# Client Architecture (`docs/ARCHITECTURE.md`)

> System Design, Security Boundaries, and Data Flows for `sonaraim-app`

## 1. Architectural Overview

`sonaraim-app` is the client-side core engine for the SonarAIM messaging ecosystem. It is designed to be embedded across Desktop (Tauri), Mobile (iOS/Android), and Instant Web / App Clip targets while enforcing three strict architectural invariants:

1. **Cryptographic Stream Separation (Dual Inbox)**: Peer-to-peer human conversations (`did:sonaraim:`) and institutional/business workflows (`did:web:`) never share the same inbox surface or trust boundary.
2. **Zero-HTML Native Rendering**: Business interactive messages are delivered as signed JSON trees mapped to native OS widgets, completely eliminating embedded browsers or HTML/JavaScript execution inside messages.
3. **Passkey Zero-Knowledge Portability**: All MLS ratchet trees, consent grants, and message histories are encrypted client-side using keys derived from hardware-backed WebAuthn PRF credentials before leaving the device.

## 2. Component Topology (ASCII)

```text
+-------------------------------------------------------------------------+
|                        IETF MLS Decryption Layer                        |
|             (Incoming Decrypted Application Envelope + DID)             |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                    DualInboxRouter (src/dualInbox.mjs)                  |
|                                                                         |
|   senderDid startsWith "did:sonaraim:"?  ---> [ PERSONAL INBOX STREAM ] |
|   senderDid startsWith "did:web:"?                                      |
|     +-- verifiedDidWeb === true?                                        |
|     +-- ConsentToken active & not revoked? --> [ SERVICES INBOX STREAM ]|
+------------------------------------+------------------------------------+
                                     | (SERVICES Card Payload)
                                     v
+-------------------------------------------------------------------------+
|               Zero-HTML Card Renderer (src/cardRenderer.mjs)            |
|                                                                         |
|   1. Canonicalize Card JSON & Verify Merchant Ed25519 Signature         |
|   2. Validate Allowlisted Widget Types & Reject Any HTML/JS Strings     |
|   3. Emit Native View Descriptor Tree (SwiftUI / Compose / Safe DOM)    |
|   4. Sign Outgoing User Action Intent with User Ed25519 Private Key     |
+------------------------------------+------------------------------------+
                                     | (State & History Snapshot)
                                     v
+-------------------------------------------------------------------------+
|                 Passkey ZK Vault (src/zkVault.mjs)                      |
|                                                                         |
|   WebAuthn PRF Secret + Salt + User DID                                 |
|     --> HKDF-SHA256 (optional scrypt hardening)                         |
|     --> 256-bit Vault Key                                               |
|     --> AES-256-GCM Encrypt/Decrypt with AAD (v1|userDid|epoch)         |
+-------------------------------------------------------------------------+
```

## 3. Core Modules

### 3.1 Dual Inbox Router (`src/dualInbox.mjs`)

- **Responsibility**: Routes incoming MLS envelopes and manages the local `ConsentToken` registry.
- **Personal Stream (`PERSONAL`)**: Accepts envelopes originating from `did:sonaraim:` identities.
- **Services Stream (`SERVICES`)**: Requires both `verifiedDidWeb === true` (confirming DNS/TLS `.well-known/did.json` binding) and an active, unrevoked, non-expired `ConsentToken` matching the merchant DID.
- **Instant Revocation**: Calling `revokeConsent(merchantDid)` marks the token as revoked with a timestamp and immediately drops any subsequent messages from that merchant at the router boundary.

### 3.2 Zero-HTML Declarative Card Engine (`src/cardRenderer.mjs`)

- **Responsibility**: Parses, verifies, and sanitizes rich B2B service cards.
- **Signature Verification**: Serializes the `card` object deterministically (`canonicalizeJson`) and validates the detached `Ed25519` signature against the merchant's public key.
- **Component Allowlist**: Only permits `header`, `text`, `key_value`, `media_image`, `divider`, `badge`, and `action_group`. Any unknown widget type or string matching markup/script patterns is rejected with a policy error.
- **Signed User Actions**: When a user triggers an action (`confirm_intent`, `select_option`, `open_deep_link`, `request_receipt`), `createSignedCardAction` produces an `Ed25519`-signed intent payload bound to `cardId`, `actionId`, `userDid`, `merchantDid`, and `timestamp`.

### 3.3 Passkey WebAuthn PRF Zero-Knowledge Vault (`src/zkVault.mjs`)

- **Responsibility**: Provides cross-ecosystem backup and restore of MLS state and inbox history without trusting cloud storage providers.
- **Key Derivation**: `deriveVaultKey` combines a high-entropy WebAuthn PRF secret (or passphrase hardened via `scryptSync`) with a per-vault random salt and HKDF context string (`sonaraim-zk-vault-v1:<userDid>`).
- **Authenticated Encryption**: `encryptVaultBlob` and `decryptVaultBlob` use `aes-256-gcm` with a random 96-bit IV and bind `v1|<userDid>|epoch:<epoch>` as Additional Authenticated Data (`AAD`) to prevent rollback or cross-account blob substitution attacks.
