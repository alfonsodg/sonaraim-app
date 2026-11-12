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
 * @returns {string} Complete HTML5 document.
 */
export function renderAppShell({ title, contentHtml }) {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root { --bg:#090d16; --card:#121826; --text:#f3f4f6; --accent:#22d3ee; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); }
    header { padding:1rem 1.25rem; border-bottom:1px solid #1f2937; }
    main { max-width:960px; margin:0 auto; padding:1.25rem; display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); }
    section { background:var(--card); border:1px solid #1f2937; border-radius:12px; padding:1rem; }
    button { background:var(--accent); color:#042f2e; border:none; border-radius:8px; padding:0.5rem 0.9rem; font-weight:600; cursor:pointer; }
    @media (max-width:768px) { main { padding:0.9rem; } }
    @media (max-width:375px) { header { padding:0.75rem; } }
  </style>
</head>
<body>
  <header><h1>${safeTitle}</h1></header>
  <main>${contentHtml}</main>
</body>
</html>`;
}
