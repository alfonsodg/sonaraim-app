/**
 * @fileoverview Issue #27 web acceptance test: the E2EE media pointer travels
 * in the P2P envelope (composer → relay → drain) and the web inbox renders the
 * attachment badge for the recipient.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { sendP2pEnvelopeToNode, startAppTestServer } from '../src/index.mjs';
import { issueSessionCookieHttp } from './webauthnFixtures.mjs';

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

test('#27: P2P envelope carries mediaPointer; inbox renders attachment badge', async () => {
  const storedItems = [];
  const mockNode = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/v1/relay/envelopes') {
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        storedItems.push({
          envelope_id: parsed.envelope_id || 'env-media-1',
          recipient_did: parsed.recipient_did,
          payload_hex: parsed.payload_hex,
        });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'queued', envelope_id: 'env-media-1' }));
      });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/v1/relay/mailboxes/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: storedItems }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => mockNode.listen(0, '127.0.0.1', r));
  const mockNodeUrl = `http://127.0.0.1:${mockNode.address().port}`;

  const secret = 'issue27-secret-0123456789abcdef';
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: mockNodeUrl,
    appHttpPort: 0,
    requireAuth: false,
    sessionSecret: secret,
  });
  try {
    const aliceCookie = await issueSessionCookieHttp(
      baseUrl,
      'did:sonaraim:alice',
      httpRequest,
      assert.equal
    );
    const pointer = {
      type: 'encrypted_media_pointer_v1',
      mediaUrl: 'https://storage.example.com/blobs/e2e',
      sha256: 'ab'.repeat(32),
      mimeType: 'image/jpeg',
      keyHex: '01'.repeat(32),
      ivHex: '02'.repeat(12),
      authTagHex: '03'.repeat(16),
      fileName: 'photo.jpg',
      sizeBytes: 12,
    };
    const sent = await sendP2pEnvelopeToNode(mockNodeUrl, {
      senderDid: 'did:sonaraim:alice',
      recipientDid: 'did:sonaraim:bob',
      text: 'e2e photo',
      mediaPointer: pointer,
    });
    assert.equal(sent.delivered, true);
    assert.equal(storedItems.length, 1);
    const decoded = JSON.parse(Buffer.from(storedItems[0].payload_hex, 'hex').toString('utf8'));
    assert.deepEqual(decoded.mediaPointer, pointer);

    const viaRoute = await httpRequest(`${baseUrl}/inbox/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: aliceCookie,
      },
      body: JSON.stringify({
        senderDid: 'did:sonaraim:alice',
        recipientDid: 'did:sonaraim:bob',
        text: 'route photo',
        mediaPointer: pointer,
      }),
    });
    assert.equal(viaRoute.status, 200);
    assert.equal(storedItems.length, 2);

    const inboxRes = await httpRequest(`${baseUrl}/inbox?mailboxId=did:sonaraim:bob`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(inboxRes.status, 200);
    assert.match(inboxRes.body, /encrypted attachment/);
    assert.match(inboxRes.body, /photo\.jpg/);
    assert.match(inboxRes.body, /route photo/);
  } finally {
    await close();
    await new Promise((r) => mockNode.close(() => r()));
  }
});
