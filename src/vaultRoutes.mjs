/**
 * @fileoverview Server-side sealed vault backup routes for Sonaraim Client App.
 * Serves `POST /api/vault/seal` and `POST /api/vault/open` (issue #3).
 *
 * Trust boundary (honest scope): these routes are a **server-side sealed
 * backup** for the web Instant Clip flow — the BFF derives a per-user vault
 * key from `SONARAIM_SESSION_SECRET` via the same HKDF domain separation as
 * the client ZK vault, so blobs stay opaque AES-256-GCM ciphertexts to any
 * storage layer but ARE decryptable by this server. The true zero-knowledge
 * vault (Passkey PRF secret never leaves the device) lives client-side —
 * mobile derives keys locally (see `mobile/src/cryptoUtils.js`) and the
 * browser flow is roadmap via the `navigator.credentials` PRF extension.
 */

import { readRequestBody } from './apiRoutes.mjs';
import { deriveVaultKey, encryptVaultBlob, decryptVaultBlob } from './zkVault.mjs';
import { verifyAppSessionCookie } from './sessionCookie.mjs';

const SERVER_VAULT_SALT = 'sonaraim-vault-server-salt-v1';

/**
 * Derives the per-user server-side vault key from the session secret.
 *
 * @param {string} sessionSecret - Server session secret (>= 16 bytes of entropy).
 * @param {string} userDid - `did:sonaraim:` user identity (HKDF domain separation).
 * @returns {Buffer} 32-byte vault key.
 */
export function deriveServerVaultKey(sessionSecret, userDid) {
  return deriveVaultKey({
    prfSecret: String(sessionSecret ?? ''),
    salt: SERVER_VAULT_SALT,
    userDid,
  });
}

/**
 * Handles `POST /api/vault/seal` (encrypt) for an authenticated session user.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {{ sessionSecret: string, sessionUserDid: string | null }} ctx - Auth context.
 * @returns {Promise<boolean>} True (route handled).
 */
async function handleSeal(req, res, ctx) {
  const body = await readRequestBody(req);
  const userDid = String(body.userDid ?? '').trim();
  const epoch = Number(body.epoch ?? 0);
  const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : null;
  if (!userDid.startsWith('did:sonaraim:')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'userDid must start with did:sonaraim:' }));
    return true;
  }
  if (!Number.isInteger(epoch) || epoch < 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'epoch must be a non-negative integer' }));
    return true;
  }
  if (!snapshot) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'snapshot object is required' }));
    return true;
  }
  if (ctx.sessionUserDid && ctx.sessionUserDid !== userDid) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'userDid mismatch: vault is bound to the session identity' }));
    return true;
  }
  try {
    const vaultKey = deriveServerVaultKey(ctx.sessionSecret, userDid);
    const blob = encryptVaultBlob({ vaultKey, userDid, epoch, snapshot });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(blob));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
  return true;
}

/**
 * Handles `POST /api/vault/open` (decrypt) for an authenticated session user.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {{ sessionSecret: string, sessionUserDid: string | null }} ctx - Auth context.
 * @returns {Promise<boolean>} True (route handled).
 */
async function handleOpen(req, res, ctx) {
  const body = await readRequestBody(req);
  const blob = body.blob && typeof body.blob === 'object' ? body.blob : null;
  if (!blob) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'blob object is required' }));
    return true;
  }
  if (ctx.sessionUserDid && blob.userDid !== ctx.sessionUserDid) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'userDid mismatch: vault is bound to the session identity' }));
    return true;
  }
  try {
    const vaultKey = deriveServerVaultKey(ctx.sessionSecret, String(blob.userDid ?? ''));
    const opened = decryptVaultBlob({ blob, vaultKey });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(opened));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'blob is invalid or undecryptable' }));
  }
  return true;
}

/**
 * Handles `POST /api/vault/seal` and `POST /api/vault/open`.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @param {{ requireAuth: boolean, sessionSecret: string }} ctx - App runtime context.
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handleVaultRoutes(req, res, url, ctx) {
  if (req.method !== 'POST') {
    return false;
  }
  if (url.pathname !== '/api/vault/seal' && url.pathname !== '/api/vault/open') {
    return false;
  }
  let sessionUserDid = null;
  if (ctx.requireAuth) {
    const check = verifyAppSessionCookie(req.headers.cookie, ctx.sessionSecret);
    if (!check.valid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', reason: check.reason }));
      return true;
    }
    sessionUserDid = check.userDid;
  }
  const authCtx = { sessionSecret: ctx.sessionSecret, sessionUserDid };
  if (url.pathname === '/api/vault/seal') {
    return handleSeal(req, res, authCtx);
  }
  return handleOpen(req, res, authCtx);
}
