/**
 * @fileoverview Instant Web / App Clip Magic Link viewer for zero-install B2B card interactions.
 */

import { escapeHtml, renderAppShell } from './htmlUtils.mjs';

/**
 * Renders an Instant Clip session page after validating that `token` is non-empty.
 *
 * @param {object} params - Clip session parameters.
 * @param {string} params.token - Ephemeral clip session token.
 * @param {string} [params.tenantDid] - Verified enterprise `did:web` identifier.
 * @param {string} params.title - Declarative card title.
 * @param {string[]} [params.actions] - Action button labels.
 * @returns {string} Complete HTML5 document.
 */
export function renderInstantClipView({ token, tenantDid = '', title, actions = [] }) {
  const trimmedToken = String(token ?? '').trim();
  if (!trimmedToken) {
    throw new Error('Instant Clip token cannot be empty');
  }

  const actionButtons = actions
    .map((act) => `<button type="button">${escapeHtml(act)}</button>`)
    .join(' ');

  const contentHtml = `
    <section aria-labelledby="clip-card">
      <h2 id="clip-card">${escapeHtml(title)}</h2>
      <p>Verified Sender: <code>${escapeHtml(tenantDid)}</code></p>
      <p>Session Token: <code>${escapeHtml(trimmedToken)}</code></p>
      <div>${actionButtons}</div>
    </section>`;

  return renderAppShell({
    title: 'Sonaraim Instant Clip',
    contentHtml,
  });
}
