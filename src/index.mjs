/**
 * @fileoverview SonarAIM Client Core SDK entry point.
 * Re-exports the Dual Inbox router, Zero-HTML Declarative Card renderer,
 * Passkey WebAuthn PRF Zero-Knowledge Vault, Passkey Session manager,
 * PSI Contact Discovery / LiveKit token helper, Node relay client, and
 * E.164 phone pairing / mobile PWA modules.
 */

export {
  resolveInboxConfig,
  DualInboxRouter,
} from './dualInbox.mjs';

export {
  resolveCardConfig,
  canonicalizeJson,
  verifyCardSignature,
  renderDeclarativeCard,
  createSignedCardAction,
} from './cardRenderer.mjs';

export {
  resolveVaultConfig,
  deriveVaultKey,
  encryptVaultBlob,
  decryptVaultBlob,
} from './zkVault.mjs';

export { renderInboxView } from './ui/inboxView.mjs';
export { renderPasskeyLoginView } from './ui/passkeyLoginView.mjs';
export { renderInstantClipView } from './ui/instantClipView.mjs';
export { escapeHtml, renderAppShell } from './ui/htmlUtils.mjs';

export {
  blindContactIdentifier,
  intersectDiscoveredContacts,
  discoverContactsViaNode,
  createLiveKitRoomToken,
} from './contactDiscovery.mjs';

export {
  fetchMailboxEnvelopes,
  sendP2pEnvelopeToNode,
} from './nodeClient.mjs';

export {
  normalizeE164Phone,
  registerPhoneIdentityOnNode,
  createDevicePairingSession,
  verifyDevicePairingCode,
  buildPwaManifest,
} from './phonePairing.mjs';

export {
  resolveRpId,
  resolveOrigin,
  createPasskeyChallenge,
  registerPasskeyCredential,
  verifyPasskeyAssertionAndIssueSession,
  verifyAppSessionCookie,
} from './passkeySession.mjs';

export {
  decodeB64urlStrict,
  decodeCborItem,
  parseAttestationObject,
  parseAuthenticatorData,
  extractEd25519KeyFromCose,
} from './webauthnCose.mjs';

export {
  createAppRequestHandler,
  startAppTestServer,
} from './server.mjs';
