// Inbound email webhook: forward an email to Claude, get an autonomous reply
//
// Flow: Resend receives the email (MX record) -> POSTs an `email.received`
// webhook here (metadata only) -> we verify the signature, check the sender
// allowlist, ACK immediately, then in the background fetch the full email,
// run it through Claude, and send the reply back to the sender.

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { waitUntil } from '@vercel/functions';
import { processEmailWithClaude } from '@/lib/email/claude-agent';
import { parseInbound } from '@/lib/email/parse-inbound';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Leave headroom under maxDuration so we can send a "timed out" reply
// before the platform kills the function.
const PROCESSING_DEADLINE_MS = 240_000;

// Lazy init: constructing Resend without a key throws, which breaks
// `next build` page-data collection when env vars aren't set locally
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// Sender allowlist — this is the AUTH BOUNDARY for the inbound agent. Anyone
// on the internet can email the inbound address; only senders listed in the
// required ALLOWED_EMAIL_SENDERS env var (comma-separated addresses) can
// trigger the agent. Unset or empty means DENY ALL inbound mail.
function allowedSenders(): string[] {
  const fromEnv = process.env.ALLOWED_EMAIL_SENDERS;
  if (!fromEnv) return [];
  return fromEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function replyFromAddress(): { email: string; name: string } {
  return {
    // AGENT_EMAIL_FROM must be an address on a Resend-verified sending domain.
    // Required — checked at request time in POST (no personal default here).
    email: (process.env.AGENT_EMAIL_FROM || '').toLowerCase(),
    name: process.env.AGENT_EMAIL_FROM_NAME || 'Assistant',
  };
}

/**
 * Extract the real addr-spec from a From header.
 *
 * A From header can be `Display Name <addr@host>`. RFC 5322 permits angle
 * brackets *inside* a quoted display name, so `"x <a@allowed>" <b@evil>`
 * would fool a naive first-bracket match. Anchor to the LAST angle-bracket
 * pair (the real addr-spec is always last), and validate it looks like an
 * email. Returns null if nothing address-shaped is found.
 */
function extractEmailAddress(from: string): string | null {
  if (!from) return null;
  const brackets = [...from.matchAll(/<([^<>]+)>/g)];
  const candidate = brackets.length
    ? brackets[brackets.length - 1][1]
    : from;
  const addr = candidate.trim().toLowerCase();
  // Basic addr-spec shape: local@domain.tld, no spaces
  if (!/^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/.test(addr)) return null;
  return addr;
}

// Fallback when the email has no text part. Decode &amp; LAST so that
// literal `&lt;` in the source (encoded as `&amp;lt;`) isn't double-decoded.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Skip auto-generated mail (out-of-office, list traffic, bounces) to avoid
// reply loops. Inspects the fetched email's lowercase-keyed header map.
function isAutomatedMessage(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  const autoSubmitted = headers['auto-submitted'];
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return true;
  const precedence = (headers['precedence'] || '').toLowerCase();
  if (['bulk', 'junk', 'auto_reply', 'list'].includes(precedence)) return true;
  if (headers['list-id'] || headers['list-unsubscribe']) return true;
  if (headers['x-autoreply'] || headers['x-autorespond']) return true;
  if (headers['x-auto-response-suppress']) return true;
  return false;
}

// Best-effort dedupe: Resend delivers at-least-once, and warm serverless
// instances are reused, so this catches most duplicate deliveries. It is NOT
// reliable across cold/concurrent instances — see docs/INBOUND_EMAIL_AGENT.md.
// TTL exceeds Resend's 10h retry horizon.
const processedEmailIds = new Map<string, number>();
const DEDUPE_TTL_MS = 12 * 60 * 60 * 1000;

function alreadyProcessed(emailId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of processedEmailIds) {
    if (now - ts > DEDUPE_TTL_MS) processedEmailIds.delete(id);
  }
  if (processedEmailIds.has(emailId)) return true;
  processedEmailIds.set(emailId, now);
  return false;
}

interface InboundEventData {
  email_id: string;
  from: string;
  to: string[];
  subject: string;
  message_id: string;
}

