/**
 * @fileoverview Lightweight Node.js HTTP server for Sonaraim Client App PWA & Instant Clip routes.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { renderInboxView } from './ui/inboxView.mjs';
import { renderInstantClipView } from './ui/instantClipView.mjs';
import { DualInboxRouter } from './dualInbox.mjs';
import { createSignedCardAction } from './cardRenderer.mjs';
import { fetchMailboxEnvelopes } from './nodeClient.mjs';
import { verifyAppSessionCookie } from './passkeySession.mjs';
import {
  readRequestBody,
  prefersJson,
  handlePasskeyAuthRoutes,
  handleDiscoveryAndCallRoutes,
} from './apiRoutes.mjs';

/**
 * Creates the HTTP request handler wired to the client app configuration.
 *
 * @param {{
 *   nodeApiBaseUrl: string,
 *   appHttpPort: number,
 *   b2bApiBaseUrl?: string,
 *   requireAuth?: boolean,
 *   sessionSecret?: string
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
      const mailboxId = String(url.searchParams.get('mailboxId') ?? '').trim();
      if (mailboxId) {
        counters.mailboxSyncTotal += 1;
        const synced = await fetchMailboxEnvelopes(config.nodeApiBaseUrl, mailboxId, 1500);
        for (const env of synced.envelopes) {
          const from = String(env.sender_did ?? env.senderDid ?? 'did:sonaraim:peer');
          const preview = String(env.preview ?? env.ciphertext_b64 ?? env.envelope_id ?? 'Queued MLS envelope');
          personalMessages.push({ from, preview });
        }
      }
      const html = renderInboxView({
        personalMessages,
        serviceCards: [
          {
            tenantDid: defaultMerchantDid,
            title: 'Appointment Confirmation',
            actions: ['Confirm'],
          },
        ],
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/inbox/consent/revoke') {
      counters.consentRevocationsTotal += 1;
      const body = await readRequestBody(req);
      const tenantDid = String(body.tenantDid || defaultMerchantDid).trim();
      const revokedAtMs = Date.now();
      router.revokeConsent(tenantDid, revokedAtMs);
      const revokedAt = new Date(revokedAtMs).toISOString();

      if (prefersJson(req)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'revoked', tenantDid, revokedAt }));
        return;
      }

      const html = renderInboxView({
        personalMessages: [{ from: 'did:sonaraim:bob', preview: 'Encrypted MLS hello' }],
        serviceCards: [],
        revocationReceipt: { tenantDid, revokedAt },
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const clipActMatch = url.pathname.match(/^\/c\/([^/]+)\/act$/);
    if (req.method === 'POST' && clipActMatch) {
      counters.clipActionsTotal += 1;
      const token = decodeURIComponent(clipActMatch[1]).trim();
      const body = await readRequestBody(req);
      const action = String(body.action || 'Confirm Action').trim();
      const tenantDid = String(body.tenantDid || defaultMerchantDid).trim();
      const signed = createSignedCardAction(
        {
          cardId: `clip_${token}`,
          actionId: action,
          userDid: 'did:sonaraim:ephemeral-clip-user',
          merchantDid: tenantDid,
          parameters: { token },
        },
        sessionPrivateKey
      );
      const receiptId = `rcpt_${crypto.randomUUID().slice(0, 8)}`;

      if (prefersJson(req)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'confirmed',
            token,
            tenantDid,
            action,
            receiptId,
            signature: signed.signature,
          })
        );
        return;
      }

      const html = renderInstantClipView({
        token,
        tenantDid,
        title: 'Instant Clip Card',
        actions: ['Confirm Action'],
        confirmationReceipt: { action, receiptId, signature: signed.signature },
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/c/')) {
      const token = url.pathname.slice(3);
      try {
        const html = renderInstantClipView({
          token,
          tenantDid: defaultMerchantDid,
          title: 'Instant Clip Card',
          actions: ['Confirm Action'],
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  };
}

/**
 * Starts the Client App HTTP server on `127.0.0.1`.
 *
 * @param {{nodeApiBaseUrl: string, appHttpPort: number, requireAuth?: boolean, sessionSecret?: string}} config
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
