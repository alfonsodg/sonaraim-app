/**
 * @fileoverview Passkey login view for Sonaraim Client App.
 * Renders the `navigator.credentials.get()` ceremony entry point bound to the
 * WebAuthn challenge/verify endpoints (issue #25 acceptance criterion).
 */

import { escapeHtml, renderAppShell } from './htmlUtils.mjs';

/**
 * Renders the Passkey sign-in page with inline `navigator.credentials.get()` flow.
 *
 * @param {object} [params] - Login view options.
 * @param {string} [params.userDid] - Prefilled user DID.
 * @param {string} [params.error] - Optional error message to display.
 * @returns {string} Complete HTML5 document.
 */
export function renderPasskeyLoginView({ userDid = '', error = '' } = {}) {
  const safeDid = escapeHtml(userDid);
  const errorHtml = error
    ? `<div class="banner" role="alert">${escapeHtml(error)}</div>`
    : '';
  const contentHtml = `
    <section aria-labelledby="passkey-login">
      <h2 id="passkey-login">Sign in with Passkey</h2>
      ${errorHtml}
      <form id="passkey-login-form" onsubmit="return false;">
        <label for="passkey-user-did">User DID</label>
        <input id="passkey-user-did" type="text" name="userDid" value="${safeDid}"
          placeholder="did:sonaraim:alice" required />
        <button id="passkey-login-button" type="button">Authenticate with Passkey</button>
      </form>
      <p id="passkey-login-status" role="status" aria-live="polite"></p>
      <script>
        document.getElementById('passkey-login-button').addEventListener('click', async () => {
          const status = document.getElementById('passkey-login-status');
          const userDid = document.getElementById('passkey-user-did').value.trim();
          try {
            status.textContent = 'Requesting authenticator…';
            await window.sonaraimPasskeyLogin(userDid);
          } catch (err) {
            status.textContent = 'Passkey authentication failed: ' + (err && err.message ? err.message : err);
          }
        });
      </script>
    </section>`;
  return renderAppShell({
    title: 'Sonaraim Passkey Login',
    contentHtml,
    passkey: {
      challengeEndpoint: '/auth/passkey/challenge',
      verifyEndpoint: '/auth/passkey/verify',
    },
  });
}
