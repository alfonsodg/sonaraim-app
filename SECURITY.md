# Security Policy (`SECURITY.md`)

## Supported Versions

SonarAIM project takes security seriously. We maintain security fixes and advisories for the following versions:

| Version | Supported          |
| :------ | :----------------- |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability or cryptographic flaw in `sonaraim-app` or associated mobile clients, **please do not open a public issue**. Instead, report it privately to our security team:

- **Email**: `security@sonaraim.org`
- **PGP Key Fingerprint**: `9F82 4B2A 7D1C 5E3F 8890  1234 A5B6 C7D8 E9F0 1122`

### Please Include

- Detailed description of the vulnerability and attack vector.
- Steps to reproduce or proof-of-concept (PoC) script.
- Impact assessment on Zero-Knowledge Vault confidentiality, Dual Inbox isolation, or Zero-HTML rendering boundaries.
- Proposed remediation if available.

## Cryptographic & Security Boundaries

`sonaraim-app` enforces specific security guarantees:

1. **Zero-Knowledge Vault Confidentiality**:
   - Master keys derived from WebAuthn PRF extension or scrypt seeds never leave the local client unencrypted.
   - All state backups use authenticated `AES-256-GCM` with bound Additional Authenticated Data (`AAD`).
2. **Dual Inbox Isolation**:
   - Sovereign peer envelopes (`did:sonaraim:`) and merchant envelopes (`did:web:`) are isolated at the routing boundary.
   - Merchant messages require valid DNS/TLS `did:web` resolution and an unrevoked `ConsentToken`.
3. **Zero-HTML Declarative Surface**:
   - Declarative cards reject all raw HTML tags, `<script>` tags, and `javascript:` URIs.
   - Only allowlisted declarative primitives are rendered.
4. **Phone Activation & Device Pairing**:
   - Phone identities are normalized to strict E.164 and pseudonymized via salted HMAC blind tokens.
   - Companion device pairing codes are short-lived (5-minute TTL) single-use numeric tokens.

## Response Timeline

- **Initial Acknowledgment**: Within 24 hours.
- **Triage & Severity Assessment**: Within 72 hours.
- **Fix & Coordinated Disclosure**: Typically within 30 days of confirmed reproduction.
