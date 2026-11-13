/**
 * @fileoverview MLS (RFC 9420-style) E2EE Group Ratchet and Messaging Manager.
 * Aligned with `sonaraim-protocol/src/mls_group.rs` epoch key evolution and transcript digests.
 */

import crypto from 'node:crypto';

/**
 * Encodes a 64-bit unsigned integer into an 8-byte big-endian Buffer.
 *
 * @param {number} num - Epoch counter.
 * @returns {Buffer} 8-byte big-endian buffer.
 */
function toEpochBuffer(num) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(num), 0);
  return buf;
}

/**
 * Creates a new MLS-ratcheted E2EE group at epoch 0.
 *
 * @param {{
 *   groupId: string,
 *   creatorDid: string,
 *   title?: string,
 *   initialMembers?: Array<string>
 * }} params
 * @returns {Record<string, any>} Initialized group state object.
 */
export function createGroup({
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

  const seedKey = crypto
    .createHmac('sha256', Buffer.from(cleanId, 'utf8'))
    .update(Buffer.from(cleanCreator, 'utf8'))
    .digest();

  const initTranscript = Buffer.concat([
    Buffer.from('sonaraim-mls-transcript-v1:', 'utf8'),
    Buffer.from(cleanId, 'utf8'),
    Buffer.from(':', 'utf8'),
    Buffer.from(cleanCreator, 'utf8'),
  ]);
  const transcriptDigest = crypto.createHash('sha256').update(initTranscript).digest();

  return {
    groupId: cleanId,
    title: String(title || 'E2EE Group'),
    epoch: 0,
    members,
    currentEpochKeyHex: seedKey.toString('hex'),
    transcriptDigestHex: transcriptDigest.toString('hex'),
    epochKeys: { 0: seedKey.toString('hex') },
    epochMembers: { 0: [...members] },
    messages: [],
  };
}

/**
 * Adds a new member to the group, ratcheting key and advancing epoch.
 *
 * @param {Record<string, any>} groupState - Current group state.
 * @param {string} newMemberDid - DID to add.
 * @returns {Record<string, any>} Updated group state.
 */
export function addGroupMember(groupState, newMemberDid) {
  const did = String(newMemberDid || '').trim();
  if (groupState.members.includes(did)) {
    throw new Error(`Member already in group: ${did}`);
  }

  const nextEpoch = groupState.epoch + 1;
  const newMembers = [...groupState.members, did];
  const eventBytes = Buffer.from(`add:${did}`, 'utf8');

  const prevKey = Buffer.from(groupState.currentEpochKeyHex, 'hex');
  const context = Buffer.concat([
    Buffer.from(groupState.groupId, 'utf8'),
    toEpochBuffer(nextEpoch),
    eventBytes,
  ]);
  const nextKey = crypto.createHmac('sha256', prevKey).update(context).digest();

  const prevTranscript = Buffer.from(groupState.transcriptDigestHex, 'hex');
  const chainInput = Buffer.concat([
    prevTranscript,
    toEpochBuffer(nextEpoch),
    eventBytes,
  ]);
  const nextTranscript = crypto.createHash('sha256').update(chainInput).digest();

  return {
    ...groupState,
    epoch: nextEpoch,
    members: newMembers,
    currentEpochKeyHex: nextKey.toString('hex'),
    transcriptDigestHex: nextTranscript.toString('hex'),
    epochKeys: {
      ...groupState.epochKeys,
      [nextEpoch]: nextKey.toString('hex'),
    },
    epochMembers: {
      ...groupState.epochMembers,
      [nextEpoch]: [...newMembers],
    },
  };
}

/**
 * Removes a member from the group, ratcheting key to prevent forward decryption.
 *
 * @param {Record<string, any>} groupState - Current group state.
 * @param {string} memberDid - DID to remove.
 * @returns {Record<string, any>} Updated group state.
 */
export function removeGroupMember(groupState, memberDid) {
  const did = String(memberDid || '').trim();
  if (!groupState.members.includes(did)) {
    throw new Error(`DID is not an active member: ${did}`);
  }

  const nextEpoch = groupState.epoch + 1;
  const newMembers = groupState.members.filter((m) => m !== did);
  const eventBytes = Buffer.from(`remove:${did}`, 'utf8');

  const prevKey = Buffer.from(groupState.currentEpochKeyHex, 'hex');
  const context = Buffer.concat([
    Buffer.from(groupState.groupId, 'utf8'),
    toEpochBuffer(nextEpoch),
    eventBytes,
  ]);
  const nextKey = crypto.createHmac('sha256', prevKey).update(context).digest();

  const prevTranscript = Buffer.from(groupState.transcriptDigestHex, 'hex');
  const chainInput = Buffer.concat([
    prevTranscript,
    toEpochBuffer(nextEpoch),
    eventBytes,
  ]);
  const nextTranscript = crypto.createHash('sha256').update(chainInput).digest();

  return {
    ...groupState,
    epoch: nextEpoch,
    members: newMembers,
    currentEpochKeyHex: nextKey.toString('hex'),
    transcriptDigestHex: nextTranscript.toString('hex'),
    epochKeys: {
      ...groupState.epochKeys,
      [nextEpoch]: nextKey.toString('hex'),
    },
    epochMembers: {
      ...groupState.epochMembers,
      [nextEpoch]: [...newMembers],
    },
  };
}

/**
 * Appends and encrypts an application message for the current epoch.
 *
 * @param {Record<string, any>} groupState - Group state.
 * @param {{ senderDid: string, text: string, mediaPointer?: any }} params
 * @returns {Record<string, any>} Encrypted message envelope.
 */
export function appendGroupMessage(groupState, { senderDid, text, mediaPointer = null }) {
  if (!groupState.members.includes(senderDid)) {
    throw new Error(`Sender is not an active member: ${senderDid}`);
  }

  const epoch = groupState.epoch;
  const keyBuffer = Buffer.from(groupState.epochKeys[epoch], 'hex');
  const ivBuffer = crypto.randomBytes(12);
  const aad = Buffer.from(`${groupState.groupId}:${epoch}`, 'utf8');

  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, ivBuffer);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(text, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const message = {
    id: `grp-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    groupId: groupState.groupId,
    epoch,
    senderDid,
    text,
    ciphertextHex: ciphertext.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ivHex: ivBuffer.toString('hex'),
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
 * @returns {string} Decrypted plaintext text.
 */
export function decryptGroupMessage(groupState, message, requesterDid) {
  const allowed = groupState.epochMembers[message.epoch];
  if (!allowed || !allowed.includes(requesterDid)) {
    throw new Error(`Requester is not authorized to decrypt epoch ${message.epoch}`);
  }

  const keyHex = groupState.epochKeys[message.epoch];
  if (!keyHex) {
    throw new Error(`Unknown epoch key for epoch ${message.epoch}`);
  }

  const keyBuffer = Buffer.from(keyHex, 'hex');
  const ivBuffer = Buffer.from(message.ivHex, 'hex');
  const authTag = Buffer.from(message.authTagHex, 'hex');
  const ciphertext = Buffer.from(message.ciphertextHex, 'hex');
  const aad = Buffer.from(`${message.groupId}:${message.epoch}`, 'utf8');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
