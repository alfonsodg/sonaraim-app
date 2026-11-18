/**
 * @fileoverview Issue #26 acceptance tests: session-bound senderDid and
 * authenticated, attempt-limited pairing redeem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  createDevicePairingSession,
  createPairingAttemptLimiter,
  startAppTestServer,
  verifyDevicePairingCode,
} from '../src/index.mjs';
import {
  issueSessionCookieHttp,
  buildAttestationAuthData,
  buildAttestationObject,
  buildCoseFixtureKey,
  buildRegistrationClientData,
  buildWebauthnAssertion,
  generateEd25519FixtureKey,
} from './webauthnFixtures.mjs';

/**
 * Minimal HTTP helper for local test servers.
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
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data })
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

const RP_ID = '127.0.0.1';
const ORIGIN = 'http://127.0.0.1';

/**
 * Registers a fixture credential, asserts it, and returns the session cookie.
 */

async function issueSessionCookie(baseUrl, userDid) {
  return issueSessionCookieHttp(baseUrl, userDid, httpRequest, assert.equal);
}

test('#26: pairing redeem requires session; creation binds owner to session', async () => {
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: false,
    sessionSecret: 'issue26-secret-0123456789abcdef',
  });
  try {
    const noSessionCreate = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:sonaraim:+51999888777' }),
    });
    assert.equal(noSessionCreate.status, 401);

    const noSessionRedeem = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: '123456' }),
    });
    assert.equal(noSessionRedeem.status, 401);

    const alice = await issueSessionCookie(baseUrl, 'did:sonaraim:alice');

    const ownerMismatch = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alice },
      body: JSON.stringify({ userDid: 'did:sonaraim:mallory' }),
    });
    assert.equal(ownerMismatch.status, 403);

    const created = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alice },
      body: JSON.stringify({ userDid: 'did:sonaraim:alice' }),
    });
    assert.equal(created.status, 200);
    const createdData = JSON.parse(created.body);
    assert.match(createdData.pairingCode, /^\d{6}$/);

    const redeemed = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alice },
      body: JSON.stringify({ pairingCode: createdData.pairingCode }),
    });
    assert.equal(redeemed.status, 200);
    const redeemedData = JSON.parse(redeemed.body);
    assert.equal(redeemedData.status, 'paired');
    assert.equal(redeemedData.userDid, 'did:sonaraim:alice');

    const replay = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alice },
      body: JSON.stringify({ pairingCode: createdData.pairingCode }),
    });
    assert.equal(replay.status, 400);

    for (let i = 0; i < 12; i += 1) {
      await httpRequest(`${baseUrl}/auth/devices/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: alice },
        body: JSON.stringify({ pairingCode: '000000' }),
      });
    }
    const limited = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alice },
      body: JSON.stringify({ pairingCode: '000000' }),
    });
    assert.equal(limited.status, 429);
  } finally {
    await close();
  }
});

test('#26: senderDid mismatch rejected; session sender accepted', async () => {
  const seenPayloads = [];
  const mockNode = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/v1/relay/envelopes') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        try {
          seenPayloads.push(JSON.parse(body));
        } catch {
          seenPayloads.push({});
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'queued', envelope_id: 'env-26' }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => mockNode.listen(0, '127.0.0.1', r));
  const mockNodeUrl = `http://127.0.0.1:${mockNode.address().port}`;

  const secret = 'issue26-secret-0123456789abcdef';
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: mockNodeUrl,
    appHttpPort: 0,
    requireAuth: false,
    sessionSecret: secret,
  });
  try {
    const noSession = await httpRequest(`${baseUrl}/inbox/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        senderDid: 'did:sonaraim:alice',
        recipientDid: 'did:sonaraim:bob',
        text: 'spoofed',
      }),
    });
    assert.equal(noSession.status, 401);

    const alice = await issueSessionCookie(baseUrl, 'did:sonaraim:alice', secret);

    const mismatch = await httpRequest(`${baseUrl}/inbox/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: alice },
      body: JSON.stringify({
        senderDid: 'did:sonaraim:mallory',
        recipientDid: 'did:sonaraim:bob',
        text: 'impersonation attempt',
      }),
    });
    assert.equal(mismatch.status, 403);
    assert.match(mismatch.body, /mismatch/);

    const ok = await httpRequest(`${baseUrl}/inbox/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: alice },
      body: JSON.stringify({
        senderDid: 'did:sonaraim:alice',
        recipientDid: 'did:sonaraim:bob',
        text: 'legit message',
      }),
    });
    assert.equal(ok.status, 200);

    const implicit = await httpRequest(`${baseUrl}/inbox/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: alice },
      body: JSON.stringify({
        recipientDid: 'did:sonaraim:bob',
        text: 'no claimed sender',
      }),
    });
    assert.equal(implicit.status, 200);
    assert.equal(seenPayloads.length, 2);
    for (const payload of seenPayloads) {
      assert.equal(payload.sender_did, 'did:sonaraim:alice');
    }
  } finally {
    await close();
    await new Promise((r) => mockNode.close(() => r()));
  }
});

test('#26: attempt limiter blocks brute force after the window fills', () => {
  const store = new Map();
  createDevicePairingSession('did:sonaraim:+51999888777', { pairingStore: store });
  const attemptStore = new Map();
  for (let i = 0; i < 10; i += 1) {
    const res = verifyDevicePairingCode('000000', store, { attemptStore });
    assert.equal(res.valid, false);
  }
  const blocked = verifyDevicePairingCode('000000', store, {
    attemptStore,
    maxAttempts: 3,
    windowMs: 600_000,
    nowMs: Date.now(),
  });
  assert.equal(blocked.valid, false);
  assert.match(blocked.reason, /Too many|Invalid/i);

  const limiter = createPairingAttemptLimiter({ maxAttempts: 3, windowMs: 60_000 });
  assert.equal(limiter.checkAndRecord('k').allowed, true);
  assert.equal(limiter.checkAndRecord('k').allowed, true);
  assert.equal(limiter.checkAndRecord('k').allowed, true);
  assert.equal(limiter.checkAndRecord('k').allowed, false);
  assert.equal(limiter.checkAndRecord('other').allowed, true);
});
