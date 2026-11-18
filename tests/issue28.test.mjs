/**
 * @fileoverview Issue #28 acceptance tests: real PWA icons served at manifest
 * paths, consistent shell references, and service worker with offline shell
 * strategy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { buildPwaManifest, startAppTestServer } from '../src/index.mjs';

/**
 * Minimal HTTP helper for local test servers.
 */
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
            body: Buffer.concat(chunks),
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

test('#28: manifest declares icons that return 200 with PNG content type', async () => {
  const manifest = buildPwaManifest();
  const iconSrcs = manifest.icons.map((icon) => icon.src);
  assert.ok(iconSrcs.includes('/icon-192.png'));
  assert.ok(iconSrcs.includes('/icon-512.png'));

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: false,
  });
  try {
    for (const src of iconSrcs) {
      const res = await httpRequest(`${baseUrl}${src}`);
      assert.equal(res.status, 200);
      assert.match(String(res.headers['content-type']), /image\/png/);
      assert.ok(res.body.length > 1000, `icon ${src} should be a real PNG`);
      assert.equal(res.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
  } finally {
    await close();
  }
});

test('#28: service worker served with offline strategy + shell registers it', async () => {
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: false,
  });
  try {
    const sw = await httpRequest(`${baseUrl}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(String(sw.headers['content-type']), /javascript/);
    const swText = sw.body.toString('utf8');
    assert.match(swText, /caches\.open/);
    assert.match(swText, /skipWaiting/);
    assert.match(swText, /clients\.claim/);
    assert.match(swText, /\/inbox/);

    const inbox = await httpRequest(`${baseUrl}/inbox`);
    assert.equal(inbox.status, 200);
    const html = inbox.body.toString('utf8');
    assert.match(html, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
    assert.match(html, /rel="icon"[^>]*\/icon-192\.png/);
    assert.match(html, /rel="apple-touch-icon"[^>]*\/icon-192\.png/);
    assert.match(html, /rel="manifest"[^>]*\/manifest\.webmanifest/);

    const login = await httpRequest(`${baseUrl}/login`);
    assert.equal(login.status, 200);
    assert.match(login.body.toString('utf8'), /serviceWorker\.register/);
  } finally {
    await close();
  }
});
