/**
 * @fileoverview WebAuthn Passkey HTTP route handlers (challenge, registration,
 * assertion verification). Extracted from `src/apiRoutes.mjs` to respect the
 * 300-line modularity boundary.
 */

import {
  createPasskeyChallenge,
  verifyPasskeyAssertionAndIssueSession,
} from './passkeySession.mjs';
import { registerPasskeyCredential } from './passkeyRegistration.mjs';
import { readRequestBody } from './apiRoutes.mjs';

/**
 * Handles WebAuthn Passkey challenge and assertion verification routes.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @param {{ challengeStore: Map<string, any>, registrationStore?: Map<string, any>, credentialStore?: Map<string, any>, sessionSecret: string }} authCtx - Passkey auth state.
 * @returns {Promise<boolean>} True if the route was handled.
 */
export async function handlePasskeyAuthRoutes(req, res, url, authCtx) {
  if (req.method === 'POST' && url.pathname === '/auth/passkey/challenge') {
    const body = await readRequestBody(req);
    const userDid = String(body.userDid || 'did:sonaraim:default-user').trim();
    try {
      const issued = createPasskeyChallenge(userDid, authCtx.challengeStore, {
        rpId: body.rpId,
        origin: body.origin,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(issued));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/auth/passkey/register/challenge') {
    const body = await readRequestBody(req);
    const userDid = String(body.userDid || 'did:sonaraim:default-user').trim();
    try {
      const issued = createPasskeyChallenge(userDid, authCtx.registrationStore, {
        rpId: body.rpId,
        origin: body.origin,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(issued));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/auth/passkey/register') {
    const body = await readRequestBody(req);
    try {
      const challengeId = String(body.challengeId ?? '');
      const pending = authCtx.registrationStore?.get(challengeId);
      if (!pending) {
        throw new Error('Passkey registration challenge not found or already consumed');
      }
      authCtx.registrationStore.delete(challengeId);
      const registered = registerPasskeyCredential({
        userDid: String(body.userDid ?? ''),
        credentialId: String(body.credentialId ?? body.rawId ?? ''),
        attestationObject: String(body.attestationObject ?? ''),
        clientDataJSON: String(body.clientDataJSON ?? ''),
        challengeB64: String(pending.challenge ?? ''),
        expectedRpId: pending.rpId,
        expectedOrigin: pending.origin,
        credentialStore: authCtx.credentialStore,
      });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'registered', ...registered }));
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
        challenge: body.challenge !== undefined ? String(body.challenge ?? '') : undefined,
        userDid: String(body.userDid ?? ''),
        credentialId: String(body.credentialId ?? body.rawId ?? ''),
        authenticatorData: String(body.authenticatorData ?? ''),
        clientDataJSON: String(body.clientDataJSON ?? ''),
        assertionSignature: String(body.assertionSignature ?? body.signature ?? ''),
        publicKeyRaw: String(body.publicKeyRaw ?? body.publicKey ?? ''),
        challengeStore: authCtx.challengeStore,
        credentialStore: authCtx.credentialStore,
        sessionSecret: authCtx.sessionSecret,
        rpId: body.rpId,
        origin: body.origin,
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

