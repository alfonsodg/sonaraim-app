/**
 * @fileoverview Shared HTML escaping and responsive shell renderer for Sonaraim Client App.
 */

/**
 * Escapes untrusted dynamic strings before embedding them in HTML templates.
 *
 * @param {unknown} value - Raw value to escape.
 * @returns {string} HTML-escaped string safe for text and attribute contexts.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Wraps client app content in an accessible, responsive HTML5 document shell.
 *
 * @param {object} params - Shell rendering options.
 * @param {string} params.title - Document and header title.
 * @param {string} params.contentHtml - Pre-escaped inner HTML for the `<main>` landmark.
 * @param {{ challengeEndpoint?: string, verifyEndpoint?: string }} [params.passkey] - Passkey endpoints enabling the `navigator.credentials.get()` client flow.
 * @returns {string} Complete HTML5 document.
 */
export function renderAppShell({ title, contentHtml, passkey }) {
  const safeTitle = escapeHtml(title);
  const passkeyScript =
    passkey && passkey.challengeEndpoint && passkey.verifyEndpoint
      ? `<script>
(function () {
  async function b64ToBytes(b64) {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    let bin = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < view.length; i += 1) bin += String.fromCharCode(view[i]);
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  async function sonaraimPasskeyLogin(userDid) {
    const challengeRes = await fetch(${JSON.stringify(passkey.challengeEndpoint)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userDid }),
    });
    if (!challengeRes.ok) throw new Error('Passkey challenge failed');
    const issued = await challengeRes.json();
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: await b64ToBytes(issued.challenge),
        rpId: issued.rpId,
        timeout: 60000,
        userVerification: 'preferred',
      },
    });
    const response = credential.response;
    const verifyRes = await fetch(${JSON.stringify(passkey.verifyEndpoint)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: issued.challengeId,
        userDid,
        credentialId: credential.id,
        authenticatorData: bytesToB64(new Uint8Array(response.authenticatorData)),
        clientDataJSON: bytesToB64(new Uint8Array(response.clientDataJSON)),
        assertionSignature: bytesToB64(new Uint8Array(response.signature)),
        publicKeyRaw: bytesToB64(new Uint8Array(response.authenticatorData.slice(0, 0))),
        rpId: issued.rpId,
        origin: window.location.origin,
      }),
    });
    if (!verifyRes.ok) throw new Error('Passkey verification failed');
    window.location.assign('/inbox');
  }
  window.sonaraimPasskeyLogin = sonaraimPasskeyLogin;
})();
</script>`
      : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#090d16" />
  <title>${safeTitle}</title>
  <style>
    :root { --bg:#090d16; --card:#121826; --text:#f3f4f6; --accent:#22d3ee; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); overflow-x:hidden; }
    header { padding:1rem 1.25rem; border-bottom:1px solid #1f2937; }
    main { max-width:960px; margin:0 auto; padding:1.25rem; display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); }
    section { background:var(--card); border:1px solid #1f2937; border-radius:12px; padding:1rem; overflow-wrap:anywhere; }
    form { display:inline-block; margin:0.25rem 0.25rem 0 0; max-width:100%; }
    input, select, textarea { max-width:100%; border:1px solid #374151; border-radius:6px; padding:0.45rem 0.6rem; background:#1f2937; color:#f3f4f6; }
    button { background:var(--accent); color:#042f2e; border:none; border-radius:8px; padding:0.5rem 0.9rem; font-weight:600; cursor:pointer; }
    .banner { background:#064e3b; color:#ecfdf5; border:1px solid #10b981; border-radius:8px; padding:0.75rem 1rem; margin-bottom:1rem; overflow-wrap:anywhere; }
    @media (max-width:768px) { main { padding:0.9rem; } }
    @media (max-width:375px) { header { padding:0.75rem; } main { padding:0.75rem; } }
  </style>
</head>
<body>
  <header><h1>${safeTitle}</h1></header>
  <main>${contentHtml}</main>
  ${passkeyScript}
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  </script>
</body>
</html>`;
}
