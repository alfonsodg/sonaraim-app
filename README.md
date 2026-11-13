# SonarAIM Client Application (`sonaraim-app`)

> Sovereign Cross-Platform Messaging Client with Dual Inbox Isolation, Zero-HTML Declarative Cards, React Native Mobile App, and Passkey Zero-Knowledge Vault

`sonaraim-app` (`@sonaraim/app`) is the core client runtime for the **SonarAIM** ecosystem. It powers Desktop (Tauri), Mobile (React Native / Expo for iOS and Android), and Progressive Web App (PWA) / App Clip experiences. It enforces cryptographic separation between human peer-to-peer conversations and verified business services while ensuring portable, end-to-end encrypted state backups across operating systems.

## Core Capabilities

- **Dual Inbox Architecture (`src/dualInbox.mjs`)**: Cryptographically segregates incoming IETF MLS (RFC 9420) envelopes into two strictly isolated streams:
  - `PERSONAL`: Sovereign human-to-human conversations authenticated via `did:sonaraim:` decentralized identifiers.
  - `SERVICES`: Verified institutional and merchant interactions authenticated via `did:web:` DNS/TLS identity and gated by explicit, revocable `ConsentToken` grants.
- **Zero-HTML Declarative Card Engine (`src/cardRenderer.mjs`, `mobile/src/cardValidator.js`)**: Eliminates WebView, HTML, CSS, and script injection surfaces by parsing cryptographically signed (`Ed25519`) declarative JSON schemas into native view trees and emitting signed user action intents.
- **Passkey WebAuthn PRF Zero-Knowledge Vault (`src/zkVault.mjs`)**: Derives 256-bit symmetric keys from hardware-backed Passkey WebAuthn `prf` extension outputs via domain-separated HKDF, encrypting MLS ratchet state and history snapshots with authenticated `AES-256-GCM`.
- **E.164 Phone Identity & Companion Device Pairing (`src/phonePairing.mjs`)**: Supports WhatsApp-like onboarding via international phone numbers (`+...`), HMAC-blinded identity pseudonymization, and 6-digit / QR pairing sessions (`sonaraim://pair?...`) linking desktop or web companion clients.
- **LiveKit Encrypted Calling (`src/contactDiscovery.mjs`, `mobile/src/screens/CallsScreen.js`, `mobile/src/callControlsLogic.js`)**: Real-time end-to-end encrypted voice and video room token issuance via `/api/calls/token` and in-app WebRTC call controls.
- **E2EE Multimedia Crypto & Catalogs (`mobile/src/mediaCrypto.js`)**: Client-side AES-256-GCM encryption and decryption for media attachments, canonical media pointer generation, presigned S3/MinIO upload requests, emoji and sticker catalogs, and filtered GIF search.
- **MLS Group Chats & Ratchet Management (`mobile/src/groupManager.js`)**: Ratcheted group messaging with epoch progression, forward secrecy, and key re-generation when adding or removing group members.
- **WhatsApp-Parity Chat Interactions (`mobile/src/chatFeatures.js`)**: Emoji reactions toggling with aggregated counts, quote replies referencing original messages, delivery/read receipts (`sent` -> `delivered` -> `read`), and ephemeral typing indicator signals.
- **24-Hour Ephemeral Status & Stories (`mobile/src/statusStore.js`)**: Ephemeral 24h status timeline with automatic TTL expiration (`DEFAULT_STATUS_TTL_SECONDS = 86400`), blind push wake token derivation, and silent push registration on the node relay.
- **Native Hardware Bridges & Expo Modules (`mobile/src/nativeDeviceBridge.js`)**: Modular wrappers connecting native device capabilities:
  - `expo-image-picker`: Camera and photo library asset picker.
  - `expo-av`: Voice note audio recording lifecycle.
  - `expo-notifications`: OS push notification token acquisition.
  - `expo-secure-store`: Hardware-backed secure storage for private identity credentials.
- **EAS Native Build Automation (`mobile/eas.json`)**: Pre-configured build profiles (`development`, `preview`, `production`) for Expo Application Services (EAS) to compile native Android (AAB/APK) and iOS (IPA) release packages.
- **Installable Mobile PWA (`src/phonePairing.mjs`)**: Standalone Progressive Web App manifest served at `/manifest.webmanifest`.
- **React Native (Expo) Mobile App (`mobile/`)**: Full-featured sovereign mobile application for iOS and Android featuring Dual Inbox stream switching, WhatsApp-parity chat, native card actions, and encrypted call rooms.

## Repository Structure

