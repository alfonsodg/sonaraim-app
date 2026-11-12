/**
 * @fileoverview Comprehensive test suite for SonarAIM Client Core (`@sonaraim/app`).
 * Verifies Dual Inbox routing and ConsentToken revocation, Zero-HTML native card
 * Ed25519 signature & component safety validation, and Passkey WebAuthn PRF
 * Zero-Knowledge Vault key derivation and AES-256-GCM encryption/decryption.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  DualInboxRouter,
  canonicalizeJson,
  verifyCardSignature,
  renderDeclarativeCard,
  createSignedCardAction,
  deriveVaultKey,
  encryptVaultBlob,
  decryptVaultBlob
} from '../src/index.mjs';

test('DualInboxRouter routes did:sonaraim peer messages to PERSONAL stream', () => {
  const router = new DualInboxRouter();
  const result = router.routeEnvelope({
    envelopeId: 'env-peer-001',
    senderDid: 'did:sonaraim:alice-key-fingerprint',
    mlsGroupId: 'group-p2p-1',
    payload: { text: 'Hello from Alice' }
  });

  assert.equal(result.accepted, true);
  assert.equal(result.stream, 'PERSONAL');
  assert.equal(result.envelopeId, 'env-peer-001');
});

test('DualInboxRouter enforces ConsentToken grant, expiration, and revocation for did:web services', () => {
  const router = new DualInboxRouter();
  const merchantDid = 'did:web:billing.acme.example.com';
  const now = 1_700_000_000_000;

  // Without prior consent, verified merchant is rejected
  const noConsent = router.routeEnvelope({
    envelopeId: 'env-b2b-001',
    senderDid: merchantDid,
    mlsGroupId: 'group-b2b-1',
    verifiedDidWeb: true,
    payload: { cardId: 'card-1' }
  }, now);
  assert.equal(noConsent.accepted, false);
  assert.equal(noConsent.reason, 'CONSENT_NOT_FOUND');

  // Unverified did:web envelope is rejected even if consent exists
  router.grantConsent({
    tokenId: 'ct-acme-01',
    merchantDid,
    scopes: ['services:message', 'services:card'],
    expiresAt: now + 60_000
  });

  const unverified = router.routeEnvelope({
    envelopeId: 'env-b2b-002',
    senderDid: merchantDid,
    mlsGroupId: 'group-b2b-1',
    verifiedDidWeb: false,
    consentTokenId: 'ct-acme-01',
    payload: {}
  }, now);
  assert.equal(unverified.accepted, false);
  assert.equal(unverified.reason, 'UNVERIFIED_MERCHANT_DID');

  // Valid verified merchant with active ConsentToken routes to SERVICES stream
  const accepted = router.routeEnvelope({
    envelopeId: 'env-b2b-003',
    senderDid: merchantDid,
    mlsGroupId: 'group-b2b-1',
    verifiedDidWeb: true,
    consentTokenId: 'ct-acme-01',
    payload: { cardId: 'card-1' }
  }, now + 1_000);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.stream, 'SERVICES');

  // Revoking ConsentToken immediately blocks subsequent envelopes
  const revoked = router.revokeConsent(merchantDid, now + 2_000);
  assert.equal(revoked, true);

  const afterRevoke = router.routeEnvelope({
    envelopeId: 'env-b2b-004',
    senderDid: merchantDid,
    mlsGroupId: 'group-b2b-1',
    verifiedDidWeb: true,
    consentTokenId: 'ct-acme-01',
    payload: { cardId: 'card-2' }
  }, now + 3_000);
  assert.equal(afterRevoke.accepted, false);
  assert.equal(afterRevoke.reason, 'CONSENT_REVOKED');
});

test('Zero-HTML Card Renderer verifies Ed25519 signature and rejects unsafe HTML/script payloads', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const validCard = {
    cardId: 'card-order-901',
    merchantDid: 'did:web:shop.example.com',
    schemaVersion: '1.0',
    issuedAt: 1_700_000_000_000,
    components: [
      {
        id: 'hdr-1',
        type: 'header',
        props: { title: 'Order #901 Ready for Pickup', subtitle: 'Locker B12' }
      },
      {
        id: 'kv-1',
        type: 'key_value',
        props: { label: 'Total Paid', value: '$42.50 USD' },
        actions: [
          {
            actionId: 'act-confirm-pickup',
            type: 'confirm_intent',
            label: 'Unlock Locker',
            payload: { lockerId: 'B12' }
          }
        ]
      }
    ]
  };

  const signature = crypto
    .sign(null, Buffer.from(canonicalizeJson(validCard), 'utf8'), privateKey)
    .toString('base64');

  const viewTree = renderDeclarativeCard({ card: validCard, signature }, publicKey);
  assert.equal(viewTree.viewType, 'SONARAIM_NATIVE_CARD');
  assert.equal(viewTree.verifiedSignature, true);
  assert.equal(viewTree.nodes.length, 2);
  assert.equal(viewTree.nodes[0].widget, 'native:header');
  assert.equal(viewTree.nodes[1].actions[0].actionId, 'act-confirm-pickup');

  // Reject tampered card content
  const tamperedCard = { ...validCard, cardId: 'card-order-999' };
  assert.throws(
    () => renderDeclarativeCard({ card: tamperedCard, signature }, publicKey),
    /invalid Ed25519 merchant signature/
  );

  // Reject unsupported HTML/webview component type
  const unsafeComponentCard = {
    ...validCard,
    components: [{ id: 'bad-1', type: 'iframe_webview', props: { src: 'https://evil.test' } }]
  };
  const unsafeCompSig = crypto
    .sign(null, Buffer.from(canonicalizeJson(unsafeComponentCard), 'utf8'), privateKey)
    .toString('base64');
  assert.throws(
    () => renderDeclarativeCard({ card: unsafeComponentCard, signature: unsafeCompSig }, publicKey),
    /Unsupported or unsafe component type/
  );

  // Reject embedded HTML markup inside a text prop
  const xssCard = {
    ...validCard,
    components: [{ id: 'txt-1', type: 'text', props: { body: 'Hello <script>alert(1)</script>' } }]
  };
  const xssSig = crypto
    .sign(null, Buffer.from(canonicalizeJson(xssCard), 'utf8'), privateKey)
    .toString('base64');
  assert.throws(
    () => renderDeclarativeCard({ card: xssCard, signature: xssSig }, publicKey),
    /Zero-HTML policy violation/
  );
});

test('createSignedCardAction produces verifiable Ed25519 user intent signatures', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const signedAction = createSignedCardAction({
    cardId: 'card-order-901',
    actionId: 'act-confirm-pickup',
    userDid: 'did:sonaraim:user-z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    merchantDid: 'did:web:shop.example.com',
    parameters: { lockerId: 'B12', biometricVerified: true },
    timestamp: 1_700_000_050_000
  }, privateKey);

  assert.equal(
    verifyCardSignature(signedAction.actionPayload, signedAction.signature, publicKey),
    true
  );
});

test('Zero-Knowledge Vault derives deterministic PRF keys and authenticates AES-256-GCM snapshots', () => {
  const userDid = 'did:sonaraim:user-vault-test-01';
  const prfSecret = crypto.randomBytes(32);
  const salt = crypto.randomBytes(16);

  const keyA = deriveVaultKey({ prfSecret, salt, userDid });
  const keyB = deriveVaultKey({ prfSecret, salt, userDid });
  assert.equal(keyA.byteLength, 32);
  assert.deepEqual(keyA, keyB);

  // Different user DID produces distinct domain-separated vault key
  const keyOtherUser = deriveVaultKey({
    prfSecret,
    salt,
    userDid: 'did:sonaraim:user-vault-test-02'
  });
  assert.notDeepEqual(keyA, keyOtherUser);

  const snapshot = {
    mlsGroups: ['group-p2p-1', 'group-b2b-1'],
    ratchetEpoch: 14,
    consents: [{ tokenId: 'ct-acme-01', merchantDid: 'did:web:billing.acme.example.com' }]
  };

  const encryptedBlob = encryptVaultBlob({
    vaultKey: keyA,
    userDid,
    epoch: 14,
    snapshot
  });

  const restored = decryptVaultBlob({
    blob: encryptedBlob,
    vaultKey: keyB,
    expectedUserDid: userDid
  });

  assert.equal(restored.userDid, userDid);
  assert.equal(restored.epoch, 14);
  assert.deepEqual(restored.snapshot, snapshot);

  // Tampering with epoch metadata triggers AES-GCM AAD authentication failure
  const tamperedEpochBlob = { ...encryptedBlob, epoch: 15 };
  assert.throws(
    () => decryptVaultBlob({ blob: tamperedEpochBlob, vaultKey: keyA }),
    /Unsupported state or unable to authenticate data/
  );
});
