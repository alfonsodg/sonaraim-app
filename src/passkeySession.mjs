/**
 * @fileoverview WebAuthn Passkey challenge generation, real assertion verification,
 * and HttpOnly HMAC-signed session cookie management for Sonaraim Client App.
 *
 * Verification model (documented MVD for issue #25):
 * - Challenge bound to origin + RP-ID; the client echoes the challenge inside
 *   `clientDataJSON`, which must parse with `type === 'webauthn.get'`.
 * - COSE-style Ed25519 signature check via WebCrypto (`node:crypto` webcrypto,
 *   stable since Node 22.13): `verify(pubkey, authData || sha256(clientDataJSON))`.
 * - Counter/replay protection: one-time challenge consumption plus strict
 *   monotonic `signCount` tracking per `credentialId` in `credentialStore`.
 * - Credential public keys are bound on first use (TOFU): a known
 *   `credentialId` presenting a different key, a different user, or a
 *   non-monotonic counter is rejected as a cloned/replayed authenticator.
 */

import crypto from 'node:crypto';

import {
  decodeB64urlStrict,
  extractEd25519KeyFromCose,
  parseAttestationObject,
  parseAuthenticatorData,
} from './webauthnCose.mjs';

const SESSION_COOKIE_NAME = 'sonaraim_session';

const DEFAULT_RP_ID = 'localhost';
const DEFAULT_ORIGIN = 'http://localhost';

/**
 * Resolves the expected Relying Party ID from an explicit override or environment.
 *
 * @param {string} [override] - Explicit RP-ID override.
 * @returns {string} Effective RP-ID.
 */
export function resolveRpId(override) {
  const clean = String(override ?? '').trim();
  if (clean) {
    return clean;
  }
  return String(process.env.SONARAIM_RP_ID ?? '').trim() || DEFAULT_RP_ID;
}

/**
 * Resolves the expected origin from an explicit override or environment.
 *
 * @param {string} [override] - Explicit origin override.
 * @returns {string} Effective origin.
 */
export function resolveOrigin(override) {
  const clean = String(override ?? '').trim();
  if (clean) {
    return clean;
  }
  return String(process.env.SONARAIM_ORIGIN ?? '').trim() || DEFAULT_ORIGIN;
}

/**
 * Generates a one-time cryptographic WebAuthn Passkey challenge bound to a
 * user DID, RP-ID, and origin.
 *
 * @param {string} userDid - Sovereign `did:sonaraim:` identifier.
 * @param {Map<string, { challenge: string, userDid: string, expiresAt: number, rpId: string, origin: string }>} challengeStore - In-memory challenge registry.
 * @param {number | { ttlMs?: number, rpId?: string, origin?: string }} [options] - TTL in ms (legacy number) or options object.
 * @returns {{ challengeId: string, challenge: string, userDid: string, expiresAt: number, rpId: string, origin: string }}
 */
export function createPasskeyChallenge(userDid, challengeStore, options) {
  const cleanDid = String(userDid ?? '').trim();
  if (!cleanDid.startsWith('did:sonaraim:')) {
    throw new Error('userDid must start with did:sonaraim:');
  }
  const opts = typeof options === 'number' ? { ttlMs: options } : (options ?? {});
  const ttlMs = Number(opts.ttlMs ?? 300_000);
  const rpId = resolveRpId(opts.rpId);
  const origin = resolveOrigin(opts.origin);
  const challengeId = `pkc_${crypto.randomUUID()}`;
  const challenge = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + ttlMs;
  const record = { challenge, userDid: cleanDid, expiresAt, rpId, origin };
  if (challengeStore instanceof Map) {
    challengeStore.set(challengeId, record);
  }
  return { challengeId, challenge, userDid: cleanDid, expiresAt, rpId, origin };
}

