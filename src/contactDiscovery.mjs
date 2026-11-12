/**
 * @fileoverview Private Contact Discovery (PSI) client utilities and LiveKit WebRTC room token generator.
 * Blinds local contact identifiers with domain-separated SHA-256 before intersection against
 * `sonaraim-node` (`/v1/psi/discover`) and mints signed LiveKit room tokens.
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Computes a domain-separated SHA-256 blinded digest for a contact identifier.
 *
 * @param {string} identifier - Normalized phone number or handle.
 * @param {string} domainSalt - Protocol PSI epoch or domain separator.
 * @returns {string} 64-character lowercase hex digest.
 */
export function blindContactIdentifier(identifier, domainSalt) {
  const normalized = String(identifier ?? '').trim();
  if (!normalized) {
    throw new Error('Contact identifier cannot be empty');
  }
  const salt = String(domainSalt ?? '').trim();
  if (!salt) {
    throw new Error('PSI domain salt cannot be empty');
  }
  return createHash('sha256').update(`${salt}|${normalized}`).digest('hex');
}

/**
 * Intersects local contact identifiers against a remote set of blinded digests.
 *
 * @param {string[]} localIdentifiers - User's local contact handles/phones.
 * @param {string[]} remoteBlindedDigests - Blinded digests returned by `sonaraim-node`.
 * @param {string} domainSalt - Protocol PSI epoch or domain separator.
 * @returns {string[]} Local identifiers that matched the remote blinded set.
 */
export function intersectDiscoveredContacts(localIdentifiers, remoteBlindedDigests, domainSalt) {
  const remoteSet = new Set(remoteBlindedDigests ?? []);
  const matched = [];
  for (const id of localIdentifiers ?? []) {
    const blinded = blindContactIdentifier(id, domainSalt);
    if (remoteSet.has(blinded)) {
      matched.push(id);
    }
  }
  return matched;
}

/**
 * Blinds local contact identifiers, queries `POST {nodeApiBaseUrl}/v1/psi/discover`,
 * and returns the matched local identifiers.
 *
 * @param {string} nodeApiBaseUrl - Base URL of the `sonaraim-node` HTTP API.
 * @param {string[]} localIdentifiers - Local phone numbers or handles to discover.
 * @param {string} [domainSalt] - PSI domain salt (default `sonaraim-psi-v1`).
 * @param {number} [timeoutMs] - Request timeout in milliseconds.
 * @returns {Promise<string[]>} Matched local contact identifiers.
 */
export async function discoverContactsViaNode(
  nodeApiBaseUrl,
  localIdentifiers,
  domainSalt = 'sonaraim-psi-v1',
  timeoutMs = 2500
) {
  const cleanIds = Array.isArray(localIdentifiers)
    ? localIdentifiers.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  if (cleanIds.length === 0) {
    return [];
  }
  const blindedTokens = cleanIds.map((id) => blindContactIdentifier(id, domainSalt));
  const baseUrl = String(nodeApiBaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return [];
  }

  try {
    const response = await fetch(`${baseUrl}/v1/psi/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        blinded_tokens: blindedTokens,
        blindedTokens,
        domain_salt: domainSalt,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    const remoteDigests = Array.isArray(payload?.matched_tokens)
      ? payload.matched_tokens
      : Array.isArray(payload?.matchedTokens)
        ? payload.matchedTokens
        : Array.isArray(payload?.matches)
          ? payload.matches
          : [];
    return intersectDiscoveredContacts(cleanIds, remoteDigests, domainSalt);
  } catch {
    return [];
  }
}

/**
 * Mints a signed JWT-style LiveKit WebRTC room token for E2EE voice/video calls.
 *
 * @param {object} params - Room token options.
 * @param {string} params.roomName - Target LiveKit room identifier.
 * @param {string} params.participantDid - Participant `did:sonaraim:` identifier.
 * @param {string} [params.livekitUrl] - Public LiveKit WebSocket URL.
 * @param {string} [params.signingKey] - HMAC signing secret.
 * @param {number} [params.ttlSec] - Token lifetime in seconds (default 3600).
 * @returns {{ roomName: string, participantDid: string, livekitUrl: string, token: string, expiresAt: number }}
 */
export function createLiveKitRoomToken({
  roomName,
  participantDid,
  livekitUrl = process.env.PUBLIC_LIVEKIT_URL || 'wss://livekit.sonaraim.internal',
  signingKey = process.env.LIVEKIT_API_SECRET || 'sonaraim-livekit-ephemeral-secret',
  ttlSec = 3600,
}) {
  const cleanRoom = String(roomName ?? '').trim();
  const cleanDid = String(participantDid ?? '').trim();
  if (!cleanRoom) {
    throw new Error('roomName is required');
  }
  if (!cleanDid) {
    throw new Error('participantDid is required');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSec;
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString(
    'base64url'
  );
  const payloadB64 = Buffer.from(
    JSON.stringify({
      iss: 'sonaraim-app',
      sub: cleanDid,
      jti: randomUUID(),
      iat: nowSec,
      exp: expSec,
      video: { roomJoin: true, room: cleanRoom, canPublish: true, canSubscribe: true },
    }),
    'utf8'
  ).toString('base64url');
  const sig = createHmac('sha256', String(signingKey))
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return {
    roomName: cleanRoom,
    participantDid: cleanDid,
    livekitUrl: String(livekitUrl).trim(),
    token: `${headerB64}.${payloadB64}.${sig}`,
    expiresAt: expSec * 1000,
  };
}
