/**
 * @fileoverview Pure tab-state + push-token routing helpers for the mobile shell.
 * Lets `AppShell` route the acquired device push token into `statusStore`
 * registration and lets tabs react to post-mount deep-link changes (issue #31,
 * items M1/M2). Kept UI-free so it runs under plain Node tests.
 */

/**
 * @typedef {'inbox' | 'groups' | 'status' | 'calls' | 'activation'} AppTab
 */

/**
 * All tabs AppShell can render.
 *
 * @type {ReadonlyArray<AppTab>}
 */
export const KNOWN_TABS = Object.freeze(['inbox', 'groups', 'status', 'calls', 'activation']);

/**
 * Coerces an unknown deep-link tab value into a known AppShell tab.
 *
 * @param {unknown} value - Candidate tab id (e.g. from `onDeepLink` route).
 * @param {AppTab} [fallback='inbox'] - Fallback tab when the value is unknown.
 * @returns {AppTab} Known tab id.
 */
export function coerceAppTab(value, fallback = 'inbox') {
  const fallbackTab = KNOWN_TABS.includes(fallback) ? fallback : 'inbox';
  return KNOWN_TABS.includes(value) ? value : fallbackTab;
}

/**
 * Decides which tab AppShell should show next when a deep link arrives after
 * mount. Unknown values keep the current tab (never blank the UI).
 *
 * @param {AppTab} currentTab - Currently rendered tab.
 * @param {unknown} nextTab - Deep-link requested tab (may be invalid).
 * @returns {AppTab} Tab to render.
 */
export function resolveNextTab(currentTab, nextTab) {
  const current = coerceAppTab(currentTab, 'inbox');
  if (nextTab === undefined || nextTab === null || nextTab === '') {
    return current;
  }
  return KNOWN_TABS.includes(nextTab) ? nextTab : current;
}

/**
 * Normalizes the acquired Expo/native push token into the shape
 * `registerPushToken` routing expects. Returns null when no usable device
 * token was acquired (e.g. permission denied), so callers can skip
 * registration instead of sending an empty token.
 *
 * @param {{ platform?: unknown, deviceToken?: unknown } | null | undefined} pushToken
 * @returns {{ platform: string, deviceToken: string } | null}
 */
export function normalizeDevicePushToken(pushToken) {
  if (!pushToken || typeof pushToken !== 'object') {
    return null;
  }
  const deviceToken = String(pushToken.deviceToken ?? '').trim();
  if (!deviceToken) {
    return null;
  }
  const platform = String(pushToken.platform ?? 'expo').trim() || 'expo';
  return { platform, deviceToken };
}

/**
 * Builds the `registerPushToken` arguments that route the acquired device
 * push token into the zero-metadata blind registration (issue #31 M1).
 *
 * @param {{
 *   nodeApiUrl: string,
 *   userDid: string,
 *   pushToken: { platform?: unknown, deviceToken?: unknown } | null | undefined,
 *   platform?: 'expo' | 'apns' | 'fcm'
 * }} params
 * @returns {{ nodeApiUrl: string, userDid: string, pushToken: string, platform: 'expo' | 'apns' | 'fcm' } | null}
 */
export function buildPushRegistration({ nodeApiUrl, userDid, pushToken, platform = 'expo' }) {
  const normalized = normalizeDevicePushToken(pushToken);
  const cleanUserDid = String(userDid ?? '').trim();
  const cleanUrl = String(nodeApiUrl ?? '').trim();
  if (!normalized || !cleanUserDid || !cleanUrl) {
    return null;
  }
  return {
    nodeApiUrl: cleanUrl,
    userDid: cleanUserDid,
    pushToken: normalized.deviceToken,
    platform,
  };
}
