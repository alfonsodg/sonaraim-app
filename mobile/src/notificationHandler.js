/**
 * @fileoverview Root notification handler for Sonaraim Mobile (issue #31).
 * Wires foreground/background notification reception, OS permission flow, and
 * `sonaraim://` deep-link routing (inbox, pairing, calls). Pure logic with
 * injected Expo modules so it runs under plain Node tests and on device.
 */

import { acquireDevicePushToken } from './nativeDeviceBridge.js';

/**
 * Maps a `sonaraim://` deep-link URL to an app tab + params.
 *
 * @param {string} url - Deep-link URL (e.g. `sonaraim://inbox?mailboxId=...`).
 * @returns {{ tab: 'inbox' | 'groups' | 'status' | 'calls' | 'activation', params: Record<string, string> } | null}
 */
export function resolveNotificationDeepLink(url) {
  const raw = String(url ?? '').trim();
  if (!raw) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'sonaraim:') {
    return null;
  }
  const host = String(parsed.hostname || parsed.pathname || '').replace(/^\/+/, '').toLowerCase();
  const tab =
    host === 'inbox' || host === 'groups' || host === 'status' || host === 'calls' || host === 'pairing' || host === 'activation'
      ? host === 'pairing' || host === 'activation'
        ? 'activation'
        : host
      : 'inbox';
  const params = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    params[key] = value;
  }
  return { tab, params };
}

/**
 * Extracts a deep-link URL from an Expo notification payload, if present.
 *
 * @param {Record<string, any>} notification - Expo notification object.
 * @returns {string | null} Deep-link URL or null.
 */
export function extractDeepLinkFromNotification(notification) {
  const content = notification?.request?.content ?? notification?.content ?? {};
  const data = content.data && typeof content.data === 'object' ? content.data : {};
  for (const key of ['deepLink', 'deep_link', 'url']) {
    if (typeof data[key] === 'string' && data[key].trim()) {
      return data[key].trim();
    }
  }
  if (typeof content.body === 'string') {
    const match = content.body.match(/sonaraim:\/\/[^\s]+/);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Sets up foreground presentation, received/response listeners, and the OS
 * permission flow. Returns a teardown function.
 *
 * @param {object} [options] - Injectable dependencies and callbacks.
 * @param {any} [options.notificationsModule] - `expo-notifications` module (or mock).
 * @param {Function} [options.acquireTokenFn] - Push-token acquisition (defaults to bridge).
 * @param {(notification: any) => void} [options.onReceived] - Foreground handler.
 * @param {(response: any) => void} [options.onResponse] - Tap-response handler.
 * @param {(route: { tab: string, params: Record<string, string> }) => void} [options.onDeepLink] - Deep-link router.
 * @returns {Promise<{ pushToken: { platform: string, deviceToken: string } | null, teardown: () => void }>}
 */
export async function setupNotificationHandler({
  notificationsModule = null,
  acquireTokenFn = acquireDevicePushToken,
  onReceived = null,
  onResponse = null,
  onDeepLink = null,
} = {}) {
  let notifs = notificationsModule;
  if (!notifs) {
    try {
      const loaded = await import('expo-notifications');
      notifs = loaded?.default ?? loaded;
    } catch {
      notifs = null;
    }
  }

  const subscriptions = [];
  const track = (sub) => {
    if (sub && typeof sub.remove === 'function') {
      subscriptions.push(sub);
    }
  };

  if (notifs && typeof notifs.setNotificationHandler === 'function') {
    notifs.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
  }

  if (notifs && typeof notifs.addNotificationReceivedListener === 'function') {
    track(
      notifs.addNotificationReceivedListener((notification) => {
        if (typeof onReceived === 'function') {
          onReceived(notification);
        }
        const link = extractDeepLinkFromNotification(notification);
        if (link && typeof onDeepLink === 'function') {
          const route = resolveNotificationDeepLink(link);
          if (route) {
            onDeepLink(route);
          }
        }
      })
    );
  }

  if (notifs && typeof notifs.addNotificationResponseReceivedListener === 'function') {
    track(
      notifs.addNotificationResponseReceivedListener((response) => {
        if (typeof onResponse === 'function') {
          onResponse(response);
        }
        const link =
          extractDeepLinkFromNotification(response?.notification) ??
          (typeof response?.notification?.request?.content?.data?.url === 'string'
            ? response.notification.request.content.data.url
            : null);
        if (link && typeof onDeepLink === 'function') {
          const route = resolveNotificationDeepLink(link);
          if (route) {
            onDeepLink(route);
          }
        }
      })
    );
  }

  let pushToken = null;
  try {
    pushToken = await acquireTokenFn({ notificationsModule: notifs ?? undefined });
  } catch {
    pushToken = null;
  }

  return {
    pushToken,
    teardown: () => {
      for (const sub of subscriptions) {
        try {
          sub.remove();
        } catch {
          // Listener teardown is best-effort
        }
      }
    },
  };
}
