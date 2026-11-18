/**
 * @fileoverview Mailbox drain normalization for Sonaraim Mobile.
 * Exposes `decodedPayload` (parsed `payload_hex` JSON) and `mediaPointer`
 * per envelope so the inbox can fetch + decrypt E2EE attachments (issue #27).
 * Uses only Uint8Array/TextDecoder: Metro/Hermes-safe, zero node imports.
 */

/**
 * Normalizes a mailbox drain result so every envelope exposes `decodedPayload`
 * (parsed `payload_hex` JSON) and `mediaPointer` when the payload carries one.
 *
 * @param {any} result - Raw `requestJson` mailbox payload.
 * @returns {{ mailbox_id?: string, items: Array<any>, envelopes: Array<any> }} Normalized result.
 */
export function normalizeMailboxResult(result) {
  const out = result && typeof result === 'object' ? { ...result } : {};
  const rawEnvelopes = Array.isArray(out.envelopes)
    ? out.envelopes
    : Array.isArray(out.items)
      ? out.items
      : [];
  const envelopes = rawEnvelopes.map((entry) => {
    const env = entry && typeof entry === 'object' ? { ...entry } : {};
    if (env.decodedPayload === undefined && typeof env.payload_hex === 'string' && env.payload_hex.trim()) {
      try {
        const rawUtf8 = decodeHexToUtf8(env.payload_hex);
        env.decodedPayload = JSON.parse(rawUtf8);
      } catch {
        env.decodedPayload = null;
      }
    }
    const payload = env.decodedPayload && typeof env.decodedPayload === 'object' ? env.decodedPayload : null;
    if (env.mediaPointer === undefined && payload?.mediaPointer && typeof payload.mediaPointer === 'object') {
      env.mediaPointer = payload.mediaPointer;
    }
    return env;
  });
  out.envelopes = envelopes;
  if (!Array.isArray(out.items)) {
    out.items = envelopes;
  }
  return out;
}

/**
 * Decodes a hex payload into UTF-8 using only Uint8Array (Hermes-safe).
 *
 * @param {string} hex - Hex-encoded string.
 * @returns {string} UTF-8 decoded string.
 */
function decodeHexToUtf8(hex) {
  const clean = String(hex).trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Summarizes a media drain into inbox-ready messages plus feedback text.
 *
 * @param {Array<Record<string, any>>} drained - `drainIncomingMedia` results.
 * @param {number} envelopeCount - Total envelopes drained.
 * @returns {{ incoming: Array<Record<string, any>>, feedback: string }}
 */
export function summarizeMediaDrain(drained, envelopeCount) {
  const list = Array.isArray(drained) ? drained : [];
  const decryptedCount = list.filter((d) => d.bytes).length;
  const failedCount = list.filter((d) => d.error).length;
  const incoming = list
    .filter((d) => d.pointer)
    .map((d) => ({
      id: d.envelopeId,
      sender: d.pointer.senderDid || 'did:sonaraim:peer',
      text: d.bytes ? `[decrypted ${d.mimeType}]` : '[encrypted attachment]',
      mediaPointer: d.pointer,
      decryptedBytes: d.bytes ? d.bytes.length : 0,
      timestamp: 'Just now',
      receiptStatus: 'delivered',
      reactions: {},
    }));
  const parts = [];
  parts.push(
    envelopeCount > 0
      ? `Retrieved ${envelopeCount} live item(s)`
      : 'Mailbox is up to date (0 new items)'
  );
  if (decryptedCount > 0) {
    parts.push(`decrypted ${decryptedCount} attachment(s)`);
  }
  if (failedCount > 0) {
    parts.push(`${failedCount} attachment(s) failed integrity`);
  }
  return { incoming, feedback: parts.join('; ') };
}