```text
sonaraim-app/
├── docs/
│   ├── ARCHITECTURE.md      # Client system design and ASCII data flows
│   ├── CONFIGURATION.md     # Environment variable reference
│   ├── DIAGRAMS.md          # Mermaid sequence and state diagrams
│   └── STANDARDS.md         # Coding, testing, and security standards
├── mobile/                  # React Native (Expo) Mobile Application
│   ├── app.json             # Expo mobile manifest & bundle configuration
│   ├── App.js               # Mobile root entrypoint
│   ├── eas.json             # EAS native build profiles (dev, preview, prod)
│   ├── package.json         # Mobile dependencies and test scripts
│   ├── src/
│   │   ├── apiClient.js     # HTTP client for app web & node endpoints
│   │   ├── AppShell.js      # Bottom tab navigation & identity state
│   │   ├── callControlsLogic.js # In-app call control logic (mic, cam, speaker)
│   │   ├── cardValidator.js # Zero-HTML declarative card validator
│   │   ├── chatFeatures.js  # Reactions, quote replies, typing, and receipts
│   │   ├── components/      # UI components (MediaComposer, CallControls, etc.)
│   │   ├── config.js        # Mobile environment configuration resolver
│   │   ├── groupManager.js  # MLS ratcheted group chat manager
│   │   ├── mediaCrypto.js   # AES-256-GCM media crypto & catalog helpers
│   │   ├── nativeDeviceBridge.js # Hardware bridges (picker, audio, push, vault)
│   │   ├── screens/         # Activation, Calls, Groups, Inbox, Status screens
│   │   ├── statusStore.js   # 24h status timeline and blind push tokens
│   │   └── styles/          # Modular component styles
│   └── tests/
│       ├── calls.test.mjs
│       ├── mobile.test.mjs
│       ├── nativeBridge.test.mjs
│       └── whatsappParity.test.mjs
├── samples/
│   └── .env.example         # Sample environment configuration
├── src/                     # Core Web & PWA Server Engine
│   ├── apiRoutes.mjs        # Passkey, discovery, and message endpoints
│   ├── cardRenderer.mjs     # Zero-HTML declarative card parser & Ed25519 verifier
│   ├── contactDiscovery.mjs # PSI contact discovery & LiveKit token issuance
│   ├── dualInbox.mjs        # PERSONAL vs SERVICES router & ConsentToken manager
│   ├── index.mjs            # Core package entry point
│   ├── nodeClient.mjs       # Upstream node relay HTTP client
│   ├── passkeySession.mjs   # WebAuthn challenge & session verification
│   ├── phonePairing.mjs     # Phone normalization, 6-digit pairing, and PWA manifest
│   ├── server.mjs           # HTTP server and route dispatcher
│   └── zkVault.mjs          # Passkey WebAuthn PRF key derivation & AES-256-GCM vault
├── tests/
│   └── app.test.mjs         # Automated node:test verification suite
├── Dockerfile               # Multi-stage build and minimal runtime container
├── LICENSE                  # Apache 2.0 Open Source License
├── CONTRIBUTING.md          # Contribution guidelines
├── CODE_OF_CONDUCT.md       # Contributor Covenant Code of Conduct
├── SECURITY.md              # Security vulnerability reporting policy
├── package.json             # Node.js ESM package manifest
└── README.md                # Project overview and quickstart
```

## HTTP API Endpoints

The core web runtime (`src/server.mjs`) exposes the following endpoints:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Health check probe returning service status and timestamp |
| `/manifest.webmanifest` | `GET` | W3C Web App Manifest for mobile PWA installation |
| `/auth/phone/register` | `POST` | E.164 phone registration and blinded token issuance |
| `/auth/devices/pair` | `POST` | 6-digit numeric companion device pairing session creation and redemption |
| `/auth/passkey/challenge` | `POST` | WebAuthn authentication challenge generation |
| `/auth/passkey/verify` | `POST` | WebAuthn assertion verification and session cookie issuance |
| `/inbox` | `GET` | Protected Dual Inbox view (HTML or JSON) |
| `/inbox/messages` | `POST` | Outgoing encrypted P2P message dispatch to Node relay |
| `/api/calls/token` | `POST` | LiveKit encrypted room token minting |
| `/api/contacts/discover`| `POST` | Blinded identifier Private Set Intersection (PSI) contact discovery |
| `/api/mailbox/:id` | `GET` | Mailbox envelopes retrieval |

## Quickstart

### Prerequisites

- Node.js `>= 20.0.0` (latest stable LTS recommended)

### Run Core Client Verification Suite

```bash
npm test
```

### Run Mobile App Verification Suite

```bash
cd mobile
npm test
```

### Launch React Native Mobile App (Expo)

```bash
cd mobile
npx expo start
```

### Build Native Mobile App Bundles (EAS)

```bash
cd mobile
npm run build:android    # eas build --platform android --profile production (AAB)
npm run build:ios        # eas build --platform ios --profile production (IPA)
```

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [System Diagrams](docs/DIAGRAMS.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Engineering Standards](docs/STANDARDS.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## License

Copyright 2026 Sonaraim Contributors. Licensed under the [Apache License, Version 2.0](LICENSE).
