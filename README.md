# SonarAIM Client Application (`sonaraim-app`)

> Sovereign Cross-Platform Messaging Client with Dual Inbox Isolation, Zero-HTML Declarative Cards, and Passkey Zero-Knowledge Vault

`sonaraim-app` (`@sonaraim/app`) is the core client runtime for the **SonarAIM** ecosystem, powering Desktop (Tauri), Mobile (iOS and Android), and Instant Web / App Clip experiences. It enforces cryptographic separation between human peer-to-peer conversations and verified business services while ensuring portable, end-to-end encrypted state backups across operating systems.

## Core Capabilities

- **Dual Inbox Architecture (`src/dualInbox.mjs`)**: Cryptographically segregates incoming IETF MLS (RFC 9420) envelopes into two strictly isolated streams:
  - `PERSONAL`: Sovereign human-to-human conversations authenticated via `did:sonaraim:` decentralized identifiers.
  - `SERVICES`: Verified institutional and merchant interactions authenticated via `did:web:` DNS/TLS identity and gated by explicit, revocable `ConsentToken` grants.
- **Zero-HTML Declarative Card Engine (`src/cardRenderer.mjs`)**: Eliminates WebView, HTML, CSS, and script injection surfaces by parsing cryptographically signed (`Ed25519`) declarative JSON schemas into native view trees (SwiftUI, Jetpack Compose, or safe DOM nodes) and emitting signed user action intents.
- **Passkey WebAuthn PRF Zero-Knowledge Vault (`src/zkVault.mjs`)**: Derives 256-bit symmetric keys from hardware-backed Passkey WebAuthn `prf` extension outputs (or scrypt-hardened recovery seeds) via domain-separated HKDF, encrypting MLS ratchet state and history snapshots with authenticated `AES-256-GCM`.
- **Instant Web & App Clip Ready (`Dockerfile`)**: Multi-stage container image that runs without third-party runtime dependencies for instant ephemeral sessions via QR or NFC triggers.

## Repository Structure

```text
sonaraim-app/
├── docs/
│   ├── ARCHITECTURE.md    # Client system design and ASCII data flows
│   ├── CONFIGURATION.md   # Environment variable reference
│   ├── DIAGRAMS.md        # Mermaid sequence and state diagrams
│   └── STANDARDS.md       # Coding, testing, and security standards
├── samples/
│   └── .env.example       # Sample environment configuration
├── src/
│   ├── cardRenderer.mjs   # Zero-HTML declarative card parser & Ed25519 verifier
│   ├── dualInbox.mjs      # PERSONAL vs SERVICES router & ConsentToken manager
│   ├── index.mjs          # Package entry point
│   └── zkVault.mjs        # Passkey WebAuthn PRF key derivation & AES-256-GCM vault
├── tests/
│   └── app.test.mjs       # Automated node:test verification suite
├── Dockerfile             # Multi-stage build and minimal runtime container
├── package.json           # Node.js ESM package manifest
└── README.md              # Project overview and quickstart
```

## Quickstart

### Prerequisites

- Node.js `>= 20.0.0` (latest stable LTS recommended)

### Run Verification Suite

```bash
npm test
```

### Usage Example

```javascript
import {
  DualInboxRouter,
  renderDeclarativeCard,
  deriveVaultKey,
  encryptVaultBlob,
  decryptVaultBlob
} from '@sonaraim/app';

const router = new DualInboxRouter();
router.grantConsent({
  tokenId: 'ct-merchant-01',
  merchantDid: 'did:web:orders.merchant.example.com',
  scopes: ['services:message', 'services:card'],
  expiresAt: Date.now() + 86_400_000
});

const routing = router.routeEnvelope({
  envelopeId: 'env-101',
  senderDid: 'did:web:orders.merchant.example.com',
  mlsGroupId: 'mls-group-orders',
  verifiedDidWeb: true,
  consentTokenId: 'ct-merchant-01',
  payload: {}
});
// => { accepted: true, stream: 'SERVICES', ... }
```

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [System Diagrams](docs/DIAGRAMS.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Engineering Standards](docs/STANDARDS.md)

## License

Apache License 2.0
