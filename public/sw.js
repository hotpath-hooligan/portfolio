/**
 * Service worker for offline support of the site shell.
 *
 * The chat is not offline-capable and is not meant to be — it is a network
 * call to the model backend. Everything else on the site is static and reads
 * fine without a connection.
 */
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;

// Everything else is cached on first use. Only the entry point is precached,
// since hashed asset names are not known until build time.
const PRECACHE = ['/'];

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
  if (url.origin !== self.location.origin) return; // never intercept the chat API

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