async function sendReply(
  to: string,
  subject: string,
  text: string,
  inReplyTo: string,
  priorReferences?: string
): Promise<void> {
  const from = replyFromAddress();
  const references = [priorReferences, inReplyTo].filter(Boolean).join(' ');
  const headers: Record<string, string> = { 'Auto-Submitted': 'auto-replied' };
  if (inReplyTo) {
    headers['In-Reply-To'] = inReplyTo;
    if (references) headers['References'] = references;
  }
  const result = await getResend().emails.send({
    from: `${from.name} <${from.email}>`,
    to: [to],
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject || '(no subject)'}`,
    text,
    headers,
  });
  if (result.error) {
    console.error('Failed to send reply:', result.error);
  } else {
    console.log(`Reply sent to ${to} (message: ${result.data?.id})`);
  }
}

async function processInboundEmail(data: InboundEventData): Promise<void> {
  const sender = extractEmailAddress(data.from);
  if (!sender) return; // already validated in POST, but keep types honest

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROCESSING_DEADLINE_MS);

  try {
    // Webhook payload is metadata-only; fetch the body
    const { data: email, error: fetchError } = await getResend().emails.receiving.get(
      data.email_id
    );

    if (fetchError || !email) {
      console.error('Failed to fetch inbound email:', fetchError);
      return;
    }

    // Drop auto-responders / list mail so we don't ping-pong
    if (isAutomatedMessage(email.headers as Record<string, string> | undefined)) {
      console.log(`Skipping automated message ${data.email_id} from ${sender}`);
      return;
    }

    const priorReferences = (email.headers as Record<string, string> | undefined)?.[
      'references'
    ];

    const rawHtml = email.html || '';
    const bodyText = email.text || (rawHtml ? htmlToText(rawHtml) : '');
    if (!bodyText.trim()) {
      console.log(`Inbound email ${data.email_id} has no readable text body`);
      await sendReply(
        sender,
        data.subject || '',
        "I couldn't find any readable text in that email. Attachments and image-only emails aren't supported yet — forward one with a text body and a command at the top.",
        data.message_id,
        priorReferences
      );
      return;
    }

    // Split trusted command from untrusted forwarded content.
    const parsed = parseInbound(bodyText);

    // Honor a reply-redirect ONLY from the trusted command, and ONLY to an
    // allowlisted (i.e. one of the operator's own) address — so injected
    // content in the forwarded body can't redirect, and a trusted command
    // can't be turned into an exfiltration channel to an arbitrary address.
    let recipient = sender;
    if (parsed.requestedReplyTo) {
      if (allowedSenders().includes(parsed.requestedReplyTo)) {
        recipient = parsed.requestedReplyTo;
        console.log(`Reply redirected to allowlisted address: ${recipient}`);
      } else {
        console.warn(
          `Ignoring reply-redirect to non-allowlisted address: ${parsed.requestedReplyTo}`
        );
      }
    }

    console.log(
      `Processing inbound email ${data.email_id} from ${sender}: "${data.subject}"`
    );

    const result = await processEmailWithClaude(
      parsed.command,
      parsed.forwarded,
      data.subject || '',
      controller.signal
    );

    // Keep raw errors in logs; send a generic, non-leaky message in the reply.
    if (!result.success) {
      console.error(`Claude processing failed for ${data.email_id}: ${result.error}`);
    }
    const replyText = result.success
      ? result.reply!
      : "Sorry, I couldn't process this email. Try forwarding it again, or rephrase the command at the top.";

    await sendReply(recipient, data.subject || '', replyText, data.message_id, priorReferences);
  } catch (error) {
    console.error('Error processing inbound email:', error);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !process.env.RESEND_API_KEY || !process.env.AGENT_EMAIL_FROM) {
    console.error(
      'RESEND_WEBHOOK_SECRET, RESEND_API_KEY, or AGENT_EMAIL_FROM not configured'
    );
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // Raw body is required for signature verification
  const payload = await request.text();
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');

  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  let event: { type: string; data: InboundEventData };
  try {
    event = getResend().webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    }) as { type: string; data: InboundEventData };
  } catch {
    console.error('Invalid webhook signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (event.type !== 'email.received') {
    return NextResponse.json({ ignored: event.type });
  }

  const sender = extractEmailAddress(event.data.from);
  if (!sender) {
    console.warn(`Could not parse sender from: ${event.data.from}`);
    return NextResponse.json({ ignored: 'unparseable sender' });
  }

  // Never respond to our own outbound mail (loop guard)
  if (sender === replyFromAddress().email) {
    return NextResponse.json({ ignored: 'self' });
  }

  if (!allowedSenders().includes(sender)) {
    console.warn(`Ignoring inbound email from unauthorized sender: ${sender}`);
    return NextResponse.json({ ignored: 'unauthorized sender' });
  }

  // On a catch-all inbound domain, only act on mail addressed to the assistant
  // (optional — set AGENT_INBOUND_ADDRESS to enable this gate).
  const inboundAddr = process.env.AGENT_INBOUND_ADDRESS?.toLowerCase();
  if (inboundAddr) {
    const recipients = (event.data.to || []).map(t => extractEmailAddress(t));
    if (!recipients.includes(inboundAddr)) {
      return NextResponse.json({ ignored: 'not addressed to assistant' });
    }
  }

  if (alreadyProcessed(event.data.email_id)) {
    return NextResponse.json({ ignored: 'duplicate' });
  }

  // ACK now; Claude can take minutes and Resend retries slow responses.
  // waitUntil keeps the function alive on Vercel; off-Vercel it's a no-op,
  // so await instead (dev/self-hosted) at the cost of a slower ACK.
  if (process.env.VERCEL) {
    waitUntil(processInboundEmail(event.data));
  } else {
    await processInboundEmail(event.data);
  }

  return NextResponse.json({ accepted: event.data.email_id });
}
