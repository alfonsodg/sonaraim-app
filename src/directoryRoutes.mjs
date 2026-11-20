/**
 * @fileoverview Verified Mini-App / Bot directory routes for Sonaraim Client App.
 * Serves `GET /directory` (issue #4): lists only services whose merchant DID
 * is a verified `did:web:` identity. Verification is anchored on the merchant
 * registry passed in context (default: the app's consent-granted merchants).
 * Plaintext contact handles are never accepted here — PSI blinding happens via
 * `POST /api/contacts/discover` (`src/apiRoutes.mjs`).
 */

import { verifyAppSessionCookie } from './sessionCookie.mjs';
import { escapeHtml, renderAppShell } from './ui/htmlUtils.mjs';

/**
 * Checks whether a merchant DID is an acceptable verified `did:web:` identity.
 *
 * @param {unknown} merchantDid - Candidate merchant DID.
 * @returns {boolean} True for well-formed `did:web:` DIDs.
 */
export function isVerifiedWebService(merchantDid) {
  const did = String(merchantDid ?? '').trim();
  if (!did.startsWith('did:web:') || did.length <= 'did:web:'.length) {
    return false;
  }
  const host = did.slice('did:web:'.length);
  return /^[A-Za-z0-9]([A-Za-z0-9._:-]*[A-Za-z0-9])?$/.test(host);
}

/**
 * Handles `GET /directory` (JSON or HTML) listing verified Mini-App services.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @param {{
 *   router: { consentRegistry: Map<string, { merchantDid: string }> },
 *   requireAuth: boolean,
 *   sessionSecret: string
 * }} ctx - App runtime context.
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handleDirectoryRoutes(req, res, url, ctx) {
  if (req.method !== 'GET' || url.pathname !== '/directory') {
    return false;
  }
  if (ctx.requireAuth) {
    const check = verifyAppSessionCookie(req.headers.cookie, ctx.sessionSecret);
    if (!check.valid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', reason: check.reason }));
      return true;
    }
  }
  const services = [];
  const registry = ctx.router?.consentRegistry;
  if (registry instanceof Map) {
    for (const record of registry.values()) {
      if (record && isVerifiedWebService(record.merchantDid)) {
        services.push({ merchantDid: record.merchantDid, verified: true });
      }
    }
  }
  const accept = String(req.headers.accept ?? '').toLowerCase();
  if (!accept.includes('text/html')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ services }));
    return true;
  }
  const items = services
    .map(
      (svc) =>
        `<li><strong>${escapeHtml(svc.merchantDid)}</strong> <span>verified Mini-App</span></li>`
    )
    .join('');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    renderAppShell({
      title: 'Sonaraim Mini-App Directory',
      contentHtml: `<section aria-label="Verified Mini-App directory"><h2>Verified services</h2><ul>${items || '<li>No verified services yet</li>'}</ul></section>`,
    })
  );
  return true;
}
