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

import {
  buildAttestationAuthData,
  buildAttestationObject,
  buildCoseFixtureKey,
  buildRegistrationClientData,
  buildWebauthnAssertion,
  generateEd25519FixtureKey,
  registerFixtureCredential,
} from './webauthnFixtures.mjs';

import {
  startAppTestServer,
  createPasskeyChallenge,
  registerPasskeyCredential,
  verifyPasskeyAssertionAndIssueSession,
  verifyAppSessionCookie,
  resolveRpId,
  resolveOrigin,
  blindContactIdentifier,
  discoverContactsViaNode,
  createLiveKitRoomToken,
  fetchMailboxEnvelopes,
  sendP2pEnvelopeToNode,
  normalizeE164Phone,
  registerPhoneIdentityOnNode,
  createDevicePairingSession,
  verifyDevicePairingCode,
  buildPwaManifest,
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
  const origins = { rpId: 'app.sonaraim.test', origin: 'https://app.sonaraim.test' };
  const ch = createPasskeyChallenge('did:sonaraim:alice', store, origins);
  assert.ok(ch.challengeId);
  assert.ok(ch.challenge);
  assert.equal(ch.rpId, origins.rpId);
  assert.equal(ch.origin, origins.origin);
  assert.equal(resolveRpId(''), process.env.SONARAIM_RP_ID || 'localhost');
  assert.ok(resolveOrigin('').length > 0);

  const credentialStore = new Map();
  const registered = await registerFixtureCredential({
    userDid: 'did:sonaraim:alice',
    rpId: origins.rpId,
    origin: origins.origin,
    credentialStore,
    registerFn: registerPasskeyCredential,
  });
  const assertion = await buildWebauthnAssertion({
    privateKey: registered.privateKey,
    publicKeyRawB64: registered.publicKeyRaw,
    rpId: origins.rpId,
    origin: origins.origin,
    challengeB64: ch.challenge,
    counter: 1,
  });
  assertion.credentialId = registered.credentialId;

  const session = verifyPasskeyAssertionAndIssueSession({
    challengeId: ch.challengeId,
    userDid: 'did:sonaraim:alice',
    credentialStore,
    challengeStore: store,
    sessionSecret: secret,
    rpId: origins.rpId,
    origin: origins.origin,
    ...assertion,
  });
  assert.equal(session.userDid, 'did:sonaraim:alice');
  assert.match(session.cookieHeader, /HttpOnly/i);

  const verified = verifyAppSessionCookie(session.cookieHeader, secret);
  assert.equal(verified.valid, true);
  assert.equal(verified.userDid, 'did:sonaraim:alice');

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: true,
    sessionSecret: secret,
  });

  try {
    const unauthInbox = await httpRequest(`${baseUrl}/inbox`);
    assert.equal(unauthInbox.status, 401);

    const challengeRes = await httpRequest(`${baseUrl}/auth/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:sonaraim:alice', rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    assert.equal(challengeRes.status, 200);
    const challengeData = JSON.parse(challengeRes.body);

    const regChallengeRes = await httpRequest(`${baseUrl}/auth/passkey/register/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:sonaraim:alice', rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    assert.equal(regChallengeRes.status, 200);
    const regChallenge = JSON.parse(regChallengeRes.body);
    const httpKey = await generateEd25519FixtureKey();
    const httpRegClientData = buildRegistrationClientData(regChallenge.challenge, regChallenge.origin);
    const httpCoseKey = buildCoseFixtureKey(httpKey.publicKeyRawB64);
    const httpCredId = Buffer.from(`http-cred-${Date.now()}`).toString('base64url');
    const httpAuthData = await buildAttestationAuthData({
      rpId: regChallenge.rpId,
      credentialIdB64: httpCredId,
      coseKeyBytes: httpCoseKey,
    });
    const regRes = await httpRequest(`${baseUrl}/auth/passkey/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: regChallenge.challengeId,
        userDid: 'did:sonaraim:alice',
        credentialId: httpCredId,
        attestationObject: buildAttestationObject(httpAuthData),
        clientDataJSON: httpRegClientData,
      }),
    });
    assert.equal(regRes.status, 201);

    const forgedRes = await httpRequest(`${baseUrl}/auth/passkey/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData.challengeId,
        userDid: 'did:sonaraim:alice',
        rpId: challengeData.rpId,
        origin: challengeData.origin,
        credentialId: httpCredId,
        authenticatorData: Buffer.alloc(37).toString('base64url'),
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        assertionSignature: Buffer.alloc(64, 9).toString('base64url'),
      }),
    });
    assert.equal(forgedRes.status, 401);

    const challengeRes2 = await httpRequest(`${baseUrl}/auth/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:sonaraim:alice', rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    assert.equal(challengeRes2.status, 200);
    const challengeData2 = JSON.parse(challengeRes2.body);
    const httpAssertion2 = await buildWebauthnAssertion({
      privateKey: httpKey.privateKey,
      publicKeyRawB64: httpKey.publicKeyRawB64,
      rpId: challengeData2.rpId,
      origin: challengeData2.origin,
      challengeB64: challengeData2.challenge,
      counter: 7,
    });
    httpAssertion2.credentialId = httpCredId;

    const verifyRes = await httpRequest(`${baseUrl}/auth/passkey/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challengeData2.challengeId,
        userDid: 'did:sonaraim:alice',
        rpId: challengeData2.rpId,
        origin: challengeData2.origin,
        ...httpAssertion2,
      }),
    });
    assert.equal(verifyRes.status, 200);
    const setCookie = verifyRes.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    const authInbox = await httpRequest(`${baseUrl}/inbox`, {
      headers: { Cookie: cookieStr.split(';')[0] },
    });
    assert.equal(authInbox.status, 200);
    assert.match(authInbox.body, /Sonaraim Dual Inbox/);
  } finally {
    await close();
  }
});

