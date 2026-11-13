/**
 * @fileoverview Chat UX Features for Sonaraim Mobile:
 * Emoji reactions, quote reply builder, receipt progression, and relay signal dispatcher.
 */

/**
 * Valid receipt statuses in forward chronological sequence.
 * @type {ReadonlyArray<'sent' | 'delivered' | 'read'>}
 */
export const RECEIPT_STATUSES = Object.freeze(['sent', 'delivered', 'read']);

/**
 * Toggles an emoji reaction on a message for a specific user DID.
 *
 * @param {Record<string, any>} message - Target message object.
 * @param {string} userDid - Reacting user DID.
 * @param {string} emoji - Reaction emoji character.
 * @returns {Record<string, any>} Cloned message with updated reactions.
 */
export function toggleReaction(message, userDid, emoji) {
  const currentReactions = { ...(message.reactions || {}) };
  const currentList = Array.isArray(currentReactions[emoji]) ? [...currentReactions[emoji]] : [];

  const existingIdx = currentList.indexOf(userDid);
  if (existingIdx >= 0) {
    currentList.splice(existingIdx, 1);
  } else {
    currentList.push(userDid);
  }

  if (currentList.length === 0) {
    delete currentReactions[emoji];
  } else {
    currentReactions[emoji] = currentList;
  }

  return {
    ...message,
    reactions: currentReactions,
  };
}

/**
 * Constructs a quote reply payload linking to the referenced message.
 *
 * @param {{
 *   targetMessage: Record<string, any>,
 *   senderDid: string,
 *   replyText: string,
 *   mediaPointer?: any
 * }} params
 * @returns {Record<string, any>} Formatted quote-reply message object.
 */
export function buildQuoteReply({ targetMessage, senderDid, replyText, mediaPointer = null }) {
  if (!targetMessage || !targetMessage.id) {
    throw new Error('targetMessage with a valid id is required for quote reply');
  }

  const sender = targetMessage.senderDid || targetMessage.sender || 'did:sonaraim:peer';
  const preview = String(targetMessage.text || '').slice(0, 100);

  return {
    id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderDid: String(senderDid || ''),
    text: String(replyText || '').trim(),
    mediaPointer,
    timestamp: Date.now(),
    receiptStatus: 'sent',
    reactions: {},
    quote: {
      id: targetMessage.id,
      senderDid: sender,
      previewText: preview,
      mediaType: targetMessage.mediaPointer?.mimeType || null,
    },
  };
}

/**
 * Advances a message receipt state along the sequence `sent` -> `delivered` -> `read`.
 *
 * @param {string} currentStatus - Current receipt state.
 * @returns {'sent' | 'delivered' | 'read'} Next receipt status.
 */
export function advanceReceiptStatus(currentStatus) {
  switch (currentStatus) {
    case 'sent':
      return 'delivered';
    case 'delivered':
      return 'read';
    case 'read':
      return 'read';
    default:
      return 'sent';
  }
}

/**
 * Dispatches an ephemeral relay signal (typing indicator, read receipt) to `POST /v1/relay/signals`.
 *
 * @param {{
 *   nodeApiUrl: string,
 *   senderDid: string,
 *   recipientDid: string,
 *   signalType: 'typing' | 'receipt' | 'presence',
 *   payload?: Record<string, any>,
 *   fetchFn?: typeof fetch
 * }} params
 * @returns {Promise<{ success: boolean, signal_id?: string }>}
 */
export async function sendRelaySignal({
  nodeApiUrl,
  senderDid,
  recipientDid,
  signalType,
  payload = {},
  fetchFn = globalThis.fetch,
}) {
  const url = `${String(nodeApiUrl).replace(/\/+$/, '')}/v1/relay/signals`;
  const body = {
    sender_did: senderDid,
    recipient_did: recipientDid,
    signal_type: signalType,
    payload,
    timestamp: Date.now(),
  };

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.message || `Signal dispatch failed: HTTP ${res.status}`);
  }
  return data;
}
