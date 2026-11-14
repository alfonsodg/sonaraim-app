/**
 * @fileoverview Client-side AES-256-GCM media encryption, pointer serialization,
 * presigned S3 upload negotiation, and sticker/GIF catalogs for Sonaraim Mobile.
 * Uses WebCrypto (`globalThis.crypto.subtle`) and `Uint8Array` for Hermes/Metro compatibility.
 */

import {
  bytesToHex,
  decryptAesGcm,
  encryptAesGcm,
  hexToBytes,
  randomBytes,
  sha256Hex,
  toUint8Array,
} from './cryptoUtils.js';
import { requireMobileEnvUrl } from './config.js';

/**
 * Standard emoji catalog for quick-pick toolbar.
 * @type {ReadonlyArray<string>}
 */
const EMOJI_CATALOG = Object.freeze([
  '👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉',
  '🚀', '👏', '💯', '🤝', '✅', '✨', '⚡', '💡',
]);

/**
 * Sticker catalog metadata with relative asset paths resolved against `EXPO_PUBLIC_CDN_BASE_URL`.
 * @type {ReadonlyArray<{ id: string, name: string, path: string, mimeType: string }>}
 */
const STICKER_ASSETS = Object.freeze([
  { id: 'stk-wave', name: 'Waving Hand', path: '/stickers/wave.webp', mimeType: 'image/webp' },
  { id: 'stk-party', name: 'Party Popper', path: '/stickers/party.webp', mimeType: 'image/webp' },
  { id: 'stk-shield', name: 'Encrypted Shield', path: '/stickers/shield.webp', mimeType: 'image/webp' },
]);

/**
 * Privacy-preserving GIF catalog metadata with relative asset paths resolved against `EXPO_PUBLIC_CDN_BASE_URL`.
 * @type {ReadonlyArray<{ id: string, title: string, path: string, tags: ReadonlyArray<string> }>}
 */
const GIF_ASSETS = Object.freeze([
  {
    id: 'gif-thumbs-up',
    title: 'Thumbs Up Approval',
    path: '/gifs/thumbs_up.gif',
    tags: ['thumbs', 'approve', 'yes', 'agree'],
  },
  {
    id: 'gif-celebrate',
    title: 'Confetti Celebration',
    path: '/gifs/celebrate.gif',
    tags: ['celebrate', 'party', 'win', 'hooray'],
  },
  {
    id: 'gif-locked',
    title: 'Secure Lock',
    path: '/gifs/secure_lock.gif',
    tags: ['secure', 'lock', 'e2ee', 'crypto'],
  },
]);

/**
 * Resolves the CDN base URL from an explicit override or `EXPO_PUBLIC_CDN_BASE_URL`.
 *
 * @param {string} [cdnBaseUrl] - Optional explicit CDN base URL override.
 * @returns {string} Sanitized CDN base URL without trailing slash.
 */
function resolveCdnBase(cdnBaseUrl) {
  const override = String(cdnBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (override) {
    return override;
  }
  return requireMobileEnvUrl(['EXPO_PUBLIC_CDN_BASE_URL', 'CDN_BASE_URL'], 'cdnBaseUrl');
}

/**
 * Encrypts a raw media byte array with client-side AES-256-GCM.
 *
 * @param {Uint8Array | ArrayBuffer} buffer - Plaintext media bytes.
 * @param {string} [customKeyHex] - Optional 32-byte key hex string.
 * @param {string} [customIvHex] - Optional 12-byte IV hex string.
 * @returns {Promise<{
 *   ciphertext: Uint8Array,
 *   authTagHex: string,
 *   keyHex: string,
 *   ivHex: string,
 *   sha256Ciphertext: string
 * }>}
 */
export async function encryptMediaBuffer(buffer, customKeyHex, customIvHex) {
  const inputBytes = toUint8Array(buffer);
  const keyBytes = customKeyHex ? hexToBytes(customKeyHex) : randomBytes(32);
  const ivBytes = customIvHex ? hexToBytes(customIvHex) : randomBytes(12);

  const { ciphertext, authTag } = await encryptAesGcm({
    keyBytes,
    ivBytes,
    plaintextBytes: inputBytes,
  });
  const sha256Ciphertext = await sha256Hex(ciphertext);

  return {
    ciphertext,
    authTagHex: bytesToHex(authTag),
    keyHex: bytesToHex(keyBytes),
    ivHex: bytesToHex(ivBytes),
    sha256Ciphertext,
  };
}

/**
 * Decrypts an authenticated AES-256-GCM encrypted media byte array.
 *
 * @param {{
 *   ciphertext: Uint8Array | ArrayBuffer,
 *   authTagHex: string,
 *   keyHex: string,
 *   ivHex: string
 * }} params - Encrypted payload and key parameters.
 * @returns {Promise<Uint8Array>} Decrypted plaintext bytes.
 */
export async function decryptMediaBuffer({ ciphertext, authTagHex, keyHex, ivHex }) {
  return decryptAesGcm({
    keyBytes: hexToBytes(keyHex),
    ivBytes: hexToBytes(ivHex),
    ciphertextBytes: toUint8Array(ciphertext),
    authTagBytes: hexToBytes(authTagHex),
  });
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
 * }} params - Media pointer fields.
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
 * }} params - Presign request parameters.
 * @returns {Promise<{ presigned_url: string, blob_url?: string }>}
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
 *
 * @returns {ReadonlyArray<string>} Emoji list.
 */
export function getEmojiCatalog() {
  return EMOJI_CATALOG;
}

/**
 * Returns available animated stickers with URLs resolved from `EXPO_PUBLIC_CDN_BASE_URL`.
 *
 * @param {string} [cdnBaseUrl] - Optional explicit CDN base URL override.
 * @returns {Array<{ id: string, name: string, url: string, mimeType: string }>} Sticker catalog.
 */
export function getStickerCatalog(cdnBaseUrl) {
  const base = resolveCdnBase(cdnBaseUrl);
  return STICKER_ASSETS.map(({ id, name, path, mimeType }) => ({
    id,
    name,
    url: `${base}${path}`,
    mimeType,
  }));
}

/**
 * Searches the privacy-preserving GIF catalog by query keyword with URLs resolved from `EXPO_PUBLIC_CDN_BASE_URL`.
 *
 * @param {string} query - Keyword to match against tags or title.
 * @param {string} [cdnBaseUrl] - Optional explicit CDN base URL override.
 * @returns {Array<{ id: string, title: string, url: string, tags: ReadonlyArray<string> }>} Matching GIFs.
 */
export function searchGifs(query, cdnBaseUrl) {
  const base = resolveCdnBase(cdnBaseUrl);
  const q = String(query || '').trim().toLowerCase();
  const filtered = q
    ? GIF_ASSETS.filter(
        (item) => item.title.toLowerCase().includes(q) || item.tags.some((tag) => tag.includes(q))
      )
    : GIF_ASSETS;

  return filtered.map(({ id, title, path, tags }) => ({
    id,
    title,
    url: `${base}${path}`,
    tags,
  }));
}
