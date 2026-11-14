/**
 * @fileoverview 24-hour Ephemeral Status/Stories Store and Blind Push Token Registration.
 * Handles 86400s TTL expiry filtering and zero-metadata silent wake-up tokens.
 */

import { sha256Hex } from './cryptoUtils.js';

/**
 * 24 hours in seconds.
 * @type {number}
 */
export const DEFAULT_STATUS_TTL_SECONDS = 86400;

/**
 * Creates a new ephemeral status/story item with a 24-hour expiration timestamp.
 *
 * @param {{
 *   authorDid: string,
 *   text?: string,
 *   mediaPointer?: any,
 *   timestamp?: number,
 *   ttlSeconds?: number
 * }} params
 * @returns {Record<string, any>} Status item object.
 */
export function createStatusItem({
  authorDid,
  text = '',
  mediaPointer = null,
  timestamp = Date.now(),
  ttlSeconds = DEFAULT_STATUS_TTL_SECONDS,
}) {
  const cleanAuthor = String(authorDid || '').trim();
  if (!cleanAuthor) {
    throw new Error('authorDid is required to publish a status');
  }

  const createdAt = Number(timestamp);
  const expiresAt = createdAt + Number(ttlSeconds) * 1000;

  return {
    id: `status-${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
    authorDid: cleanAuthor,
    text: String(text || '').trim(),
    mediaPointer,
    createdAt,
    expiresAt,
    viewers: [],
  };
}

/**
 * Filters a list of statuses, retaining only unexpired items active within the 24h window.
 *
 * @param {Array<Record<string, any>>} statusList - Array of status items.
 * @param {number} [currentTimestamp=Date.now()] - Timestamp against which to evaluate expiry.
 * @returns {Array<Record<string, any>>} Active unexpired status items.
 */
export function filterActiveStatuses(statusList, currentTimestamp = Date.now()) {
  if (!Array.isArray(statusList)) {
    return [];
  }
  const now = Number(currentTimestamp);
  return statusList.filter((item) => item && typeof item.expiresAt === 'number' && item.expiresAt > now);
}

/**
 * Derives a deterministic 128-bit blind push wake-up token formatted as `wake_<32-hex-chars>`.
 * Aligned with `sonaraim-node/src/relay.rs` zero-metadata wake-up design.
 *
 * @param {string} mailboxId - Target recipient mailbox or DID.
 * @param {string} envelopeId - Target envelope identifier.
 * @param {number} epochSecs - Creation epoch timestamp in seconds.
 * @returns {Promise<string>} Formatted blind wake token.
 */
export async function deriveBlindPushToken(mailboxId, envelopeId, epochSecs) {
  const payload = `sonaraim:wake:v1|${mailboxId}|${envelopeId}|${epochSecs}`;
  const digest = await sha256Hex(payload);
  return `wake_${digest.slice(0, 32)}`;
}

/**
 * Registers a blind push wake-up token with the node relay via `POST /v1/push/register`.
 *
 * @param {{
 *   nodeApiUrl: string,
 *   userDid: string,
 *   pushToken: string,
 *   platform?: 'expo' | 'apns' | 'fcm',
 *   fetchFn?: typeof fetch
 * }} params
 * @returns {Promise<{ registered: boolean, blind_token: string }>}
 */
export async function registerPushToken({
  nodeApiUrl,
  userDid,
  pushToken,
  platform = 'expo',
  fetchFn = globalThis.fetch,
}) {
  const url = `${String(nodeApiUrl).replace(/\/+$/, '')}/v1/push/register`;
  const body = {
    user_did: userDid,
    blind_token: pushToken,
    platform,
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
    throw new Error(data.message || `Push registration failed: HTTP ${res.status}`);
  }
  return data;
}
