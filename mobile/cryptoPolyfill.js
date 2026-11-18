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
