/**
 * @fileoverview Instant Web / App Clip Magic Link viewer for zero-install B2B card interactions.
 */

import { escapeHtml, renderAppShell } from './htmlUtils.mjs';

/**
 * Renders an Instant Clip session page after validating that `token` is non-empty.
 * Wraps action buttons in accessible `<form method="POST">` elements and renders
 * an optional signed confirmation banner when an action has been submitted.
 *
 * @param {object} params - Clip session parameters.
 * @param {string} params.token - Ephemeral clip session token.
 * @param {string} [params.tenantDid] - Verified enterprise `did:web` identifier.
 * @param {string} params.title - Declarative card title.
 * @param {string[]} [params.actions] - Action button labels.
 * @param {{ action: string, receiptId: string, signature: string }} [params.confirmationReceipt] - Optional action confirmation receipt.
 * @returns {string} Complete HTML5 document.
 */
export function renderInstantClipView({
  token,
  tenantDid = '',
  title,
  actions = [],
  confirmationReceipt = null,
}) {
  const trimmedToken = String(token ?? '').trim();
  if (!trimmedToken) {
    throw new Error('Instant Clip token cannot be empty');
  }

  const safeToken = escapeHtml(trimmedToken);
  const safeTenant = escapeHtml(tenantDid);

  const bannerHtml = confirmationReceipt
    ? `<div class="banner" role="status" aria-live="polite">
        <strong>Action Confirmed:</strong> ${escapeHtml(confirmationReceipt.action)}
        — Receipt: <code>${escapeHtml(confirmationReceipt.receiptId)}</code>
        — Signature: <code>${escapeHtml(confirmationReceipt.signature)}</code>
      </div>`
    : '';

  const actionForms = actions
    .map((act) => {
      const safeAct = escapeHtml(act);
      return `<form method="POST" action="/c/${safeToken}/act">
        <input type="hidden" name="action" value="${safeAct}" />
        <input type="hidden" name="tenantDid" value="${safeTenant}" />
        <button type="submit">${safeAct}</button>
      </form>`;
    })
    .join(' ');

  const contentHtml = `
    <section aria-labelledby="clip-card">
      <h2 id="clip-card">${escapeHtml(title)}</h2>
      ${bannerHtml}
      <p>Verified Sender: <code>${safeTenant}</code></p>
      <p>Session Token: <code>${safeToken}</code></p>
      <div>${actionForms}</div>
    </section>`;

  return renderAppShell({
    title: 'Sonaraim Instant Clip',
    contentHtml,
  });
}
