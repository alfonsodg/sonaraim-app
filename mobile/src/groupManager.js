/**
 * @fileoverview MLS (RFC 9420-style) E2EE Group Ratchet and Messaging Manager.
 * Aligned with `sonaraim-protocol/src/mls_group.rs` epoch key evolution and transcript digests.
 * Uses WebCrypto (`globalThis.crypto.subtle`) and `Uint8Array` for Hermes/Metro compatibility.
 */

import {
  bytesToHex,
  concatBytes,
  decodeUtf8,
  decryptAesGcm,
  encodeUtf8,
  encryptAesGcm,
  hexToBytes,
  hmacSha256Bytes,
  randomBytes,
  sha256Bytes,
} from './cryptoUtils.js';

/**
 * Encodes a 64-bit unsigned integer into an 8-byte big-endian `Uint8Array`.
 *
 * @param {number} num - Epoch counter.
 * @returns {Uint8Array} 8-byte big-endian byte array.
 */
function toEpochBytes(num) {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt(num), false);
  return bytes;
}

/**
 * Advances group epoch key and transcript digest for a membership change event.
 *
 * @param {Record<string, any>} groupState - Current group state.
 * @param {Array<string>} newMembers - Updated member list for the next epoch.
 * @param {string} eventTag - Membership event label (`add:<did>` or `remove:<did>`).
 * @returns {Promise<Record<string, any>>} Updated group state at `epoch + 1`.
 */
async function ratchetGroupEpoch(groupState, newMembers, eventTag) {
  const nextEpoch = groupState.epoch + 1;
  const epochBytes = toEpochBytes(nextEpoch);
  const eventBytes = encodeUtf8(eventTag);

  const prevKey = hexToBytes(groupState.currentEpochKeyHex);
  const context = concatBytes(encodeUtf8(groupState.groupId), epochBytes, eventBytes);
  const nextKey = await hmacSha256Bytes(prevKey, context);

  const prevTranscript = hexToBytes(groupState.transcriptDigestHex);
  const chainInput = concatBytes(prevTranscript, epochBytes, eventBytes);
  const nextTranscript = await sha256Bytes(chainInput);

  const nextKeyHex = bytesToHex(nextKey);
  const nextTranscriptHex = bytesToHex(nextTranscript);

  return {
    ...groupState,
    epoch: nextEpoch,
    members: newMembers,
    currentEpochKeyHex: nextKeyHex,
    transcriptDigestHex: nextTranscriptHex,
    epochKeys: {
      ...groupState.epochKeys,
      [nextEpoch]: nextKeyHex,
    },
    epochMembers: {
      ...groupState.epochMembers,
      [nextEpoch]: [...newMembers],
    },
  };
}

/**
 * Creates a new MLS-ratcheted E2EE group at epoch 0.
 *
 * @param {{
 *   groupId: string,
 *   creatorDid: string,
 *   title?: string,
 *   initialMembers?: Array<string>
 * }} params - Group initialization parameters.
 * @returns {Promise<Record<string, any>>} Initialized group state object.
 */
export async function createGroup({
  groupId,
  creatorDid,
  title = 'E2EE Group',
  initialMembers = [],
}) {
  const cleanId = String(groupId || '').trim();
  const cleanCreator = String(creatorDid || '').trim();
  if (!cleanId || !cleanCreator) {
    throw new Error('groupId and creatorDid are required');
  }

  const memberSet = new Set([cleanCreator, ...initialMembers.map(String)]);
  const members = Array.from(memberSet);

  const seedKey = await hmacSha256Bytes(encodeUtf8(cleanId), encodeUtf8(cleanCreator));
  const initTranscript = concatBytes(
    encodeUtf8('sonaraim-mls-transcript-v1:'),
    encodeUtf8(cleanId),
    encodeUtf8(':'),
    encodeUtf8(cleanCreator)
  );
  const transcriptDigest = await sha256Bytes(initTranscript);

  const seedKeyHex = bytesToHex(seedKey);
  const transcriptDigestHex = bytesToHex(transcriptDigest);

  return {
    groupId: cleanId,
    title: String(title || 'E2EE Group'),
    epoch: 0,
    members,
    currentEpochKeyHex: seedKeyHex,
    transcriptDigestHex,
    epochKeys: { 0: seedKeyHex },
    epochMembers: { 0: [...members] },
    messages: [],
  };
}

