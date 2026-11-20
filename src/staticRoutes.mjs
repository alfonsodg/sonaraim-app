/**
 * @fileoverview Static PWA asset serving (icons + service worker) for Sonaraim Client App.
 * Keeps `src/server.mjs` under the 300-line modularity boundary (issue #28).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_ASSETS = new Map([
  ['/icon-192.png', { file: 'icons/icon-192.png', type: 'image/png' }],
  ['/icon-512.png', { file: 'icons/icon-512.png', type: 'image/png' }],
  ['/sw.js', { file: 'sw.js', type: 'application/javascript; charset=utf-8' }],
]);

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Serves versioned static PWA assets (`/icon-*.png`, `/sw.js`) with immutable caching.
 *
 * @param {import('node:http').IncomingMessage} req - Incoming HTTP request.
 * @param {import('node:http').ServerResponse} res - Outgoing HTTP response.
 * @param {URL} url - Parsed request URL.
 * @returns {Promise<boolean>} True if a static asset was served.
 */
export async function handleStaticAssetRoutes(req, res, url) {
  const staticAsset = req.method === 'GET' ? STATIC_ASSETS.get(url.pathname) : null;
  if (!staticAsset) {
    return false;
  }
  try {
    const filePath = path.join(PUBLIC_DIR, staticAsset.file);
    const data = await fs.promises.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': staticAsset.type,
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': data.length,
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }
  return true;
}
