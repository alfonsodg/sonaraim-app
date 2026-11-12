# Engineering Standards (`docs/STANDARDS.md`)

> Development, Cryptographic, and Quality Mandates for `sonaraim-app`

## Runtime & Module System

- **Language & Module Format**: Modern ECMAScript Modules (`"type": "module"`, `.mjs`) targeting latest stable Node.js (`>= 20.0.0`) with zero external runtime bloat.
- **File Modularity**: Every source file in `src/` and `tests/` must remain under 300 lines and adhere to the Single Responsibility Principle (SOLID).
- **Documentation**: Complete JSDoc annotations are mandatory on every exported class, method, and helper function.

## Security & Zero-Hardcode Policy

- **Zero Hardcoded Configuration**: All stream identifiers, DID prefixes, component limits, and cryptographic parameters are resolved dynamically from environment variables via `resolveInboxConfig`, `resolveCardConfig`, and `resolveVaultConfig`.
- **Zero-HTML Surface**: `src/cardRenderer.mjs` strictly forbids raw HTML, CSS, `<script>`, `javascript:` URIs, or inline event attributes. Only allowlisted declarative component primitives (`header`, `text`, `key_value`, `media_image`, `divider`, `badge`, `action_group`) are accepted after `Ed25519` signature verification.
- **Authenticated Encryption**: `src/zkVault.mjs` uses `node:crypto` `hkdfSync` (with optional `scryptSync` hardening) and `aes-256-gcm` with explicit Additional Authenticated Data (`AAD`) binding `version`, `userDid`, and `epoch`.

## Testing & Linting Gates

- **Test-Driven Verification**: Execute `npm test` (`node --test tests/*.test.mjs`) before every commit.
- **Markdown Quality**: All Markdown documentation must pass `markdownlint` with zero errors.
- **Git Workflow**: Conventional Commits referencing the active issue (`feat(app): ... (#1)` with `Ref #1`), branching from `develop`.
