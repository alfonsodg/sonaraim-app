/**
 * @fileoverview Unit tests for native device bridges (camera/gallery, voice recording,
 * OS push token acquisition, and hardware-backed secure storage).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickMediaAsset,
  startVoiceRecording,
  acquireDevicePushToken,
  saveSecureValue,
  readSecureValue,
} from '../src/nativeDeviceBridge.js';

describe('Native Device Bridge (EAS Build Ready)', () => {
  it('picks image/video assets using injected Expo ImagePicker module', async () => {
    const fakePicker = {
      requestMediaLibraryPermissionsAsync: async () => ({ status: 'granted' }),
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ uri: 'file:///tmp/photo.jpg', mimeType: 'image/jpeg', fileSize: 1024 }],
      }),
    };

    const asset = await pickMediaAsset({ mediaType: 'image', pickerModule: fakePicker });
    assert.equal(asset.uri, 'file:///tmp/photo.jpg');
    assert.equal(asset.mimeType, 'image/jpeg');
  });

  it('records voice note lifecycle via injected Expo AV Audio module', async () => {
    const fakeAudio = {
      requestPermissionsAsync: async () => ({ status: 'granted' }),
      setAudioModeAsync: async () => {},
      Recording: {
        createAsync: async () => ({
          recording: {
            stopAndUnloadAsync: async () => {},
            getURI: () => 'file:///tmp/voice.m4a',
          },
        }),
      },
    };

    const session = await startVoiceRecording({ audioModule: fakeAudio });
    const result = await session.stop();
    assert.equal(result.uri, 'file:///tmp/voice.m4a');
    assert.equal(result.mimeType, 'audio/m4a');
  });

  it('acquires OS push token via injected Expo Notifications module', async () => {
    const fakeNotifs = {
      getPermissionsAsync: async () => ({ status: 'granted' }),
      getDevicePushTokenAsync: async () => ({ type: 'fcm', data: 'fcm-device-token-xyz' }),
    };

    const token = await acquireDevicePushToken({ notificationsModule: fakeNotifs });
    assert.equal(token.platform, 'fcm');
    assert.equal(token.deviceToken, 'fcm-device-token-xyz');
  });

  it('stores and retrieves secrets using injected SecureStore module', async () => {
    const store = new Map();
    const fakeSecureStore = {
      setItemAsync: async (k, v) => { store.set(k, v); },
      getItemAsync: async (k) => store.get(k) ?? null,
    };

    await saveSecureValue('sonaraim_identity_key', 'ed25519-priv', { secureStoreModule: fakeSecureStore });
    const val = await readSecureValue('sonaraim_identity_key', { secureStoreModule: fakeSecureStore });
    assert.equal(val, 'ed25519-priv');
  });
});
