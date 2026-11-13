/**
 * @fileoverview Automated tests for Sonaraim React Native Mobile modules.
 * Verifies config resolution, API client HTTP integrations, Zero-HTML card validation,
 * and E.164 / companion pairing payload formatting using node:test and node:assert.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMobileConfig, mobileConfig } from '../src/config.js';
import { normalizeE164, createApiClient } from '../src/apiClient.js';
import {
  validateDeclarativeCard,
  validateCardAction,
  validateCardComponent,
  hasHtmlInjection,
  CardValidationError,
  ALLOWED_COMPONENT_TYPES,
  ALLOWED_ACTION_TYPES,
} from '../src/cardValidator.js';

describe('Mobile Config Resolver', () => {
  it('resolves safe defaults when environment variables are omitted', () => {
    const config = resolveMobileConfig({});
    assert.equal(config.appApiUrl, 'http://localhost:3000');
    assert.equal(config.nodeApiUrl, 'http://localhost:8080');
    assert.equal(config.livekitUrl, 'wss://livekit.sonaraim.internal');
    assert.equal(config.domainSalt, 'sonaraim-mobile-v1');
    assert.equal(config.requestTimeoutMs, 8000);
  });

  it('overrides URLs and strips trailing slashes dynamically', () => {
    const custom = resolveMobileConfig({
      EXPO_PUBLIC_APP_API_URL: 'https://app.sonaraim.org///',
      EXPO_PUBLIC_NODE_API_URL: 'https://relay.sonaraim.org/',
      EXPO_PUBLIC_LIVEKIT_URL: 'wss://livekit.sonaraim.org/',
      EXPO_PUBLIC_DOMAIN_SALT: 'custom-salt-v2',
      EXPO_PUBLIC_REQUEST_TIMEOUT_MS: '5000',
    });
    assert.equal(custom.appApiUrl, 'https://app.sonaraim.org');
    assert.equal(custom.nodeApiUrl, 'https://relay.sonaraim.org');
    assert.equal(custom.livekitUrl, 'wss://livekit.sonaraim.org');
    assert.equal(custom.domainSalt, 'custom-salt-v2');
    assert.equal(custom.requestTimeoutMs, 5000);
  });

  it('exports default mobileConfig instance', () => {
    assert.ok(mobileConfig);
    assert.ok(typeof mobileConfig.appApiUrl === 'string');
  });
});

describe('E.164 Phone Normalization', () => {
  it('formats various raw phone numbers to standard E.164', () => {
    assert.equal(normalizeE164('+1 (415) 555-2671'), '+14155552671');
    assert.equal(normalizeE164('51999888777'), '+51999888777');
    assert.equal(normalizeE164('+44-20-7946-0958'), '+442079460958');
  });

  it('rejects invalid or malformed phone inputs', () => {
    assert.throws(() => normalizeE164(''), /cannot be empty/);
    assert.throws(() => normalizeE164('abc'), /Invalid E.164/);
    assert.throws(() => normalizeE164('+01234'), /Invalid E.164/);
  });
});

describe('Mobile API Client with Mocked Fetch', () => {
  it('registers E.164 phone identity via POST /auth/phone/register', async () => {
    let capturedUrl = '';
    let capturedBody = null;
    const mockFetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        text: async () => JSON.stringify({
          phone: capturedBody.phone,
          userDid: `did:sonaraim:${capturedBody.phone}`,
          blindedToken: 'mock-blinded-token-1234',
          status: 'registered',
        }),
      };
    };

    const client = createApiClient({ appApiUrl: 'http://test-app:3000' }, { fetch: mockFetch });
    const res = await client.registerPhone('+1 (415) 555-2671');

    assert.equal(capturedUrl, 'http://test-app:3000/auth/phone/register');
    assert.equal(capturedBody.phone, '+14155552671');
    assert.equal(res.status, 'registered');
    assert.equal(res.userDid, 'did:sonaraim:+14155552671');
  });

  it('creates and verifies companion device pairing sessions via POST /auth/devices/pair', async () => {
    const mockFetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.userDid) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            status: 'created',
            pairingCode: '654321',
            pairingUri: `sonaraim://pair?code=654321&did=${encodeURIComponent(body.userDid)}`,
            userDid: body.userDid,
            expiresAt: '2026-11-13T01:00:00.000Z',
          }),
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({
          status: 'paired',
          valid: true,
          userDid: 'did:sonaraim:+14155552671',
          pairedAt: '2026-11-13T00:25:00.000Z',
        }),
      };
    };

    const client = createApiClient({ appApiUrl: 'http://test-app:3000' }, { fetch: mockFetch });
    const session = await client.createPairingSession('did:sonaraim:+14155552671');
    assert.equal(session.pairingCode, '654321');
    assert.match(session.pairingUri, /^sonaraim:\/\/pair\?code=654321/);

    const verified = await client.verifyPairingCode('654321');
    assert.equal(verified.status, 'paired');
    assert.equal(verified.valid, true);
  });

  it('fetches mailbox envelopes and sends encrypted P2P message', async () => {
    const mockFetch = async (url, opts = {}) => {
      if (url.includes('/api/mailbox/')) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            mailbox_id: 'did:sonaraim:alice',
            items: [{ id: 'env-1', text: 'Hello Alice' }],
          }),
        };
      }
      if (url.includes('/inbox/messages')) {
        const body = JSON.parse(opts.body);
        return {
          ok: true,
          text: async () => JSON.stringify({
            status: 'sent',
            envelopeId: 'env-999',
            recipientDid: body.recipientDid,
          }),
        };
      }
      return { ok: false, status: 404, text: async () => 'Not found' };
    };

    const client = createApiClient(
      { appApiUrl: 'http://test-app:3000', nodeApiUrl: 'http://test-node:8080' },
      { fetch: mockFetch }
    );

    const mailbox = await client.fetchInboxMailbox('did:sonaraim:alice');
    assert.equal(mailbox.items.length, 1);
    assert.equal(mailbox.items[0].text, 'Hello Alice');

    const sent = await client.sendP2pMessage({
      senderDid: 'did:sonaraim:alice',
      recipientDid: 'did:sonaraim:bob',
      text: 'Encrypted greeting',
    });
    assert.equal(sent.status, 'sent');
    assert.equal(sent.envelopeId, 'env-999');
  });

  it('fetches LiveKit encrypted room token via POST /api/calls/token', async () => {
    const mockFetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      return {
        ok: true,
        text: async () => JSON.stringify({
          roomName: body.roomName,
          participantDid: body.participantDid,
          serverUrl: 'wss://livekit.sonaraim.internal',
          token: 'mock.livekit.jwt.token',
        }),
      };
    };

    const client = createApiClient({ appApiUrl: 'http://test-app:3000' }, { fetch: mockFetch });
    const call = await client.fetchCallToken({
      roomName: 'secure-ops',
      participantDid: 'did:sonaraim:operator',
    });

    assert.equal(call.roomName, 'secure-ops');
    assert.equal(call.token, 'mock.livekit.jwt.token');
    assert.equal(call.serverUrl, 'wss://livekit.sonaraim.internal');
  });

  it('queries PSI blind matches from node relay', async () => {
    const mockFetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      return {
        ok: true,
        text: async () => JSON.stringify({
          matched_hashes: [body.blinded_hashes[0]],
        }),
      };
    };

    const client = createApiClient({ nodeApiUrl: 'http://test-node:8080' }, { fetch: mockFetch });
    const res = await client.blindMatchPsi(['hash-1', 'hash-2']);
    assert.deepEqual(res.matched_hashes, ['hash-1']);
  });

  it('surfaces HTTP errors with descriptive messages', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Pairing code expired' }),
    });

    const client = createApiClient({ appApiUrl: 'http://test-app:3000' }, { fetch: mockFetch });
    await assert.rejects(
      async () => client.verifyPairingCode('000000'),
      /Pairing code expired/
    );
  });
});

describe('Zero-HTML Declarative Card Validator', () => {
  it('accepts valid declarative card envelopes', () => {
    const validCard = {
      title: 'Order Confirmation',
      tenantDid: 'did:web:merchant.example.com',
      components: [
        { type: 'header', text: 'Thank you for your order' },
        { type: 'key_value', key: 'Total', value: '$42.00' },
      ],
      actions: [
        { id: 'act-1', type: 'confirm_intent', label: 'Confirm Delivery' },
        { id: 'act-2', type: 'request_receipt', label: 'Email Receipt' },
      ],
    };

    const result = validateDeclarativeCard(validCard);
    assert.equal(result.valid, true);
    assert.equal(result.card.title, 'Order Confirmation');
  });

  it('rejects raw HTML, script tags, and javascript URIs', () => {
    assert.equal(hasHtmlInjection('<script>alert(1)</script>'), true);
    assert.equal(hasHtmlInjection('<img src="x" onerror="evil()">'), true);
    assert.equal(hasHtmlInjection('javascript:void(0)'), true);
    assert.equal(hasHtmlInjection('Plain text string'), false);

    assert.throws(
      () => validateDeclarativeCard({
        title: '<script>evil()</script>',
        tenantDid: 'did:web:example.com',
      }),
      (err) => err instanceof CardValidationError && err.message.includes('Zero-HTML')
    );

    assert.throws(
      () => validateDeclarativeCard({
        title: 'Safe Title',
        tenantDid: 'did:web:example.com',
        actions: [{ id: '1', type: 'confirm_intent', label: '<b onclick="hack()">Click</b>' }],
      }),
      /Zero-HTML policy violation/
    );
  });

  it('rejects cards with missing title or invalid tenantDid', () => {
    assert.throws(
      () => validateDeclarativeCard({ tenantDid: 'did:web:example.com' }),
      /title must be a non-empty string/
    );

    assert.throws(
      () => validateDeclarativeCard({ title: 'Test', tenantDid: 'invalid-not-did' }),
      /tenantDid must be a valid DID/
    );
  });

  it('enforces allowed component types and action types', () => {
    assert.ok(ALLOWED_COMPONENT_TYPES.has('header'));
    assert.ok(ALLOWED_ACTION_TYPES.has('confirm_intent'));

    assert.throws(
      () => validateCardComponent({ type: 'unsafe_custom_html' }),
      /Unsupported component type/
    );

    assert.throws(
      () => validateCardAction({ id: 'a1', type: 'eval_js', label: 'Run' }),
      /Unsupported action type/
    );
  });
});
