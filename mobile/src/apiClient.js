/**
 * @fileoverview HTTP API client for Sonaraim React Native Mobile App.
 * Interfaces with `sonaraim-app-web` and `sonaraim-node` endpoints for phone registration,
 * companion device pairing, Dual Inbox messaging, LiveKit call tokens, and PSI contact matching.
 */

import { resolveMobileConfig, requireMobileEnvUrl } from './config.js';

/**
 * Normalizes an international phone number to strict E.164 format.
 *
 * @param {string} rawPhone - Raw input phone string (e.g. `+1 (415) 555-2671`).
 * @returns {string} E.164 phone string starting with `+`.
 * @throws {Error} If phone number cannot be formatted to E.164.
 */
export function normalizeE164(rawPhone) {
  const input = String(rawPhone ?? '').trim();
  if (!input) {
    throw new Error('Phone number cannot be empty');
  }

  const cleaned = input.replace(/[\s\-().]/g, '');
  const formatted = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;

  if (!/^\+[1-9]\d{6,14}$/.test(formatted)) {
    throw new Error(`Invalid E.164 phone number: "${rawPhone}"`);
  }

  return formatted;
}

/**
 * Creates a configured Sonaraim Mobile API client instance.
 *
 * @param {Partial<ReturnType<typeof resolveMobileConfig>>} [customConfig] - Optional config overrides.
 * @param {{ fetch?: typeof fetch }} [dependencies] - Injected fetch implementation (useful for tests).
 */
