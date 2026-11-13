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

## 2. React Native Mobile Environment Variables (`mobile/`)

The React Native Expo application in `mobile/` resolves its configuration via `mobile/src/config.js` using standard Expo public variables (`EXPO_PUBLIC_*`):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_APP_API_URL` | `http://localhost:3000` | Target URL of the running `sonaraim-app` web server |
| `EXPO_PUBLIC_NODE_API_URL` | `http://localhost:8080` | Target URL of the `sonaraim-node` relay |
| `EXPO_PUBLIC_LIVEKIT_URL` | `wss://livekit.sonaraim.internal` | Target LiveKit SFU server WebSocket URL |
| `EXPO_PUBLIC_DOMAIN_SALT` | `sonaraim-mobile-v1` | Domain separation salt for local PSI identifier blinding |
| `EXPO_PUBLIC_REQUEST_TIMEOUT_MS` | `8000` | Client HTTP request timeout in milliseconds |

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
