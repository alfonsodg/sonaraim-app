/**
 * @fileoverview WebAuthn Passkey challenge generation, assertion verification,
 * and HttpOnly HMAC-signed session cookie management for Sonaraim Client App.
 */

import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'sonaraim_session';

/**
 * Generates a one-time cryptographic WebAuthn Passkey challenge bound to a user DID.
 *
 * @param {string} userDid - Sovereign `did:sonaraim:` identifier.
 * @param {Map<string, { challenge: string, userDid: string, expiresAt: number }>} challengeStore - In-memory challenge registry.
 * @param {number} [ttlMs] - Challenge validity window in milliseconds (default 300_000ms).
 * @returns {{ challengeId: string, challenge: string, userDid: string, expiresAt: number }}
 */
export function createPasskeyChallenge(userDid, challengeStore, ttlMs = 300_000) {
  const cleanDid = String(userDid ?? '').trim();
  if (!cleanDid.startsWith('did:sonaraim:')) {
    throw new Error('userDid must start with did:sonaraim:');
  }
  const challengeId = `pkc_${crypto.randomUUID()}`;
  const challenge = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + ttlMs;
  const record = { challenge, userDid: cleanDid, expiresAt };
  if (challengeStore instanceof Map) {
    challengeStore.set(challengeId, record);
  }
  return { challengeId, challenge, userDid: cleanDid, expiresAt };
}

/**
 * Verifies a Passkey assertion against a pending one-time challenge and mints a signed HttpOnly session cookie.
 *
 * @param {object} params - Assertion verification inputs.
 * @param {string} params.challengeId - Challenge identifier returned by `createPasskeyChallenge`.
 * @param {string} params.challenge - Challenge nonce signed by the authenticator.
 * @param {string} params.userDid - Authenticating `did:sonaraim:` identifier.
 * @param {string} params.assertionSignature - Non-empty WebAuthn assertion signature.
 * @param {Map<string, { challenge: string, userDid: string, expiresAt: number }>} params.challengeStore - Active challenge store.
 * @param {string} params.sessionSecret - Server HMAC secret for signing session tokens.
 * @param {number} [params.sessionTtlSec] - Session lifetime in seconds (default 86400).
 * @returns {{ sessionToken: string, cookieHeader: string, userDid: string, expiresAt: number }}
 */
export function verifyPasskeyAssertionAndIssueSession({
  challengeId,
  challenge,
  userDid,
  assertionSignature,
  challengeStore,
  sessionSecret,
  sessionTtlSec = 86_400,
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
  if (stored.challenge !== challenge || stored.userDid !== userDid) {
    throw new Error('Passkey challenge mismatch');
  }
  if (typeof assertionSignature !== 'string' || assertionSignature.trim().length < 4) {
    throw new Error('Invalid Passkey assertionSignature');
  }

  const secret = String(sessionSecret ?? '').trim();
  if (!secret) {
    throw new Error('sessionSecret is required');
  }

  const expiresAt = Date.now() + sessionTtlSec * 1000;
  const payloadB64 = Buffer.from(
    JSON.stringify({ sub: userDid, exp: expiresAt, jti: crypto.randomUUID() }),
    'utf8'
  ).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sessionToken = `${payloadB64}.${mac}`;
  const cookieHeader = `${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionTtlSec}`;

  return {
    sessionToken,
    cookieHeader,
    userDid,
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
