/**
 * @fileoverview Sonaraim PWA service worker (issue #28).
 * Offline shell strategy:
 * - App shell + icons: cache-first (pre-cached at install, versioned).
 * - API/relay (`/api/`, `/v1/` GETs): network-first with cache fallback.
 * - Navigations: network-first, fallback to cached `/inbox` shell offline.
 * Non-GET requests are never served from cache.
 */

const SW_VERSION = 'sonaraim-sw-v1';
const SHELL_ASSETS = ['/inbox', '/login', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/sw.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SW_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SW_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Decides whether a request targets a cacheable GET API route.
 *
 * @param {Request} request - Incoming fetch request.
 * @returns {boolean} True for GET requests under /api/ or /v1/.
 */
function isApiGet(request) {
  if (request.method !== 'GET') {
    return false;
  }
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/inbox', { ignoreSearch: true })));
    return;
  }
  if (isApiGet(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SW_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request))
  );
});
