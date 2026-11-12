/**
 * @fileoverview Lightweight Node.js HTTP server for Sonaraim Client App PWA & Instant Clip routes.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { renderInboxView } from './ui/inboxView.mjs';
import { renderInstantClipView } from './ui/instantClipView.mjs';
import { DualInboxRouter } from './dualInbox.mjs';
import { createSignedCardAction } from './cardRenderer.mjs';

/**
 * Reads and parses the incoming HTTP request body (supports JSON and application/x-www-form-urlencoded).
 *
 * @param {http.IncomingMessage} req - Incoming HTTP request.
 * @returns {Promise<Record<string, string>>} Parsed key-value payload.
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      const trimmed = raw.trim();
      if (!trimmed) {
        resolve({});
        return;
      }
      const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
      if (contentType.includes('application/json') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          resolve(parsed && typeof parsed === 'object' ? parsed : {});
          return;
        } catch {
          resolve({});
          return;
        }
      }
      const params = new URLSearchParams(trimmed);
      /** @type {Record<string, string>} */
      const out = {};
      for (const [k, v] of params.entries()) {
        out[k] = v;
      }
      resolve(out);
    });
    req.on('error', reject);
  });
}

/**
 * Determines whether the caller explicitly prefers a JSON response over HTML.
 *
 * @param {http.IncomingMessage} req - Incoming HTTP request.
 * @returns {boolean} True when JSON response is requested.
 */
function prefersJson(req) {
  const accept = String(req.headers.accept ?? '').toLowerCase();
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return true;
  }
  return contentType.includes('application/json') && !accept.includes('text/html');
}

/**
 * Creates the HTTP request handler wired to the client app configuration.
 *
 * @param {{nodeApiBaseUrl: string, appHttpPort: number, b2bApiBaseUrl?: string}} config
 * @returns {http.RequestListener}
 */
export function createAppRequestHandler(config) {
  const { privateKey: sessionPrivateKey } = crypto.generateKeyPairSync('ed25519');
  const router = new DualInboxRouter();
  const defaultMerchantDid = 'did:web:clinic.example.com';
  router.grantConsent({
    tokenId: 'ct-clinic-default',
    merchantDid: defaultMerchantDid,
    scopes: ['services:message', 'services:card'],
    expiresAt: Date.now() + 86_400_000 * 30,
  });

  return async (req, res) => {
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

    if (req.method === 'GET' && url.pathname === '/inbox') {
      const html = renderInboxView({
        personalMessages: [{ from: 'did:sonaraim:bob', preview: 'Encrypted MLS hello' }],
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
      const body = await readRequestBody(req);
      const tenantDid = String(body.tenantDid || defaultMerchantDid).trim();
      const revokedAtMs = Date.now();
      router.revokeConsent(tenantDid, revokedAtMs);
      const revokedAt = new Date(revokedAtMs).toISOString();

      if (prefersJson(req)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'revoked',
            tenantDid,
            revokedAt,
          })
        );
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
        confirmationReceipt: {
          action,
          receiptId,
          signature: signed.signature,
        },
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
 * @param {{nodeApiBaseUrl: string, appHttpPort: number}} config
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
