/**
 * @fileoverview HTTP client for polling queued MLS envelopes from a Sonaraim Node relay.
 * Provides graceful timeout fallback so the Dual Inbox UI remains responsive even if the
 * upstream node relay is temporarily unreachable.
 */

/**
 * Polls `GET {nodeApiBaseUrl}/v1/relay/mailboxes/{mailboxId}` and returns queued envelopes.
 *
 * @param {string} nodeApiBaseUrl - Base URL of the `sonaraim-node` HTTP API.
 * @param {string} mailboxId - Target ephemeral or user mailbox identifier.
 * @param {number} [timeoutMs] - Request timeout in milliseconds (defaults to 2500ms).
 * @returns {Promise<{ mailboxId: string, envelopes: Array<Record<string, unknown>> }>}
 */
export async function fetchMailboxEnvelopes(nodeApiBaseUrl, mailboxId, timeoutMs = 2500) {
  const cleanMailboxId = String(mailboxId ?? '').trim();
  if (!cleanMailboxId) {
    throw new Error('mailboxId cannot be empty');
  }

  const baseUrl = String(nodeApiBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return { mailboxId: cleanMailboxId, envelopes: [] };
  }

  const endpoint = `${baseUrl}/v1/relay/mailboxes/${encodeURIComponent(cleanMailboxId)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return { mailboxId: cleanMailboxId, envelopes: [] };
    }

    const payload = await response.json();
    const rawList = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.envelopes)
        ? payload.envelopes
        : Array.isArray(payload?.messages)
          ? payload.messages
          : [];

    return {
      mailboxId: cleanMailboxId,
      envelopes: rawList,
    };
  } catch {
    return { mailboxId: cleanMailboxId, envelopes: [] };
  }
}
