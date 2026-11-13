/**
 * @fileoverview Configuration resolver for Sonaraim React Native Expo Mobile App.
 * Reads environment variables with safe development fallbacks and zero hardcoded secrets.
 */

/**
 * Strips any trailing slashes from a URL string.
 *
 * @param {string} url - Target URL.
 * @returns {string} Sanitized URL without trailing slashes.
 */
function stripTrailingSlash(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

/**
 * Resolves the mobile client runtime configuration from environment variables.
 * Prioritizes standard Expo public variables (`EXPO_PUBLIC_*`).
 *
 * @param {Record<string, string | undefined>} [env=process.env] - Environment dictionary.
 * @returns {{
 *   appApiUrl: string,
 *   nodeApiUrl: string,
 *   livekitUrl: string,
 *   domainSalt: string,
 *   requestTimeoutMs: number
 * }} Resolved configuration object.
 */
export function resolveMobileConfig(env = process.env) {
  const safeEnv = env && typeof env === 'object' ? env : {};

  const appApiUrl = stripTrailingSlash(
    safeEnv.EXPO_PUBLIC_APP_API_URL ||
    safeEnv.APP_API_URL ||
    'http://localhost:3000'
  );

  const nodeApiUrl = stripTrailingSlash(
    safeEnv.EXPO_PUBLIC_NODE_API_URL ||
    safeEnv.NODE_API_URL ||
    'http://localhost:8080'
  );

  const livekitUrl = stripTrailingSlash(
    safeEnv.EXPO_PUBLIC_LIVEKIT_URL ||
    safeEnv.LIVEKIT_URL ||
    'wss://livekit.sonaraim.internal'
  );

  const domainSalt = String(
    safeEnv.EXPO_PUBLIC_DOMAIN_SALT ||
    safeEnv.DOMAIN_SALT ||
    'sonaraim-mobile-v1'
  ).trim();

  const requestTimeoutMs = Number.parseInt(
    safeEnv.EXPO_PUBLIC_REQUEST_TIMEOUT_MS || '8000',
    10
  );

  return {
    appApiUrl,
    nodeApiUrl,
    livekitUrl,
    domainSalt,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 8000,
  };
}

/**
 * Default active configuration instance for the mobile application.
 */
export const mobileConfig = resolveMobileConfig();
