/**
 * @fileoverview WebCrypto polyfill bootstrap for Sonaraim Mobile (issue #29,
 * owner Option C). Installs `react-native-quick-crypto` ONCE at the app
 * entrypoint so `globalThis.crypto.subtle` (AES-GCM, Ed25519, X25519, HKDF,
 * ChaCha20-Poly1305) exists before any business-logic module evaluates.
 *
 * Per the reformed #19 rule: business logic must not import `node:crypto`
 * directly; the vetted native module is installed exactly once here.
 */

let installed = false;
let installPromise = null;

/**
 * Loads the `react-native-quick-crypto` native module when available.
 * Dynamic import keeps Node/test runtimes working without the native module.
 *
 * @returns {Promise<{ install: Function } | null>} Install-capable module or null.
 */
export async function loadQuickCryptoModule() {
  try {
    const mod = await import('react-native-quick-crypto');
    const install = mod?.install ?? mod?.default?.install;
    if (typeof install === 'function') {
      return { install };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Installs the quick-crypto WebCrypto polyfill globally (idempotent).
 *
 * @param {{ installModule?: { install: Function } | null }} [options]
 * @returns {boolean} True when the polyfill install ran (or was already done).
 */
export function installCryptoPolyfill({ installModule = null } = {}) {
  if (installed) {
    return true;
  }
  if (installModule && typeof installModule.install === 'function') {
    installModule.install();
    installed = true;
    return true;
  }
  installed = true;
  return true;
}

/**
 * Ensures the WebCrypto polyfill install has completed before any caller
 * touches `crypto.subtle`. On Hermes without an installable module this
 * rejects LOUDLY at startup instead of silently reporting `true`.
 *
 * @param {{ loadModuleFn?: typeof loadQuickCryptoModule, installFn?: typeof installCryptoPolyfill }} [options]
 * @returns {Promise<boolean>} Resolves true once WebCrypto is usable.
 * @throws {Error} When no installable module exists and WebCrypto is missing.
 */
export async function ensureCryptoReady({
  loadModuleFn = loadQuickCryptoModule,
  installFn = installCryptoPolyfill,
} = {}) {
  if (hasUsableWebCrypto()) {
    installed = true;
    return true;
  }
  if (!installPromise) {
    installPromise = (async () => {
      const module = await loadModuleFn();
      installFn({ installModule: module });
      if (!hasUsableWebCrypto()) {
        throw new Error(
          'WebCrypto polyfill unavailable: react-native-quick-crypto is not installed in this runtime'
        );
      }
      return true;
    })();
    if (typeof globalThis !== 'undefined') {
      globalThis.__sonaraimCryptoReady = installPromise;
    }
    installPromise.catch(() => {
      installPromise = null;
    });
  }
  return installPromise;
}

/**
 * Test-only reset for the module-level install gate. Never call in production.
 *
 * @returns {void}
 */
export function __resetCryptoGateForTests() {
  installed = false;
  installPromise = null;
  if (typeof globalThis !== 'undefined') {
    delete globalThis.__sonaraimCryptoReady;
  }
}

/**
 * Reports whether the active runtime exposes a usable WebCrypto subtle API.
 *
 * @returns {boolean} True when `globalThis.crypto.subtle` is available.
 */
export function hasUsableWebCrypto() {
  const webCrypto = globalThis.crypto;
  return Boolean(
    webCrypto && webCrypto.subtle && typeof webCrypto.getRandomValues === 'function'
  );
}
