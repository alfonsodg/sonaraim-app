# Configuration Guide (`docs/CONFIGURATION.md`)

> Runtime Environment Variables and Endpoints for `sonaraim-app` and `mobile/`

All configurable parameters in `sonaraim-app` are loaded dynamically from environment variables with safe defaults. No URLs, ports, or cryptographic secrets are hardcoded in application logic.

## 1. Web & PWA Server Environment Variables (`src/`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SONARAIM_APP_HOST` | `0.0.0.0` | Bind address for the client web server |
| `SONARAIM_APP_PORT` | `3000` | HTTP port for the client web server |
| `NODE_API_BASE_URL` | `http://127.0.0.1:8080` | Upstream Sonaraim Node relay base URL |
| `PUBLIC_LIVEKIT_URL` | `wss://livekit.sonaraim.internal` | LiveKit SFU WebSocket server URL |
| `SESSION_SECRET` | *(dynamic random)* | HMAC secret for signing session cookies and call tokens |
| `SONARAIM_RELAY_URL` | `wss://relay.sonaraim.example.com/v1/mls` | Default MLS WebSocket relay endpoint |
| `SONARAIM_DID_RESOLVER_URL` | `https://resolver.sonaraim.example.com/1.0/identifiers` | Universal DID resolver endpoint for `did:sonaraim` and `did:web` |
| `SONARAIM_INBOX_PERSONAL_STREAM` | `PERSONAL` | Target stream identifier for human P2P messages |
| `SONARAIM_INBOX_SERVICES_STREAM` | `SERVICES` | Target stream identifier for verified merchant messages |
| `SONARAIM_PEER_DID_PREFIX` | `did:sonaraim:` | Required DID prefix for sovereign peer identities |
| `SONARAIM_MERCHANT_DID_PREFIX` | `did:web:` | Required DID prefix for verified merchant identities |
| `SONARAIM_REQUIRE_CONSENT_FOR_SERVICES` | `true` | Enforces active `ConsentToken` verification for `SERVICES` envelopes |
| `SONARAIM_CARD_MAX_COMPONENTS` | `24` | Maximum declarative components allowed per card |
| `SONARAIM_CARD_MAX_ACTIONS` | `6` | Maximum interactive actions allowed per card |
| `SONARAIM_CARD_SIGNATURE_ALGORITHM` | `Ed25519` | Digital signature algorithm required for card envelopes |
| `SONARAIM_VAULT_HKDF_HASH` | `sha256` | Hash algorithm used for HKDF vault key derivation |
| `SONARAIM_VAULT_HKDF_INFO` | `sonaraim-zk-vault-v1` | HKDF domain separation prefix |
| `SONARAIM_VAULT_CIPHER_ALGO` | `aes-256-gcm` | Authenticated symmetric cipher for ZK Vault blobs |
| `SONARAIM_VAULT_KEY_LENGTH` | `32` | Symmetric key length in bytes (256 bits) |
| `SONARAIM_VAULT_IV_LENGTH` | `12` | Initialization vector length in bytes (96 bits for AES-GCM) |
| `SONARAIM_VAULT_SCRYPT_COST` | `16384` | CPU/memory cost parameter `N` for optional scrypt hardening |
| `SONARAIM_VAULT_SCRYPT_BLOCK_SIZE` | `8` | Block size parameter `r` for scrypt hardening |
| `SONARAIM_VAULT_SCRYPT_PARALLELIZATION` | `1` | Parallelization parameter `p` for scrypt hardening |
| `SONARAIM_LOG_LEVEL` | `INFO` | Structured JSON logging verbosity (`ERROR`, `WARN`, `INFO`, `DEBUG`) |

## 2. React Native Mobile Environment & Native Configuration (`mobile/`)

### 2.1 Mobile Environment Variables