test('Issue #8: PSI contact discovery via Node and LiveKit room token minting', async () => {
  const domainSalt = 'sonaraim-psi-v1';
  const registeredPhone = '+51999111222';
  const registeredDigest = blindContactIdentifier(registeredPhone, domainSalt);

  const mockNode = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/v1/psi/discover') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ matched_tokens: [registeredDigest] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => mockNode.listen(0, '127.0.0.1', r));
  const mockNodeUrl = `http://127.0.0.1:${mockNode.address().port}`;

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: mockNodeUrl,
    appHttpPort: 0,
    livekitUrl: 'wss://livekit.sonaraim.example.com',
  });

  try {
    const directMatches = await discoverContactsViaNode(
      mockNodeUrl,
      ['+51999111222', '+51999000999'],
      domainSalt
    );
    assert.deepEqual(directMatches, ['+51999111222']);

    const psiRes = await httpRequest(`${baseUrl}/api/contacts/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifiers: ['+51999111222', '+51999000999'],
        domainSalt,
      }),
    });
    assert.equal(psiRes.status, 200);
    const psiData = JSON.parse(psiRes.body);
    assert.deepEqual(psiData.matchedContacts, ['+51999111222']);

    const directToken = createLiveKitRoomToken({
      roomName: 'mls-room-01',
      participantDid: 'did:sonaraim:alice',
      livekitUrl: 'wss://livekit.sonaraim.example.com',
      signingKey: 'test-key',
    });
    assert.equal(directToken.roomName, 'mls-room-01');
    assert.equal(directToken.token.split('.').length, 3);

    const callRes = await httpRequest(`${baseUrl}/api/calls/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: 'mls-room-01',
        participantDid: 'did:sonaraim:alice',
      }),
    });
    assert.equal(callRes.status, 200);
    const callData = JSON.parse(callRes.body);
    assert.equal(callData.roomName, 'mls-room-01');
    assert.equal(callData.livekitUrl, 'wss://livekit.sonaraim.example.com');
    assert.equal(callData.token.split('.').length, 3);
  } finally {
    await close();
    await new Promise((r) => mockNode.close(() => r()));
  }
});

