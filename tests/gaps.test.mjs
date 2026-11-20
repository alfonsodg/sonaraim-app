/**
 * @fileoverview TDD for real gaps #3 (vault seal/open routes) and #4
 * (verified Mini-App directory routes). Both suites must FAIL before fix.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  startAppTestServer,
  blindContactIdentifier,
} from '../src/index.mjs';

function httpRequest(url, options = {}) {
  const parsed = new URL(url);
  const method = options.method ?? 'GET';
  const body = options.body ?? '';
  const headers = { ...(options.headers ?? {}) };
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
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
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

test('#3 gap: POST /api/vault/seal encrypts and POST /api/vault/open decrypts (zero-knowledge round-trip)', async () => {
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8099',
    appHttpPort: 0,
    requireAuth: false,
  });
  try {
    const sealRes = await httpRequest(`${baseUrl}/api/vault/seal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        userDid: 'did:sonaraim:alice',
        epoch: 1,
        snapshot: { inbox: ['hello'] },
      }),
    });
    assert.equal(sealRes.status, 200);
    const sealed = JSON.parse(sealRes.body);
    assert.equal(sealed.version, 1);
    assert.ok(sealed.ciphertext);

    const openRes = await httpRequest(`${baseUrl}/api/vault/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ blob: sealed }),
    });
    assert.equal(openRes.status, 200);
    const opened = JSON.parse(openRes.body);
    assert.equal(opened.userDid, 'did:sonaraim:alice');
    assert.deepEqual(opened.snapshot, { inbox: ['hello'] });
  } finally {
    await close();
  }
});

test('#4 gap: GET /directory lists only verified did:web services', async () => {
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8099',
    appHttpPort: 0,
    requireAuth: false,
  });
  try {
    const res = await httpRequest(`${baseUrl}/directory`, {
      headers: { Accept: 'application/json' },
    });
    assert.equal(res.status, 200);
    const payload = JSON.parse(res.body);
    assert.ok(Array.isArray(payload.services));
    for (const svc of payload.services) {
      assert.match(svc.merchantDid, /^did:web:/);
      assert.equal(svc.verified, true);
    }
  } finally {
    await close();
  }
});

test('#4 gap: POST /api/directory/blind-contact contract helper exists', async () => {
  const digest = blindContactIdentifier('+15551234567', 'sonaraim-psi-v1');
  assert.match(digest, /^[0-9a-f]{64}$/);
});
