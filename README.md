# market-brief-agent

A Next.js API-only service with two independent email agents: a scheduled daily market digest, and an inbound forward-to-LLM email assistant.

**Status:** runs on Vercel. The digest fires via Vercel Cron at 10:00 UTC daily; the inbound agent responds to email in near-real-time via a Resend webhook.

## How it works

There is no UI — every route lives under `app/api/`.

**1. Daily market digest** — assembles and sends an HTML market brief:

- Puppeteer screenshots the TradingView S&P 500 heatmap
- Jupiter page parsing pulls price/market-cap/volume for a set of pre-IPO ("prestock") tokens on Solana
- Perplexity (`sonar-pro`) writes 5 synthesized market insights, with citations filtered to a reputable-source allowlist
- Resend delivers the composed email to `DIGEST_RECIPIENTS`

**2. Inbound email agent** — forward any email with a command written above the forward marker, and Claude replies in-thread:

- Resend receives the email (MX record) and POSTs a signed `email.received` webhook
- The route verifies the signature, checks the sender against `ALLOWED_EMAIL_SENDERS` (the auth boundary — unset means deny all), ACKs, then processes in the background
- The body is split into trusted command vs. untrusted forwarded content (prompt-injection defense); Claude runs with web search enabled and the reply is emailed back

```
                         ┌────────────────────────────────────────────┐
 Vercel Cron 10:00 UTC ─▶│ /api/cron/send-daily-email                 │
                         │   ├─ Puppeteer → TradingView heatmap PNG   │
                         │   ├─ /api/solana/token-data → Jupiter data │
                         │   ├─ Perplexity → market insights          │
                         │   └─ Resend → DIGEST_RECIPIENTS            │
                         └────────────────────────────────────────────┘
                         ┌────────────────────────────────────────────┐
 you ─forward──▶ Resend ─▶ /api/email/inbound (svix-verified webhook) │
                         │   ├─ sender allowlist gate                 │
                         │   ├─ split command / forwarded content     │
                         │   ├─ Claude (+ web search)                 │
                         │   └─ Resend → threaded reply to you        │
                         └────────────────────────────────────────────┘
```

## Quickstart

```bash
git clone https://github.com/BaseLayerAI/market-brief-agent.git
cd market-brief-agent
cp .env.example .env
# fill in the env vars, then:
npm install
npm run dev

# preview the digest HTML (no send)
curl http://localhost:3000/api/email/market-overview
# send the digest now
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/email/send
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | yes | Sends all outbound email |
| `PERPLEXITY_API_KEY` | for digest | Market insights section |
| `ANTHROPIC_API_KEY` | for inbound agent | Claude replies |
| `RESEND_WEBHOOK_SECRET` | for inbound agent | Verifies inbound webhook signatures |
| `DIGEST_RECIPIENTS` | yes (digest) | Comma-separated digest recipients; cron returns 500 if unset |
| `ALLOWED_EMAIL_SENDERS` | yes (inbound) | Comma-separated senders allowed to trigger the agent; unset/empty = deny all |
| `AGENT_EMAIL_FROM` | yes (inbound) | Reply-from address on a Resend-verified domain |
| `AGENT_EMAIL_FROM_NAME` | no | Reply-from display name (default `Assistant`) |
| `AGENT_INBOUND_ADDRESS` | no | On a catch-all domain, only mail to this address triggers the agent |
| `EMAIL_FROM` | no | Digest sender (default `onboarding@resend.dev`, Resend's testing sender) |
| `EMAIL_FROM_NAME` | no | Digest sender name (default `Market Brief`) |
| `OPERATOR_NAME` | no | How the agent's prompt refers to you (default `the operator`) |
| `CRON_SECRET` | recommended | Bearer token guarding the cron + manual-send endpoints |
| `NEXT_PUBLIC_API_URL` | no | Base URL for the self-call to `/api/solana/token-data` (default `http://localhost:3000`) |
| `LOGO_PATH` | no | Header logo (path under `public/` or absolute); unset = text-only header |
| `FOOTER_LINKS` | no | JSON array of `{label,url}` footer links; unset = none |

## Deployment

Deploy to Vercel. `vercel.json` registers the cron (`0 10 * * *` → `/api/cron/send-daily-email`); set the env vars in Project → Settings → Environment Variables. Puppeteer needs the Node.js runtime (already set per-route) and enough function memory/time for a headless Chromium launch.

For the inbound agent, one-time Resend setup: enable receiving on a (sub)domain via an MX record, then add a webhook for `email.received` pointing at `https://<your-domain>/api/email/inbound` and copy its signing secret into `RESEND_WEBHOOK_SECRET`. Details in [docs/INBOUND_EMAIL_AGENT.md](docs/INBOUND_EMAIL_AGENT.md).

Operational details: [docs/RUNBOOK.md](docs/RUNBOOK.md).
