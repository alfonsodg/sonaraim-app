/**
 * @fileoverview Route handlers for Instant App Clip interactions and promotional consent revocation.
 */

import crypto from 'node:crypto';
import { renderInboxView } from './ui/inboxView.mjs';
import { renderInstantClipView } from './ui/instantClipView.mjs';
import { createSignedCardAction } from './cardRenderer.mjs';
import { readRequestBody, prefersJson } from './apiRoutes.mjs';

/**
 * Handles Instant Clip actions and promotional consent revocation routes.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {{
 *   router: import('./dualInbox.mjs').DualInboxRouter,
 *   sessionPrivateKey: crypto.KeyObject,
 *   defaultMerchantDid: string,
 *   counters: { clipActionsTotal: number, consentRevocationsTotal: number }
 * }} ctx
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handleClipAndConsentRoutes(req, res, url, ctx) {
  if (req.method === 'POST' && url.pathname === '/inbox/consent/revoke') {
    ctx.counters.consentRevocationsTotal += 1;
    const body = await readRequestBody(req);
    const tenantDid = String(body.tenantDid || ctx.defaultMerchantDid).trim();
    const revokedAtMs = Date.now();
    ctx.router.revokeConsent(tenantDid, revokedAtMs);
    const revokedAt = new Date(revokedAtMs).toISOString();

    if (prefersJson(req)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'revoked', tenantDid, revokedAt }));
      return true;
    }

    const html = renderInboxView({
      personalMessages: [{ from: 'did:sonaraim:bob', preview: 'Encrypted MLS hello' }],
      serviceCards: [],
      revocationReceipt: { tenantDid, revokedAt },
    });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return true;
  }

  const clipActMatch = url.pathname.match(/^\/c\/([^/]+)\/act$/);
  if (req.method === 'POST' && clipActMatch) {
    ctx.counters.clipActionsTotal += 1;
    const token = decodeURIComponent(clipActMatch[1]).trim();
    const body = await readRequestBody(req);
    const action = String(body.action || 'Confirm Action').trim();
    const tenantDid = String(body.tenantDid || ctx.defaultMerchantDid).trim();
    const signed = createSignedCardAction(
      {
        cardId: `clip_${token}`,
        actionId: action,
        userDid: 'did:sonaraim:ephemeral-clip-user',
        merchantDid: tenantDid,
        parameters: { token },
      },
      ctx.sessionPrivateKey
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
      return true;
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
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/c/')) {
    const token = url.pathname.slice(3);
    try {
      const html = renderInstantClipView({
        token,
        tenantDid: ctx.defaultMerchantDid,
        title: 'Instant Clip Card',
        actions: ['Confirm Action'],
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}
