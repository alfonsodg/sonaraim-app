/**
 * @fileoverview Configuration resolver for Sonaraim React Native Expo Mobile App.
 * Validates required `EXPO_PUBLIC_*` environment variables with zero hardcoded URLs or secrets.
 */

const REQUIRED_ENV_SPECS = Object.freeze([
  { key: 'appApiUrl', envNames: ['EXPO_PUBLIC_APP_API_URL', 'APP_API_URL'], isUrl: true },
  { key: 'nodeApiUrl', envNames: ['EXPO_PUBLIC_NODE_API_URL', 'NODE_API_URL'], isUrl: true },
  { key: 'livekitUrl', envNames: ['EXPO_PUBLIC_LIVEKIT_URL', 'LIVEKIT_URL'], isUrl: true },
  { key: 'domainSalt', envNames: ['EXPO_PUBLIC_DOMAIN_SALT', 'DOMAIN_SALT'], isUrl: false },
]);

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
 * Reads the first non-empty environment variable from a list of candidate names.
 *
 * @param {Record<string, string | undefined>} env - Environment dictionary.
 * @param {ReadonlyArray<string>} envNames - Ordered candidate variable names.
 * @param {boolean} isUrl - Whether to strip trailing slashes.
 * @returns {string} Resolved value or empty string.
 */
function readEnvValue(env, envNames, isUrl) {
  for (const name of envNames) {
    const raw = env[name];
    if (raw !== undefined && String(raw).trim() !== '') {
      return isUrl ? stripTrailingSlash(raw) : String(raw).trim();
    }
  }
  return '';
}

/**
 * Resolves a specific mobile configuration URL variable or throws if unconfigured.
 *
 * @param {ReadonlyArray<string>} envNames - Candidate environment variable names.
 * @param {string} label - Human-readable setting label for error messages.
 * @param {Record<string, string | undefined>} [env=process.env] - Environment dictionary.
 * @returns {string} Sanitized URL without trailing slashes.
 * @throws {Error} When none of the candidate environment variables are set.
 */
export function requireMobileEnvUrl(envNames, label, env = process.env) {
  const safeEnv = env && typeof env === 'object' ? env : {};
  const value = readEnvValue(safeEnv, envNames, true);
  if (!value) {
    throw new Error(`Missing required mobile configuration: ${label} (${envNames[0]})`);
  }
  return value;
}

/**
 * Resolves the mobile client runtime configuration from environment variables.
 * Prioritizes standard Expo public variables (`EXPO_PUBLIC_*`) and fails fast
 * when required variables are missing.
 *
 * @param {Record<string, string | undefined>} [env=process.env] - Environment dictionary.
 * @returns {{
 *   appApiUrl: string,
 *   nodeApiUrl: string,
 *   livekitUrl: string,
 *   domainSalt: string,
 *   cdnBaseUrl: string,
 *   livekitMeetUrl: string,
 *   requestTimeoutMs: number
 * }} Resolved configuration object.
 * @throws {Error} When any required configuration variable is missing.
 */
export function resolveMobileConfig(env = process.env) {
  const safeEnv = env && typeof env === 'object' ? env : {};
  const resolved = {};
  const missing = [];

  for (const spec of REQUIRED_ENV_SPECS) {
    const value = readEnvValue(safeEnv, spec.envNames, spec.isUrl);
    if (!value) {
      missing.push(spec.envNames[0]);
    }
    resolved[spec.key] = value;
  }

  if (missing.length > 0) {
    throw new Error(`Missing required mobile configuration: ${missing.join(', ')}`);
  }

  const cdnBaseUrl = readEnvValue(
    safeEnv,
    ['EXPO_PUBLIC_CDN_BASE_URL', 'CDN_BASE_URL'],
    true
  );
  const livekitMeetUrl = readEnvValue(
    safeEnv,
    ['EXPO_PUBLIC_LIVEKIT_MEET_URL', 'LIVEKIT_MEET_URL'],
    true
  );

  const requestTimeoutMs = Number.parseInt(
    safeEnv.EXPO_PUBLIC_REQUEST_TIMEOUT_MS || '8000',
    10
  );

  return {
    ...resolved,
    cdnBaseUrl,
    livekitMeetUrl,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 8000,
  };
}

/**
 * Lazy default configuration proxy that validates environment variables on property access.
 */
export const mobileConfig = new Proxy(
  {},
  {
    get(_target, prop) {
      return resolveMobileConfig()[prop];
    },
    ownKeys() {
      return Object.keys(resolveMobileConfig());
    },
    getOwnPropertyDescriptor(_target, prop) {
      const cfg = resolveMobileConfig();
      if (prop in cfg) {
        return { enumerable: true, configurable: true, value: cfg[prop] };
      }
      return undefined;
    },
  }
);
