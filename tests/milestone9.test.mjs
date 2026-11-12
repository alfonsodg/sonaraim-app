/**
 * @fileoverview Milestone 9 TDD tests for Issue #5 (Interactive POST /c/:token/act submission
 * and 1-tap promotional consent revocation) and Issue #6 (Live Node mailbox sync & /metrics).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  renderInboxView,
  renderInstantClipView,
  startAppTestServer,
  fetchMailboxEnvelopes,
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

test('Issue #5: renderInstantClipView renders accessible POST /c/:token/act form and confirmation banner', () => {
  const formHtml = renderInstantClipView({
    token: 'clip_900',
    tenantDid: 'did:web:clinic.example.com',
    title: 'Appointment Check-In',
    actions: ['Confirm Arrival'],
  });

  assert.match(formHtml, /<form[^>]*method="POST"[^>]*action="\/c\/clip_900\/act"/i);
  assert.match(formHtml, /<button[^>]*type="submit"[^>]*>/i);
  assert.match(formHtml, /<link rel="icon" href="data:," \/>/);

  const confirmedHtml = renderInstantClipView({
    token: 'clip_900',
    tenantDid: 'did:web:clinic.example.com',
    title: 'Appointment Check-In',
    actions: ['Confirm Arrival'],
    confirmationReceipt: {
      action: 'Confirm Arrival',
      receiptId: 'rcpt_123',
      signature: 'sig_base64_demo',
    },
  });

  assert.match(confirmedHtml, /role="status"/i);
  assert.match(confirmedHtml, /rcpt_123/);
  assert.match(confirmedHtml, /Confirm Arrival/);
});

test('Issue #5: renderInboxView renders 1-tap POST /inbox/consent/revoke forms and revocation banner', () => {
  const html = renderInboxView({
    personalMessages: [{ from: 'did:sonaraim:bob', preview: 'Hello' }],
    serviceCards: [
      {
        tenantDid: 'did:web:clinic.example.com',
        title: 'Appointment Confirmation',
        actions: ['Confirm'],
      },
    ],
    revocationReceipt: {
      tenantDid: 'did:web:clinic.example.com',
      revokedAt: '2026-11-12T22:30:00.000Z',
    },
  });

  assert.match(html, /<form[^>]*method="POST"[^>]*action="\/inbox\/consent\/revoke"/i);
  assert.match(html, /Revoke Consent/i);
  assert.match(html, /role="status"/i);
  assert.match(html, /Consent revoked for/i);
});

test('Issue #5: POST /c/:token/act and POST /inbox/consent/revoke return 200 OK with signed confirmation / revocation receipt', async () => {
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
  });

  try {
    const formAct = await httpRequest(`${baseUrl}/c/clip_token_77/act`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
      },
      body: 'action=Confirm+Action&tenantDid=did%3Aweb%3Aclinic.example.com',
    });
    assert.equal(formAct.status, 200);
    assert.match(formAct.body, /Action Confirmed/i);
    assert.match(formAct.body, /clip_token_77/);
    assert.match(formAct.body, /Signature:/i);

    const jsonAct = await httpRequest(`${baseUrl}/c/clip_token_77/act`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action: 'Confirm Action',
        tenantDid: 'did:web:clinic.example.com',
      }),
    });
    assert.equal(jsonAct.status, 200);
    const parsedAct = JSON.parse(jsonAct.body);
    assert.equal(parsedAct.status, 'confirmed');
    assert.equal(parsedAct.token, 'clip_token_77');
    assert.equal(parsedAct.action, 'Confirm Action');
    assert.ok(parsedAct.signature);
    assert.ok(parsedAct.receiptId);

    const formRevoke = await httpRequest(`${baseUrl}/inbox/consent/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
      },
      body: 'tenantDid=did%3Aweb%3Aclinic.example.com',
    });
    assert.equal(formRevoke.status, 200);
    assert.match(formRevoke.body, /Consent revoked for/i);
    assert.match(formRevoke.body, /did:web:clinic\.example\.com/);

    const jsonRevoke = await httpRequest(`${baseUrl}/inbox/consent/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ tenantDid: 'did:web:clinic.example.com' }),
    });
    assert.equal(jsonRevoke.status, 200);
    const parsedRevoke = JSON.parse(jsonRevoke.body);
    assert.equal(parsedRevoke.status, 'revoked');
    assert.equal(parsedRevoke.tenantDid, 'did:web:clinic.example.com');
    assert.ok(parsedRevoke.revokedAt);
  } finally {
    await close();
  }
});

test('Issue #6: fetchMailboxEnvelopes drains queued envelopes from Node API and /api/mailbox/:mailboxId + /metrics work', async () => {
  // Start a mock sonaraim-node server
  const mockEnvelopes = [
    {
      envelope_id: 'env-live-01',
      sender_did: 'did:sonaraim:carol',
      ciphertext_b64: 'SGVsbG8gZnJvbSBDYXJvbA==',
    },
  ];

  const mockNodeServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/v1/relay/mailboxes/mbx_alice') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          mailbox_id: 'mbx_alice',
          envelopes: mockEnvelopes,
        })
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  await new Promise((resolve) => mockNodeServer.listen(0, '127.0.0.1', resolve));
  const nodeAddr = mockNodeServer.address();
  const mockNodeUrl = `http://127.0.0.1:${nodeAddr.port}`;

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: mockNodeUrl,
    appHttpPort: 0,
  });

  try {
    const direct = await fetchMailboxEnvelopes(mockNodeUrl, 'mbx_alice');
    assert.equal(direct.mailboxId, 'mbx_alice');
    assert.equal(direct.envelopes.length, 1);
    assert.equal(direct.envelopes[0].envelope_id, 'env-live-01');

    // Graceful fallback when unreachable
    const fallback = await fetchMailboxEnvelopes('http://127.0.0.1:1', 'mbx_alice', 150);
    assert.equal(fallback.mailboxId, 'mbx_alice');
    assert.deepEqual(fallback.envelopes, []);

    // Proxy route GET /api/mailbox/:mailboxId
    const proxyRes = await httpRequest(`${baseUrl}/api/mailbox/mbx_alice`);
    assert.equal(proxyRes.status, 200);
    const proxyData = JSON.parse(proxyRes.body);
    assert.equal(proxyData.mailboxId, 'mbx_alice');
    assert.equal(proxyData.envelopes.length, 1);
    assert.equal(proxyData.envelopes[0].envelope_id, 'env-live-01');

    // GET /inbox?mailboxId=mbx_alice renders live synced message
    const liveInbox = await httpRequest(`${baseUrl}/inbox?mailboxId=mbx_alice`);
    assert.equal(liveInbox.status, 200);
    assert.match(liveInbox.body, /did:sonaraim:carol/);

    // GET /metrics returns Prometheus text/plain; version=0.0.4
    const metricsRes = await httpRequest(`${baseUrl}/metrics`);
    assert.equal(metricsRes.status, 200);
    assert.match(String(metricsRes.headers['content-type']), /text\/plain;\s*version=0\.0\.4/);
    assert.match(metricsRes.body, /sonaraim_app_http_requests_total/);
    assert.match(metricsRes.body, /sonaraim_app_mailbox_sync_total/);
  } finally {
    await close();
    await new Promise((resolve) => mockNodeServer.close(() => resolve()));
  }
});
