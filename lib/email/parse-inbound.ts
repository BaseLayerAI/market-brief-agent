// Split an inbound forwarded email into the trusted command (what the
// operator typed above the forward) and the untrusted forwarded content, and
// detect an optional "send the reply to <address>" redirect from the command.
//
// Why the split matters: instructions inside the forwarded body are written by
// third parties and must never be obeyed (prompt injection). Only text the
// operator typed themselves — above the client's forward marker — is trusted.

const FORWARD_MARKERS: RegExp[] = [
  /^\s*-{2,}\s*Forwarded message\s*-{2,}/im, // Gmail
  /^\s*Begin forwarded message:/im, // Apple Mail
  /^\s*-{2,}\s*Original Message\s*-{2,}/im, // Outlook
  /^\s*_{5,}\s*$/m, // Outlook underscore divider (usually precedes "From:")
];

export interface ParsedInbound {
  /** Trusted: the text the operator typed above the forward. */
  command: string;
  /** Untrusted: the forwarded original email. */
  forwarded: string;
  /** An email address the command asked the reply to be sent to, if any. */
  requestedReplyTo: string | null;
}

export function parseInbound(bodyText: string): ParsedInbound {
  let splitIdx = -1;
  for (const re of FORWARD_MARKERS) {
    const m = bodyText.match(re);
    if (m && m.index !== undefined && (splitIdx === -1 || m.index < splitIdx)) {
      splitIdx = m.index;
    }
  }

  // No recognizable forward marker → treat the whole body as untrusted (no
  // trusted command). Claude will summarize. This is the safe default: we never
  // promote unmarked content to "trusted".
  let command = '';
  let forwarded = bodyText.trim();
  if (splitIdx > -1) {
    command = bodyText.slice(0, splitIdx).trim();
    forwarded = bodyText.slice(splitIdx).trim();
  }

  return { command, forwarded, requestedReplyTo: extractRedirect(command) };
}

/**
 * Pull a reply-redirect target out of the trusted command only, e.g.
 * "send the response to me@example.com". Returns the lowercased address or
 * null. The caller must still validate it against the sender allowlist before
 * using it — this function does not authorize anything.
 */
function extractRedirect(command: string): string | null {
  if (!command) return null;
  const m = command.match(
    /\b(?:send|email|deliver|forward|cc)\b[^.\n]*?\bto\s+<?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})>?/i
  );
  return m ? m[1].toLowerCase() : null;
}
