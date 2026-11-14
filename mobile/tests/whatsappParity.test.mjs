/**
 * @fileoverview WhatsApp-parity feature test suite for Sonaraim Mobile.
 * Covers issues #13, #14, #15, #16, and #17:
 * - #13: E2EE multimedia encryption & composer helpers
 * - #14: E2EE MLS group chat creation, ratchet, and messaging
 * - #15: Reactions, quote replies, receipts, and typing relay signals
 * - #16: 24h ephemeral status TTL and blind push token registration
 * - #17: EAS build configuration and WebRTC in-app call controls
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  encryptMediaBuffer,
  decryptMediaBuffer,
  createMediaPointer,
  requestPresignedUpload,
  getEmojiCatalog,
  getStickerCatalog,
  searchGifs,
} from '../src/mediaCrypto.js';
import {
  createGroup,
  addGroupMember,
  removeGroupMember,
  appendGroupMessage,
  decryptGroupMessage,
} from '../src/groupManager.js';
import {
  toggleReaction,
  buildQuoteReply,
  advanceReceiptStatus,
  sendRelaySignal,
} from '../src/chatFeatures.js';
import {
  createStatusItem,
  filterActiveStatuses,
  registerPushToken,
  deriveBlindPushToken,
} from '../src/statusStore.js';
import {
  resolveCallControlAction,
  initialCallControlsState,
} from '../src/callControlsLogic.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Issue #13: E2EE Multimedia Crypto & Catalog Helpers', () => {
  it('encrypts and decrypts media buffer using AES-256-GCM roundtrip', async () => {
    const rawData = new TextEncoder().encode('Confidential voice note / image bytes');
    const encrypted = await encryptMediaBuffer(rawData);

    assert.ok(encrypted.ciphertext instanceof Uint8Array);
    assert.equal(encrypted.keyHex.length, 64);
    assert.equal(encrypted.ivHex.length, 24);
    assert.equal(encrypted.authTagHex.length, 32);

    const decrypted = await decryptMediaBuffer({
      ciphertext: encrypted.ciphertext,
      authTagHex: encrypted.authTagHex,
      keyHex: encrypted.keyHex,
      ivHex: encrypted.ivHex,
    });
    assert.equal(new TextDecoder().decode(decrypted), 'Confidential voice note / image bytes');
  });

  it('builds canonical media pointer and requests presigned upload', async () => {
    const pointer = createMediaPointer({
      mediaUrl: 'https://s3.sonaraim.org/blobs/abc123',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      mimeType: 'image/webp',
      keyHex: '01'.repeat(32),
      ivHex: '02'.repeat(12),
      authTagHex: '03'.repeat(16),
      fileName: 'photo.webp',
      sizeBytes: 1024,
    });
    assert.equal(pointer.type, 'encrypted_media_pointer_v1');
    assert.equal(pointer.fileName, 'photo.webp');

    const mockFetch = async (_url, opts) => {
      const parsed = JSON.parse(opts.body);
      assert.equal(parsed.sha256_ciphertext, pointer.sha256);
      return {
        ok: true,
        text: async () => JSON.stringify({ presigned_url: 'https://s3.sonaraim.org/upload-ticket' }),
      };
    };

    const res = await requestPresignedUpload({
      endpointUrl: 'http://node.test/v1/media/presign',
      sha256Ciphertext: pointer.sha256,
      contentLength: 1024,
      fetchFn: mockFetch,
    });
    assert.equal(res.presigned_url, 'https://s3.sonaraim.org/upload-ticket');
  });

  it('provides emoji, sticker, and filtered GIF catalogs using EXPO_PUBLIC_CDN_BASE_URL', () => {
    const prevCdn = process.env.EXPO_PUBLIC_CDN_BASE_URL;
    process.env.EXPO_PUBLIC_CDN_BASE_URL = 'https://assets.example.com/media/';
    try {
      const emojis = getEmojiCatalog();
      assert.ok(emojis.includes('👍') && emojis.includes('❤️'));
      const stickers = getStickerCatalog();
      assert.ok(stickers.length >= 2 && stickers[0].url.startsWith('https://assets.example.com/media/'));
      const gifs = searchGifs('thumbs');
      assert.ok(gifs.length >= 1 && /thumbs/i.test(gifs[0].tags.join(' ')));
      assert.ok(gifs[0].url.startsWith('https://assets.example.com/media/'));
    } finally {
      if (prevCdn === undefined) delete process.env.EXPO_PUBLIC_CDN_BASE_URL;
      else process.env.EXPO_PUBLIC_CDN_BASE_URL = prevCdn;
    }
  });
});

describe('Issue #14: E2EE Group Chats & Ratchet Management', () => {
  it('creates group with epoch 0 and ratchets key when adding members', async () => {
    const group = await createGroup({
      groupId: 'grp-crypto-team',
      creatorDid: 'did:sonaraim:alice',
      title: 'Crypto Team',
    });
    assert.equal(group.epoch, 0);
    assert.deepEqual(group.members, ['did:sonaraim:alice']);
    assert.ok(group.currentEpochKeyHex && group.transcriptDigestHex);

    const g1 = await addGroupMember(group, 'did:sonaraim:bob');
    assert.equal(g1.epoch, 1);
    assert.ok(g1.members.includes('did:sonaraim:bob'));
    assert.notEqual(g1.currentEpochKeyHex, group.currentEpochKeyHex);
    assert.notEqual(g1.transcriptDigestHex, group.transcriptDigestHex);
  });

  it('ratchets key on member removal and restricts decryption of future epochs', async () => {
    const g0 = await createGroup({ groupId: 'grp-sec', creatorDid: 'did:sonaraim:alice' });
    const g1 = await addGroupMember(g0, 'did:sonaraim:bob');
    const g2 = await addGroupMember(g1, 'did:sonaraim:carol');
    const g3 = await removeGroupMember(g2, 'did:sonaraim:bob');
    assert.equal(g3.epoch, 3);
    assert.ok(!g3.members.includes('did:sonaraim:bob'));

    const msg = await appendGroupMessage(g3, {
      senderDid: 'did:sonaraim:carol',
      text: 'Secret project discussion',
    });
    assert.equal(msg.epoch, 3);
    assert.equal(await decryptGroupMessage(g3, msg, 'did:sonaraim:alice'), 'Secret project discussion');
    await assert.rejects(
      () => decryptGroupMessage(g3, msg, 'did:sonaraim:bob'),
      /not authorized to decrypt epoch 3/i
    );
  });
});

describe('Issue #15: Reactions, Quote Replies, Receipts & Typing', () => {
  it('toggles reactions and aggregates count per emoji', () => {
    let msg = { id: 'm-1', text: 'Hey there', reactions: {} };
    msg = toggleReaction(msg, 'did:sonaraim:alice', '👍');
    assert.deepEqual(msg.reactions['👍'], ['did:sonaraim:alice']);

    msg = toggleReaction(msg, 'did:sonaraim:bob', '👍');
    assert.deepEqual(msg.reactions['👍'], ['did:sonaraim:alice', 'did:sonaraim:bob']);

    msg = toggleReaction(msg, 'did:sonaraim:alice', '👍');
    assert.deepEqual(msg.reactions['👍'], ['did:sonaraim:bob']);
  });

  it('builds quote reply referencing target message', () => {
    const original = { id: 'm-42', sender: 'did:sonaraim:alice', text: 'Original proposal' };
    const reply = buildQuoteReply({
      targetMessage: original,
      senderDid: 'did:sonaraim:bob',
      replyText: 'Looks great to me!',
    });
    assert.equal(reply.quote.id, 'm-42');
    assert.equal(reply.quote.senderDid, 'did:sonaraim:alice');
    assert.equal(reply.receiptStatus, 'sent');
  });

  it('advances receipt status and sends relay signals', async () => {
    assert.equal(advanceReceiptStatus('sent'), 'delivered');
    assert.equal(advanceReceiptStatus('delivered'), 'read');
    assert.equal(advanceReceiptStatus('read'), 'read');

    const mockFetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ success: true, signal_id: 'sig-99' }),
    });

    const res = await sendRelaySignal({
      nodeApiUrl: 'http://node.test',
      senderDid: 'did:sonaraim:alice',
      recipientDid: 'did:sonaraim:bob',
      signalType: 'typing',
      payload: { is_typing: true },
      fetchFn: mockFetch,
    });
    assert.equal(res.success, true);
  });
});

describe('Issue #16: 24h Status/Stories & Silent Push Registration', () => {
  it('creates status and filters out items older than 24 hours (86400s)', () => {
    const now = 1_700_000_000_000;
    const fresh = createStatusItem({
      authorDid: 'did:sonaraim:alice',
      text: 'Sunny day!',
      timestamp: now,
    });
    const expired = createStatusItem({
      authorDid: 'did:sonaraim:bob',
      text: 'Yesterday update',
      timestamp: now - 86_400_000 - 1000,
    });

    assert.equal(fresh.expiresAt, now + 86_400_000);
    const active = filterActiveStatuses([fresh, expired], now);
    assert.equal(active.length, 1);
    assert.equal(active[0].authorDid, 'did:sonaraim:alice');
  });

  it('derives blind push wake token and registers with node relay', async () => {
    const token = await deriveBlindPushToken('mailbox-123', 'env-456', 1700000000);
    assert.match(token, /^wake_[0-9a-f]{32}$/);

    const mockFetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({ registered: true, blind_token: token }),
    });

    const res = await registerPushToken({
      nodeApiUrl: 'http://node.test',
      userDid: 'did:sonaraim:alice',
      pushToken: token,
      platform: 'expo',
      fetchFn: mockFetch,
    });
    assert.equal(res.registered, true);
  });
});

describe('Issue #17: EAS Native Builds & Call Controls', () => {
  it('verifies eas.json has development, preview, and production profiles', () => {
    const easPath = path.resolve(__dirname, '../eas.json');
    assert.ok(fs.existsSync(easPath), 'eas.json must exist in mobile/');
    const easContent = JSON.parse(fs.readFileSync(easPath, 'utf8'));

    assert.ok(easContent.build?.development);
    assert.ok(easContent.build?.preview);
    assert.ok(easContent.build?.production);
    assert.equal(easContent.build.production.android?.buildType, 'app-bundle');
  });

  it('resolves in-app call control actions for mic, camera, and speaker', () => {
    let state = initialCallControlsState();
    assert.equal(state.isMuted, false);
    assert.equal(state.isCameraOn, true);
    assert.equal(state.cameraFacing, 'front');
    assert.equal(state.isSpeakerOn, false);

    state = resolveCallControlAction(state, 'toggle_mute');
    assert.equal(state.isMuted, true);
    state = resolveCallControlAction(state, 'toggle_camera');
    assert.equal(state.isCameraOn, false);
    state = resolveCallControlAction(state, 'switch_camera');
    assert.equal(state.cameraFacing, 'back');
    state = resolveCallControlAction(state, 'toggle_speaker');
    assert.equal(state.isSpeakerOn, true);
  });
});
