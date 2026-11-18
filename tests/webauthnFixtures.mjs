/**
 * @fileoverview Shared WebAuthn assertion fixture builder for issue #25 tests.
 * Signs `authData || sha256(clientDataJSON)` with Ed25519 via WebCrypto and
 * builds `fmt: 'none'` attestation objects for the registration ceremony.
 */

import { webcrypto } from 'node:crypto';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * Generates an Ed25519 keypair and exports the raw 32-byte public key.
 *
 * @returns {Promise<{ privateKey: CryptoKey, publicKey: CryptoKey, publicKeyRawB64: string }>}
 */
export async function generateEd25519FixtureKey() {
  const kp = await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  return { privateKey: kp.privateKey, publicKey: kp.publicKey, publicKeyRawB64: b64url(raw) };
}

/**
 * Encodes a CBOR unsigned integer (major type 0, values < 2^32).
 *
 * @param {number} value - Non-negative integer.
 * @returns {Buffer} CBOR encoding.
 */
function cborUint(value) {
  if (value < 24) {
    return Buffer.from([value]);
  }
  if (value < 256) {
    return Buffer.from([0x18, value]);
  }
  if (value < 65536) {
    const out = Buffer.alloc(3);
    out[0] = 0x19;
    out.writeUInt16BE(value, 1);
    return out;
  }
  const out = Buffer.alloc(5);
  out[0] = 0x1a;
  out.writeUInt32BE(value, 1);
  return out;
}

/**
 * Encodes a CBOR byte string (major type 2).
 *
 * @param {Buffer} bytes - Payload.
 * @returns {Buffer} CBOR encoding.
 */
export function cborBytes(bytes) {
  return Buffer.concat([encodeLength(2, bytes.length), bytes]);
}

/**
 * Encodes a CBOR length header for a major type.
 *
 * @param {number} major - CBOR major type (0-7).
 * @param {number} length - Payload length.
 * @returns {Buffer} Header bytes.
 */
function encodeLength(major, length) {
  const prefix = major << 5;
  if (length < 24) {
    return Buffer.from([prefix | length]);
  }
  if (length < 256) {
    return Buffer.from([prefix | 24, length]);
  }
  if (length < 65536) {
    const out = Buffer.alloc(3);
    out[0] = prefix | 25;
    out.writeUInt16BE(length, 1);
    return out;
  }
  const out = Buffer.alloc(5);
  out[0] = prefix | 26;
  out.writeUInt32BE(length, 1);
  return out;
}

/**
 * Encodes a CBOR UTF-8 text string (major type 3).
 *
 * @param {string} text - Payload.
 * @returns {Buffer} CBOR encoding.
 */
export function cborText(text) {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.concat([encodeLength(3, bytes.length), bytes]);
}

/**
 * Builds a COSE Ed25519 public-key map: `{1: 1, 3: -8, -1: 6, -2: x}`.
 *
 * @param {Buffer} xBytes - 32-byte raw public key.
 * @returns {Buffer} CBOR-encoded COSE key.
 */
export function encodeCoseEd25519Key(xBytes) {
  const parts = [
    Buffer.from([0xa4]),
    Buffer.from([0x01, 0x01]),
    Buffer.from([0x03, 0x27]),
    Buffer.from([0x20, 0x06]),
    Buffer.from([0x21]),
    cborBytes(xBytes),
  ];
  return Buffer.concat(parts);
}

/**
 * Builds a COSE Ed25519 key plus attested authenticator data for HTTP registration tests.
 *
 * @param {string} publicKeyRawB64 - Raw 32-byte public key (base64url).
 * @returns {Buffer} CBOR-encoded COSE key.
 */
export function buildCoseFixtureKey(publicKeyRawB64) {
  return encodeCoseEd25519Key(Buffer.from(String(publicKeyRawB64), 'base64url'));
}

/**
 * Builds attested authenticator data for HTTP registration tests.
 *
 * @param {object} params - Authenticator data inputs.
 * @returns {Promise<Buffer>} Raw authenticator data.
 */
export async function buildAttestationAuthData(params) {
  return buildAuthenticatorDataWithCredential(params);
}

/**
 * Builds raw authenticator data with an attested credential section.
 * @param {string} params.rpId - Relying Party ID.
 * @param {string} params.credentialIdB64 - Credential identifier (base64url).
 * @param {Buffer} params.coseKeyBytes - CBOR COSE key.
 * @param {number} [params.counter] - Signature counter.
 * @returns {Promise<Buffer>} Raw authenticator data.
 */
