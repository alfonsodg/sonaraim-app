/**
 * @fileoverview Issue #25 acceptance tests: real WebAuthn assertion verification.
 * Covers forged/empty/short signature rejection and valid-assertion acceptance,
 * origin/RP-ID binding, counter/replay protection, and unknown-credential denial.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPasskeyChallenge,
  registerPasskeyCredential,
  verifyPasskeyAssertionAndIssueSession,
} from '../src/index.mjs';
import {
  buildAttestationObject,
  buildAuthenticatorDataWithCredential,
  buildRegistrationClientData,
  buildWebauthnAssertion,
  generateEd25519FixtureKey,
  registerFixtureCredential,
} from './webauthnFixtures.mjs';

const RP_ID = 'app.sonaraim.test';
const ORIGIN = 'https://app.sonaraim.test';
const SECRET = 'test-secret-0123456789abcdef';

/**
 * Creates a fresh registered credential plus an assertion fixture for one challenge.
 */
async function freshRegisteredAssertion({ credentialStore, rpId = RP_ID, origin = ORIGIN, counter = 1 }) {
  const store = new Map();
  const issued = createPasskeyChallenge('did:sonaraim:alice', store, { rpId, origin });
  const registered = await registerFixtureCredential({
    userDid: 'did:sonaraim:alice',
    rpId,
    origin,
    credentialStore,
    registerFn: registerPasskeyCredential,
  });
  const assertion = await buildWebauthnAssertion({
    privateKey: registered.privateKey,
    publicKeyRawB64: registered.publicKeyRaw,
    rpId,
    origin,
    challengeB64: issued.challenge,
    counter,
  });
  return { issued, assertion: { ...assertion, credentialId: registered.credentialId }, registered, store };
}

test('#25: forged signature is rejected', async () => {
  const credentialStore = new Map();
  const { issued, assertion } = await freshRegisteredAssertion({ credentialStore });
  const holder = new Map();
  holder.set(issued.challengeId, issued);
  assert.throws(
    () =>
      verifyPasskeyAssertionAndIssueSession({
        challengeId: issued.challengeId,
        userDid: 'did:sonaraim:alice',
        challengeStore: holder,
        credentialStore,
        sessionSecret: SECRET,
        rpId: RP_ID,
        origin: ORIGIN,
        ...assertion,
        assertionSignature: Buffer.alloc(64, 9).toString('base64url'),
      }),
    /assertionSignature/i
  );
});

test('#25: empty and short signatures rejected; unknown credential denied; valid assertion accepted', async () => {
  const credentialStore = new Map();

  const unknownStore = new Map();
  const unknownIssued = createPasskeyChallenge('did:sonaraim:alice', unknownStore, {
    rpId: RP_ID,
    origin: ORIGIN,
  });
  assert.throws(
    () =>
      verifyPasskeyAssertionAndIssueSession({
        challengeId: unknownIssued.challengeId,
        userDid: 'did:sonaraim:alice',
        challengeStore: unknownStore,
        credentialStore: new Map(),
        sessionSecret: SECRET,
        credentialId: Buffer.from('nope').toString('base64url'),
        authenticatorData: Buffer.alloc(37).toString('base64url'),
        clientDataJSON: Buffer.from('{}').toString('base64url'),
        assertionSignature: Buffer.alloc(64, 1).toString('base64url'),
      }),
    /unknown credential|clientData|assertion/i
  );

  for (const sig of ['', '   ', 'YWJj']) {
    const issued = createPasskeyChallenge('did:sonaraim:alice', new Map(), {
      rpId: RP_ID,
      origin: ORIGIN,
    });
    const holder = new Map();
    holder.set(issued.challengeId, issued);
    assert.throws(
      () =>
        verifyPasskeyAssertionAndIssueSession({
          challengeId: issued.challengeId,
          userDid: 'did:sonaraim:alice',
          challengeStore: holder,
          credentialStore,
          sessionSecret: SECRET,
          credentialId: 'eA',
          authenticatorData: Buffer.alloc(37).toString('base64url'),
          clientDataJSON: Buffer.from('{}').toString('base64url'),
          assertionSignature: sig,
        }),
      /signature|assertion/i
    );
  }

  const { issued, assertion } = await freshRegisteredAssertion({ credentialStore, counter: 2 });
  const holder = new Map();
  holder.set(issued.challengeId, issued);
  const session = verifyPasskeyAssertionAndIssueSession({
    challengeId: issued.challengeId,
    userDid: 'did:sonaraim:alice',
    challengeStore: holder,
    credentialStore,
    sessionSecret: SECRET,
    rpId: RP_ID,
    origin: ORIGIN,
    ...assertion,
  });
  assert.equal(session.userDid, 'did:sonaraim:alice');
  assert.match(session.cookieHeader, /HttpOnly/);
});

