/**
 * @fileoverview Dual Inbox & Declarative Card UI renderer separating Personal (`did:sonaraim`)
 * and Verified Services (`did:web`) streams.
 */

import { escapeHtml, renderAppShell } from './htmlUtils.mjs';

/**
 * Renders the Dual Inbox HTML view with strict escaping of message previews and card actions.
 *
 * @param {object} state - Inbox snapshot.
 * @param {Array<{from: string, preview: string}>} [state.personalMessages]
 * @param {Array<{tenantDid: string, title: string, actions?: string[]}>} [state.serviceCards]
 * @returns {string} Complete HTML5 document.
 */
export function renderInboxView({ personalMessages = [], serviceCards = [] }) {
  const personalRows = personalMessages
    .map(
      (msg) =>
        `<li><strong>${escapeHtml(msg.from)}</strong>: ${escapeHtml(msg.preview)}</li>`
    )
    .join('');

  const serviceRows = serviceCards
    .map((card) => {
      const buttons = (card.actions ?? [])
        .map((act) => `<button type="button">${escapeHtml(act)}</button>`)
        .join(' ');
      return `<article><h3>${escapeHtml(card.title)}</h3><p><code>${escapeHtml(
        card.tenantDid
      )}</code></p><div>${buttons}</div></article>`;
    })
    .join('');

  const contentHtml = `
    <section aria-labelledby="personal-stream">
      <h2 id="personal-stream">Personal Stream</h2>
      <ul>${personalRows}</ul>
    </section>
    <section aria-labelledby="services-stream">
      <h2 id="services-stream">Verified Services</h2>
      ${serviceRows}
    </section>`;

  return renderAppShell({
    title: 'Sonaraim Dual Inbox',
    contentHtml,
  });
}
