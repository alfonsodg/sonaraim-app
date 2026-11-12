/**
 * @fileoverview Milestone 11 TDD test suite for Issues #7, #8, #9, and #10:
 * - #7: WebAuthn Passkey challenge/assertion session endpoints and protected /inbox gate
 * - #8: LiveKit room token endpoint and interactive PSI contact discovery route
 * - #9: Decode live Node payload_hex into Dual Inbox streams and POST /inbox/messages P2P sender
 * - #10: E.164 phone activation, companion device 6-digit/QR pairing, and mobile PWA manifest
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

import {
  startAppTestServer,
  createPasskeyChallenge,
  verifyPasskeyAssertionAndIssueSession,
  verifyAppSessionCookie,
} from '../src/index.mjs';

/**
 * Helper to execute an HTTP request against a local test server.
 *
 * @param {string} url - Full request URL.
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, body: string }>}
 */
function httpRequest(url, options = {}) {
  const parsed = new URL(url);
  const method = options.method ?? 'GET';
  const body = options.body ?? '';
  const headers = { ...(options.headers ?? {}) };
  if (body && !headers['content-length'] && !headers['Content-Length']) {
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: data,
          })
        );
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

test('Issue #7: Passkey challenge generation, assertion verification, session cookie, and protected /inbox gate', async () => {
  const secret = 'test-session-hmac-secret-0123456789';
  const store = new Map();
  const ch = createPasskeyChallenge('did:sonaraim:alice', store);
  assert.ok(ch.challengeId);
  assert.ok(ch.challenge);

  const session = verifyPasskeyAssertionAndIssueSession({
    challengeId: ch.challengeId,
    challenge: ch.challenge,
    userDid: 'did:sonaraim:alice',
    assertionSignature: 'valid_passkey_sig',
    challengeStore: store,
    sessionSecret: secret,
  });
  assert.equal(session.userDid, 'did:sonaraim:alice');
  assert.match(session.cookieHeader, /HttpOnly/i);

  const verified = verifyAppSessionCookie(session.cookieHeader, secret);
  assert.equal(verified.valid, true);
  assert.equal(verified.userDid, 'did:sonaraim:alice');

  // Test HTTP endpoints with requireAuth: true
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: true,
    sessionSecret: secret,
  });

  try {
    // 1. Unauthenticated /inbox returns 401 when requireAuth is true
    const unauthInbox = await httpRequest(`${baseUrl}/inbox`);
    assert.equal(unauthInbox.status, 401);

    // 2. Request a Passkey challenge via POST /auth/passkey/challenge
    const challengeRes = await httpRequest(`${baseUrl}/auth/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:sonaraim:alice' }),
    });
    assert.equal(challengeRes.status, 200);
    const challengeData = JSON.parse(challengeRes.body);
    assert.ok(challengeData.challengeId);
    assert.ok(challengeData.challenge);

    // 3. Verify Passkey assertion via POST /auth/passkey/verify
    const verifyRes = await httpRequest(`${baseUrl}/auth/passkey/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData.challengeId,
        challenge: challengeData.challenge,
        userDid: 'did:sonaraim:alice',
        assertionSignature: crypto
          .createHmac('sha256', challengeData.challenge)
          .update('did:sonaraim:alice')
          .digest('base64url'),
      }),
    });
    assert.equal(verifyRes.status, 200);
    const setCookie = verifyRes.headers['set-cookie'];
    assert.ok(setCookie, 'Expected Set-Cookie header');
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.match(cookieStr, /sonaraim_session=/);
    assert.match(cookieStr, /HttpOnly/i);

    // 4. Authenticated /inbox with session cookie returns 200 OK
    const authInbox = await httpRequest(`${baseUrl}/inbox`, {
      headers: { Cookie: cookieStr.split(';')[0] },
    });
    assert.equal(authInbox.status, 200);
    assert.match(authInbox.body, /Sonaraim Dual Inbox/);
  } finally {
    await close();
  }
});
