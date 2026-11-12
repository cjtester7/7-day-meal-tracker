// 7-Day Meal Tracker — Service Worker v3.5
// Deploy as /sw.js next to index.html (the app registers '/sw.js').
// Caches the app shell and the Firebase SDK so the app opens with no connection.
// Firestore/Auth network traffic is NOT intercepted — Firestore's own offline
// cache (IndexedDB) handles data reads and queued writes.

const CACHE_NAME = 'meal-tracker-v3.5';
const FIREBASE_VERSION = '10.8.0';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Cache each URL independently so one failure doesn't break install
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('meal-tracker-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Page loads: network first (get updates), fall back to cached shell offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || caches.match('/'))
        )
    );
    return;
  }

  // Firebase SDK modules: versioned and immutable, so cache first
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Other same-origin assets: serve cache, refresh in background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
  // Everything else (Firestore, Auth APIs) passes through untouched
});
