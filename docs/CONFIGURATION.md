# Configuration Guide (`docs/CONFIGURATION.md`)

> Runtime Environment Variables for `sonaraim-app`

All configurable parameters in `sonaraim-app` are loaded from environment variables with safe defaults via `resolveInboxConfig`, `resolveCardConfig`, and `resolveVaultConfig`. No URLs, ports, or cryptographic thresholds are hardcoded in application logic.

## Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SONARAIM_RELAY_URL` | `wss://relay.sonaraim.example.com/v1/mls` | Default MLS WebSocket relay endpoint |
| `SONARAIM_DID_RESOLVER_URL` | `https://resolver.sonaraim.example.com/1.0/identifiers` | Universal DID resolver endpoint for `did:sonaraim` and `did:web` |
| `SONARAIM_INBOX_PERSONAL_STREAM` | `PERSONAL` | Target inbox identifier for peer-to-peer human messages |
| `SONARAIM_INBOX_SERVICES_STREAM` | `SERVICES` | Target inbox identifier for verified merchant messages |
| `SONARAIM_PEER_DID_PREFIX` | `did:sonaraim:` | Required DID prefix for sovereign peer identities |
| `SONARAIM_MERCHANT_DID_PREFIX` | `did:web:` | Required DID prefix for verified institutional/merchant identities |
| `SONARAIM_REQUIRE_CONSENT_FOR_SERVICES` | `true` | Enforces active `ConsentToken` verification for all `SERVICES` envelopes |
| `SONARAIM_CARD_MAX_COMPONENTS` | `24` | Maximum number of declarative components allowed in a single card |
| `SONARAIM_CARD_MAX_ACTIONS` | `6` | Maximum number of interactive actions allowed per card component |
| `SONARAIM_CARD_SIGNATURE_ALGORITHM` | `Ed25519` | Digital signature algorithm required for card envelopes |
| `SONARAIM_VAULT_HKDF_HASH` | `sha256` | HMAC hash function used during HKDF vault key derivation |
| `SONARAIM_VAULT_HKDF_INFO` | `sonaraim-zk-vault-v1` | HKDF domain separation prefix |
| `SONARAIM_VAULT_CIPHER_ALGO` | `aes-256-gcm` | Authenticated symmetric cipher for Zero-Knowledge Vault blobs |
| `SONARAIM_VAULT_KEY_LENGTH` | `32` | Symmetric key length in bytes (256 bits) |
| `SONARAIM_VAULT_IV_LENGTH` | `12` | Initialization vector length in bytes (96 bits for AES-GCM) |
| `SONARAIM_VAULT_SCRYPT_COST` | `16384` | CPU/memory cost parameter `N` for optional scrypt seed hardening |
| `SONARAIM_VAULT_SCRYPT_BLOCK_SIZE` | `8` | Block size parameter `r` for scrypt hardening |
| `SONARAIM_VAULT_SCRYPT_PARALLELIZATION` | `1` | Parallelization parameter `p` for scrypt hardening |
| `SONARAIM_APP_HOST` | `0.0.0.0` | Bind address for Instant Web / App Clip container runtime |
| `SONARAIM_APP_PORT` | `8080` | Bind port for Instant Web / App Clip container runtime |
| `SONARAIM_LOG_LEVEL` | `INFO` | Structured JSON logging verbosity (`ERROR`, `WARN`, `INFO`, `DEBUG`) |

## Example Setup

Copy `samples/.env.example` to `.env` for local development:

```bash
cp samples/.env.example .env
```
