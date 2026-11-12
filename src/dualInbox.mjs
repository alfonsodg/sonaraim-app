/**
 * @fileoverview Dual Inbox Router and ConsentToken state manager for SonarAIM Client.
 * Classifies incoming MLS envelopes into PERSONAL vs SERVICES inbox streams based on
 * sender DID (`did:sonaraim:` peer vs verified `did:web:` business) and enforces
 * per-merchant ConsentToken revocation rules.
 */

/**
 * Default configuration resolver reading from environment variables with safe fallbacks.
 * @param {Record<string, string | undefined>} [env] - Environment source dictionary.
 * @returns {{
 *   personalStream: string,
 *   servicesStream: string,
 *   peerDidPrefix: string,
 *   merchantDidPrefix: string,
 *   requireConsentForServices: boolean
 * }}
 */
export function resolveInboxConfig(env = process.env) {
  return {
    personalStream: env.SONARAIM_INBOX_PERSONAL_STREAM || 'PERSONAL',
    servicesStream: env.SONARAIM_INBOX_SERVICES_STREAM || 'SERVICES',
    peerDidPrefix: env.SONARAIM_PEER_DID_PREFIX || 'did:sonaraim:',
    merchantDidPrefix: env.SONARAIM_MERCHANT_DID_PREFIX || 'did:web:',
    requireConsentForServices: (env.SONARAIM_REQUIRE_CONSENT_FOR_SERVICES ?? 'true') !== 'false'
  };
}

/**
 * Stateful Dual Inbox router that separates human peer conversations from verified B2B services
 * and manages merchant ConsentToken grants and revocations.
 */
export class DualInboxRouter {
  /**
   * Creates a new DualInboxRouter instance.
   * @param {Partial<ReturnType<typeof resolveInboxConfig>>} [options] - Custom routing configuration.
   */
  constructor(options = {}) {
    const defaults = resolveInboxConfig();
    this.config = { ...defaults, ...options };
    /** @type {Map<string, { tokenId: string, merchantDid: string, scopes: string[], expiresAt: number, revokedAt: number | null }>} */
    this.consentRegistry = new Map();
  }

  /**
   * Registers or updates an active merchant ConsentToken.
   * @param {{
   *   tokenId: string,
   *   merchantDid: string,
   *   scopes?: string[],
   *   expiresAt: number
   * }} token - ConsentToken descriptor granted by the user.
   * @returns {{ tokenId: string, merchantDid: string, scopes: string[], expiresAt: number, revokedAt: null }}
   */
  grantConsent(token) {
    if (!token || typeof token.tokenId !== 'string' || !token.tokenId.trim()) {
      throw new Error('Invalid ConsentToken: tokenId is required');
    }
    if (typeof token.merchantDid !== 'string' || !token.merchantDid.startsWith(this.config.merchantDidPrefix)) {
      throw new Error(`Invalid ConsentToken: merchantDid must start with ${this.config.merchantDidPrefix}`);
    }
    if (typeof token.expiresAt !== 'number' || Number.isNaN(token.expiresAt)) {
      throw new Error('Invalid ConsentToken: numeric expiresAt timestamp is required');
    }

    const record = {
      tokenId: token.tokenId,
      merchantDid: token.merchantDid,
      scopes: Array.isArray(token.scopes) ? [...token.scopes] : ['services:message'],
      expiresAt: token.expiresAt,
      revokedAt: null
    };
    this.consentRegistry.set(token.merchantDid, record);
    return { ...record };
  }

  /**
   * Revokes consent for a specific merchant DID immediately.
   * @param {string} merchantDid - The merchant DID (`did:web:...`) to revoke.
   * @param {number} [revokedAt] - Timestamp of revocation in epoch milliseconds.
   * @returns {boolean} True if an existing grant was revoked, false if not found.
   */
  revokeConsent(merchantDid, revokedAt = Date.now()) {
    const existing = this.consentRegistry.get(merchantDid);
    if (!existing) {
      return false;
    }
    existing.revokedAt = revokedAt;
    this.consentRegistry.set(merchantDid, existing);
    return true;
  }

  /**
   * Checks whether a merchant DID currently holds an active, unrevoked ConsentToken.
   * @param {string} merchantDid - Merchant DID to inspect.
   * @param {number} [now] - Current timestamp in epoch milliseconds.
   * @returns {{ valid: boolean, reason?: string, tokenId?: string }}
   */
  verifyConsent(merchantDid, now = Date.now()) {
    const record = this.consentRegistry.get(merchantDid);
    if (!record) {
      return { valid: false, reason: 'CONSENT_NOT_FOUND' };
    }
    if (record.revokedAt !== null) {
      return { valid: false, reason: 'CONSENT_REVOKED', tokenId: record.tokenId };
    }
    if (now >= record.expiresAt) {
      return { valid: false, reason: 'CONSENT_EXPIRED', tokenId: record.tokenId };
    }
    return { valid: true, tokenId: record.tokenId };
  }

  /**
   * Classifies and validates an incoming MLS envelope into PERSONAL or SERVICES streams.
   * @param {{
   *   envelopeId: string,
   *   senderDid: string,
   *   mlsGroupId: string,
   *   verifiedDidWeb?: boolean,
   *   consentTokenId?: string,
   *   timestamp?: number,
   *   payload: unknown
   * }} envelope - Incoming MLS envelope metadata and decrypted payload.
   * @param {number} [now] - Current evaluation timestamp in epoch milliseconds.
   * @returns {{
   *   accepted: boolean,
   *   stream: string | null,
   *   envelopeId: string,
   *   senderDid: string,
   *   reason?: string
   * }}
   */
  routeEnvelope(envelope, now = Date.now()) {
    if (!envelope || typeof envelope.envelopeId !== 'string' || !envelope.envelopeId.trim()) {
      throw new Error('Invalid MLS envelope: envelopeId is required');
    }
    if (typeof envelope.senderDid !== 'string' || !envelope.senderDid.trim()) {
      throw new Error('Invalid MLS envelope: senderDid is required');
    }

    const { senderDid, envelopeId } = envelope;

    // Route 1: Sovereign peer-to-peer human messaging (`did:sonaraim:...`)
    if (senderDid.startsWith(this.config.peerDidPrefix)) {
      return {
        accepted: true,
        stream: this.config.personalStream,
        envelopeId,
        senderDid
      };
    }

    // Route 2: Verified business/institution messaging (`did:web:...`)
    if (senderDid.startsWith(this.config.merchantDidPrefix)) {
      if (envelope.verifiedDidWeb !== true) {
        return {
          accepted: false,
          stream: null,
          envelopeId,
          senderDid,
          reason: 'UNVERIFIED_MERCHANT_DID'
        };
      }

      if (this.config.requireConsentForServices) {
        const consentStatus = this.verifyConsent(senderDid, now);
        if (!consentStatus.valid) {
          return {
            accepted: false,
            stream: null,
            envelopeId,
            senderDid,
            reason: consentStatus.reason
          };
        }
        if (envelope.consentTokenId && envelope.consentTokenId !== consentStatus.tokenId) {
          return {
            accepted: false,
            stream: null,
            envelopeId,
            senderDid,
            reason: 'CONSENT_TOKEN_MISMATCH'
          };
        }
      }

      return {
        accepted: true,
        stream: this.config.servicesStream,
        envelopeId,
        senderDid
      };
    }

    return {
      accepted: false,
      stream: null,
      envelopeId,
      senderDid,
      reason: 'UNSUPPORTED_DID_METHOD'
    };
  }
}
