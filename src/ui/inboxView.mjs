/**
 * @fileoverview Dual Inbox & Declarative Card UI renderer separating Personal (`did:sonaraim`)
 * and Verified Services (`did:web`) streams.
 */

import { escapeHtml, renderAppShell } from './htmlUtils.mjs';

/**
 * Renders the Dual Inbox HTML view with strict escaping of message previews, interactive
 * card action forms, and 1-tap promotional consent revocation controls.
 *
 * @param {object} state - Inbox snapshot.
 * @param {Array<{from: string, preview: string}>} [state.personalMessages]
 * @param {Array<{tenantDid: string, title: string, actions?: string[], clipToken?: string}>} [state.serviceCards]
 * @param {{tenantDid: string, revokedAt: string}} [state.revocationReceipt] - Optional consent revocation receipt.
 * @returns {string} Complete HTML5 document.
 */
export function renderInboxView({
  personalMessages = [],
  serviceCards = [],
  revocationReceipt = null,
}) {
  const bannerHtml = revocationReceipt
    ? `<div class="banner" role="status" aria-live="polite">
        <strong>Consent revoked for</strong> <code>${escapeHtml(revocationReceipt.tenantDid)}</code>
        at <code>${escapeHtml(revocationReceipt.revokedAt)}</code>
      </div>`
    : '';

  const personalRows = personalMessages
    .map(
      (msg) =>
        `<li><strong>${escapeHtml(msg.from)}</strong>: ${escapeHtml(msg.preview)}</li>`
    )
    .join('');

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

      return `<article><h3>${escapeHtml(card.title)}</h3><p><code>${safeTenant}</code></p><div>${actionForms} ${revokeForm}</div></article>`;
    })
    .join('');

  const contentHtml = `
    <section aria-labelledby="personal-stream">
      <h2 id="personal-stream">Personal Stream</h2>
      <ul>${personalRows}</ul>
    </section>
    <section aria-labelledby="services-stream">
      <h2 id="services-stream">Verified Services</h2>
      ${bannerHtml}
      ${serviceRows}
    </section>`;

  return renderAppShell({
    title: 'Sonaraim Dual Inbox',
    contentHtml,
  });
}
