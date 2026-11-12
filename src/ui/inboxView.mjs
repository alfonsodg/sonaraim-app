/**
 * @fileoverview Dual Inbox & Declarative Card UI renderer separating Personal (`did:sonaraim`)
 * and Verified Services (`did:web`) streams with companion device pairing and P2P messaging.
 */

import { escapeHtml, renderAppShell } from './htmlUtils.mjs';

/**
 * Renders the Dual Inbox HTML view with strict escaping of message previews, interactive
 * card action forms, 1-tap consent revocation, and 6-digit companion device pairing controls.
 *
 * @param {object} [state] - Inbox snapshot.
 * @param {Array<{from: string, preview: string}>} [state.personalMessages]
 * @param {Array<{tenantDid: string, title: string, actions?: string[], clipToken?: string}>} [state.serviceCards]
 * @param {{tenantDid: string, revokedAt: string}} [state.revocationReceipt] - Optional consent revocation receipt.
 * @param {string} [state.linkedPhone] - Optional registered E.164 phone number.
 * @param {{ pairingCode: string, pairingUri: string }} [state.pairingSession] - Optional active device pairing session.
 * @returns {string} Complete HTML5 document.
 */
export function renderInboxView({
  personalMessages = [],
  serviceCards = [],
  revocationReceipt = null,
  linkedPhone = null,
  pairingSession = null,
} = {}) {
  const bannerHtml = revocationReceipt
    ? `<div class="banner" role="status" aria-live="polite">
        <strong>Consent revoked for</strong> <code>${escapeHtml(revocationReceipt.tenantDid)}</code>
        at <code>${escapeHtml(revocationReceipt.revokedAt)}</code>
      </div>`
    : '';

  const personalRows = personalMessages
    .map(
      (msg) =>
        `<li><strong>${escapeHtml(msg.from)}</strong>: <span>${escapeHtml(msg.preview)}</span></li>`
    )
    .join('');

  const sendFormHtml = `
    <form method="POST" action="/inbox/messages" style="display:flex; flex-direction:column; gap:0.5rem; margin-top:1rem;">
      <input type="text" name="recipientDid" placeholder="Recipient DID (e.g. did:sonaraim:bob)" required />
      <input type="text" name="text" placeholder="Type an encrypted message..." required />
      <button type="submit" style="align-self:flex-start;">Send Message</button>
    </form>`;

  const serviceRows = serviceCards
    .map((card) => {
      const safeTenant = escapeHtml(card.tenantDid);
      const safeClipToken = escapeHtml(card.clipToken ?? 'inbox_card');
      const actionForms = (card.actions ?? [])
        .map((act) => {
          const safeAct = escapeHtml(act);
          return `<form method="POST" action="/c/${safeClipToken}/act">
            <input type="hidden" name="action" value="${safeAct}" />
            <input type="hidden" name="tenantDid" value="${safeTenant}" />
            <button type="submit">${safeAct}</button>
          </form>`;
        })
        .join(' ');

      const revokeForm = `<form method="POST" action="/inbox/consent/revoke">
        <input type="hidden" name="tenantDid" value="${safeTenant}" />
        <button type="submit">Revoke Consent</button>
      </form>`;

      return `<article style="margin-bottom:1rem; border-top:1px solid #1f2937; padding-top:0.75rem;">
        <h3>${escapeHtml(card.title)}</h3>
        <p><code>${safeTenant}</code></p>
        <div>${actionForms} ${revokeForm}</div>
      </article>`;
    })
    .join('');

  const phoneSection = linkedPhone
    ? `<p>Linked Phone: <code>${escapeHtml(linkedPhone)}</code></p>`
    : '';

  const pairingBoxHtml = pairingSession
    ? `<div>
        <p>Active 6-digit Code: <strong><code>${escapeHtml(pairingSession.pairingCode)}</code></strong></p>
        <p><small>${escapeHtml(pairingSession.pairingUri)}</small></p>
      </div>`
    : `<form method="POST" action="/auth/devices/pair">
        <input type="hidden" name="userDid" value="${escapeHtml(linkedPhone ? `did:sonaraim:${linkedPhone}` : 'did:sonaraim:user')}" />
        <button type="submit">Generate 6-Digit Code</button>
      </form>`;

  const contentHtml = `
    <section aria-labelledby="personal-stream">
      <h2 id="personal-stream">Personal Stream</h2>
      <ul>${personalRows}</ul>
      ${sendFormHtml}
    </section>
    <section aria-labelledby="services-stream">
      <h2 id="services-stream">Verified Services</h2>
      ${bannerHtml}
      ${serviceRows}
    </section>
    <section aria-labelledby="devices-stream">
      <h2 id="devices-stream">Companion Devices</h2>
      <h3>Link Companion Device (6-digit code)</h3>
      <p>Scan QR or enter 6-digit code to pair desktop and browser clients to your phone identity.</p>
      ${phoneSection}
      ${pairingBoxHtml}
    </section>`;

  return renderAppShell({
    title: 'Sonaraim Dual Inbox',
    contentHtml,
  });
}