test('Issue #9: decode live Node items[].payload_hex into Dual Inbox streams and send P2P messages via POST /inbox/messages', async () => {
  /** @type {Array<Record<string, any>>} */
  const storedItems = [
    {
      envelope_id: 'env-card-b2b-1',
      payload_hex: Buffer.from(
        JSON.stringify({
          tenantDid: 'did:web:store.example.com',
          title: 'Package Dispatched #771',
          actions: ['Track Package', 'Confirm Delivery'],
          clipToken: 'clip_pkg_771',
        }),
        'utf8'
      ).toString('hex'),
    },
  ];

  const mockNode = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname.startsWith('/v1/relay/mailboxes/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: storedItems }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/relay/envelopes') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        storedItems.push({
          envelope_id: parsed.envelope_id || 'env-p2p-1',
          recipient_did: parsed.recipient_did || parsed.mailbox_id,
          payload_hex: parsed.payload_hex,
        });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'queued', envelope_id: 'env-p2p-1' }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => mockNode.listen(0, '127.0.0.1', r));
  const mockNodeUrl = `http://127.0.0.1:${mockNode.address().port}`;

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: mockNodeUrl,
    appHttpPort: 0,
    requireAuth: false,
    sessionSecret: 'issue9-sender-secret-0123456789abcdef',
  });

  /**
   * Issues a session cookie for the sender via register + assert.
   */
  async function cookieFor(userDid) {
    const rcRes = await httpRequest(`${baseUrl}/auth/passkey/register/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid, rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    const rc = JSON.parse(rcRes.body);
    const key = await generateEd25519FixtureKey();
    const credId = Buffer.from(`cred9-${userDid}-${Date.now()}`).toString('base64url');
    const authData = await buildAttestationAuthData({
      rpId: rc.rpId,
      credentialIdB64: credId,
      coseKeyBytes: buildCoseFixtureKey(key.publicKeyRawB64),
    });
    const regRes = await httpRequest(`${baseUrl}/auth/passkey/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: rc.challengeId,
        userDid,
        credentialId: credId,
        attestationObject: buildAttestationObject(authData),
        clientDataJSON: buildRegistrationClientData(rc.challenge, rc.origin),
      }),
    });
    assert.equal(regRes.status, 201);
    const chRes = await httpRequest(`${baseUrl}/auth/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid, rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    const ch = JSON.parse(chRes.body);
    const assertion = await buildWebauthnAssertion({
      privateKey: key.privateKey,
      publicKeyRawB64: key.publicKeyRawB64,
      rpId: ch.rpId,
      origin: ch.origin,
      challengeB64: ch.challenge,
      counter: 1,
    });
    assertion.credentialId = credId;
    const vRes = await httpRequest(`${baseUrl}/auth/passkey/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: ch.challengeId, userDid, ...assertion }),
    });
    assert.equal(vRes.status, 200);
    const setCookie = vRes.headers['set-cookie'];
    return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  }

  const aliceCookie = await cookieFor('did:sonaraim:alice');

  try {
    // 1. Send P2P message via POST /inbox/messages (JSON, session-bound sender)
    const sendRes = await httpRequest(`${baseUrl}/inbox/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        senderDid: 'did:sonaraim:alice',
        recipientDid: 'did:sonaraim:bob',
        text: 'Dinner at 8pm?',
      }),
    });
    assert.equal(sendRes.status, 200);
    const sendJson = JSON.parse(sendRes.body);
    assert.equal(sendJson.status, 'sent');

    // 2. Also verify direct helper sendP2pEnvelopeToNode
    const directSend = await sendP2pEnvelopeToNode(mockNodeUrl, {
      senderDid: 'did:sonaraim:dave',
      recipientDid: 'did:sonaraim:bob',
      text: 'See you tomorrow!',
    });
    assert.equal(directSend.delivered, true);
    assert.equal(storedItems.length, 3);

    // 3. Verify fetchMailboxEnvelopes decodes payload_hex
    const synced = await fetchMailboxEnvelopes(mockNodeUrl, 'did:sonaraim:bob');
    assert.equal(synced.envelopes.length, 3);
    assert.equal(synced.envelopes[0].decodedPayload.title, 'Package Dispatched #771');

    // 4. Verify GET /inbox?mailboxId=did:sonaraim:bob renders both decoded B2B card & P2P messages
    const inboxRes = await httpRequest(`${baseUrl}/inbox?mailboxId=did:sonaraim:bob`);
    assert.equal(inboxRes.status, 200);
    assert.match(inboxRes.body, /Package Dispatched #771/);
    assert.match(inboxRes.body, /did:web:store\.example\.com/);
    assert.match(inboxRes.body, /Dinner at 8pm\?/);
    assert.match(inboxRes.body, /See you tomorrow!/);
    assert.match(inboxRes.body, /<form[^>]*method="POST"[^>]*action="\/inbox\/messages"/i);
  } finally {
    await close();
    await new Promise((r) => mockNode.close(() => r()));
  }
});

test('Issue #10: E.164 phone activation, companion device 6-digit/QR pairing, and mobile PWA manifest', async () => {
  // 1. Phone number normalization
  assert.equal(normalizeE164Phone('+51999888777'), '+51999888777');
  assert.equal(normalizeE164Phone('51999888777'), '+51999888777');
  assert.equal(normalizeE164Phone('+1 (415) 555-2671'), '+14155552671');
  assert.throws(() => normalizeE164Phone(''), /empty/);
  assert.throws(() => normalizeE164Phone('1234'), /Invalid E.164/);

  // 2. Direct unit tests for phone registration & pairing sessions
  const phoneReg = await registerPhoneIdentityOnNode('http://127.0.0.1:8090', '+51 999 888 777');
  assert.equal(phoneReg.phone, '+51999888777');
  assert.equal(phoneReg.userDid, 'did:sonaraim:+51999888777');
  assert.ok(phoneReg.blindedToken);

  const pairingStore = new Map();
  const session = createDevicePairingSession('did:sonaraim:+51999888777', { pairingStore });
  assert.match(session.pairingCode, /^\d{6}$/);
  assert.match(
    session.pairingUri,
    /^sonaraim:\/\/pair\?code=\d{6}&did=did%3Asonaraim%3A%2B51999888777$/
  );

  const verified = verifyDevicePairingCode(session.pairingCode, pairingStore);
  assert.equal(verified.valid, true);
  assert.equal(verified.userDid, 'did:sonaraim:+51999888777');

  const replay = verifyDevicePairingCode(session.pairingCode, pairingStore);
  assert.equal(replay.valid, false);

  // 3. Web App Manifest unit check
  const manifest = buildPwaManifest();
  assert.equal(manifest.name, 'Sonaraim Client');
  assert.equal(manifest.start_url, '/inbox');
  assert.equal(manifest.display, 'standalone');

  // 4. HTTP integration tests (pairing routes require a session since #26)
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: false,
    sessionSecret: 'issue10-pairing-secret-0123456789abcdef',
  });

  /**
   * Issues a real session cookie via register + assert ceremony.
   */
  async function issueCookie(userDid) {
    const rcRes = await httpRequest(`${baseUrl}/auth/passkey/register/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid, rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    assert.equal(rcRes.status, 200);
    const rc = JSON.parse(rcRes.body);
    const key = await generateEd25519FixtureKey();
    const authData = await buildAttestationAuthData({
      rpId: rc.rpId,
      credentialIdB64: Buffer.from(`cred10-${Date.now()}`).toString('base64url'),
      coseKeyBytes: buildCoseFixtureKey(key.publicKeyRawB64),
    });
    const credId = Buffer.from(`cred10-${Date.now()}`).toString('base64url');
    const authData2 = await buildAttestationAuthData({
      rpId: rc.rpId,
      credentialIdB64: credId,
      coseKeyBytes: buildCoseFixtureKey(key.publicKeyRawB64),
    });
    void authData;
    const regRes = await httpRequest(`${baseUrl}/auth/passkey/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: rc.challengeId,
        userDid,
        credentialId: credId,
        attestationObject: buildAttestationObject(authData2),
        clientDataJSON: buildRegistrationClientData(rc.challenge, rc.origin),
      }),
    });
    assert.equal(regRes.status, 201);
    const chRes = await httpRequest(`${baseUrl}/auth/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid, rpId: '127.0.0.1', origin: 'http://127.0.0.1' }),
    });
    const ch = JSON.parse(chRes.body);
    const assertion = await buildWebauthnAssertion({
      privateKey: key.privateKey,
      publicKeyRawB64: key.publicKeyRawB64,
      rpId: ch.rpId,
      origin: ch.origin,
      challengeB64: ch.challenge,
      counter: 1,
    });
    assertion.credentialId = credId;
    const vRes = await httpRequest(`${baseUrl}/auth/passkey/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: ch.challengeId, userDid, ...assertion }),
    });
    assert.equal(vRes.status, 200);
    const setCookie = vRes.headers['set-cookie'];
    return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  }

  const ownerCookie = await issueCookie('did:sonaraim:+51999888777');

  try {
    // Phone registration route
    const regRes = await httpRequest(`${baseUrl}/auth/phone/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+51999888777' }),
    });
    assert.equal(regRes.status, 200);
    const regData = JSON.parse(regRes.body);
    assert.equal(regData.status, 'registered');
    assert.equal(regData.phone, '+51999888777');
    assert.equal(regData.userDid, 'did:sonaraim:+51999888777');

    const regBad = await httpRequest(`${baseUrl}/auth/phone/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: 'bad-number' }),
    });
    assert.equal(regBad.status, 400);

    // Companion device pairing: create code (session-bound since #26)
    const unauthPair = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid: 'did:sonaraim:+51999888777' }),
    });
    assert.equal(unauthPair.status, 401);

    const pairCreate = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ userDid: 'did:sonaraim:+51999888777' }),
    });
    assert.equal(pairCreate.status, 200);
    const pairData = JSON.parse(pairCreate.body);
    assert.equal(pairData.status, 'created');
    assert.match(pairData.pairingCode, /^\d{6}$/);

    // Companion device pairing: redeem code
    const pairClaim = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ pairingCode: pairData.pairingCode }),
    });
    assert.equal(pairClaim.status, 200);
    const claimData = JSON.parse(pairClaim.body);
    assert.equal(claimData.status, 'paired');
    assert.equal(claimData.userDid, 'did:sonaraim:+51999888777');

    // Companion device pairing: invalid code
    const pairBad = await httpRequest(`${baseUrl}/auth/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ pairingCode: '000000' }),
    });
    assert.equal(pairBad.status, 400);

    // GET /manifest.webmanifest
    const manifestRes = await httpRequest(`${baseUrl}/manifest.webmanifest`);
    assert.equal(manifestRes.status, 200);
    assert.match(String(manifestRes.headers['content-type']), /application\/manifest\+json/);
    const manifestBody = JSON.parse(manifestRes.body);
    assert.equal(manifestBody.short_name, 'Sonaraim');

    // GET /inbox rendering linked phone and companion device section
    const inboxRes = await httpRequest(`${baseUrl}/inbox?mailboxId=did:sonaraim:+51999888777`);
    assert.equal(inboxRes.status, 200);
    assert.match(inboxRes.body, /<link rel="icon"[^>]*\/icon-192\.png/);
    assert.match(inboxRes.body, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
    assert.match(inboxRes.body, /Linked Phone:\s*<code>\+51999888777<\/code>/);
    assert.match(inboxRes.body, /Link Companion Device \(6-digit code\)/);
    assert.match(inboxRes.body, /@media\s*\(max-width:\s*375px\)/);
    assert.match(inboxRes.body, /@media\s*\(max-width:\s*768px\)/);
    assert.match(inboxRes.body, /overflow-x:\s*hidden/);
  } finally {
    await close();
  }
});