The React Native Expo application in `mobile/` resolves its configuration via `mobile/src/config.js` using standard Expo public variables (`EXPO_PUBLIC_*`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_APP_API_URL` | `http://localhost:3000` | Target URL of the running `sonaraim-app` web server |
| `EXPO_PUBLIC_NODE_API_URL` | `http://localhost:8080` | Target URL of the `sonaraim-node` relay |
| `EXPO_PUBLIC_LIVEKIT_URL` | `wss://livekit.sonaraim.internal` | Target LiveKit SFU server WebSocket URL |
| `EXPO_PUBLIC_DOMAIN_SALT` | `sonaraim-mobile-v1` | Domain separation salt for local PSI identifier blinding |
| `EXPO_PUBLIC_REQUEST_TIMEOUT_MS` | `8000` | Client HTTP request timeout in milliseconds |

### 2.2 Native Hardware Bridges & Permissions (`mobile/src/nativeDeviceBridge.js`)

Hardware access is encapsulated in `nativeDeviceBridge.js` and declared in `mobile/app.json`:

| Module | Native Capability | Usage & Configuration |
| :--- | :--- | :--- |
| `expo-image-picker` | Photo library & camera | `pickMediaAsset`: Prompts user permission and returns URI, MIME type, and file size for AES-256-GCM encryption in `mediaCrypto.js`. |
| `expo-av` | Microphone & audio recording | `startVoiceRecording`: Manages voice note recording lifecycle (`prepareToRecordAsync`, `startAsync`, `stopAndUnloadAsync`). |
| `expo-notifications` | Push notification service | `acquireDevicePushToken`: Obtains OS device push token for blind APNs/FCM wake-up registration via `statusStore.js`. |
| `expo-secure-store` | Hardware Keychain / KeyStore | `saveSecureValue` / `readSecureValue`: Persists sensitive identity credentials, DID keys, and MLS ratchet epoch keys. |

### 2.3 WhatsApp-Parity Application Architecture

Milestone 14 introduces client modules delivering full WhatsApp feature parity over sovereign E2EE protocols:

| Module | Purpose | Key Functions & Interfaces |
| :--- | :--- | :--- |
| `mediaCrypto.js` | E2EE multimedia crypto & catalogs | `encryptMediaBuffer`, `decryptMediaBuffer`, `createMediaPointer`, `requestPresignedUpload`, `getEmojiCatalog`, `getStickerCatalog`, `searchGifs`. Uses AES-256-GCM authenticated encryption. |
| `groupManager.js` | MLS ratcheted group chats | `createGroup` (epoch 0), `addGroupMember` (ratchets epoch key forward), `removeGroupMember` (ratchets key, restricting future epochs), `appendGroupMessage`, `decryptGroupMessage`. |
| `chatFeatures.js` | Rich conversational interactions | `toggleReaction` (aggregates emoji counts), `buildQuoteReply` (references target message ID), `advanceReceiptStatus` (`sent` -> `delivered` -> `read`), `sendRelaySignal` (dispatches ephemeral typing/receipt signals). |
| `statusStore.js` | 24-hour ephemeral Status/Stories | `createStatusItem`, `filterActiveStatuses` (enforces `DEFAULT_STATUS_TTL_SECONDS = 86400`), `deriveBlindPushToken`, `registerPushToken` (submits blind SHA-256 hash to node relay). |
| `callControlsLogic.js` | In-app WebRTC call controls | `createInitialCallState`, `resolveCallAction` (handles `toggleMic`, `toggleCamera`, `toggleSpeaker`, and `endCall`). |

### 2.4 EAS Native Build Profiles (`mobile/eas.json`)

Build profiles for Expo Application Services (EAS) enable native binary compilation:

| Profile | Platform | Build Type / Distribution | Output Artifact |
| :--- | :--- | :--- | :--- |
| `development` | Android / iOS | `developmentClient: true`, internal distribution | Debug APK / iOS Simulator build |
| `preview` | Android / iOS | `distribution: "internal"` | Standalone APK / iOS Ad-Hoc IPA |
| `production` | Android / iOS | Store-ready distribution | Android App Bundle (AAB) / iOS App Store IPA |

Native build scripts in `mobile/package.json`:

```bash
npm run build:android    # eas build --platform android --profile production
npm run build:ios        # eas build --platform ios --profile production
```

## 3. Core Server HTTP Endpoints Reference

### `/manifest.webmanifest`

- **Method**: `GET`
- **Content-Type**: `application/manifest+json; charset=utf-8`
- **Description**: W3C Web App Manifest descriptor for installing the Sonaraim client as a standalone mobile PWA.

### `/auth/phone/register`

- **Method**: `POST`
- **Request Body**: `{"phone": "+14155552671"}`
- **Description**: Validates and normalizes phone numbers to E.164, derives `did:sonaraim:<e164>`, computes an HMAC-blinded pseudonym token, and registers the identity on the node relay.

### `/auth/devices/pair`

- **Method**: `POST`
- **Request Body (Create)**: `{"userDid": "did:sonaraim:+14155552671"}`
- **Response (Create)**: `{"status": "created", "pairingCode": "654321", "pairingUri": "sonaraim://pair?...", "expiresAt": "..."}`
- **Request Body (Verify)**: `{"pairingCode": "654321"}`
- **Response (Verify)**: `{"status": "paired", "valid": true, "userDid": "did:sonaraim:+14155552671", "pairedAt": "..."}`
- **Description**: Creates or redeems short-lived (5-minute TTL) single-use 6-digit numeric pairing codes for linking companion devices.

### `/api/calls/token`

- **Method**: `POST`
- **Request Body**: `{"roomName": "room-1", "participantDid": "did:sonaraim:alice"}`
- **Response**: `{"roomName": "room-1", "participantDid": "did:sonaraim:alice", "serverUrl": "wss://...", "token": "..."}`
- **Description**: Issues cryptographically signed LiveKit JWT access tokens for joining end-to-end encrypted voice and video call rooms.

### `/inbox` & `/inbox/messages`

- **`GET /inbox`**: Renders the Dual Inbox view (HTML for browsers, JSON when requested via `Accept: application/json`).
- **`POST /inbox/messages`**: Dispatches an encrypted P2P message envelope to the upstream Node relay.
