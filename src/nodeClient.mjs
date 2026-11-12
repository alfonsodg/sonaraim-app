/**
 * @fileoverview HTTP client for polling queued MLS envelopes and sending P2P envelopes
 * to a Sonaraim Node relay. Decodes hex-encoded payload JSON and provides graceful
 * timeout fallback so the Dual Inbox UI remains responsive.
 */

import crypto from 'node:crypto';

/**
 * Polls `GET {nodeApiBaseUrl}/v1/relay/mailboxes/{mailboxId}` and returns queued envelopes.
 * Decodes `payload_hex` when present into `decodedPayload`.
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
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.messages)
            ? payload.messages
            : [];

    const envelopes = rawList.map((item) => {
      const entry = { ...item };
      if (typeof entry.payload_hex === 'string' && entry.payload_hex.trim()) {
        try {
          const rawUtf8 = Buffer.from(entry.payload_hex, 'hex').toString('utf8');
          entry.decodedPayload = JSON.parse(rawUtf8);
        } catch {
          entry.decodedPayload = null;
        }
      }
      return entry;
    });

    return {
      mailboxId: cleanMailboxId,
      envelopes,
    };
  } catch {
    return { mailboxId: cleanMailboxId, envelopes: [] };
  }
}

/**
 * Dispatches a hex-encoded JSON P2P envelope to a live Sonaraim Node relay.
 *
 * @param {string} nodeApiBaseUrl - Base URL of the `sonaraim-node` HTTP API.
 * @param {{
 *   senderDid?: string,
 *   sender_did?: string,
 *   recipientDid?: string,
 *   recipient_did?: string,
 *   mailbox_id?: string,
 *   text?: string,
 *   preview?: string,
 *   envelope_id?: string,
 *   [key: string]: unknown
 * }} message - Outgoing message descriptor.
 * @param {number} [timeoutMs] - Request timeout in milliseconds (defaults to 2500ms).
 * @returns {Promise<{ delivered: boolean, envelope_id: string, status: string }>}
 */
export async function sendP2pEnvelopeToNode(nodeApiBaseUrl, message, timeoutMs = 2500) {
  const baseUrl = String(nodeApiBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('nodeApiBaseUrl cannot be empty');
  }

  const senderDid = String(message.senderDid ?? message.sender_did ?? 'did:sonaraim:user').trim();
  const recipientDid = String(
    message.recipientDid ?? message.recipient_did ?? message.mailbox_id ?? ''
  ).trim();
  const text = String(message.text ?? message.preview ?? '').trim();

  if (!recipientDid) {
    throw new Error('recipientDid is required');
  }

  const envelopeId = String(
    message.envelope_id ?? `env-p2p-${crypto.randomBytes(4).toString('hex')}`
  );
  const payloadHex = Buffer.from(
    JSON.stringify({
      senderDid,
      recipientDid,
      text,
      sentAt: new Date().toISOString(),
      ...message,
    }),
    'utf8'
  ).toString('hex');

  const endpoint = `${baseUrl}/v1/relay/envelopes`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      envelope_id: envelopeId,
      sender_did: senderDid,
      recipient_did: recipientDid,
      payload_hex: payloadHex,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Node relay returned HTTP ${response.status}`);
  }

  const resJson = await response.json().catch(() => ({}));
  return {
    delivered: true,
    envelope_id: String(resJson.envelope_id || envelopeId),
    status: String(resJson.status || 'delivered'),
  };
}