/**
 * Adds a new member to the group, ratcheting key and advancing epoch.
 *
 * @param {Record<string, any>} groupState - Current group state.
 * @param {string} newMemberDid - DID to add.
 * @returns {Promise<Record<string, any>>} Updated group state.
 */
export async function addGroupMember(groupState, newMemberDid) {
  const did = String(newMemberDid || '').trim();
  if (groupState.members.includes(did)) {
    throw new Error(`Member already in group: ${did}`);
  }
  const newMembers = [...groupState.members, did];
  return ratchetGroupEpoch(groupState, newMembers, `add:${did}`);
}

/**
 * Removes a member from the group, ratcheting key to prevent forward decryption.
 *
 * @param {Record<string, any>} groupState - Current group state.
 * @param {string} memberDid - DID to remove.
 * @returns {Promise<Record<string, any>>} Updated group state.
 */
export async function removeGroupMember(groupState, memberDid) {
  const did = String(memberDid || '').trim();
  if (!groupState.members.includes(did)) {
    throw new Error(`DID is not an active member: ${did}`);
  }
  const newMembers = groupState.members.filter((m) => m !== did);
  return ratchetGroupEpoch(groupState, newMembers, `remove:${did}`);
}

/**
 * Appends and encrypts an application message for the current epoch.
 *
 * @param {Record<string, any>} groupState - Group state.
 * @param {{ senderDid: string, text: string, mediaPointer?: any }} params - Message parameters.
 * @returns {Promise<Record<string, any>>} Encrypted message envelope.
 */
export async function appendGroupMessage(groupState, { senderDid, text, mediaPointer = null }) {
  if (!groupState.members.includes(senderDid)) {
    throw new Error(`Sender is not an active member: ${senderDid}`);
  }

  const epoch = groupState.epoch;
  const keyBytes = hexToBytes(groupState.epochKeys[epoch]);
  const ivBytes = randomBytes(12);
  const aad = encodeUtf8(`${groupState.groupId}:${epoch}`);

  const { ciphertext, authTag } = await encryptAesGcm({
    keyBytes,
    ivBytes,
    plaintextBytes: encodeUtf8(text),
    additionalDataBytes: aad,
  });

  const message = {
    id: `grp-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    groupId: groupState.groupId,
    epoch,
    senderDid,
    text,
    ciphertextHex: bytesToHex(ciphertext),
    authTagHex: bytesToHex(authTag),
    ivHex: bytesToHex(ivBytes),
    mediaPointer,
    timestamp: Date.now(),
  };

  groupState.messages.push(message);
  return message;
}

/**
 * Decrypts a group application message if requester was a member at message epoch.
 *
 * @param {Record<string, any>} groupState - Group state.
 * @param {Record<string, any>} message - Message envelope.
 * @param {string} requesterDid - DID requesting decryption.
 * @returns {Promise<string>} Decrypted plaintext text.
 */
export async function decryptGroupMessage(groupState, message, requesterDid) {
  const allowed = groupState.epochMembers[message.epoch];
  if (!allowed || !allowed.includes(requesterDid)) {
    throw new Error(`Requester is not authorized to decrypt epoch ${message.epoch}`);
  }

  const keyHex = groupState.epochKeys[message.epoch];
  if (!keyHex) {
    throw new Error(`Unknown epoch key for epoch ${message.epoch}`);
  }

  const decrypted = await decryptAesGcm({
    keyBytes: hexToBytes(keyHex),
    ivBytes: hexToBytes(message.ivHex),
    ciphertextBytes: hexToBytes(message.ciphertextHex),
    authTagBytes: hexToBytes(message.authTagHex),
    additionalDataBytes: encodeUtf8(`${message.groupId}:${message.epoch}`),
  });
  return decodeUtf8(decrypted);
}
