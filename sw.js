/* SREE FOUNDATION Ordering — service worker.
 *
 * Strategy summary:
 *  - App pages (navigations): network-first, cached copy as the offline
 *    fallback, so updates land as soon as they are published.
 *  - Static libraries & fonts (Google Fonts, cdnjs, Firebase JS SDK):
 *    cache-first — they only change with app updates, so repeat launches
 *    (and offline launches) never re-download them.
 *  - Everything else (Firestore, wa.me, …) is left untouched: the network
 *    handles it, and Firestore keeps its own IndexedDB offline cache.
 *
 * IMPORTANT: bump VERSION whenever index.html / manage.html / assets
 * change, so previously-installed clients refresh their shell.
 */
const VERSION = 'sf-order-v1.0.0';
const APP_SHELL = ['./', './index.html', './manage.html', './manifest.json', './icon-192.png'];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Static assets: cache-first, opaque responses are fine here.
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // App navigations: network-first with cached fallback.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match('./index.html'))
        )
    );
  }
});