test('fetchMailboxEnvelopes prefers payload.items over string-only payload.envelopes', async () => {
  const hex = Buffer.from(
    JSON.stringify({ tenant_did: 'did:web:clinic.example.com', cardTitle: 'Lab Result Ready' }),
    'utf8'
  ).toString('hex');
  const mockNode = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        envelopes: ['env_b2b_1'],
        items: [{ envelope_id: 'env_b2b_1', recipient_mailbox_id: 'did:sonaraim:alice', payload_hex: hex }],
      })
    );
  });
  await new Promise((r) => mockNode.listen(0, '127.0.0.1', r));
  try {
    const synced = await fetchMailboxEnvelopes(
      `http://127.0.0.1:${mockNode.address().port}`,
      'did:sonaraim:alice'
    );
    assert.equal(synced.envelopes.length, 1);
    assert.equal(synced.envelopes[0].decodedPayload.cardTitle, 'Lab Result Ready');

    const { baseUrl, close } = await startAppTestServer({
      nodeApiBaseUrl: `http://127.0.0.1:${mockNode.address().port}`,
      appHttpPort: 0,
      requireAuth: false,
    });
    try {
      const inbox = await httpRequest(`${baseUrl}/inbox?mailboxId=did:sonaraim:alice`);
      assert.equal(inbox.status, 200);
      assert.match(inbox.body, /Lab Result Ready/);
    } finally {
      await close();
    }
  } finally {
    await new Promise((r) => mockNode.close(() => r()));
  }
});