/**
 * Registers a WebAuthn credential from a `webauthn.create` ceremony, binding the
 * extracted COSE Ed25519 public key to `credentialId` + `userDid` in
 * `credentialStore`. Accepts only `fmt: 'none'` self-attestation.
 *
 * @param {object} params - Registration inputs.
 * @param {string} params.userDid - Sovereign `did:sonaraim:` identifier.
 * @param {string} params.credentialId - Opaque credential identifier (base64url).
 * @param {string} params.attestationObject - CBOR attestation object (base64url).
 * @param {string} params.clientDataJSON - JSON client data (base64url, `type === 'webauthn.create'`).
 * @param {string} params.challengeB64 - Pending registration challenge to match.
 * @param {string} [params.expectedRpId] - RP-ID the attestation auth data must hash to.
 * @param {string} [params.expectedOrigin] - Origin the creation clientData must echo.
 * @param {Map} params.credentialStore - Per-credential registry.
 * @returns {{ credentialId: string, userDid: string, publicKeyRaw: string }}
 */
export function registerPasskeyCredential({
  userDid,
  credentialId,
  attestationObject,
  clientDataJSON,
  challengeB64,
  expectedRpId,
  expectedOrigin,
  credentialStore,
}) {
  const cleanDid = String(userDid ?? '').trim();
  if (!cleanDid.startsWith('did:sonaraim:')) {
    throw new Error('userDid must start with did:sonaraim:');
  }
  const cleanCredentialId = String(credentialId ?? '').trim();
  if (!cleanCredentialId) {
    throw new Error('Invalid Passkey registration: missing credentialId');
  }
  if (!(credentialStore instanceof Map)) {
    throw new Error('Valid credentialStore Map is required');
  }
  if (credentialStore.has(cleanCredentialId)) {
    throw new Error('Invalid Passkey registration: credential already registered');
  }
  const clientBytes = decodeB64urlStrict(clientDataJSON, 'clientDataJSON');
  let clientData;
  try {
    clientData = JSON.parse(clientBytes.toString('utf8'));
  } catch {
    throw new Error('Invalid Passkey registration: clientDataJSON is not JSON');
  }
  if (clientData?.type !== 'webauthn.create') {
    throw new Error('Invalid Passkey registration: unexpected clientData type');
  }
  if (String(clientData?.challenge ?? '') !== String(challengeB64 ?? '')) {
    throw new Error('Invalid Passkey registration: challenge mismatch');
  }
  const { authData } = parseAttestationObject(attestationObject);
  const parsed = parseAuthenticatorData(authData);
  if (!parsed.userPresent) {
    throw new Error('Invalid Passkey registration: user-presence flag not set');
  }
  if (!parsed.credentialIdB64 || !parsed.coseKey) {
    throw new Error('Invalid Passkey registration: missing attested credential');
  }
  if (expectedRpId) {
    const expectedHash = Buffer.from(
      crypto.createHash('sha256').update(String(expectedRpId), 'utf8').digest()
    );
    if (!crypto.timingSafeEqual(parsed.rpIdHash, expectedHash)) {
      throw new Error('Invalid Passkey registration: RP-ID mismatch');
    }
  }
  if (expectedOrigin && String(clientData?.origin ?? '') !== String(expectedOrigin)) {
    throw new Error('Invalid Passkey registration: origin mismatch');
  }
  if (parsed.credentialIdB64 !== cleanCredentialId) {
    throw new Error('Invalid Passkey registration: credentialId mismatch');
  }
  const pubBytes = extractEd25519KeyFromCose(parsed.coseKey);
  const publicKeyRaw = pubBytes.toString('base64url');
  credentialStore.set(cleanCredentialId, { publicKeyRaw, lastCounter: 0, userDid: cleanDid });
  return { credentialId: cleanCredentialId, userDid: cleanDid, publicKeyRaw };
}

/**
 * Decodes a base64url string into bytes, throwing a labeled error on failure.
 *
 * @param {string} value - Base64url-encoded input.
 * @param {string} label - Field label for error messages.
 * @returns {Buffer} Decoded bytes.
 */
function decodeB64url(value, label) {
  return decodeB64urlStrict(value, label);
}

