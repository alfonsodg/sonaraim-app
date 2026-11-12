/**
 * @fileoverview Private Contact Discovery (PSI) client utilities.
 * Blinds local contact identifiers with domain-separated SHA-256 before intersection.
 */

import { createHash } from 'node:crypto';

/**
 * Computes a domain-separated SHA-256 blinded digest for a contact identifier.
 *
 * @param {string} identifier - Normalized phone number or handle.
 * @param {string} domainSalt - Protocol PSI epoch or domain separator.
 * @returns {string} 64-character lowercase hex digest.
 */
export function blindContactIdentifier(identifier, domainSalt) {
  const normalized = String(identifier ?? '').trim();
  if (!normalized) {
    throw new Error('Contact identifier cannot be empty');
  }
  const salt = String(domainSalt ?? '').trim();
  if (!salt) {
    throw new Error('PSI domain salt cannot be empty');
  }
  return createHash('sha256').update(`${salt}|${normalized}`).digest('hex');
}

/**
 * Intersects local contact identifiers against a remote set of blinded digests.
 *
 * @param {string[]} localIdentifiers - User's local contact handles/phones.
 * @param {string[]} remoteBlindedDigests - Blinded digests returned by `sonaraim-node`.
 * @param {string} domainSalt - Protocol PSI epoch or domain separator.
 * @returns {string[]} Local identifiers that matched the remote blinded set.
 */
export function intersectDiscoveredContacts(localIdentifiers, remoteBlindedDigests, domainSalt) {
  const remoteSet = new Set(remoteBlindedDigests ?? []);
  const matched = [];
  for (const id of localIdentifiers ?? []) {
    const blinded = blindContactIdentifier(id, domainSalt);
    if (remoteSet.has(blinded)) {
      matched.push(id);
    }
  }
  return matched;
}
