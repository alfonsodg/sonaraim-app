/**
 * @fileoverview Remediation acceptance tests (review-app gate): pushes the
 * acquired device token into `statusStore` registration (M1), reacts to
 * post-mount deep-link tab changes (M2), pins quick-crypto with lockfile (M3),
 * gates `crypto.subtle` on install completion with a loud failure (M4), and
 * documents the inbox session requirement + honest calling fallback (m2/m5).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOBILE_DIR = path.resolve(__dirname, '..');

function readMobileFile(name) {
  return fs.readFileSync(path.join(MOBILE_DIR, name), 'utf8');
}

describe('Remediation M1: push token reaches statusStore registration', () => {
  it('AppShell accepts pushToken and routes it to registerPushToken', async () => {
    const { buildPushRegistration, normalizeDevicePushToken } = await import(
      '../src/tabState.js'
    );
    const token = { platform: 'expo', deviceToken: 'ExponentPushToken[abc123]' };
    assert.deepEqual(normalizeDevicePushToken(token), token);
    assert.equal(normalizeDevicePushToken(null), null);
    assert.equal(normalizeDevicePushToken({ deviceToken: '   ' }), null);

    const args = buildPushRegistration({
      nodeApiUrl: 'https://relay.example.com',
      userDid: 'did:sonaraim:alice',
      pushToken: token,
    });
    assert.deepEqual(args, {
      nodeApiUrl: 'https://relay.example.com',
      userDid: 'did:sonaraim:alice',
      pushToken: 'ExponentPushToken[abc123]',
      platform: 'expo',
    });
    assert.equal(
      buildPushRegistration({ nodeApiUrl: 'https://r.example', userDid: 'did:x', pushToken: null }),
      null
    );

    const appJs = readMobileFile('App.js');
    assert.match(appJs, /pushToken=\{pushToken\}/);
    const shell = readMobileFile('src/AppShell.js');
    assert.match(shell, /pushToken/);
    assert.match(shell, /registerPushToken/);
  });
});

describe('Remediation M2: tabs react to post-mount deep-link changes', () => {
  it('resolveNextTab switches tabs and never blanks on unknown values', async () => {
    const { resolveNextTab, coerceAppTab } = await import('../src/tabState.js');
    assert.equal(resolveNextTab('inbox', 'calls'), 'calls');
    assert.equal(resolveNextTab('inbox', 'activation'), 'activation');
    assert.equal(resolveNextTab('inbox', 'bogus-tab'), 'inbox');
    assert.equal(resolveNextTab('status', null), 'status');
    assert.equal(resolveNextTab('groups', ''), 'groups');
    assert.equal(coerceAppTab('calls'), 'calls');
    assert.equal(coerceAppTab('nope'), 'inbox');

    const shell = readMobileFile('src/AppShell.js');
    assert.match(shell, /useEffect/);
    assert.match(shell, /initialTab/);
  });
});

describe('Remediation M3: quick-crypto pinned with lockfile', () => {
  it('pins an exact version and commits the mobile lockfile', () => {
    const pkg = JSON.parse(readMobileFile('package.json'));
    assert.equal(pkg.dependencies['react-native-quick-crypto'], '1.1.10');
    assert.ok(
      fs.existsSync(path.join(MOBILE_DIR, 'package-lock.json')),
      'mobile/package-lock.json must be committed'
    );
  });
});

describe('Remediation M4: crypto gate fails loud without an installable module', () => {
  it('resolves when WebCrypto is already usable', async () => {
    const polyfill = await import('../cryptoPolyfill.js');
    polyfill.__resetCryptoGateForTests();
    assert.equal(await polyfill.ensureCryptoReady({ loadModuleFn: async () => null }), true);
  });

  it('business logic awaits the gate instead of importing the polyfill', async () => {
    const { getCryptoReadyGate, setCryptoReadyGate, awaitCryptoReady } = await import(
      '../src/cryptoUtils.js'
    );
    setCryptoReadyGate(null);
    assert.equal(getCryptoReadyGate(), null);
    await awaitCryptoReady();
    let order = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    setCryptoReadyGate(gate.then(() => order.push('gate')));
    const waiter = awaitCryptoReady().then(() => order.push('waiter'));
    release();
    await waiter;
    assert.deepEqual(order, ['gate', 'waiter']);
    await assert.rejects(async () => {
      setCryptoReadyGate(Promise.reject(new Error('WebCrypto polyfill unavailable: test')));
      await awaitCryptoReady();
    }, /WebCrypto polyfill unavailable/);
    setCryptoReadyGate(null);
  });

  it('rejects loudly when no module can be installed and subtle is missing', async () => {
    const polyfill = await import('../cryptoPolyfill.js');
    polyfill.__resetCryptoGateForTests();
    const realCrypto = globalThis.crypto;
    const stub = { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) };
    Object.defineProperty(globalThis, 'crypto', { value: stub, configurable: true });
    try {
      await assert.rejects(
        () => polyfill.ensureCryptoReady({ loadModuleFn: async () => null }),
        /WebCrypto polyfill unavailable/
      );
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
      polyfill.__resetCryptoGateForTests();
    }
  });

  it('waits for install completion via the injected loader', async () => {
    const polyfill = await import('../cryptoPolyfill.js');
    polyfill.__resetCryptoGateForTests();
    const realCrypto = globalThis.crypto;
    const stub = { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) };
    Object.defineProperty(globalThis, 'crypto', { value: stub, configurable: true });
    let installed = false;
    const fakeModule = {
      install() {
        installed = true;
        Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
      },
    };
    try {
      const [first, second] = await Promise.all([
        polyfill.ensureCryptoReady({
          loadModuleFn: async () => fakeModule,
          installFn: ({ installModule }) => installModule.install(),
        }),
        polyfill.ensureCryptoReady({
          loadModuleFn: async () => fakeModule,
          installFn: ({ installModule }) => installModule.install(),
        }),
      ]);
      assert.equal(first, true);
      assert.equal(second, true);
      assert.equal(installed, true);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
      polyfill.__resetCryptoGateForTests();
    }
  });
});

describe('Remediation m2/m5: docs + honest fallback', () => {
  it('documents that POST /inbox/messages requires a session even with requireAuth=false', () => {
    const candidates = ['../docs/CONFIGURATION.md', '../../docs/CONFIGURATION.md'];
    let found = false;
    for (const candidate of candidates) {
      const docPath = path.resolve(__dirname, candidate);
      if (fs.existsSync(docPath)) {
        const doc = fs.readFileSync(docPath, 'utf8');
        if (/POST \/inbox\/messages/.test(doc) && /session/i.test(doc)) {
          found = true;
        }
      }
    }
    assert.equal(found, true, 'CONFIGURATION.md must document the inbox session requirement');
  });

  it('package.json no longer claims LiveKit E2E Calling', () => {
    const pkg = JSON.parse(readMobileFile('package.json'));
    assert.ok(!String(pkg.description || '').includes('LiveKit E2E Calling'));
    assert.match(String(pkg.description || ''), /fallback/i);
  });
});
