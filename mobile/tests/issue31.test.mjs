/**
 * @fileoverview Issue #31 acceptance tests: root notification handler with
 * foreground/background cases, permission flow, and `sonaraim://` deep-link
 * routing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractDeepLinkFromNotification,
  resolveNotificationDeepLink,
  setupNotificationHandler,
} from '../src/notificationHandler.js';

/**
 * Builds a mock `expo-notifications` module recording handler + listeners.
 */
function buildMockNotifications() {
  const calls = { handler: null, received: [], responses: [] };
  return {
    calls,
    setNotificationHandler(handler) {
      calls.handler = handler;
    },
    addNotificationReceivedListener(cb) {
      calls.received.push(cb);
      return { remove: () => {} };
    },
    addNotificationResponseReceivedListener(cb) {
      calls.responses.push(cb);
      return { remove: () => {} };
    },
    getPermissionsAsync: async () => ({ status: 'granted' }),
    getDevicePushTokenAsync: async () => ({ type: 'expo', data: 'ExponentPushToken[test]' }),
  };
}

describe('Issue #31: notification handler wired at root', () => {
  it('resolves sonaraim:// deep links to tabs with params', () => {
    assert.deepEqual(resolveNotificationDeepLink('sonaraim://inbox?mailboxId=did%3Asonaraim%3Abob'), {
      tab: 'inbox',
      params: { mailboxId: 'did:sonaraim:bob' },
    });
    assert.deepEqual(resolveNotificationDeepLink('sonaraim://pairing?code=123456'), {
      tab: 'activation',
      params: { code: '123456' },
    });
    assert.deepEqual(resolveNotificationDeepLink('sonaraim://calls?room=secure-1'), {
      tab: 'calls',
      params: { room: 'secure-1' },
    });
    assert.equal(resolveNotificationDeepLink('https://example.com/x'), null);
    assert.equal(resolveNotificationDeepLink('not-a-url'), null);
    assert.equal(resolveNotificationDeepLink(''), null);
  });

  it('extracts deep links from notification payloads', () => {
    assert.equal(
      extractDeepLinkFromNotification({
        request: { content: { data: { deepLink: 'sonaraim://inbox?mailboxId=x' } } },
      }),
      'sonaraim://inbox?mailboxId=x'
    );
    assert.equal(
      extractDeepLinkFromNotification({ content: { data: { url: 'sonaraim://calls' } } }),
      'sonaraim://calls'
    );
    assert.equal(extractDeepLinkFromNotification({ request: { content: { data: {} } } }), null);
  });

  it('sets foreground handler, subscribes listeners, runs permission flow', async () => {
    const mock = buildMockNotifications();
    const received = [];
    const deepLinks = [];
    const { pushToken, teardown } = await setupNotificationHandler({
      notificationsModule: mock,
      acquireTokenFn: async () => ({ platform: 'expo', deviceToken: 'ExponentPushToken[test]' }),
      onReceived: (n) => received.push(n),
      onDeepLink: (route) => deepLinks.push(route),
    });
    assert.deepEqual(pushToken, { platform: 'expo', deviceToken: 'ExponentPushToken[test]' });
    assert.ok(mock.calls.handler, 'foreground handler must be set');
    assert.equal(mock.calls.received.length, 1);
    assert.equal(mock.calls.responses.length, 1);

    mock.calls.received[0]({
      request: { content: { data: { deepLink: 'sonaraim://inbox?mailboxId=did%3Asonaraim%3Abob' } } },
    });
    assert.equal(received.length, 1);
    assert.deepEqual(deepLinks[0], { tab: 'inbox', params: { mailboxId: 'did:sonaraim:bob' } });

    teardown();
  });

  it('handles background tap responses with deep-link routing', async () => {
    const mock = buildMockNotifications();
    const responses = [];
    const deepLinks = [];
    await setupNotificationHandler({
      notificationsModule: mock,
      acquireTokenFn: async () => null,
      onResponse: (r) => responses.push(r),
      onDeepLink: (route) => deepLinks.push(route),
    });
    mock.calls.responses[0]({
      notification: { request: { content: { data: { url: 'sonaraim://calls?room=r1' } } } },
    });
    assert.equal(responses.length, 1);
    assert.deepEqual(deepLinks[0], { tab: 'calls', params: { room: 'r1' } });
  });

  it('tolerates denied permissions (null token, listeners still wired)', async () => {
    const mock = buildMockNotifications();
    mock.getPermissionsAsync = async () => ({ status: 'denied' });
    const { pushToken } = await setupNotificationHandler({
      notificationsModule: mock,
      acquireTokenFn: async () => {
        throw new Error('Push notification permission denied');
      },
    });
    assert.equal(pushToken, null);
    assert.equal(mock.calls.received.length, 1);
  });
});
