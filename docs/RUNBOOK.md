# Runbook — market-brief-agent

## Where it runs

Vercel, as an API-only Next.js app. Two triggers:

| Trigger | Mechanism | Endpoint |
|---|---|---|
| Daily digest | Vercel Cron, `0 10 * * *` (10:00 UTC), from `vercel.json` | `GET /api/cron/send-daily-email` |
| Inbound agent | Resend `email.received` webhook (svix-signed) | `POST /api/email/inbound` |

## Credentials

All credentials live in Vercel project env vars — nothing is stored in the repo.

| Credential | Used for | Rotation |
|---|---|---|
| `RESEND_API_KEY` | All outbound email + fetching inbound bodies | Resend dashboard → API Keys → create new, update env, delete old, redeploy |
| `RESEND_WEBHOOK_SECRET` | Verifying inbound webhooks | Resend dashboard → Webhooks → the webhook's page → roll secret, update env, redeploy |
| `PERPLEXITY_API_KEY` | Digest market insights | Perplexity settings → regenerate, update env, redeploy |
| `ANTHROPIC_API_KEY` | Inbound agent replies | console.anthropic.com → API Keys → create new, update env, delete old, redeploy |
| `CRON_SECRET` | Gating cron/manual-send endpoints | Generate a new random string, update env, redeploy (Vercel Cron sends it automatically) |

After changing any env var, redeploy — Vercel functions read env at build/deploy time.

## Failure signatures

**Digest didn't arrive**

- Vercel dashboard → Cron Jobs: did the 10:00 UTC run fire, and with what status?
- Function logs for `/api/cron/send-daily-email`:
  - `DIGEST_RECIPIENTS is not set` → env var missing; set it and redeploy.
  - `Error capturing TradingView market heatmap` → Puppeteer/Chromium failure (timeout, memory, or TradingView page change). Retry manually; if persistent, raise function memory or update the selector logic.
  - `PERPLEXITY_API_KEY not found` / Perplexity API error → insights section is skipped or empty; the email still sends. Check key/quota.
  - `Resend API error` → check the Resend dashboard for delivery logs and domain verification.
- Email generated but not delivered → Resend dashboard → Emails; verify the `EMAIL_FROM` domain is still verified.

**Inbound agent stopped replying**

- Resend dashboard → Webhooks → delivery attempts: are webhooks being delivered, and with what response code?
  - 401 → signature mismatch: `RESEND_WEBHOOK_SECRET` doesn't match the webhook's current secret.
  - 500 `Not configured` → one of `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY`, `AGENT_EMAIL_FROM` is unset.
- Function logs for `/api/email/inbound`:
  - `Ignoring inbound email from unauthorized sender` → sender not in `ALLOWED_EMAIL_SENDERS` (remember: unset = deny all).
  - `Claude processing failed` → check `ANTHROPIC_API_KEY` validity and Anthropic status; the sender still gets a generic failure reply.
  - Nothing at all → MX record or webhook config broke; re-check Resend receiving setup.

## Recovery

- **Re-send a missed digest:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/email/send` (uses `DIGEST_RECIPIENTS`).
- **Preview without sending:** `GET /api/email/market-overview` returns the digest HTML.
- **Re-run a missed inbound email:** just forward it again — there is no persistent queue; an email dropped after ACK is gone.
- **Bad deploy:** Vercel dashboard → Deployments → promote the previous good deployment.

## Cost guards

- The inbound agent truncates forwarded content at ~200K chars and caps continuation loops; processing hard-aborts at 240s.
- Dedupe of webhook retries is in-memory per instance — expect occasional double-processing across cold starts (double token spend, duplicate reply).
