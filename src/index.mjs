/**
 * @fileoverview SonarAIM Client Core SDK entry point.
 * Re-exports the Dual Inbox router, Zero-HTML Declarative Card renderer,
 * and Passkey WebAuthn PRF Zero-Knowledge Vault modules.
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
