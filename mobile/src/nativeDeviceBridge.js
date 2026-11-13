/**
 * @fileoverview Native hardware bridges for Sonaraim Mobile (Expo SDK 51).
 * Connects camera/gallery picker, voice note recording, OS push tokens, and SecureStore.
 */

async function loadOptionalExpoModule(moduleName) {
  try {
    return await import(moduleName);
  } catch {
    throw new Error(`Native module '${moduleName}' is not available in this runtime`);
  }
}

/**
 * Prompts media library permission and picks an encrypted-ready image or video asset.
 *
 * @param {{
 *   mediaType?: 'image' | 'video' | 'all',
 *   pickerModule?: any
 * }} [options]
 * @returns {Promise<{ uri: string, mimeType: string, fileSize: number } | null>}
 */
export async function pickMediaAsset({ mediaType = 'image', pickerModule = null } = {}) {
  const picker = pickerModule ?? (await loadOptionalExpoModule('expo-image-picker'));
  const perm = await picker.requestMediaLibraryPermissionsAsync();
  if (perm?.status !== 'granted') {
    throw new Error('Media library permission denied');
  }
  const mediaTypes =
    mediaType === 'video' ? 'Videos' : mediaType === 'all' ? 'All' : 'Images';
  const result = await picker.launchImageLibraryAsync({
    mediaTypes,
    allowsEditing: false,
    quality: 0.9,
  });
  if (result?.canceled || !result?.assets?.length) {
    return null;
  }
  const asset = result.assets[0];
  return {
    uri: String(asset.uri || ''),
    mimeType: String(asset.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')),
    fileSize: Number(asset.fileSize || 0),
  };
}

/**
 * Starts a native voice note recording session using `expo-av`.
 *
 * @param {{ audioModule?: any }} [options]
 * @returns {Promise<{ stop: () => Promise<{ uri: string, mimeType: string }> }>}
 */
export async function startVoiceRecording({ audioModule = null } = {}) {
  const audio = audioModule ?? (await loadOptionalExpoModule('expo-av')).Audio ?? (await loadOptionalExpoModule('expo-av'));
  const perm = await audio.requestPermissionsAsync();
  if (perm?.status !== 'granted') {
    throw new Error('Microphone permission denied');
  }
  await audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const created = await audio.Recording.createAsync(audio.RecordingOptionsPresets?.HIGH_QUALITY);
  const recording = created.recording;
  return {
    async stop() {
      await recording.stopAndUnloadAsync();
      return {
        uri: String(recording.getURI() || ''),
        mimeType: 'audio/m4a',
      };
    },
  };
}

/**
 * Requests OS notification permission and returns the native APNs/FCM push token.
 *
 * @param {{ notificationsModule?: any }} [options]
 * @returns {Promise<{ platform: string, deviceToken: string }>}
 */
export async function acquireDevicePushToken({ notificationsModule = null } = {}) {
  const notifs = notificationsModule ?? (await loadOptionalExpoModule('expo-notifications'));
  let perm = await notifs.getPermissionsAsync();
  if (perm?.status !== 'granted' && typeof notifs.requestPermissionsAsync === 'function') {
    perm = await notifs.requestPermissionsAsync();
  }
  if (perm?.status !== 'granted') {
    throw new Error('Push notification permission denied');
  }
  const tokenInfo = await notifs.getDevicePushTokenAsync();
  return {
    platform: String(tokenInfo?.type || 'fcm'),
    deviceToken: String(tokenInfo?.data || ''),
  };
}

/**
 * Persists a sensitive key or session token in hardware-backed `expo-secure-store`.
 *
 * @param {string} key
 * @param {string} value
 * @param {{ secureStoreModule?: any }} [options]
 * @returns {Promise<void>}
 */
export async function saveSecureValue(key, value, { secureStoreModule = null } = {}) {
  const secureStore = secureStoreModule ?? (await loadOptionalExpoModule('expo-secure-store'));
  await secureStore.setItemAsync(String(key), String(value));
}

/**
 * Reads a sensitive key or session token from hardware-backed `expo-secure-store`.
 *
 * @param {string} key
 * @param {{ secureStoreModule?: any }} [options]
 * @returns {Promise<string | null>}
 */
export async function readSecureValue(key, { secureStoreModule = null } = {}) {
  const secureStore = secureStoreModule ?? (await loadOptionalExpoModule('expo-secure-store'));
  return secureStore.getItemAsync(String(key));
}
