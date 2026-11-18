/**
 * @fileoverview Issue #27 acceptance tests: E2EE media pointer travels in the
 * P2P envelope (composer → relay → drain) and the recipient can fetch +
 * decrypt + render it (mobile logic + web inbox render).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createApiClient } from '../src/apiClient.js';
import { normalizeMailboxResult, summarizeMediaDrain } from '../src/mailboxSync.js';
import { drainIncomingMedia, processMediaAttachment } from '../src/mediaComposerLogic.js';
import { createMediaPointer, encryptMediaBuffer } from '../src/mediaCrypto.js';

describe('Issue #27: media pointer travels in the P2P envelope', () => {
  it('sendP2pMessage carries mediaPointer alongside text', async () => {
    let sentBody = null;
    const mockFetch = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { ok: true, text: async () => JSON.stringify({ status: 'sent', envelopeId: 'env-m' }) };
    };
    const client = createApiClient(
      { appApiUrl: 'http://app:3000', nodeApiUrl: 'http://node:8080' },
      { fetch: mockFetch }
    );
    const pointer = createMediaPointer({
      mediaUrl: 'https://cdn.example.com/blobs/x',
      sha256: 'ab'.repeat(32),
      mimeType: 'image/jpeg',
      keyHex: '01'.repeat(32),
      ivHex: '02'.repeat(12),
      authTagHex: '03'.repeat(16),
      fileName: 'photo.jpg',
      sizeBytes: 12,
    });
    const res = await client.sendP2pMessage({
      senderDid: 'did:sonaraim:alice',
      recipientDid: 'did:sonaraim:bob',
      text: 'photo for you',
      mediaPointer: pointer,
    });
    assert.equal(res.status, 'sent');
    assert.equal(sentBody.text, 'photo for you');
    assert.deepEqual(sentBody.mediaPointer, pointer);
  });

  it('normalizeMailboxResult exposes decodedPayload + mediaPointer from payload_hex', () => {
    const pointer = {
      type: 'encrypted_media_pointer_v1',
      mediaUrl: 'https://cdn.example.com/blobs/x',
      sha256: 'ab'.repeat(32),
      mimeType: 'image/jpeg',
      keyHex: '01'.repeat(32),
      ivHex: '02'.repeat(12),
      authTagHex: '03'.repeat(16),
    };
    const payloadHex = Buffer.from(
      JSON.stringify({ senderDid: 'did:sonaraim:alice', text: 'hi', mediaPointer: pointer }),
      'utf8'
    ).toString('hex');
    const normalized = normalizeMailboxResult({
      mailbox_id: 'did:sonaraim:bob',
      items: [{ envelope_id: 'env-1', payload_hex: payloadHex }],
    });
    assert.equal(normalized.envelopes.length, 1);
    assert.equal(normalized.envelopes[0].decodedPayload.text, 'hi');
    assert.deepEqual(normalized.envelopes[0].mediaPointer, pointer);
  });

  it('E2E: composer encrypt → relay envelope → drain → decrypt roundtrip', async () => {
    const uploads = new Map();
    const fetchFn = async (url, opts = {}) => {
      if (url.endsWith('/v1/media/presign') && (opts.method || 'POST') === 'POST') {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              presigned_url: 'https://storage.example.com/blobs/e2e?sig=abc',
              blob_url: 'https://storage.example.com/blobs/e2e',
            }),
        };
      }
      if (String(url).startsWith('https://storage.example.com/') && opts.method === 'PUT') {
        uploads.set('https://storage.example.com/blobs/e2e', Buffer.from(opts.body));
        return { ok: true, text: async () => '' };
      }
      if (url === 'https://storage.example.com/blobs/e2e') {
        const stored = uploads.get('https://storage.example.com/blobs/e2e');
        return {
          ok: true,
          arrayBuffer: async () => stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const attached = await processMediaAttachment({
      kind: 'image',
      nodeApiUrl: 'https://node.example.com',
      pickMediaAssetFn: async () => ({ uri: 'file:///e2e.jpg', mimeType: 'image/jpeg', fileSize: 9 }),
      readAssetBytesFn: async () => new TextEncoder().encode('e2e-bytes'),
      fetchFn,
    });
    assert.equal(attached.cancelled, false);

    const payloadHex = Buffer.from(
      JSON.stringify({
        senderDid: 'did:sonaraim:alice',
        recipientDid: 'did:sonaraim:bob',
        text: 'e2e photo',
        mediaPointer: attached.mediaPointer,
      }),
      'utf8'
    ).toString('hex');
    const normalized = normalizeMailboxResult({
      items: [{ envelope_id: 'env-e2e', payload_hex: payloadHex }],
    });
    const drained = await drainIncomingMedia({ envelopes: normalized.envelopes, fetchFn });
    assert.equal(drained.length, 1);
    assert.equal(drained[0].error, null);
    assert.equal(new TextDecoder().decode(drained[0].bytes), 'e2e-bytes');
    assert.equal(drained[0].mimeType, 'image/jpeg');
  });

  it('summarizeMediaDrain builds inbox messages + feedback text', () => {
    const drained = [
      { envelopeId: 'env-1', pointer: { senderDid: 'did:sonaraim:alice', mimeType: 'image/jpeg' }, bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg', error: null },
      { envelopeId: 'env-2', pointer: { mimeType: 'video/mp4' }, bytes: null, mimeType: null, error: 'Media fetch failed: HTTP 404' },
    ];
    const { incoming, feedback } = summarizeMediaDrain(drained, 2);
    assert.equal(incoming.length, 2);
    assert.match(incoming[0].text, /decrypted/);
    assert.equal(incoming[0].decryptedBytes, 3);
    assert.equal(incoming[1].text, '[encrypted attachment]');
    assert.match(feedback, /decrypted 1 attachment/);
    assert.match(feedback, /1 attachment\(s\) failed integrity/);
  });

  it('E2E: tampered blob fails integrity; envelopes without pointer drain clean', async () => {
    const raw = new TextEncoder().encode('secret-bytes');
    const encrypted = await encryptMediaBuffer(raw);
    const pointer = createMediaPointer({
      mediaUrl: 'https://cdn.example.com/blobs/t',
      sha256: encrypted.sha256Ciphertext,
      mimeType: 'image/jpeg',
      keyHex: encrypted.keyHex,
      ivHex: encrypted.ivHex,
      authTagHex: encrypted.authTagHex,
      fileName: 't.jpg',
      sizeBytes: encrypted.ciphertext.byteLength,
    });
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] ^= 0xff;
    const fetchFn = async () => ({
      ok: true,
      arrayBuffer: async () => tampered.buffer.slice(tampered.byteOffset, tampered.byteOffset + tampered.byteLength),
    });
    const drained = await drainIncomingMedia({
      envelopes: [{ envelope_id: 'env-t', decodedPayload: { text: 'x', mediaPointer: pointer } }, { envelope_id: 'env-plain', decodedPayload: { text: 'plain' } }],
      fetchFn,
    });
    assert.equal(drained.length, 2);
    assert.match(drained[0].error, /integrity|Media/i);
    assert.equal(drained[0].bytes, null);
    assert.equal(drained[1].error, null);
    assert.equal(drained[1].pointer, null);
  });
});
