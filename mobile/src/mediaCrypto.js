/**
 * @fileoverview Client-side AES-256-GCM media encryption, pointer serialization,
 * presigned S3 upload negotiation, and sticker/GIF catalogs for Sonaraim Mobile.
 */

import crypto from 'node:crypto';

/**
 * Standard emoji catalog for quick-pick toolbar.
 * @type {ReadonlyArray<string>}
 */
const EMOJI_CATALOG = Object.freeze([
  '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉',
  '🚀', '👏', '💯', '🤝', '✅', '✨', '⚡', '💡',
]);

/**
 * Default animated sticker catalog.
 * @type {ReadonlyArray<{ id: string, name: string, url: string, mimeType: string }>}
 */
const STICKER_CATALOG = Object.freeze([
  {
    id: 'stk-wave',
    name: 'Waving Hand',
    url: 'https://cdn.sonaraim.org/stickers/wave.webp',
    mimeType: 'image/webp',
  },
  {
    id: 'stk-party',
    name: 'Party Popper',
    url: 'https://cdn.sonaraim.org/stickers/party.webp',
    mimeType: 'image/webp',
  },
  {
    id: 'stk-shield',
    name: 'Encrypted Shield',
    url: 'https://cdn.sonaraim.org/stickers/shield.webp',
    mimeType: 'image/webp',
  },
]);

/**
 * Privacy-preserving GIF catalog with searchable tags.
 * @type {ReadonlyArray<{ id: string, title: string, url: string, tags: ReadonlyArray<string> }>}
 */
const GIF_CATALOG = Object.freeze([
  {
    id: 'gif-thumbs-up',
    title: 'Thumbs Up Approval',
    url: 'https://cdn.sonaraim.org/gifs/thumbs_up.gif',
    tags: ['thumbs', 'approve', 'yes', 'agree'],
  },
  {
    id: 'gif-celebrate',
    title: 'Confetti Celebration',
    url: 'https://cdn.sonaraim.org/gifs/celebrate.gif',
    tags: ['celebrate', 'party', 'win', 'hooray'],
  },
  {
    id: 'gif-locked',
    title: 'Secure Lock',
    url: 'https://cdn.sonaraim.org/gifs/secure_lock.gif',
    tags: ['secure', 'lock', 'e2ee', 'crypto'],
  },
]);

/**
 * Encrypts a raw media buffer with client-side AES-256-GCM.
 *
 * @param {Buffer|Uint8Array} buffer - Plaintext media bytes.
 * @param {string} [customKeyHex] - Optional 32-byte key hex string.
 * @param {string} [customIvHex] - Optional 12-byte IV hex string.
 * @returns {{
 *   ciphertext: Buffer,
 *   authTagHex: string,
 *   keyHex: string,
 *   ivHex: string,
 *   sha256Ciphertext: string
 * }}
 */
export function encryptMediaBuffer(buffer, customKeyHex, customIvHex) {
  const inputBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const key = customKeyHex ? Buffer.from(customKeyHex, 'hex') : crypto.randomBytes(32);
  const iv = customIvHex ? Buffer.from(customIvHex, 'hex') : crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const sha256Ciphertext = crypto.createHash('sha256').update(ciphertext).digest('hex');

  return {
    ciphertext,
    authTagHex: authTag.toString('hex'),
    keyHex: key.toString('hex'),
    ivHex: iv.toString('hex'),
    sha256Ciphertext,
  };
}

/**
 * Decrypts an authenticated AES-256-GCM encrypted media buffer.
 *
 * @param {{
 *   ciphertext: Buffer|Uint8Array,
 *   authTagHex: string,
 *   keyHex: string,
 *   ivHex: string
 * }} params
 * @returns {Buffer} Decrypted plaintext buffer.
 */
export function decryptMediaBuffer({ ciphertext, authTagHex, keyHex, ivHex }) {
  const cipherBuffer = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cipherBuffer), decipher.final()]);
}

/**
 * Formats a canonical zero-knowledge encrypted media pointer.
 *
 * @param {{
 *   mediaUrl: string,
 *   sha256: string,
 *   mimeType: string,
 *   keyHex: string,
 *   ivHex: string,
 *   authTagHex: string,
 *   fileName?: string,
 *   sizeBytes?: number
 * }} params
 * @returns {Record<string, any>} Standard media pointer payload.
 */
export function createMediaPointer(params) {
  return {
    type: 'encrypted_media_pointer_v1',
    mediaUrl: String(params.mediaUrl || ''),
    sha256: String(params.sha256 || ''),
    mimeType: String(params.mimeType || 'application/octet-stream'),
    keyHex: String(params.keyHex || ''),
    ivHex: String(params.ivHex || ''),
    authTagHex: String(params.authTagHex || ''),
    fileName: String(params.fileName || 'media.bin'),
    sizeBytes: Number(params.sizeBytes || 0),
  };
}

/**
 * Requests an S3 presigned upload URL from `POST /v1/media/presign`.
 *
 * @param {{
 *   endpointUrl: string,
 *   sha256Ciphertext: string,
 *   contentLength: number,
 *   fetchFn?: typeof fetch
 * }} params
 * @returns {Promise<{ presigned_url: string }>}
 */
export async function requestPresignedUpload({
  endpointUrl,
  sha256Ciphertext,
  contentLength,
  fetchFn = globalThis.fetch,
}) {
  const res = await fetchFn(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sha256_ciphertext: sha256Ciphertext,
      content_length: contentLength,
    }),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.message || `Presign request failed: HTTP ${res.status}`);
  }
  return data;
}

/**
 * Returns available emoji items for quick reactions and insertion.
 * @returns {ReadonlyArray<string>}
 */
export function getEmojiCatalog() {
  return EMOJI_CATALOG;
}

/**
 * Returns available animated stickers.
 * @returns {ReadonlyArray<{ id: string, name: string, url: string, mimeType: string }>}
 */
export function getStickerCatalog() {
  return STICKER_CATALOG;
}

/**
 * Searches the privacy-preserving GIF catalog by query keyword.
 *
 * @param {string} query - Keyword to match against tags or title.
 * @returns {Array<{ id: string, title: string, url: string, tags: ReadonlyArray<string> }>}
 */
export function searchGifs(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return [...GIF_CATALOG];
  }
  return GIF_CATALOG.filter(
    (item) => item.title.toLowerCase().includes(q) || item.tags.some((tag) => tag.includes(q))
  );
}
