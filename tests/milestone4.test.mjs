/**
 * @fileoverview Milestone 4 TDD integration tests for @sonaraim/app:
 * Dual Inbox UI, Instant Web Clip viewer, Private Contact Discovery PSI client,
 * and zero-hardcode HTTP server routes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  renderInboxView,
  renderInstantClipView,
  blindContactIdentifier,
  intersectDiscoveredContacts,
  startAppTestServer,
} from '../src/index.mjs';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      })
      .on('error', reject);
  });
}

test('renderInboxView separates Personal and Services streams with strict HTML escaping', () => {
  const html = renderInboxView({
    personalMessages: [{ from: 'did:sonaraim:bob', preview: 'Hey Alice <script>alert(1)</script>' }],
    serviceCards: [{ tenantDid: 'did:web:clinic.example.com', title: 'Appointment 10:30', actions: ['Confirm'] }],
  });

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Personal Stream/);
  assert.match(html, /Verified Services/);
  assert.match(html, /did:sonaraim:bob/);
  assert.match(html, /Appointment 10:30/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /@media\s*\(/);
});

test('renderInstantClipView renders valid clip session and rejects empty tokens', () => {
  assert.throws(() => renderInstantClipView({ token: '  ', title: 'Test' }), /token/i);

  const html = renderInstantClipView({
    token: 'clip_valid_01',
    tenantDid: 'did:web:clinic.example.com',
    title: 'Confirm Lab Pickup',
    actions: ['Approve Pickup'],
  });
  assert.match(html, /Confirm Lab Pickup/);
  assert.match(html, /Approve Pickup/);
  assert.match(html, /clip_valid_01/);
});

test('contactDiscovery blinds identifiers and intersects matched hashes locally', () => {
  const blindedAlice = blindContactIdentifier('+51999111222', 'sonaraim-psi-v1');
  const blindedBob = blindContactIdentifier('+51999333444', 'sonaraim-psi-v1');
  assert.notEqual(blindedAlice, '+51999111222');
  assert.equal(blindedAlice.length, 64);

  const matches = intersectDiscoveredContacts(
    ['+51999111222', '+51999333444'],
    [blindedBob],
    'sonaraim-psi-v1'
  );
  assert.deepEqual(matches, ['+51999333444']);
});

test('startAppTestServer serves /health, /inbox, and /c/:token routes', async () => {
  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
  });

  try {
    const health = await fetchText(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.match(health.body, /"service":"sonaraim-app"/);

    const inbox = await fetchText(`${baseUrl}/inbox`);
    assert.equal(inbox.status, 200);
    assert.match(inbox.body, /Personal Stream/);

    const clip = await fetchText(`${baseUrl}/c/clip_demo_99`);
    assert.equal(clip.status, 200);
    assert.match(clip.body, /clip_demo_99/);
  } finally {
    await close();
  }
});
