/**
 * @fileoverview Minimal CBOR decoder plus WebAuthn attestation/authenticator-data
 * parsing for Sonaraim Client App. Supports only definite-length values and the
 * structures produced by `webauthn.create` (`fmt: 'none'`) responses and COSE
 * Ed25519 keys — enough for registration without external dependencies.
 */

/**
 * Decodes a base64url string into bytes.
 *
 * @param {string} value - Base64url-encoded input.
 * @param {string} label - Field label for error messages.
 * @returns {Buffer} Decoded bytes.
 */
export function decodeB64urlStrict(value, label) {
  const clean = String(value ?? '').trim();
  if (!clean) {
    throw new Error(`Invalid Passkey assertion: missing ${label}`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(clean)) {
    throw new Error(`Invalid Passkey assertion: malformed ${label}`);
  }
  try {
    return Buffer.from(clean, 'base64url');
  } catch {
    throw new Error(`Invalid Passkey assertion: malformed ${label}`);
  }
}

/**
 * Reads a CBOR argument/length value.
 *
 * @param {Buffer} buf - Input bytes.
 * @param {number} offset - Read position.
 * @param {number} arg - Initial-byte argument bits.
 * @returns {{ value: number, next: number }} Decoded value and next offset.
 */
function readCborArg(buf, offset, arg) {
  if (arg < 24) {
    return { value: arg, next: offset };
  }
  if (arg === 24) {
    return { value: buf.readUInt8(offset), next: offset + 1 };
  }
  if (arg === 25) {
    return { value: buf.readUInt16BE(offset), next: offset + 2 };
  }
  if (arg === 26) {
    const value = buf.readUInt32BE(offset);
    return { value, next: offset + 4 };
  }
  throw new Error('Unsupported CBOR length encoding');
}

/**
 * Decodes one CBOR data item starting at `offset`.
 *
 * @param {Buffer} buf - Input bytes.
 * @param {number} [offset] - Start position.
 * @returns {{ value: unknown, next: number }} Decoded value and next offset.
 */
export function decodeCborItem(buf, offset = 0) {
  if (offset >= buf.length) {
    throw new Error('Truncated CBOR input');
  }
  const initial = buf[offset];
  const major = initial >> 5;
  const arg = initial & 0x1f;
  let pos = offset + 1;

  if (major === 0) {
    const { value, next } = readCborArg(buf, pos, arg);
    return { value, next };
  }
  if (major === 1) {
    const { value, next } = readCborArg(buf, pos, arg);
    return { value: -1 - value, next };
  }
  if (major === 2 || major === 3) {
    const { value: length, next } = readCborArg(buf, pos, arg);
    pos = next;
    if (pos + length > buf.length) {
      throw new Error('Truncated CBOR byte/text string');
    }
    const slice = buf.subarray(pos, pos + length);
    return { value: major === 2 ? Buffer.from(slice) : slice.toString('utf8'), next: pos + length };
  }
  if (major === 4) {
    const { value: length, next } = readCborArg(buf, pos, arg);
    pos = next;
    const items = [];
    for (let i = 0; i < length; i += 1) {
      const decoded = decodeCborItem(buf, pos);
      items.push(decoded.value);
      pos = decoded.next;
    }
    return { value: items, next: pos };
  }
  if (major === 5) {
    const { value: length, next } = readCborArg(buf, pos, arg);
    pos = next;
    const entries = new Map();
    for (let i = 0; i < length; i += 1) {
      const key = decodeCborItem(buf, pos);
      pos = key.next;
      const val = decodeCborItem(buf, pos);
      pos = val.next;
      entries.set(key.value, val.value);
    }
    return { value: entries, next: pos };
  }
  if (major === 7) {
    if (arg === 20 || arg === 21) {
      return { value: arg === 21, next: pos };
    }
    if (arg === 22 || arg === 23) {
      return { value: null, next: pos };
    }
    throw new Error('Unsupported CBOR simple value');
  }
  throw new Error('Unsupported CBOR major type');
}

/**
 * Parses a WebAuthn `attestationObject` (`fmt: 'none'` only) into auth data bytes.
 *
 * @param {string} attestationObjectB64 - Base64url CBOR attestation object.
 * @returns {{ fmt: string, authData: Buffer }} Attestation format and authenticator data.
 */
export function parseAttestationObject(attestationObjectB64) {
  const raw = decodeB64urlStrict(attestationObjectB64, 'attestationObject');
  const { value } = decodeCborItem(raw, 0);
  if (!(value instanceof Map)) {
    throw new Error('Invalid Passkey registration: attestationObject must be a map');
  }
  const fmt = value.get('fmt');
  if (fmt !== 'none') {
    throw new Error(
      `Unsupported attestation format "${String(fmt)}": only self-attested fmt 'none' is accepted`
    );
  }
  const authData = value.get('authData');
  if (!Buffer.isBuffer(authData)) {
    throw new Error('Invalid Passkey registration: attestationObject missing authData');
  }
  return { fmt, authData: Buffer.from(authData) };
}

/**
 * Parses raw authenticator data, including the attested credential section.
 *
 * @param {Buffer} authData - Raw authenticator data bytes.
 * @returns {{
 *   rpIdHash: Buffer, flags: number, userPresent: boolean,
 *   counter: number, credentialIdB64: string | null, coseKeyBytes: Buffer | null
 * }} Parsed fields.
 */
export function parseAuthenticatorData(authData) {
  const bytes = Buffer.from(authData);
  if (bytes.length < 37) {
    throw new Error('Invalid Passkey assertion: authenticatorData too short');
  }
  const flags = bytes[32];
  const counter = bytes.readUInt32BE(33);
  const result = {
    rpIdHash: bytes.subarray(0, 32),
    flags,
    userPresent: (flags & 0x01) !== 0,
    counter,
    credentialIdB64: null,
    coseKeyBytes: null,
  };
  if ((flags & 0x40) === 0) {
    return result;
  }
  if (bytes.length < 55) {
    throw new Error('Invalid Passkey registration: attested data truncated');
  }
  const credIdLen = bytes.readUInt16BE(53);
  const credStart = 55;
  const credEnd = credStart + credIdLen;
  if (credIdLen === 0 || credEnd > bytes.length) {
    throw new Error('Invalid Passkey registration: credentialId truncated');
  }
  const { value, next } = decodeCborItem(bytes, credEnd);
  if (!(value instanceof Map)) {
    throw new Error('Invalid Passkey registration: credential key must be a COSE map');
  }
  result.credentialIdB64 = bytes.subarray(credStart, credEnd).toString('base64url');
  result.coseKeyBytes = bytes.subarray(credEnd, next);
  result.coseKey = value;
  return result;
}

/**
 * Extracts the 32-byte Ed25519 `x` coordinate from a decoded COSE key map.
 * Expects `kty OKP (1), crv Ed25519 (6), x: bstr(32)`.
 *
 * @param {Map<unknown, unknown>} coseKey - Decoded COSE key map.
 * @returns {Buffer} Raw 32-byte public key.
 */
export function extractEd25519KeyFromCose(coseKey) {
  if (!(coseKey instanceof Map)) {
    throw new Error('Invalid Passkey registration: credential key must be a COSE map');
  }
  if (coseKey.get(1) !== 1 || coseKey.get(-1) !== 6) {
    throw new Error('Invalid Passkey registration: only COSE OKP Ed25519 keys are accepted');
  }
  const x = coseKey.get(-2);
  if (!Buffer.isBuffer(x) || x.length !== 32) {
    throw new Error('Invalid Passkey registration: Ed25519 key must be 32 bytes');
  }
  return Buffer.from(x);
}
