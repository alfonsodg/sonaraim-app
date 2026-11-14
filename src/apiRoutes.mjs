/**
 * @fileoverview Modular HTTP route handlers and request body helpers for Sonaraim Client App.
 * Keeps `src/server.mjs` concise and well under the 300-line modularity boundary.
 */

import {
  createPasskeyChallenge,
  verifyPasskeyAssertionAndIssueSession,
} from './passkeySession.mjs';
import {
  discoverContactsViaNode,
  createLiveKitRoomToken,
} from './contactDiscovery.mjs';
import { sendP2pEnvelopeToNode } from './nodeClient.mjs';

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

/**
 * Handles PSI contact discovery (`/api/contacts/discover`) and LiveKit room token (`/api/calls/token`) routes.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @param {{ nodeApiBaseUrl: string, livekitUrl?: string, sessionSecret: string }} ctx - App runtime context.
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handleDiscoveryAndCallRoutes(req, res, url, ctx) {
  if (req.method === 'POST' && url.pathname === '/api/contacts/discover') {
    const body = await readRequestBody(req);
    const identifiers = Array.isArray(body.identifiers)
      ? body.identifiers
      : typeof body.identifiers === 'string'
        ? body.identifiers.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const domainSalt = String(body.domainSalt || 'sonaraim-psi-v1').trim();
    const matchedContacts = await discoverContactsViaNode(
      ctx.nodeApiBaseUrl,
      identifiers,
      domainSalt
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ matchedContacts, domainSalt }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/calls/token') {
    const body = await readRequestBody(req);
    try {
      const descriptor = createLiveKitRoomToken({
        roomName: String(body.roomName || 'sonaraim-default-room'),
        participantDid: String(body.participantDid || 'did:sonaraim:caller'),
        livekitUrl: ctx.livekitUrl || process.env.PUBLIC_LIVEKIT_URL,
        signingKey: ctx.livekitApiSecret || process.env.LIVEKIT_API_SECRET || ctx.sessionSecret,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(descriptor));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}

/**
 * Handles sending live P2P messages to a Sonaraim Node relay via `POST /inbox/messages`.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @param {{ nodeApiBaseUrl: string }} ctx - App runtime context.
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handleInboxMessageRoutes(req, res, url, ctx) {
  if (req.method === 'POST' && url.pathname === '/inbox/messages') {
    const body = await readRequestBody(req);
    const senderDid = String(body.senderDid || body.sender_did || 'did:sonaraim:user').trim();
    const recipientDid = String(body.recipientDid || body.recipient_did || '').trim();
    const text = String(body.text || body.preview || '').trim();

    if (!recipientDid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'recipientDid is required' }));
      return true;
    }

    try {
      const dispatched = await sendP2pEnvelopeToNode(ctx.nodeApiBaseUrl, {
        senderDid,
        recipientDid,
        text,
      });

      if (prefersJson(req)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'sent',
            envelopeId: dispatched.envelope_id,
            recipientDid,
          })
        );
        return true;
      }

      res.writeHead(303, {
        Location: `/inbox?mailboxId=${encodeURIComponent(recipientDid)}`,
      });
      res.end();
      return true;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return true;
    }
  }

  return false;
}
