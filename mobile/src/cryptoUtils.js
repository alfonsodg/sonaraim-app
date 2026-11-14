/**
 * @fileoverview Cross-platform WebCrypto and binary encoding helpers for Sonaraim Mobile.
 * Uses only standard `globalThis.crypto`, `Uint8Array`, `TextEncoder`, and `TextDecoder`
 * so all cryptographic operations work identically in Node (>=20) and React Native Hermes.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Returns the active WebCrypto instance from `globalThis.crypto`.
 *
 * @returns {Crypto} Standard WebCrypto object.
 * @throws {Error} If WebCrypto `subtle` or `getRandomValues` is unavailable.
 */
function getWebCrypto() {
  const webCrypto = globalThis.crypto;
  if (!webCrypto || !webCrypto.subtle || typeof webCrypto.getRandomValues !== 'function') {
    throw new Error('WebCrypto API (globalThis.crypto.subtle) is required in this runtime');
  }
  return webCrypto;
}

/**
 * Encodes a UTF-8 string into a `Uint8Array`.
 *
 * @param {string} value - Input string.
 * @returns {Uint8Array} UTF-8 encoded bytes.
 */
export function encodeUtf8(value) {
  return textEncoder.encode(String(value ?? ''));
}

/**
 * Decodes a `Uint8Array` into a UTF-8 string.
 *
 * @param {Uint8Array} bytes - Input byte array.
 * @returns {string} Decoded UTF-8 string.
 */
export function decodeUtf8(bytes) {
  return textDecoder.decode(bytes);
}

/**
 * Normalizes an ArrayBuffer or TypedArray into a `Uint8Array`.
 *
 * @param {Uint8Array | ArrayBuffer | ArrayLike<number>} input - Binary input.
 * @returns {Uint8Array} Normalized byte view.
 */
export function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(input);
}

/**
 * Converts a `Uint8Array` to a lowercase hexadecimal string.
 *
 * @param {Uint8Array} bytes - Input bytes.
 * @returns {string} Lowercase hex string.
 */
export function bytesToHex(bytes) {
  const view = toUint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i += 1) {
    out += view[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Converts a hexadecimal string into a `Uint8Array`.
 *
 * @param {string} hex - Even-length hexadecimal string.
 * @returns {Uint8Array} Decoded byte array.
 * @throws {Error} If the hex string has invalid length or characters.
 */
export function hexToBytes(hex) {
  const clean = String(hex ?? '').trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hexadecimal string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Concatenates multiple `Uint8Array` instances into a single `Uint8Array`.
 *
 * @param {...Uint8Array} arrays - Byte arrays to concatenate.
 * @returns {Uint8Array} Combined byte array.
 */
export function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

/**
 * Generates cryptographically secure random bytes via `crypto.getRandomValues`.
 *
 * @param {number} length - Number of random bytes to generate.
 * @returns {Uint8Array} Random byte array.
 */
export function randomBytes(length) {
  const out = new Uint8Array(length);
  getWebCrypto().getRandomValues(out);
  return out;
}

/**
 * Computes a SHA-256 digest over bytes or a UTF-8 string.
 *
 * @param {Uint8Array | string} data - Input data.
 * @returns {Promise<Uint8Array>} 32-byte SHA-256 digest.
 */
export async function sha256Bytes(data) {
  const bytes = typeof data === 'string' ? encodeUtf8(data) : toUint8Array(data);
  const digest = await getWebCrypto().subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

/**
 * Computes a lowercase hex SHA-256 digest over bytes or a UTF-8 string.
 *
 * @param {Uint8Array | string} data - Input data.
 * @returns {Promise<string>} 64-character hex digest.
 */
export async function sha256Hex(data) {
  return bytesToHex(await sha256Bytes(data));
}

/**
 * Computes an HMAC-SHA256 tag using WebCrypto.
 *
 * @param {Uint8Array} keyBytes - Raw HMAC key bytes.
 * @param {Uint8Array} dataBytes - Message bytes to authenticate.
 * @returns {Promise<Uint8Array>} 32-byte HMAC-SHA256 tag.
 */
export async function hmacSha256Bytes(keyBytes, dataBytes) {
  const { subtle } = getWebCrypto();
  const key = await subtle.importKey(
    'raw',
    toUint8Array(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await subtle.sign('HMAC', key, toUint8Array(dataBytes));
  return new Uint8Array(sig);
}

/**
 * Encrypts plaintext bytes using AES-256-GCM with optional AAD.
 *
 * @param {{
 *   keyBytes: Uint8Array,
 *   ivBytes: Uint8Array,
 *   plaintextBytes: Uint8Array,
 *   additionalDataBytes?: Uint8Array
 * }} params - Encryption inputs.
 * @returns {Promise<{ ciphertext: Uint8Array, authTag: Uint8Array }>} Ciphertext and 16-byte GCM tag.
 */
export async function encryptAesGcm({ keyBytes, ivBytes, plaintextBytes, additionalDataBytes }) {
  const { subtle } = getWebCrypto();
  const key = await subtle.importKey(
    'raw',
    toUint8Array(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const algorithm = {
    name: 'AES-GCM',
    iv: toUint8Array(ivBytes),
    tagLength: 128,
    ...(additionalDataBytes ? { additionalData: toUint8Array(additionalDataBytes) } : {}),
  };
  const encrypted = new Uint8Array(
    await subtle.encrypt(algorithm, key, toUint8Array(plaintextBytes))
  );
  const tagOffset = encrypted.length - 16;
  return {
    ciphertext: encrypted.slice(0, tagOffset),
    authTag: encrypted.slice(tagOffset),
  };
}

/**
 * Decrypts AES-256-GCM ciphertext and verifies its 16-byte authentication tag.
 *
 * @param {{
 *   keyBytes: Uint8Array,
 *   ivBytes: Uint8Array,
 *   ciphertextBytes: Uint8Array,
 *   authTagBytes: Uint8Array,
 *   additionalDataBytes?: Uint8Array
 * }} params - Decryption inputs.
 * @returns {Promise<Uint8Array>} Decrypted plaintext bytes.
 */
export async function decryptAesGcm({
  keyBytes,
  ivBytes,
  ciphertextBytes,
  authTagBytes,
  additionalDataBytes,
}) {
  const { subtle } = getWebCrypto();
  const key = await subtle.importKey(
    'raw',
    toUint8Array(keyBytes),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const combined = concatBytes(toUint8Array(ciphertextBytes), toUint8Array(authTagBytes));
  const algorithm = {
    name: 'AES-GCM',
    iv: toUint8Array(ivBytes),
    tagLength: 128,
    ...(additionalDataBytes ? { additionalData: toUint8Array(additionalDataBytes) } : {}),
  };
  const decrypted = await subtle.decrypt(algorithm, key, combined);
  return new Uint8Array(decrypted);
}
