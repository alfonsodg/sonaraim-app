/**
 * @fileoverview HttpOnly HMAC-signed session cookie issuance and validation.
 * Extracted from `src/passkeySession.mjs` to respect the 300-line boundary.
 */

import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'sonaraim_session';

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

/**
 * Mints an HMAC-signed session token and its `Set-Cookie` header value.
 *
 * @param {string} userDid - Authenticated `did:sonaraim:` identifier.
 * @param {string} sessionSecret - Server HMAC secret.
 * @param {number} [sessionTtlSec] - Session lifetime in seconds (default 86400).
 * @returns {{ sessionToken: string, cookieHeader: string, expiresAt: number }}
 */
export function mintSessionCookie(userDid, sessionSecret, sessionTtlSec = 86_400) {
  const secret = String(sessionSecret ?? '').trim();
  if (!secret) {
    throw new Error('sessionSecret is required');
  }
  const cleanDid = String(userDid ?? '').trim();
  if (!cleanDid) {
    throw new Error('userDid is required');
  }
  const ttl = Number(sessionTtlSec) > 0 ? Number(sessionTtlSec) : 86_400;
  const expiresAt = Date.now() + ttl * 1000;
  const payloadB64 = Buffer.from(
    JSON.stringify({ sub: cleanDid, exp: expiresAt, jti: crypto.randomUUID() }),
    'utf8'
  ).toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sessionToken = `${payloadB64}.${mac}`;
  return {
    sessionToken,
    cookieHeader: `${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}`,
    expiresAt,
  };
}
