/**
 * @fileoverview Unit tests for Issue #20: MediaComposer native bridge & presigned upload workflow.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processMediaAttachment } from '../src/mediaComposerLogic.js';

describe('Issue #20: MediaComposer Native Bridge & Presigned Upload Flow', () => {
  it('picks an image asset, encrypts it, requests presigned upload, and returns media pointer', async () => {
    const calls = { pick: null, presign: null, upload: null };

    const result = await processMediaAttachment({
      kind: 'image',
      nodeApiUrl: 'https://node.example.com',
      pickMediaAssetFn: async (opts) => {
        calls.pick = opts;
        return {
          uri: 'file:///tmp/photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 12,
        };
      },
      readAssetBytesFn: async () => new TextEncoder().encode('image-bytes!'),
      fetchFn: async (url, opts) => {
        if (url.endsWith('/v1/media/presign')) {
          calls.presign = { url, body: JSON.parse(opts.body) };
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                presigned_url: 'https://storage.example.com/blobs/img-1?sig=abc',
                blob_url: 'https://storage.example.com/blobs/img-1',
              }),
          };
        }
        calls.upload = { url, method: opts.method, byteLength: opts.body.byteLength };
        return { ok: true, text: async () => '' };
      },
    });

    assert.equal(calls.pick.mediaType, 'image');
    assert.equal(calls.presign.url, 'https://node.example.com/v1/media/presign');
    assert.equal(calls.presign.body.content_length, 12);
    assert.equal(calls.upload.method, 'PUT');
    assert.equal(calls.upload.url, 'https://storage.example.com/blobs/img-1?sig=abc');
    assert.equal(result.cancelled, false);
    assert.equal(result.mediaPointer.type, 'encrypted_media_pointer_v1');
    assert.equal(result.mediaPointer.mediaUrl, 'https://storage.example.com/blobs/img-1');
    assert.equal(result.mediaPointer.mimeType, 'image/jpeg');
    assert.equal(result.mediaPointer.sizeBytes, 12);
    assert.equal(result.mediaPointer.keyHex.length, 64);
  });

  it('picks a video asset and uploads encrypted ciphertext', async () => {
    let pickedType = '';
    const result = await processMediaAttachment({
      kind: 'video',
      nodeApiUrl: 'https://node.example.com',
      pickMediaAssetFn: async ({ mediaType }) => {
        pickedType = mediaType;
        return { uri: 'file:///tmp/clip.mp4', mimeType: 'video/mp4', fileSize: 10 };
      },
      readAssetBytesFn: async () => new TextEncoder().encode('video-data'),
      fetchFn: async (url) => {
        if (url.endsWith('/v1/media/presign')) {
          return {
            ok: true,
            text: async () => JSON.stringify({ presigned_url: 'https://storage.example.com/v/1' }),
          };
        }
        return { ok: true, text: async () => '' };
      },
    });

    assert.equal(pickedType, 'video');
    assert.equal(result.cancelled, false);
    assert.equal(result.mediaPointer.mimeType, 'video/mp4');
    assert.equal(result.mediaPointer.mediaUrl, 'https://storage.example.com/v/1');
  });

  it('records voice note via startVoiceRecording, encrypts, and requests presigned upload', async () => {
    let stopped = false;
    const result = await processMediaAttachment({
      kind: 'audio',
      nodeApiUrl: 'https://node.example.com',
      startVoiceRecordingFn: async () => ({
        stop: async () => {
          stopped = true;
          return { uri: 'file:///tmp/voice.m4a', mimeType: 'audio/m4a' };
        },
      }),
      readAssetBytesFn: async () => new TextEncoder().encode('voice-audio-bytes'),
      fetchFn: async (url) => {
        if (url.endsWith('/v1/media/presign')) {
          return {
            ok: true,
            text: async () => JSON.stringify({ presigned_url: 'https://storage.example.com/a/1' }),
          };
        }
        return { ok: true, text: async () => '' };
      },
    });

    assert.equal(stopped, true);
    assert.equal(result.cancelled, false);
    assert.equal(result.mediaPointer.mimeType, 'audio/m4a');
    assert.equal(result.mediaPointer.mediaUrl, 'https://storage.example.com/a/1');
  });

  it('handles user cancellation cleanly without calling presign or throwing', async () => {
    let presignCalled = false;
    const result = await processMediaAttachment({
      kind: 'image',
      nodeApiUrl: 'https://node.example.com',
      pickMediaAssetFn: async () => null,
      fetchFn: async () => {
        presignCalled = true;
        return { ok: true, text: async () => '{}' };
      },
    });

    assert.equal(result.cancelled, true);
    assert.equal(result.mediaPointer, null);
    assert.equal(presignCalled, false);
  });

  it('surfaces permission denied errors cleanly', async () => {
    await assert.rejects(
      () =>
        processMediaAttachment({
          kind: 'image',
          nodeApiUrl: 'https://node.example.com',
          pickMediaAssetFn: async () => {
            throw new Error('Media library permission denied');
          },
        }),
      /Media library permission denied/
    );
  });
});