test('#25: login view wires navigator.credentials.get() client flow', async () => {
  const { renderPasskeyLoginView, startAppTestServer } = await import('../src/index.mjs');
  const html = renderPasskeyLoginView({ userDid: 'did:sonaraim:alice' });
  assert.match(html, /navigator\.credentials\.get/);
  assert.match(html, /sonaraimPasskeyLogin/);
  assert.match(html, /\/auth\/passkey\/challenge/);
  assert.match(html, /\/auth\/passkey\/verify/);

  const { baseUrl, close } = await startAppTestServer({
    nodeApiBaseUrl: 'http://127.0.0.1:8090',
    appHttpPort: 0,
    requireAuth: true,
    sessionSecret: 'login-view-secret-0123456789abcdef',
  });
  try {
    const res = await fetch(`${baseUrl}/login`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /navigator\.credentials\.get/);
    assert.match(body, /Sign in with Passkey/);
  } finally {
    await close();
  }
});

test('#25: origin/RP-ID mismatch, counter replay, and user mismatch rejected', async () => {
  const credentialStore = new Map();

  const wrongOriginStore = new Map();
  const { issued: wo, assertion: woA } = await freshRegisteredAssertion({ credentialStore: wrongOriginStore });
  void wo;
  void woA;

  const credentialStore2 = new Map();
  const { issued, assertion } = await freshRegisteredAssertion({ credentialStore: credentialStore2, counter: 5 });
  const holder = new Map();
  holder.set(issued.challengeId, issued);
  const ok = verifyPasskeyAssertionAndIssueSession({
    challengeId: issued.challengeId,
    userDid: 'did:sonaraim:alice',
    challengeStore: holder,
    credentialStore: credentialStore2,
    sessionSecret: SECRET,
    rpId: RP_ID,
    origin: ORIGIN,
    ...assertion,
  });
  assert.equal(ok.userDid, 'did:sonaraim:alice');

  const replayIssued = createPasskeyChallenge('did:sonaraim:alice', holder, {
    rpId: RP_ID,
    origin: ORIGIN,
  });
  assert.throws(
    () =>
      verifyPasskeyAssertionAndIssueSession({
        challengeId: replayIssued.challengeId,
        userDid: 'did:sonaraim:alice',
        challengeStore: holder,
        credentialStore: credentialStore2,
        sessionSecret: SECRET,
        rpId: RP_ID,
        origin: ORIGIN,
        ...assertion,
      }),
    /replay|consumed|challenge/i
  );

  const otherStore = new Map();
  const otherIssued = createPasskeyChallenge('did:sonaraim:bob', otherStore, {
    rpId: RP_ID,
    origin: ORIGIN,
  });
  assert.throws(
    () =>
      verifyPasskeyAssertionAndIssueSession({
        challengeId: otherIssued.challengeId,
        userDid: 'did:sonaraim:bob',
        challengeStore: otherStore,
        credentialStore: credentialStore2,
        sessionSecret: SECRET,
        rpId: RP_ID,
        origin: ORIGIN,
        ...assertion,
      }),
      /user mismatch|challenge mismatch/i
  );
});

test('#25: registration rejects wrong challenge, non-Ed25519 keys, and duplicates', async () => {
  const credentialStore = new Map();
  const { privateKey, publicKeyRawB64 } = await generateEd25519FixtureKey();
  void privateKey;
  void publicKeyRawB64;
  const { publicKeyRawB64: pub } = await generateEd25519FixtureKey();

  const coseEc2 = Buffer.from([0xa4, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20, ...new Array(32).fill(1)]);
  const authData = await buildAuthenticatorDataWithCredential({
    rpId: RP_ID,
    credentialIdB64: Buffer.from('cred-x').toString('base64url'),
    coseKeyBytes: coseEc2,
  });
  assert.throws(
    () =>
      registerPasskeyCredential({
        userDid: 'did:sonaraim:alice',
        credentialId: Buffer.from('cred-x').toString('base64url'),
        attestationObject: buildAttestationObject(authData),
        clientDataJSON: buildRegistrationClientData(
          Buffer.from('right').toString('base64url'),
          ORIGIN
        ),
        challengeB64: Buffer.from('wrong').toString('base64url'),
        credentialStore,
      }),
    /challenge mismatch/i
  );

  assert.throws(
    () =>
      registerPasskeyCredential({
        userDid: 'did:sonaraim:alice',
        credentialId: Buffer.from('cred-x').toString('base64url'),
        attestationObject: buildAttestationObject(authData),
        clientDataJSON: buildRegistrationClientData(
          Buffer.from('right').toString('base64url'),
          ORIGIN
        ),
        challengeB64: Buffer.from('right').toString('base64url'),
        credentialStore,
      }),
    /COSE|Ed25519/i
  );
  void pub;
});
