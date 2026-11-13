# Contributing to SonarAIM Client (`sonaraim-app`)

Thank you for your interest in contributing to **SonarAIM Client**! We are committed to building an open, sovereign, and cryptographically secure communication ecosystem.

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to `security@sonaraim.org`.

## Architecture & Subprojects

The `sonaraim-app` repository hosts both the core client web services and the cross-platform mobile application:

- **Core Web / PWA Services (`src/`)**: Node.js ESM services including Dual Inbox routing, Zero-HTML Declarative Card parsing, Passkey WebAuthn PRF vault, and E.164 phone pairing.
- **Mobile Application (`mobile/`)**: React Native (Expo) mobile client providing native activation, Dual Inbox messaging, and LiveKit encrypted voice/video calling.

## Development Workflow

### 1. Prerequisites

- **Node.js**: `>= 20.0.0` (LTS recommended)
- **npm**: `>= 10.0.0`
- **Git**

### 2. Branching Model

- The default development integration branch is `develop`.
- Always branch your work from `develop`:
  - `feature/<issue-id>-<short-description>` for new features.
  - `fix/<issue-id>-<short-description>` for bug fixes.
- Pull requests must target `develop`. Merges to `main` are reserved for tagged production releases.

### 3. Conventional Commits

Commit messages must follow the Conventional Commits specification and reference an existing issue:

```text
<type>(<scope>): <subject> (#issue)

Ref #issue
```

Supported types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`.

### 4. Code Quality & Modularity Guidelines

- **File Length Limit**: Every source file in `src/`, `mobile/src/`, and test suites must strictly remain under **300 lines**.
- **JSDoc Mandatory**: All exported classes, functions, components, and procedures must have complete JSDoc annotations documenting parameters and return values.
- **Zero Hardcoded Values**: All URLs, ports, stream names, and cryptographic parameters must be loaded via config resolvers (`resolveInboxConfig`, `resolveCardConfig`, `resolveMobileConfig`).
- **Zero-HTML Security Boundary**: No raw HTML, CSS, `<script>` tags, or inline handlers are accepted in Declarative Cards. Use only allowlisted declarative primitives (`header`, `text`, `key_value`, `media_image`, `divider`, `badge`, `action_group`).

## Testing & Quality Gates

Before submitting a pull request, all automated test suites and markdown linters must pass with zero errors:

```bash
# 1. Run root client and server tests
npm test

# 2. Run React Native mobile tests
cd mobile && npm test && cd ..

# 3. Verify Markdown documentation style
npx --yes markdownlint-cli2 "*.md" "docs/*.md"
```

## Submitting Pull Requests

1. Fork the repository and create your branch from `develop`.
2. Implement your changes following TDD (write failing tests first).
3. Ensure all tests and lint checks pass cleanly.
4. Push your branch and open a Pull Request referencing the active issue.
5. Address review feedback constructively.
