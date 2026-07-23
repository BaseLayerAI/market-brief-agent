# Inbound email agent — setup and security model

Forward any email to the agent's address with a command written at the top, and Claude replies autonomously, in-thread.

## How it works

1. You forward an email to the receiving address and write a command above the forwarded content, e.g. "Summarize this and draft a polite decline."
2. Resend receives the email (via an MX record) and POSTs an `email.received` webhook to `/api/email/inbound`.
3. The endpoint verifies the webhook signature, checks the sender is on the allowlist, and ACKs immediately.
4. In the background it fetches the full email body, sends it to Claude (with web search enabled), and emails Claude's answer back to you as a threaded reply.

If you write no command, Claude summarizes the forwarded email and suggests next steps.

## Environment variables

```bash
# Required
RESEND_API_KEY=re_...              # sends the replies
ANTHROPIC_API_KEY=sk-ant-...       # console.anthropic.com → API keys
RESEND_WEBHOOK_SECRET=whsec_...    # from the webhook's page in the Resend dashboard
AGENT_EMAIL_FROM=assistant@example.com   # reply sender, on a Resend-verified domain
ALLOWED_EMAIL_SENDERS=you@example.com    # comma-separated; unset/empty = deny all inbound

# Optional
AGENT_EMAIL_FROM_NAME=Assistant          # reply sender display name
AGENT_INBOUND_ADDRESS=assistant@example.com  # on a catch-all domain, only mail to this address triggers the agent
OPERATOR_NAME=Alex                       # how the system prompt refers to you
CRON_SECRET=...                          # also gates /api/email/send against open-relay abuse
```

## Resend setup (one-time)

### 1. Enable receiving on a domain

**Recommended: use a subdomain** so your normal mail is unaffected.

1. Resend dashboard → Domains → add (or open) the domain you want to receive on, e.g. `mail.example.com`.
2. Enable receiving and copy the **MX record** Resend shows you.
3. Add that MX record at your DNS provider. It must have the lowest priority value on that name.

Receiving is catch-all: once the MX record is live, *any* address at that domain reaches the webhook. The sender allowlist is what gates access.

> Warning: if you put the MX record on a root domain that already receives mail (Google Workspace etc.), you will break your normal inbox. Use a subdomain unless the domain has no existing mailbox.

Zero-DNS alternative for testing: Emails page → Receiving tab → "Receiving address" gives you a `<alias>@<id>.resend.app` address that works immediately.

### 2. Add the webhook

1. Resend dashboard → Webhooks → Add Webhook.
2. URL: `https://<your-domain>/api/email/inbound`
3. Event: `email.received` only.
4. Copy the signing secret (`whsec_...`) from the webhook's details page → set as `RESEND_WEBHOOK_SECRET` → redeploy.

## Usage

Forward an email to the receiving address and type a command at the top:

```
Research this company and tell me if the valuation in this email is reasonable.

---------- Forwarded message ----------
From: ...
```

Example commands:

- "Summarize this thread in 5 bullets."
- "Draft a reply declining politely but keeping the door open."
- "Fact-check the claims in this newsletter." (Claude will use web search)
- "Translate this to English."

### Sending the reply to a different address

By default the reply goes back to whoever forwarded the email. To send it elsewhere, say so **in your command** (the text above the forward), e.g. "Summarize this and send the response to other@example.com".

The redirect only works when:

- the instruction is in **your command**, not inside the forwarded content (an instruction buried in a forwarded email is treated as untrusted and ignored — this is the anti-injection guard), **and**
- the target address is on the sender allowlist (`ALLOWED_EMAIL_SENDERS`).

If the target isn't allowlisted, the redirect is ignored and the reply goes back to you.

## Security model

- **Signature verification**: every webhook is verified against `RESEND_WEBHOOK_SECRET` (svix); forged requests get 401.
- **Sender allowlist**: only `ALLOWED_EMAIL_SENDERS` can trigger the agent — this is the auth boundary, and an unset/empty list denies all inbound mail. The From address is parsed anchored to the last angle-bracket pair, so a quoted-display-name trick like `"x <you@allowed>" <attacker@evil>` resolves to the real sender (`attacker@evil`) and is rejected.
- **Prompt-injection defense**: the forwarded email is fenced as untrusted data, and Claude is instructed never to act on instructions inside it. `web_fetch` is disabled (only `web_search` is on) so injected content can't drive arbitrary outbound requests to exfiltrate the thread.
- **Loop guards**: mail from the agent's own sending address is ignored, and auto-responders / list mail (Auto-Submitted, Precedence, List-Id, X-Autoreply headers) are skipped. Replies carry `Auto-Submitted: auto-replied`.
- **Open-relay guard**: `/api/email/send` requires `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set, and validates recipient addresses.
- **Dedupe**: duplicate `email_id`s are dropped (best-effort, in-memory).

## Residual risks (not yet mitigated)

- **From is unauthenticated at the app layer.** The allowlist trusts the From address. A spoofer who can send DMARC-passing mail as an allowlisted domain, or exploits weak inbound DMARC enforcement, could trigger the agent. Mitigation: enforce strict DMARC on the receiving domain, and/or check `Authentication-Results` headers. The worst case is bounded — replies only go back to an allowlisted address and cost some tokens.
- **Dedupe and rate-limiting are per-instance and in-memory.** Across cold/concurrent serverless instances a duplicate delivery can run twice, and there is no per-sender quota. For hard cost control, move dedupe + rate limiting to a shared store (e.g. Redis, `SET email_id NX EX`).
- **Background processing is bounded by `maxDuration` (300s).** Work aborts at 240s and sends a "cut short" reply; a hard platform kill beyond that drops the email with no retry (Resend already got its 200). Long web-search chains are the main risk.
- **Vercel-only background processing.** The handler uses `waitUntil`; off-Vercel it falls back to awaiting inline (slower ACK).

## Testing

```bash
# Endpoint rejects unsigned requests (expect 400/401)
curl -X POST https://<your-domain>/api/email/inbound -d '{}'
```

Then send a real test: from an allowlisted address, forward any email to the receiving address with "Reply with the word PONG." at the top. Expect a threaded reply within ~1–3 minutes (web-search commands take longer). Check the function logs for `/api/email/inbound` and the Resend dashboard (Emails → Receiving, and Webhooks → delivery attempts) when debugging.

## Limits and caveats

- Attachments are ignored (only the email text is sent to Claude).
- Processing runs in the background after the webhook ACK; hard cap is the function's `maxDuration` (300s).
- The agent cannot send email to third parties — it only replies to allowlisted addresses. Ask it to *draft* messages instead.
- Each forward costs Anthropic API tokens (plus web search when used).