test('Issue #22 & #23: fail closed on /inbox by default (401) and fail fast on missing LiveKit config', async () => {
  const prevUrl = process.env.PUBLIC_LIVEKIT_URL;
  const prevSecret = process.env.LIVEKIT_API_SECRET;
  delete process.env.PUBLIC_LIVEKIT_URL;
  delete process.env.LIVEKIT_API_SECRET;

  try {
    assert.throws(
      () => createLiveKitRoomToken({ roomName: 'r1', participantDid: 'did:sonaraim:alice' }),
      /PUBLIC_LIVEKIT_URL is required/
    );
    assert.throws(
      () =>
        createLiveKitRoomToken({
          roomName: 'r1',
          participantDid: 'did:sonaraim:alice',
          livekitUrl: 'wss://livekit.example.com',
        }),
      /LIVEKIT_API_SECRET is required/
    );
  } finally {
    if (prevUrl !== undefined) process.env.PUBLIC_LIVEKIT_URL = prevUrl;
    if (prevSecret !== undefined) process.env.LIVEKIT_API_SECRET = prevSecret;
  }

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
  });
  try {
    const inboxRes = await httpRequest(`${baseUrl}/inbox`);
    assert.equal(inboxRes.status, 401);
    const body = JSON.parse(inboxRes.body);
    assert.equal(body.error, 'unauthorized');
  } finally {
    await close();
  }
});
