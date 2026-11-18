# Sonaraim Mobile (`@sonaraim/mobile`)

React Native / Expo SDK 51 client: Dual Inbox, Zero-HTML Declarative Cards,
E2EE media composer, and calling.

## Calling: external LiveKit Meet fallback (honest status)

In-app calling via `@livekit/react-native` is **not** embedded in this
snapshot. `CallsScreen` mints an encrypted room token via
`POST /api/calls/token` and opens the call in the external LiveKit Meet app
(`Linking.openURL(buildLiveKitJoinUrl(...))`); `callControlsLogic.js` drives
the local mic/camera/speaker UI state only. Embedding the native WebRTC engine
remains roadmap — see issue #29.

## Crypto runtime (issue #29, owner Option C)

Hermes ships no `crypto.subtle`. The vetted `react-native-quick-crypto`
module is installed **once** at the entrypoint (`cryptoPolyfill.js`, loaded
by `App.js`) as the global WebCrypto polyfill (AES-GCM, ChaCha20-Poly1305,
Ed25519, X25519, HKDF over OpenSSL + Expo config plugin). Business logic
under `src/` must not import `node:crypto` directly (hygiene test
`mobileCryptoHygiene.test.mjs`).

Consequences accepted by the owner:

- Requires a Custom Dev Client (Expo Go incompatible).
- `newArchEnabled: true` (verify against Expo SDK 51 during the EAS build).
- Platform floors: iOS 16.4+, Android `minSdkVersion` 24.

## EAS build (config ready, not executed here)

`app.json` / `eas.json` are build-ready (channels, profiles, plugin). No
`eas.projectId` is set in this repo: link the project, then run:

```sh
cd mobile
eas build --platform android --profile development   # Custom Dev Client (APK)
eas build --platform ios --profile development      # simulator
```

Node-side tests are unaffected (WebCrypto is native in Node 22+).