/**
 * Verifies a WebAuthn Passkey assertion against a pending one-time challenge
 * (origin/RP-ID/challenge binding, Ed25519 signature, counter/replay checks)
 * and mints a signed HttpOnly session cookie.
 *
 * @param {object} params - Assertion verification inputs.
 * @param {string} params.challengeId - Challenge identifier returned by `createPasskeyChallenge`.
 * @param {string} [params.challenge] - Legacy echoed challenge string (must match stored when provided).
 * @param {string} params.userDid - Authenticating `did:sonaraim:` identifier.
 * @param {string} [params.credentialId] - Opaque credential identifier (base64url).
 * @param {string} params.authenticatorData - Raw authenticator data (base64url, >= 37 bytes).
 * @param {string} params.clientDataJSON - JSON client data (base64url, `type === 'webauthn.get'`).
 * @param {string} params.assertionSignature - Raw Ed25519 signature (base64url, 64 bytes).
 * @param {Map} params.challengeStore - Active challenge store.
 * @param {Map} [params.credentialStore] - Per-credential `{ publicKeyRaw, lastCounter, userDid }` registry.
 * @param {string} params.sessionSecret - Server HMAC secret for signing session tokens.
 * @param {number} [params.sessionTtlSec] - Session lifetime in seconds (default 86400).
 * @param {string} [params.rpId] - RP-ID override (defaults to the stored challenge binding).
 * @param {string} [params.origin] - Origin override (defaults to the stored challenge binding).
 * @returns {{ sessionToken: string, cookieHeader: string, userDid: string, expiresAt: number }}
 */
