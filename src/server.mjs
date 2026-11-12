/**
 * @fileoverview Lightweight Node.js HTTP server for Sonaraim Client App PWA & Instant Clip routes.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { renderInboxView } from './ui/inboxView.mjs';
import { DualInboxRouter } from './dualInbox.mjs';
import { fetchMailboxEnvelopes } from './nodeClient.mjs';
import { verifyAppSessionCookie } from './passkeySession.mjs';
import { handlePhoneAndDeviceRoutes } from './phonePairing.mjs';
import { handleClipAndConsentRoutes } from './clipRoutes.mjs';
import {
  handlePasskeyAuthRoutes,
  handleDiscoveryAndCallRoutes,
  handleInboxMessageRoutes,
} from './apiRoutes.mjs';

/**
 * Creates the HTTP request handler wired to the client app configuration.
 *
 * @param {{
 *   nodeApiBaseUrl: string,
 *   appHttpPort: number,
 *   b2bApiBaseUrl?: string,
 *   requireAuth?: boolean,
 *   sessionSecret?: string,
 *   livekitUrl?: string
 * }} config
 * @returns {http.RequestListener}
 */
export function createAppRequestHandler(config) {
  const { privateKey: sessionPrivateKey } = crypto.generateKeyPairSync('ed25519');
  const sessionSecret =
    String(config.sessionSecret || process.env.SONARAIM_SESSION_SECRET || '').trim() ||
    crypto.randomBytes(32).toString('hex');
  const requireAuth =
    config.requireAuth === true || process.env.SONARAIM_REQUIRE_AUTH === 'true';
  const challengeStore = new Map();
  const pairingStore = new Map();

  const router = new DualInboxRouter();
  const defaultMerchantDid = 'did:web:clinic.example.com';
  router.grantConsent({
    tokenId: 'ct-clinic-default',
    merchantDid: defaultMerchantDid,
    scopes: ['services:message', 'services:card'],
    expiresAt: Date.now() + 86_400_000 * 30,
  });

  const counters = {
    httpRequestsTotal: 0,
    mailboxSyncTotal: 0,
    clipActionsTotal: 0,
    consentRevocationsTotal: 0,
  };

  return async (req, res) => {
    counters.httpRequestsTotal += 1;
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'sonaraim-app',
          nodeApiBaseUrl: config.nodeApiBaseUrl,
        })
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/metrics') {
      const lines = [
        '# HELP sonaraim_app_http_requests_total Total HTTP requests handled by sonaraim-app.',
        '# TYPE sonaraim_app_http_requests_total counter',
        `sonaraim_app_http_requests_total ${counters.httpRequestsTotal}`,
        '# HELP sonaraim_app_mailbox_sync_total Total Node mailbox sync operations executed.',
        '# TYPE sonaraim_app_mailbox_sync_total counter',
        `sonaraim_app_mailbox_sync_total ${counters.mailboxSyncTotal}`,
        '# HELP sonaraim_app_clip_actions_total Total Instant Clip interactive actions signed.',
        '# TYPE sonaraim_app_clip_actions_total counter',
        `sonaraim_app_clip_actions_total ${counters.clipActionsTotal}`,
        '# HELP sonaraim_app_consent_revocations_total Total 1-tap consent revocations processed.',
        '# TYPE sonaraim_app_consent_revocations_total counter',
        `sonaraim_app_consent_revocations_total ${counters.consentRevocationsTotal}`,
        '',
      ].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(lines);
      return;
    }

    if (await handlePasskeyAuthRoutes(req, res, url, { challengeStore, sessionSecret })) {
      return;
    }

    if (
      await handleDiscoveryAndCallRoutes(req, res, url, {
        nodeApiBaseUrl: config.nodeApiBaseUrl,
        livekitUrl: config.livekitUrl,
        sessionSecret,
      })
    ) {
      return;
    }

    if (await handleInboxMessageRoutes(req, res, url, { nodeApiBaseUrl: config.nodeApiBaseUrl })) {
      return;
    }

    if (
      await handlePhoneAndDeviceRoutes(req, res, url, {
        nodeApiBaseUrl: config.nodeApiBaseUrl,
        pairingStore,
      })
    ) {
      return;
    }

    const mailboxMatch = url.pathname.match(/^\/api\/mailbox\/([^/]+)$/);
    if (req.method === 'GET' && mailboxMatch) {
      const mailboxId = decodeURIComponent(mailboxMatch[1]).trim();
      counters.mailboxSyncTotal += 1;
      const synced = await fetchMailboxEnvelopes(config.nodeApiBaseUrl, mailboxId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(synced));
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/inbox')) {
      if (requireAuth) {
        const check = verifyAppSessionCookie(req.headers.cookie, sessionSecret);
        if (!check.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized', reason: check.reason }));
          return;
        }
      }

      const personalMessages = [{ from: 'did:sonaraim:bob', preview: 'Encrypted MLS hello' }];
      const serviceCards = [];
      const rawMailbox = String(url.searchParams.get('mailboxId') ?? '').trim();
      const mailboxId = rawMailbox.startsWith('did:sonaraim: ')
        ? `did:sonaraim:+${rawMailbox.slice('did:sonaraim: '.length).trim()}`
        : rawMailbox;
      let linkedPhone = url.searchParams.get('phone');
      if (mailboxId.startsWith('did:sonaraim:+')) {
        linkedPhone = mailboxId.slice('did:sonaraim:'.length);
      }

      if (mailboxId) {
        counters.mailboxSyncTotal += 1;
        const synced = await fetchMailboxEnvelopes(config.nodeApiBaseUrl, mailboxId, 1500);
        for (const env of synced.envelopes) {
          const payload = env.decodedPayload;
          if (payload && (payload.tenantDid || payload.title)) {
            serviceCards.push({
              tenantDid: String(payload.tenantDid || defaultMerchantDid),
              title: String(payload.title || 'Verified Service Card'),
              actions: Array.isArray(payload.actions) ? payload.actions : ['View'],
              clipToken: payload.clipToken,
            });
          } else {
            const from = String(
              payload?.senderDid ?? env.sender_did ?? env.senderDid ?? 'did:sonaraim:peer'
            );
            const preview = String(
              payload?.text ?? env.preview ?? env.ciphertext_b64 ?? env.envelope_id ?? 'Queued MLS envelope'
            );
            personalMessages.push({ from, preview });
          }
        }
      }

      if (serviceCards.length === 0) {
        serviceCards.push({
          tenantDid: defaultMerchantDid,
          title: 'Appointment Confirmation',
          actions: ['Confirm'],
        });
      }

      const html = renderInboxView({
        personalMessages,
        serviceCards,
        linkedPhone,
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (
      await handleClipAndConsentRoutes(req, res, url, {
        router,
        sessionPrivateKey,
        defaultMerchantDid,
        counters,
      })
    ) {
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  };
}

/**
 * Starts the Client App HTTP server on `127.0.0.1`.
 *
 * @param {{
 *   nodeApiBaseUrl: string,
 *   appHttpPort: number,
 *   requireAuth?: boolean,
 *   sessionSecret?: string,
 *   livekitUrl?: string
 * }} config
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>}
 */
export function startAppTestServer(config) {
  const server = http.createServer(createAppRequestHandler(config));
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(config.appHttpPort, '127.0.0.1', () => {
      const addr = server.address();
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        baseUrl,
        close: () => new Promise((resClose) => server.close(() => resClose())),
      });
    });
  });
}