export function createApiClient(customConfig = {}, dependencies = {}) {
  const safeCustom = customConfig && typeof customConfig === 'object' ? customConfig : {};
  const config = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop in safeCustom && safeCustom[prop] !== undefined) {
          return safeCustom[prop];
        }
        if (prop === 'requestTimeoutMs') {
          const parsed = Number.parseInt(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS || '8000', 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
        }
        return resolveMobileConfig()[prop];
      },
    }
  );
  const fetchFn = dependencies.fetch || globalThis.fetch;

  if (typeof fetchFn !== 'function') {
    throw new Error('Fetch implementation is not available in the current environment');
  }

  /**
   * Internal JSON fetch helper with timeout and standardized error handling.
   *
   * @param {string} url - Target URL.
   * @param {RequestInit} [options] - Fetch options.
   * @returns {Promise<any>} Parsed JSON response.
   */
  async function requestJson(url, options = {}) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const timeoutMs = options.signal ? undefined : config.requestTimeoutMs;
    const signal = options.signal || (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined);

    const res = await fetchFn(url, {
      ...options,
      headers,
      signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { rawText: text };
    }

    if (!res.ok) {
      const errMessage = (data && data.error) || (data && data.message) || `HTTP error ${res.status}`;
      const err = new Error(errMessage);
      /** @type {any} */ (err).status = res.status;
      /** @type {any} */ (err).data = data;
      throw err;
    }

    return data;
  }

  return {
    config,

    /**
     * Registers an E.164 phone identity on the app web server and node relay.
     *
     * @param {string} phone - Target phone number in E.164 format.
     * @returns {Promise<{ phone: string, userDid: string, blindedToken: string, status: string }>}
     */
    async registerPhone(phone) {
      const normalized = normalizeE164(phone);
      return requestJson(`${config.appApiUrl}/auth/phone/register`, {
        method: 'POST',
        body: JSON.stringify({ phone: normalized }),
      });
    },

    /**
     * Generates a 6-digit companion device pairing session and QR URI.
     *
     * @param {string} userDid - Owner user DID (e.g. `did:sonaraim:+14155552671`).
     * @returns {Promise<{ status: string, pairingCode: string, pairingUri: string, userDid: string, expiresAt: string }>}
     */
    async createPairingSession(userDid) {
      return requestJson(`${config.appApiUrl}/auth/devices/pair`, {
        method: 'POST',
        body: JSON.stringify({ userDid }),
      });
    },

    /**
     * Redeems and verifies a 6-digit companion device pairing code.
     *
     * @param {string} pairingCode - 6-digit verification code.
     * @returns {Promise<{ status: string, valid: boolean, userDid: string, pairedAt: string }>}
     */
    async verifyPairingCode(pairingCode) {
      return requestJson(`${config.appApiUrl}/auth/devices/pair`, {
        method: 'POST',
        body: JSON.stringify({ pairingCode: String(pairingCode).trim() }),
      });
    },

    /**
     * Fetches mailbox envelopes / items for a given DID or mailbox identifier.
     *
     * @param {string} mailboxId - Target mailbox DID.
     * @returns {Promise<{ mailbox_id?: string, items?: Array<any>, envelopes?: Array<any> }>}
     */
    async fetchInboxMailbox(mailboxId) {
      const id = encodeURIComponent(String(mailboxId).trim());
      // Try node API endpoint first, fallback to app server /api/mailbox/:id
      const primaryUrl = `${config.nodeApiUrl}/api/mailbox/${id}`;
      try {
        return await requestJson(primaryUrl, { method: 'GET' });
      } catch (err) {
        // Fallback to app server proxy
        const fallbackUrl = `${config.appApiUrl}/api/mailbox/${id}`;
        return requestJson(fallbackUrl, { method: 'GET' });
      }
    },

    /**
     * Sends an encrypted P2P message envelope via `POST /inbox/messages`.
     *
     * @param {{ senderDid: string, recipientDid: string, text: string }} payload
     * @returns {Promise<{ status: string, envelopeId: string, recipientDid: string }>}
     */
    async sendP2pMessage(payload) {
      return requestJson(`${config.appApiUrl}/inbox/messages`, {
        method: 'POST',
        body: JSON.stringify({
          senderDid: payload.senderDid,
          recipientDid: payload.recipientDid,
          text: payload.text,
        }),
      });
    },

    /**
     * Requests a cryptographically signed LiveKit call room token from the web server.
     *
     * @param {{ roomName?: string, participantDid?: string }} [params]
     * @returns {Promise<{ roomName: string, participantDid: string, serverUrl: string, token: string }>}
     */
    async fetchCallToken(params = {}) {
      return requestJson(`${config.appApiUrl}/api/calls/token`, {
        method: 'POST',
        body: JSON.stringify({
          roomName: params.roomName || 'sonaraim-secure-room',
          participantDid: params.participantDid || 'did:sonaraim:mobile-user',
        }),
      });
    },

    /**
     * Queries Private Set Intersection (PSI) blind matches from the node relay or app server.
     *
     * @param {Array<string>} blindedHashes - Array of blinded identifier hashes.
     * @param {string} [domainSalt] - PSI domain separation salt.
     * @returns {Promise<{ matched_hashes?: Array<string>, matchedContacts?: Array<string> }>}
     */
    async blindMatchPsi(blindedHashes, domainSalt = config.domainSalt) {
      const nodeUrl = `${config.nodeApiUrl}/v1/psi/blind-match`;
      try {
        return await requestJson(nodeUrl, {
          method: 'POST',
          body: JSON.stringify({
            blinded_hashes: blindedHashes,
            domain_salt: domainSalt,
          }),
        });
      } catch {
        // Fallback to app discovery route
        return requestJson(`${config.appApiUrl}/api/contacts/discover`, {
          method: 'POST',
          body: JSON.stringify({
            identifiers: blindedHashes,
            domainSalt: domainSalt,
          }),
        });
      }
    },
  };
}

/**
 * Builds an external LiveKit Meet / WebRTC join URL from a LiveKit server URL and JWT token.
 *
 * @param {{
 *   serverUrl: string,
 *   token: string,
 *   roomName?: string,
 *   meetBaseUrl?: string
 * }} params
 * @returns {string} Joinable LiveKit Meet URL.
 */
export function buildLiveKitJoinUrl({
  serverUrl,
  token,
  meetBaseUrl,
} = {}) {
  const cleanServer = String(serverUrl || '').trim();
  const cleanToken = String(token || '').trim();
  if (!cleanServer || !cleanToken) {
    throw new Error('serverUrl and token are required');
  }
  const resolvedBase =
    String(meetBaseUrl || '').trim() ||
    requireMobileEnvUrl(['EXPO_PUBLIC_LIVEKIT_MEET_URL', 'LIVEKIT_MEET_URL'], 'livekitMeetUrl');
  const base = resolvedBase.replace(/\/+$/, '');
  const query = new URLSearchParams({
    liveKitUrl: cleanServer,
    token: cleanToken,
  });
  return `${base}?${query.toString()}`;
}

/**
 * Singleton API client instance for application screens.
 */
export const apiClient = createApiClient();
