/**
 * @fileoverview Modular HTTP route handlers and request body helpers for Sonaraim Client App.
 * Keeps `src/server.mjs` concise and well under the 300-line modularity boundary.
 */

import {
  createPasskeyChallenge,
  verifyPasskeyAssertionAndIssueSession,
} from './passkeySession.mjs';

/**
 * Reads and parses the incoming HTTP request body (supports JSON and application/x-www-form-urlencoded).
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @returns {Promise<Record<string, unknown>>} Parsed key-value payload.
 */
export function readRequestBody(req) {
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
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @returns {boolean} True when JSON response is requested.
 */
export function prefersJson(req) {
  const accept = String(req.headers.accept ?? '').toLowerCase();
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return true;
  }
  return contentType.includes('application/json') && !accept.includes('text/html');
}

/**
 * Handles WebAuthn Passkey challenge and assertion verification routes.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @param {{ challengeStore: Map<string, any>, sessionSecret: string }} authCtx - Passkey auth state.
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handlePasskeyAuthRoutes(req, res, url, authCtx) {
  if (req.method === 'POST' && url.pathname === '/auth/passkey/challenge') {
    const body = await readRequestBody(req);
    const userDid = String(body.userDid || 'did:sonaraim:default-user').trim();
    try {
      const issued = createPasskeyChallenge(userDid, authCtx.challengeStore);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(issued));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/auth/passkey/verify') {
    const body = await readRequestBody(req);
    try {
      const session = verifyPasskeyAssertionAndIssueSession({
        challengeId: String(body.challengeId ?? ''),
        challenge: String(body.challenge ?? ''),
        userDid: String(body.userDid ?? ''),
        assertionSignature: String(body.assertionSignature ?? ''),
        challengeStore: authCtx.challengeStore,
        sessionSecret: authCtx.sessionSecret,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': session.cookieHeader,
      });
      res.end(
        JSON.stringify({
          status: 'authenticated',
          userDid: session.userDid,
          expiresAt: session.expiresAt,
        })
      );
    } catch (err) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}