export async function buildAuthenticatorDataWithCredential({
  rpId,
  credentialIdB64,
  coseKeyBytes,
  counter = 0,
}) {
  const rpIdHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
  const credId = Buffer.from(credentialIdB64, 'base64url');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(credId.length, 0);
  const aaguid = Buffer.alloc(16, 0);
  return Buffer.concat([
    rpIdHash,
    Buffer.from([0x41]),
    Buffer.from([(counter >>> 24) & 0xff, (counter >>> 16) & 0xff, (counter >>> 8) & 0xff, counter & 0xff]),
    aaguid,
    len,
    credId,
    coseKeyBytes,
  ]);
}

/**
 * Builds a `fmt: 'none'` attestation object wrapping authenticator data.
 *
 * @param {Buffer} authData - Raw authenticator data.
 * @returns {string} Base64url CBOR attestation object.
 */
export function buildAttestationObject(authData) {
  const fmtPart = Buffer.concat([cborText('fmt'), cborText('none')]);
  const authPart = Buffer.concat([cborText('authData'), cborBytes(authData)]);
  const stmtPart = Buffer.concat([cborText('attStmt'), Buffer.from([0xa0])]);
  return b64url(Buffer.concat([Buffer.from([0xa3]), fmtPart, authPart, stmtPart]));
}

/**
 * Builds a `webauthn.create` clientDataJSON bound to a challenge and origin.
 *
 * @param {string} challengeB64 - Challenge to echo.
 * @param {string} origin - Expected origin.
 * @returns {string} Base64url clientDataJSON.
 */
export function buildRegistrationClientData(challengeB64, origin) {
  return b64url(
    Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: challengeB64, origin }), 'utf8')
  );
}

/**
 * Builds a signed `webauthn.get` assertion bound to a challenge/origin/RP-ID.
 *
 * @param {object} params - Fixture inputs.
 * @param {CryptoKey} params.privateKey - Ed25519 private key.
 * @param {string} params.publicKeyRawB64 - Raw public key as credentialId material.
 * @param {string} params.rpId - Relying Party ID.
 * @param {string} params.origin - Expected origin.
 * @param {string} params.challengeB64 - Stored challenge (base64url of raw bytes).
 * @param {number} [params.counter] - Signature counter (default 1).
 * @returns {Promise<{ credentialId: string, authenticatorData: string, clientDataJSON: string, assertionSignature: string }>}
 */
export async function buildWebauthnAssertion({
  privateKey,
  publicKeyRawB64,
  rpId,
  origin,
  challengeB64,
  counter = 1,
}) {
  const clientData = {
    type: 'webauthn.get',
    challenge: challengeB64,
    origin,
  };
  const clientDataJSON = Buffer.from(JSON.stringify(clientData), 'utf8');
  const rpIdHash = Buffer.from(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
  );
  const authData = Buffer.concat([
    rpIdHash,
    Buffer.from([0x01]),
    Buffer.from([
      (counter >>> 24) & 0xff,
      (counter >>> 16) & 0xff,
      (counter >>> 8) & 0xff,
      counter & 0xff,
    ]),
  ]);
  const clientHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', clientDataJSON));
  const signed = Buffer.concat([authData, clientHash]);
  const signature = Buffer.from(await webcrypto.subtle.sign('Ed25519', privateKey, signed));
  return {
    credentialId: String(publicKeyRawB64),
    authenticatorData: b64url(authData),
    clientDataJSON: b64url(clientDataJSON),
    assertionSignature: b64url(signature),
  };
}

/**
 * Registers a fixture credential, returning its id, key material, and details.
 *
 * @param {object} params - Registration inputs.
 * @param {string} params.userDid - Owner DID.
 * @param {string} params.rpId - Relying Party ID.
 * @param {string} params.origin - Expected origin.
 * @param {Map} params.credentialStore - Registry to populate.
 * @param {Function} params.registerFn - `registerPasskeyCredential` implementation.
 * @returns {Promise<{ credentialId: string, privateKey: CryptoKey, publicKeyRawB64: string }>}
 */
export async function registerFixtureCredential({ userDid, rpId, origin, credentialStore, registerFn }) {
  const challengeB64 = Buffer.from('registration-challenge-test').toString('base64url');
  const { privateKey, publicKeyRawB64 } = await generateEd25519FixtureKey();
  const cose = encodeCoseEd25519Key(Buffer.from(publicKeyRawB64, 'base64url'));
  const credId = `cred_${Math.random().toString(36).slice(2, 10)}`;
  const authData = await buildAuthenticatorDataWithCredential({
    rpId,
    credentialIdB64: Buffer.from(credId).toString('base64url'),
    coseKeyBytes: cose,
  });
  const credentialId = Buffer.from(credId).toString('base64url');
  const registered = registerFn({
    userDid,
    credentialId,
    attestationObject: buildAttestationObject(authData),
    clientDataJSON: buildRegistrationClientData(challengeB64, origin),
    challengeB64,
    credentialStore,
  });
  return { ...registered, privateKey };
}
