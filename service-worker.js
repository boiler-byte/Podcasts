/* Podcasts v4 – only the local application shell is cached. */
const SHELL_CACHE = 'podcasts-shell-v6';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css?v=4',
  './app.js?v=6',
  './manifest.webmanifest',
  './assets/hero.webp',
  './icons/favicon.svg',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
const SHELL_URLS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => name.startsWith('podcasts-shell-') && name !== SHELL_CACHE)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Do not intercept API calls, podcast artwork, audio, or other external resources.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  if (SHELL_URLS.has(url.href)) {
    event.respondWith(
      // Prefer the newest shell on a connection; retain the cached copy offline.
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
      }).catch(() => caches.match(request))
    );
  }
});
