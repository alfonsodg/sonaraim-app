/**
 * @fileoverview Lightweight Node.js HTTP server for Sonaraim Client App PWA & Instant Clip routes.
 */

import http from 'node:http';
import { renderInboxView } from './ui/inboxView.mjs';
import { renderInstantClipView } from './ui/instantClipView.mjs';

/**
 * Creates the HTTP request handler wired to the client app configuration.
 *
 * @param {{nodeApiBaseUrl: string, appHttpPort: number}} config
 * @returns {http.RequestListener}
 */
export function createAppRequestHandler(config) {
  return (req, res) => {
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
            tenantDid: 'did:web:clinic.example.com',
            title: 'Appointment Confirmation',
            actions: ['Confirm'],
          },
        ],
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
          tenantDid: 'did:web:clinic.example.com',
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
