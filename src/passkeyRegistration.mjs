/**
 * @fileoverview WebAuthn credential registration (`webauthn.create` ceremony).
 * Extracted from `src/passkeySession.mjs` to respect the 300-line boundary.
 * Only `fmt: 'none'` self-attestation with COSE Ed25519 keys is accepted.
 */

import crypto from 'node:crypto';

import {
  decodeB64urlStrict,
  extractEd25519KeyFromCose,
  parseAttestationObject,
  parseAuthenticatorData,
} from './webauthnCose.mjs';

/**
 * Registers a WebAuthn credential from a `webauthn.create` ceremony, binding the
 * extracted COSE Ed25519 public key to `credentialId` + `userDid` in
 * `credentialStore`. Accepts only `fmt: 'none'` self-attestation.
 *
 * @param {object} params - Registration inputs.
 * @param {string} params.userDid - Sovereign `did:sonaraim:` identifier.
 * @param {string} params.credentialId - Opaque credential identifier (base64url).
 * @param {string} params.attestationObject - CBOR attestation object (base64url).
 * @param {string} params.clientDataJSON - JSON client data (base64url, `type === 'webauthn.create'`).
 * @param {string} params.challengeB64 - Pending registration challenge to match.
 * @param {string} [params.expectedRpId] - RP-ID the attestation auth data must hash to.
 * @param {string} [params.expectedOrigin] - Origin the creation clientData must echo.
 * @param {Map} params.credentialStore - Per-credential registry.
 * @returns {{ credentialId: string, userDid: string, publicKeyRaw: string }}
 */
export function registerPasskeyCredential({
  userDid,
  credentialId,
  attestationObject,
  clientDataJSON,
  challengeB64,
  expectedRpId,
  expectedOrigin,
  credentialStore,
}) {
  const cleanDid = String(userDid ?? '').trim();
  if (!cleanDid.startsWith('did:sonaraim:')) {
    throw new Error('userDid must start with did:sonaraim:');
  }
  const cleanCredentialId = String(credentialId ?? '').trim();
  if (!cleanCredentialId) {
    throw new Error('Invalid Passkey registration: missing credentialId');
  }
  if (!(credentialStore instanceof Map)) {
    throw new Error('Valid credentialStore Map is required');
  }
  if (credentialStore.has(cleanCredentialId)) {
    throw new Error('Invalid Passkey registration: credential already registered');
  }
  const clientBytes = decodeB64urlStrict(clientDataJSON, 'clientDataJSON');
  let clientData;
  try {
    clientData = JSON.parse(clientBytes.toString('utf8'));
  } catch {
    throw new Error('Invalid Passkey registration: clientDataJSON is not JSON');
  }
  if (clientData?.type !== 'webauthn.create') {
    throw new Error('Invalid Passkey registration: unexpected clientData type');
  }
  if (String(clientData?.challenge ?? '') !== String(challengeB64 ?? '')) {
    throw new Error('Invalid Passkey registration: challenge mismatch');
  }
  const { authData } = parseAttestationObject(attestationObject);
  const parsed = parseAuthenticatorData(authData);
  if (!parsed.userPresent) {
    throw new Error('Invalid Passkey registration: user-presence flag not set');
  }
  if (!parsed.credentialIdB64 || !parsed.coseKey) {
    throw new Error('Invalid Passkey registration: missing attested credential');
  }
  if (expectedRpId) {
    const expectedHash = Buffer.from(
      crypto.createHash('sha256').update(String(expectedRpId), 'utf8').digest()
    );
    if (!crypto.timingSafeEqual(parsed.rpIdHash, expectedHash)) {
      throw new Error('Invalid Passkey registration: RP-ID mismatch');
    }
  }
  if (expectedOrigin && String(clientData?.origin ?? '') !== String(expectedOrigin)) {
    throw new Error('Invalid Passkey registration: origin mismatch');
  }
  if (parsed.credentialIdB64 !== cleanCredentialId) {
    throw new Error('Invalid Passkey registration: credentialId mismatch');
  }
  const pubBytes = extractEd25519KeyFromCose(parsed.coseKey);
  const publicKeyRaw = pubBytes.toString('base64url');
  credentialStore.set(cleanCredentialId, { publicKeyRaw, lastCounter: 0, userDid: cleanDid });
  return { credentialId: cleanCredentialId, userDid: cleanDid, publicKeyRaw };
}

