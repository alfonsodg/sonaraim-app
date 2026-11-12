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
    // 1. Form-encoded submission (browser form submit) to POST /c/:token/act
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

    // 2. JSON submission to POST /c/:token/act
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

    // 3. Form-encoded submission to POST /inbox/consent/revoke
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

    // 4. JSON submission to POST /inbox/consent/revoke
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
