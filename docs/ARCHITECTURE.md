# Client Architecture (`docs/ARCHITECTURE.md`)

> System Design, Security Boundaries, and Data Flows for `sonaraim-app` and `mobile/`

## 1. Architectural Overview

`sonaraim-app` is the client runtime for the SonarAIM messaging ecosystem, providing two complementary deployment artifacts:

1. **Core Web / PWA Server (`src/`)**: A minimal Node.js ESM server powering Progressive Web App (PWA) and Instant Web / App Clip experiences with Passkey WebAuthn gates, Dual Inbox routing, and upstream Node relay integrations.
2. **React Native (Expo) Mobile Client (`mobile/`)**: A cross-platform mobile application for iOS and Android delivering native phone identity activation, 6-digit companion device pairing, Dual Inbox messaging, Zero-HTML Declarative Card action execution, and encrypted LiveKit voice/video calls.

### Core Invariants

1. **Cryptographic Stream Separation (Dual Inbox)**: Peer-to-peer human conversations (`did:sonaraim:`) and institutional/business workflows (`did:web:`) never share the same inbox surface or trust boundary.
2. **Zero-HTML Native Rendering**: Business interactive messages are delivered as signed JSON trees mapped to native OS widgets or safe DOM trees, strictly rejecting HTML tags, inline styles, CSS, `<script>` tags, or `javascript:` URIs.
3. **Passkey Zero-Knowledge Portability**: All MLS ratchet trees, consent grants, and message histories are encrypted client-side using keys derived from hardware-backed WebAuthn PRF credentials before leaving the device.

## 2. System Topology (ASCII)

```text
+---------------------------------------------------------------------------------+
|                               Client Targets                                    |
|   +------------------------------------+  +---------------------------------+   |
|   |   React Native Mobile (mobile/)    |  |       Desktop / Web PWA         |   |
|   |  (iOS / Android Native Shell)      |  |  (Standalone Manifest / Browser)|   |
|   +-----------------+------------------+  +----------------+----------------+   |
+---------------------|--------------------------------------|--------------------+
                      |                                      |
                      | HTTP / WebSocket                     | HTTP / Session
                      v                                      v
+---------------------------------------------------------------------------------+
|                       Sonaraim Web / PWA Server (src/server.mjs)                |
|                                                                                 |
|   /manifest.webmanifest   --> W3C PWA Installable Descriptor                     |
|   /auth/phone/register    --> E.164 Normalization + Salted HMAC Identity         |
|   /auth/devices/pair      --> 6-Digit Code Creation & Companion Verification    |
|   /auth/passkey/*         --> WebAuthn Challenge & Assertion Authentication     |
|   /inbox                  --> Protected Dual Inbox Stream Delivery              |
|   /inbox/messages         --> Outgoing Encrypted P2P Dispatches                 |
|   /api/calls/token        --> LiveKit E2E Encrypted Call Room Token Issuance    |
+------------------------------------+--------------------------------------------+
                                     |
                                     | Envelopes & RPC
                                     v
+---------------------------------------------------------------------------------+
|                           Sonaraim Node Relay & Network                         |
|                                                                                 |
|   /api/mailbox/:id        --> Queued Encrypted Envelopes (RFC 9420 MLS)         |
|   /v1/psi/blind-match     --> Private Set Intersection (PSI) Contact Discovery  |
|   LiveKit Server          --> Real-time E2E Audio/Video SFU Data Channels       |
+---------------------------------------------------------------------------------+
```

## 3. Core Modules & Subsystems

### 3.1 Dual Inbox Router (`src/dualInbox.mjs`)

- **Responsibility**: Routes incoming MLS envelopes and manages the local `ConsentToken` registry.
- **Personal Stream (`PERSONAL`)**: Accepts envelopes originating from `did:sonaraim:` identities.
- **Services Stream (`SERVICES`)**: Requires both `verifiedDidWeb === true` (confirming DNS/TLS `.well-known/did.json` binding) and an active, unrevoked, non-expired `ConsentToken` matching the merchant DID.
- **Instant Revocation**: Calling `revokeConsent(merchantDid)` marks the token as revoked with a timestamp and immediately drops any subsequent messages from that merchant at the router boundary.

### 3.2 Zero-HTML Declarative Card Engine (`src/cardRenderer.mjs`, `mobile/src/cardValidator.js`)

- **Responsibility**: Parses, verifies, and sanitizes rich B2B service cards.
- **Signature Verification**: Serializes the `card` object deterministically (`canonicalizeJson`) and validates the detached `Ed25519` signature against the merchant's public key.
- **Component Allowlist**: Only permits `header`, `text`, `key_value`, `media_image`, `divider`, `badge`, and `action_group`. Any unknown widget type or string matching markup/script patterns is rejected with a policy error.
- **Signed User Actions**: When a user triggers an action (`confirm_intent`, `select_option`, `open_deep_link`, `request_receipt`), `createSignedCardAction` produces an `Ed25519`-signed intent payload bound to `cardId`, `actionId`, `userDid`, `merchantDid`, and `timestamp`.

### 3.3 Passkey WebAuthn PRF Zero-Knowledge Vault (`src/zkVault.mjs`)

- **Responsibility**: Provides cross-ecosystem backup and restore of MLS state and inbox history without trusting cloud storage providers.
- **Key Derivation**: `deriveVaultKey` combines a high-entropy WebAuthn PRF secret (or passphrase hardened via `scryptSync`) with a per-vault random salt and HKDF context string (`sonaraim-zk-vault-v1:<userDid>`).
- **Authenticated Encryption**: `encryptVaultBlob` and `decryptVaultBlob` use `aes-256-gcm` with a random 96-bit IV and bind `v1|<userDid>|epoch:<epoch>` as Additional Authenticated Data (`AAD`) to prevent rollback or cross-account blob substitution attacks.

### 3.4 Phone Activation & Companion Pairing (`src/phonePairing.mjs`)

- **E.164 Validation**: `normalizeE164Phone` parses, strips non-numeric separators, and enforces standard ITU-T E.164 phone formatting.
- **Blinded Tokens**: Phones are registered on upstream relays via HMAC-SHA256 blind tokens using domain separation salts.
- **Companion Pairing Protocol**: `createDevicePairingSession` generates a single-use 6-digit PIN and deep-link URI (`sonaraim://pair?code=...&did=...`) with a 5-minute time-to-live (`TTL`). Secondary devices redeem this code via `verifyDevicePairingCode`.

### 3.5 React Native Mobile Architecture (`mobile/`)

- **`mobile/src/config.js`**: Environment variable resolver for Expo (`EXPO_PUBLIC_APP_API_URL`, `EXPO_PUBLIC_NODE_API_URL`, `EXPO_PUBLIC_LIVEKIT_URL`) with safe local defaults.
- **`mobile/src/apiClient.js`**: Unified asynchronous HTTP client interacting with the app web endpoints and node relay.
- **`mobile/src/cardValidator.js`**: Client-side Zero-HTML validator enforcing schema invariants, allowed component types, and allowed actions before rendering.
- **`mobile/src/screens/ActivationScreen.js`**: E.164 phone number onboarding, DID derivation, and 6-digit companion device pairing UI.
- **`mobile/src/screens/InboxScreen.js`**: Dual Inbox tab view segregating Personal P2P messages from Verified Services cards, complete with message composition and action triggers.
- **`mobile/src/screens/CallsScreen.js`**: LiveKit room launcher connecting to `/api/calls/token` for encrypted calls.
- **`mobile/src/AppShell.js`**: Root tab navigator coordinating active screens and identity state.
