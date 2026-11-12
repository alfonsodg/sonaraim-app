/**
 * @fileoverview WhatsApp-like E.164 phone activation, 6-digit companion device pairing,
 * and installable mobile PWA manifest generator for Sonaraim Client App.
 */

import crypto from 'node:crypto';
import { readRequestBody } from './apiRoutes.mjs';

/**
 * Normalizes and validates a phone number to standard E.164 international format.
 * Examples: `+51999888777`, `51999888777`, `+1 (415) 555-2671` -> `+14155552671`.
 *
 * @param {string} rawPhone - Raw input phone number.
 * @returns {string} Normalized E.164 phone string starting with `+`.
 */
export function normalizeE164Phone(rawPhone) {
  const input = String(rawPhone ?? '').trim();
  if (!input) {
    throw new Error('Phone number cannot be empty');
  }

  const cleaned = input.replace(/[\s\-().]/g, '');
  const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;

  if (!/^\+[1-9]\d{6,14}$/.test(withPlus)) {
    throw new Error(`Invalid E.164 phone number: "${rawPhone}"`);
  }

  return withPlus;
}

/**
 * Derives a blinded identity token and registers the phone identity on the upstream node relay.
 *
 * @param {string} nodeApiBaseUrl - Base URL of `sonaraim-node`.
 * @param {string} phone - Raw or normalized phone number.
 * @param {{ domainSalt?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ phone: string, userDid: string, blindedToken: string, status: string }>}
 */
export async function registerPhoneIdentityOnNode(nodeApiBaseUrl, phone, options = {}) {
  const normalizedPhone = normalizeE164Phone(phone);
  const userDid = `did:sonaraim:${normalizedPhone}`;
  const salt = String(options.domainSalt || 'sonaraim-phone-v1').trim();

  const blindedToken = crypto
    .createHmac('sha256', salt)
    .update(normalizedPhone, 'utf8')
    .digest('hex');

  const baseUrl = String(nodeApiBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (baseUrl) {
    try {
      await fetch(`${baseUrl}/v1/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ userDid, phone: normalizedPhone, blindedToken }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 2500),
      });
    } catch {
      // Graceful fallback when node relay runs offline or mock
    }
  }

  return {
    phone: normalizedPhone,
    userDid,
    blindedToken,
    status: 'registered',
  };
}

/**
 * Creates a 6-digit numeric pairing session for linking companion devices (Desktop/Web).
 *
 * @param {string} userDid - Owner user DID (e.g. `did:sonaraim:+51999888777`).
 * @param {{ pairingStore?: Map<string, any>, ttlMs?: number }} [options]
 * @returns {{ pairingCode: string, pairingUri: string, userDid: string, expiresAt: string }}
 */
export function createDevicePairingSession(userDid, options = {}) {
  const cleanDid = String(userDid ?? 'did:sonaraim:user').trim();
  const pairingStore = options.pairingStore || new Map();
  const code = String(crypto.randomInt(100000, 1000000));
  const ttlMs = options.ttlMs ?? 300_000;
  const expiresAtMs = Date.now() + ttlMs;

  const session = {
    pairingCode: code,
    pairingUri: `sonaraim://pair?code=${code}&did=${encodeURIComponent(cleanDid)}`,
    userDid: cleanDid,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
  };

  pairingStore.set(code, session);
  return {
    pairingCode: session.pairingCode,
    pairingUri: session.pairingUri,
    userDid: session.userDid,
    expiresAt: session.expiresAt,
  };
}

/**
 * Verifies and redeems a 6-digit companion device pairing code.
 *
 * @param {string} pairingCode - 6-digit code.
 * @param {Map<string, any>} pairingStore - In-memory pairing code registry.
 * @returns {{ valid: boolean, userDid?: string, pairedAt?: string, reason?: string }}
 */
export function verifyDevicePairingCode(pairingCode, pairingStore) {
  const code = String(pairingCode ?? '').trim();
  if (!code || !pairingStore || !pairingStore.has(code)) {
    return { valid: false, reason: 'Invalid or non-existent pairing code' };
  }

  const session = pairingStore.get(code);
  if (Date.now() > session.expiresAtMs) {
    pairingStore.delete(code);
    return { valid: false, reason: 'Pairing code expired' };
  }

  pairingStore.delete(code);
  return {
    valid: true,
    userDid: session.userDid,
    pairedAt: new Date().toISOString(),
  };
}

/**
 * Generates the standard Web App Manifest descriptor for mobile PWA installation.
 *
 * @returns {Record<string, unknown>} W3C Web App Manifest object.
 */
export function buildPwaManifest() {
  return {
    name: 'Sonaraim Client',
    short_name: 'Sonaraim',
    description: 'SonarAIM Zero-Knowledge Encrypted Client and Dual Inbox',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    background_color: '#090d16',
    theme_color: '#090d16',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };
}

/**
 * Handles phone registration, companion device pairing, and webmanifest endpoints.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {{ nodeApiBaseUrl: string, pairingStore: Map<string, any> }} ctx
 * @returns {Promise<boolean>} True if route was handled.
 */
export async function handlePhoneAndDeviceRoutes(req, res, url, ctx) {
  if (req.method === 'GET' && (url.pathname === '/manifest.webmanifest' || url.pathname === '/manifest.json')) {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
    res.end(JSON.stringify(buildPwaManifest(), null, 2));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/auth/phone/register') {
    const body = await readRequestBody(req);
    const phone = String(body.phone ?? '').trim();
    try {
      const registered = await registerPhoneIdentityOnNode(ctx.nodeApiBaseUrl, phone);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(registered));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/auth/devices/pair') {
    const body = await readRequestBody(req);
    const pairingCode = String(body.pairingCode ?? body.code ?? '').trim();

    if (pairingCode) {
      const verified = verifyDevicePairingCode(pairingCode, ctx.pairingStore);
      if (!verified.valid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: verified.reason }));
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'paired', ...verified }));
      return true;
    }

    const userDid = String(body.userDid || 'did:sonaraim:user').trim();
    const session = createDevicePairingSession(userDid, { pairingStore: ctx.pairingStore });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'created', ...session }));
    return true;
  }

  return false;
}
