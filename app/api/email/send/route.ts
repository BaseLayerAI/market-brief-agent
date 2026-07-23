// API endpoint to generate and send daily market overview email

import { NextResponse } from 'next/server';
import { generateMarketOverviewEmail } from '@/lib/email/generate-email';
import { sendMarketOverviewEmail } from '@/lib/email/send-email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Recipient {
  email: string;
  name?: string;
}

// Default recipients come from the required DIGEST_RECIPIENTS env var
// (comma-separated email addresses). Returns null when unset/empty.
function digestRecipients(): Recipient[] | null {
  const raw = process.env.DIGEST_RECIPIENTS;
  if (!raw) return null;
  const emails = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (emails.length === 0) return null;
  return emails.map(email => ({ email }));
}

function isAuthorized(request?: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // If no secret is configured, the endpoint is open (dev convenience).
  if (!cronSecret) return true;
  const authHeader = request?.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

async function sendEmail(request?: Request) {
  try {
    // This endpoint sends mail from the configured sender domain to arbitrary
    // recipients — gate it so it can't be used as an open relay.
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let recipients: Recipient[] | null = digestRecipients();

    // Allow custom recipients via request body (optional)
    if (request) {
      try {
        const body = await request.json();
        if (Array.isArray(body.recipients)) {
          const valid = body.recipients.filter(
            (r: unknown): r is Recipient =>
              !!r &&
              typeof (r as Recipient).email === 'string' &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((r as Recipient).email)
          );
          if (valid.length === 0) {
            return NextResponse.json(
              { error: 'No valid recipients provided' },
              { status: 400 }
            );
          }
          recipients = valid;
        }
      } catch {
        // If body parsing fails, use default recipients
      }
    }

    if (!recipients) {
      console.error('DIGEST_RECIPIENTS is not set and no recipients were provided');
      return NextResponse.json(
        {
          success: false,
          error:
            'DIGEST_RECIPIENTS is not configured. Set it to a comma-separated list of recipient email addresses, or pass recipients in the request body.',
        },
        { status: 500 }
      );
    }

    console.log('Generating market overview email...');
    const { html, error: generateError } = await generateMarketOverviewEmail();

    if (generateError || !html) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to generate email', 
          details: generateError || 'No HTML content generated' 
        },
        { status: 500 }
      );
    }

    console.log('Sending email to recipients:', recipients.map(r => r.email).join(', '));
    const sendResult = await sendMarketOverviewEmail(html, recipients);

    if (!sendResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to send email',
          details: sendResult.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
      recipients: recipients.map(r => r.email),
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('Error in send email endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return sendEmail(request);
}

// Also allow GET for easy testing
export async function GET() {
  return sendEmail();
}

