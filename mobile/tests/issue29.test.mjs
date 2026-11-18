/**
 * @fileoverview Issue #29 acceptance tests: quick-crypto WebCrypto polyfill
 * (owner Option C), reformed #19 hygiene rule, LiveKit fallback honesty, and
 * EAS build readiness (config only — no build executed here).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_DIR = path.resolve(__dirname, '..');

/**
 * Reads and parses a JSON file under `mobile/`.
 */
function readMobileJson(name) {
  return JSON.parse(fs.readFileSync(path.join(MOBILE_DIR, name), 'utf8'));
}

describe('Issue #29: quick-crypto polyfill as global WebCrypto (Option C)', () => {
  it('declares react-native-quick-crypto and installs it once at the entrypoint', () => {
    const pkg = readMobileJson('package.json');
    assert.ok(
      pkg.dependencies['react-native-quick-crypto'],
      'quick-crypto must be a mobile dependency'
    );
    const appJs = fs.readFileSync(path.join(MOBILE_DIR, 'App.js'), 'utf8');
    assert.match(appJs, /cryptoPolyfill/);
    const polyfill = fs.readFileSync(path.join(MOBILE_DIR, 'cryptoPolyfill.js'), 'utf8');
    assert.match(polyfill, /react-native-quick-crypto/);
    assert.match(polyfill, /installCryptoPolyfill/);
  });

  it('exposes a usable WebCrypto check and idempotent installer', async () => {
    const { installCryptoPolyfill, hasUsableWebCrypto } = await import(
      '../cryptoPolyfill.js'
    );
    assert.equal(installCryptoPolyfill({}), true);
    assert.equal(installCryptoPolyfill({}), true);
    assert.equal(typeof hasUsableWebCrypto(), 'boolean');
  });

  it('pins newArch + iOS 16.4 + minSdk 24 floors in app.json with the plugin', () => {
    const appJson = readMobileJson('app.json');
    assert.equal(appJson.expo.newArchEnabled, true);
    assert.equal(appJson.expo.ios.deploymentTarget, '16.4');
    assert.equal(appJson.expo.android.minSdkVersion, 24);
    assert.ok(appJson.expo.plugins.includes('react-native-quick-crypto'));
  });

  it('keeps eas.json build profiles with release channels documented', () => {
    const eas = readMobileJson('eas.json');
    for (const profile of ['development', 'preview', 'production']) {
      assert.ok(eas.build[profile], `${profile} profile must exist`);
      assert.ok(eas.build[profile].channel, `${profile} profile must set a channel`);
    }
  });

  it('does not execute a real EAS build here: no eas.projectId required', () => {
    const appJson = readMobileJson('app.json');
    assert.equal(appJson.expo.extra?.eas?.projectId ?? null, null);
  });
});

describe('Issue #29: LiveKit honesty (external Meet fallback documented)', () => {
  it('documents external Meet fallback instead of claiming in-app calling', () => {
    const callsScreen = fs.readFileSync(
      path.join(MOBILE_DIR, 'src/screens/CallsScreen.js'),
      'utf8'
    );
    assert.match(callsScreen, /Linking\.openURL|Meet/);
    const readme = fs.readFileSync(path.join(MOBILE_DIR, 'README.md'), 'utf8');
    assert.match(readme, /Meet|fallback/i);
  });

  it('package.json has no Metro-incompatible module type flag', () => {
    const pkg = readMobileJson('package.json');
    assert.notEqual(pkg.type, 'module');
  });
});
