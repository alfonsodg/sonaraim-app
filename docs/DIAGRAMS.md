# System Diagrams (`docs/DIAGRAMS.md`)

> Mermaid Architecture, Sequence, and State Diagrams for `sonaraim-app`

## 1. Dual Inbox Envelope Routing Flow

```mermaid
flowchart TD
    A["Incoming Decrypted MLS Envelope"] --> B{"Inspect senderDid Prefix"}
    B -- "did:sonaraim:*" --> C["Route to PERSONAL Stream"]
    B -- "did:web:*" --> D{"verifiedDidWeb === true?"}
    B -- "Other Prefix" --> E["Reject: UNSUPPORTED_DID_METHOD"]
    D -- "No" --> F["Reject: UNVERIFIED_MERCHANT_DID"]
    D -- "Yes" --> G{"Verify Merchant ConsentToken"}
    G -- "Missing" --> H["Reject: CONSENT_NOT_FOUND"]
    G -- "Revoked" --> I["Reject: CONSENT_REVOKED"]
    G -- "Expired" --> J["Reject: CONSENT_EXPIRED"]
    G -- "Valid & Active" --> K["Route to SERVICES Stream"]
```

## 2. Zero-HTML Declarative Card Verification & Action Signing

```mermaid
sequenceDiagram
    participant M as Merchant (did:web)
    participant R as DualInboxRouter
    participant C as CardRenderer
    participant U as Native UI (SwiftUI / Compose / Web)

    M->>R: MLS Envelope (Signed Card Payload + ConsentToken ID)
    R->>R: Verify did:web & Active ConsentToken
    R->>C: Forward Signed Card Envelope
    C->>C: Canonicalize JSON & Verify Ed25519 Signature
    C->>C: Validate Allowlisted Components & Zero-HTML Policy
    C->>U: Emit Native View Descriptor Tree
    U->>C: User Triggers Action (confirm_intent)
    C->>C: Sign Action Payload with User Ed25519 Key
    C->>M: Return Signed Action Intent over MLS
```

## 3. Passkey WebAuthn PRF Zero-Knowledge Vault Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Locked
    Locked --> KeyDerived: WebAuthn PRF Assertion + Salt + User DID (HKDF-SHA256)
    KeyDerived --> EncryptedSnapshot: encryptVaultBlob (AES-256-GCM + AAD v1|userDid|epoch)
    EncryptedSnapshot --> CloudRelayBackup: Upload Zero-Knowledge Ciphertext Blob
    CloudRelayBackup --> RestoredSnapshot: decryptVaultBlob + Verify AuthTag & AAD
    RestoredSnapshot --> [*]
```
