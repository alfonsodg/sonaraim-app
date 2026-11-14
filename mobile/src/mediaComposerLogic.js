/**
 * @fileoverview E2EE media attachment workflow logic for MediaComposer.
 * Separated from React Native UI layer to allow native `node --test` execution.
 */

import { pickMediaAsset, startVoiceRecording } from './nativeDeviceBridge.js';
import {
  createMediaPointer,
  encryptMediaBuffer,
  requestPresignedUpload,
} from './mediaCrypto.js';

const EXTENSION_BY_KIND = Object.freeze({
  image: 'jpg',
  video: 'mp4',
  audio: 'm4a',
});

/**
 * Reads binary bytes from a local or remote asset URI using `fetch`.
 *
 * @param {string} uri - Asset URI returned by Expo ImagePicker or AV Recording.
 * @param {typeof fetch} [fetchFn=globalThis.fetch] - Fetch implementation.
 * @returns {Promise<Uint8Array>} Raw asset bytes.
 */
export async function readAssetBytes(uri, fetchFn = globalThis.fetch) {
  const res = await fetchFn(uri);
  if (!res.ok) {
    throw new Error(`Failed to read media asset: HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Uploads encrypted media ciphertext to a presigned S3 URL via HTTP PUT.
 *
 * @param {string} presignedUrl - Presigned PUT URL.
 * @param {Uint8Array} ciphertext - Encrypted media bytes.
 * @param {string} mimeType - Original media MIME type.
 * @param {typeof fetch} [fetchFn=globalThis.fetch] - Fetch implementation.
 * @returns {Promise<void>}
 */
async function uploadEncryptedMedia(presignedUrl, ciphertext, mimeType, fetchFn = globalThis.fetch) {
  const res = await fetchFn(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Original-Mime-Type': mimeType,
    },
    body: ciphertext,
  });
  if (!res.ok) {
    throw new Error(`Encrypted media upload failed: HTTP ${res.status}`);
  }
}

/**
 * Captures or picks device media, encrypts it with AES-256-GCM, requests a presigned
 * upload URL from `/v1/media/presign`, uploads the ciphertext, and returns a canonical pointer.
 *
 * @param {{
 *   kind: 'image' | 'video' | 'audio',
 *   nodeApiUrl: string,
 *   pickMediaAssetFn?: typeof pickMediaAsset,
 *   startVoiceRecordingFn?: typeof startVoiceRecording,
 *   readAssetBytesFn?: typeof readAssetBytes,
 *   fetchFn?: typeof fetch
 * }} params - Attachment workflow parameters and injectable dependencies.
 * @returns {Promise<{ cancelled: boolean, mediaPointer: Record<string, any> | null }>}
 */
export async function processMediaAttachment({
  kind,
  nodeApiUrl,
  pickMediaAssetFn = pickMediaAsset,
  startVoiceRecordingFn = startVoiceRecording,
  readAssetBytesFn = readAssetBytes,
  fetchFn = globalThis.fetch,
}) {
  const cleanNodeUrl = String(nodeApiUrl ?? '').trim().replace(/\/+$/, '');
  if (!cleanNodeUrl) {
    throw new Error('nodeApiUrl is required for presigned media upload');
  }

  let asset = null;
  if (kind === 'audio') {
    const recorder = await startVoiceRecordingFn();
    asset = recorder ? await recorder.stop() : null;
  } else {
    asset = await pickMediaAssetFn({ mediaType: kind === 'video' ? 'video' : 'image' });
  }

  if (!asset || !asset.uri) {
    return { cancelled: true, mediaPointer: null };
  }

  const rawBytes = await readAssetBytesFn(asset.uri, fetchFn);
  const encrypted = await encryptMediaBuffer(rawBytes);

  const presigned = await requestPresignedUpload({
    endpointUrl: `${cleanNodeUrl}/v1/media/presign`,
    sha256Ciphertext: encrypted.sha256Ciphertext,
    contentLength: encrypted.ciphertext.byteLength,
    fetchFn,
  });

  if (!presigned?.presigned_url) {
    throw new Error('Presign endpoint did not return a presigned_url');
  }

  await uploadEncryptedMedia(
    presigned.presigned_url,
    encrypted.ciphertext,
    asset.mimeType || 'application/octet-stream',
    fetchFn
  );

  const ext = EXTENSION_BY_KIND[kind] || 'bin';
  const mediaPointer = createMediaPointer({
    mediaUrl: presigned.blob_url || presigned.presigned_url,
    sha256: encrypted.sha256Ciphertext,
    mimeType: asset.mimeType || 'application/octet-stream',
    keyHex: encrypted.keyHex,
    ivHex: encrypted.ivHex,
    authTagHex: encrypted.authTagHex,
    fileName: `attachment-${Date.now()}.${ext}`,
    sizeBytes: Number(asset.fileSize || rawBytes.byteLength),
  });

  return { cancelled: false, mediaPointer };
}
