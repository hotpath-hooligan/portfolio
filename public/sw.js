/**
 * Service worker for offline support.
 *
 * Deliberately does NOT touch the model weights: Transformers.js already
 * persists those to the Cache API under its own key, and duplicating ~140 MB
 * into a second cache would double the storage cost and risk eviction of both.
 * This worker's job is only the site shell and the search index.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;

// Everything else is cached on first use. Only the entry point is precached,
// since hashed asset names are not known until build time.
const PRECACHE = ['/', '/search/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individual failures must not abort the install — a missing optional
      // URL should not leave the site with no worker at all.
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k.startsWith('shell-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // HF CDN handles its own caching

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);

      // Network-first so a deploy is picked up immediately, falling back to
      // cache when offline. The site is small enough that the network round
      // trip is not worth optimising away with cache-first.
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Navigations to an uncached route still get the shell rather than the
        // browser's offline error page.
        if (request.mode === 'navigate') {
          const shell = await cache.match('/');
          if (shell) return shell;
        }
        throw new Error('offline and not cached');
      }
    })(),
  );
});