export function verifyPasskeyAssertionAndIssueSession({
  challengeId,
  challenge,
  userDid,
  credentialId,
  authenticatorData,
  clientDataJSON,
  assertionSignature,
  challengeStore,
  credentialStore,
  sessionSecret,
  sessionTtlSec = 86_400,
  rpId,
  origin,
}) {
  if (!challengeStore || !(challengeStore instanceof Map)) {
    throw new Error('Valid challengeStore Map is required');
  }
  const stored = challengeStore.get(String(challengeId ?? ''));
  if (!stored) {
    throw new Error('Passkey challenge not found or already consumed');
  }
  challengeStore.delete(String(challengeId));

  if (Date.now() > stored.expiresAt) {
    throw new Error('Passkey challenge expired');
  }
  if (stored.userDid !== String(userDid ?? '').trim()) {
    throw new Error('Passkey challenge mismatch');
  }
  if (challenge !== undefined && String(challenge).trim() !== stored.challenge) {
    throw new Error('Passkey challenge mismatch');
  }

  const expectedRpId = String(rpId ?? '').trim() || stored.rpId;
  const expectedOrigin = String(origin ?? '').trim() || stored.origin;

  const clientDataBytes = decodeB64url(clientDataJSON, 'clientDataJSON');
  let clientData;
  try {
    clientData = JSON.parse(clientDataBytes.toString('utf8'));
  } catch {
    throw new Error('Invalid Passkey assertion: clientDataJSON is not JSON');
  }
  if (clientData?.type !== 'webauthn.get') {
    throw new Error('Invalid Passkey assertion: unexpected clientData type');
  }
  if (String(clientData?.origin ?? '') !== expectedOrigin) {
    throw new Error('Invalid Passkey assertion: origin mismatch');
  }
  if (String(clientData?.challenge ?? '') !== stored.challenge) {
    throw new Error('Passkey challenge mismatch');
  }

  const authData = decodeB64url(authenticatorData, 'authenticatorData');
  const parsedAuth = parseAuthenticatorData(authData);
  const rpIdHash = Buffer.from(
    crypto.createHash('sha256').update(expectedRpId, 'utf8').digest()
  );
  if (!crypto.timingSafeEqual(parsedAuth.rpIdHash, rpIdHash)) {
    throw new Error('Invalid Passkey assertion: RP-ID mismatch');
  }
  const signCount = parsedAuth.counter;
  if (!parsedAuth.userPresent) {
    throw new Error('Invalid Passkey assertion: user-presence flag not set');
  }

  const sigBytes = decodeB64url(assertionSignature, 'assertionSignature');
  if (sigBytes.length !== 64) {
    throw new Error('Invalid Passkey assertionSignature');
  }

  const cleanCredentialId = String(credentialId ?? '').trim();
  if (!cleanCredentialId) {
    throw new Error('Invalid Passkey assertion: missing credentialId');
  }
  if (!(credentialStore instanceof Map)) {
    throw new Error('Valid credentialStore Map is required');
  }
  const known = credentialStore.get(cleanCredentialId);
  if (!known) {
    throw new Error('Invalid Passkey assertion: unknown credential (register first)');
  }
  if (String(known.userDid ?? '') !== String(userDid ?? '').trim()) {
    throw new Error('Invalid Passkey assertion: credential user mismatch');
  }
  if (!(signCount > Number(known.lastCounter ?? -1))) {
    throw new Error('Invalid Passkey assertion: counter replay detected');
  }
  const pubBytes = decodeB64urlStrict(known.publicKeyRaw, 'credential public key');
  if (pubBytes.length !== 32) {
    throw new Error('Invalid Passkey assertion: credential public key must be 32 bytes');
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(pubBytes).toString('base64url'),
      },
      format: 'jwk',
    });
  } catch {
    throw new Error('Invalid Passkey assertion: unusable credential public key');
  }
  const clientHash = crypto.createHash('sha256').update(clientDataBytes).digest();
  const signedData = Buffer.concat([Buffer.from(authData), clientHash]);
  let valid = false;
  try {
    valid = crypto.verify(null, signedData, publicKey, sigBytes);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new Error('Invalid Passkey assertionSignature');
  }

  if (credentialStore instanceof Map) {
    credentialStore.set(cleanCredentialId, {
      publicKeyRaw: known.publicKeyRaw,
      lastCounter: signCount,
      userDid: String(userDid ?? '').trim(),
    });
  }

  const secret = String(sessionSecret ?? '').trim();
  if (!secret) {
    throw new Error('sessionSecret is required');
  }

  const expiresAt = Date.now() + Number(sessionTtlSec) * 1000;
  const payloadB64 = Buffer.from(
    JSON.stringify({ sub: String(userDid ?? '').trim(), exp: expiresAt, jti: crypto.randomUUID() }),
    'utf8'
  ).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sessionToken = `${payloadB64}.${mac}`;
  const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Number(sessionTtlSec)}`;

  return {
    sessionToken,
    cookieHeader,
    userDid: String(userDid ?? '').trim(),
    expiresAt,
  };
}

/**
 * Validates the `sonaraim_session` cookie from an HTTP Cookie header or Set-Cookie string.
 *
 * @param {string | undefined} rawCookieHeader - Raw `Cookie` or `Set-Cookie` header string.
 * @param {string} sessionSecret - Server HMAC secret.
 * @returns {{ valid: boolean, userDid?: string, reason?: string }}
 */
export function verifyAppSessionCookie(rawCookieHeader, sessionSecret) {
  const header = String(rawCookieHeader ?? '').trim();
  if (!header) {
    return { valid: false, reason: 'MISSING_COOKIE' };
  }
  const match = header.match(/(?:^|;\s*)sonaraim_session=([^;]+)/);
  if (!match) {
    return { valid: false, reason: 'MISSING_SESSION_TOKEN' };
  }
  const token = match[1].trim();
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'MALFORMED_TOKEN' };
  }

  const [payloadB64, providedMac] = parts;
  const secret = String(sessionSecret ?? '').trim();
  if (!secret) {
    return { valid: false, reason: 'MISSING_SECRET' };
  }

  const expectedMac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const a = Buffer.from(providedMac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  try {
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof claims.exp !== 'number' || Date.now() > claims.exp) {
      return { valid: false, reason: 'SESSION_EXPIRED' };
    }
    return { valid: true, userDid: String(claims.sub) };
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD' };
  }
}
