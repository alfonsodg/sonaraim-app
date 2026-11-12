/**
 * @fileoverview SonarAIM Client Core SDK entry point.
 * Re-exports the Dual Inbox router, Zero-HTML Declarative Card renderer,
 * Passkey WebAuthn PRF Zero-Knowledge Vault, and Node relay client modules.
 */

export {
  resolveInboxConfig,
  DualInboxRouter
} from './dualInbox.mjs';

export {
  resolveCardConfig,
  canonicalizeJson,
  verifyCardSignature,
  renderDeclarativeCard,
  createSignedCardAction
} from './cardRenderer.mjs';

export {
  resolveVaultConfig,
  deriveVaultKey,
  encryptVaultBlob,
  decryptVaultBlob
} from './zkVault.mjs';

export { renderInboxView } from './ui/inboxView.mjs';
export { renderInstantClipView } from './ui/instantClipView.mjs';
export {
  blindContactIdentifier,
  intersectDiscoveredContacts
} from './contactDiscovery.mjs';
export { fetchMailboxEnvelopes } from './nodeClient.mjs';
export {
  createAppRequestHandler,
  startAppTestServer
} from './server.mjs';
