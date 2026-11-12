// 7-Day Meal Tracker — Service Worker v3.6
// Deploy as sw.js in the SAME folder as index.html (the app registers './sw.js').
// Works at a domain root or in a GitHub Pages project folder (yourname.github.io/repo-name/).
//
// v3.6 changes:
//  - All app paths are relative to this worker's folder (no leading "/")
//  - Page loads bypass the browser's HTTP cache, so GitHub Pages' ~10-minute
//    cache can't serve a stale index.html while you're online
//  - A new version waits until you tap "Tap to refresh" in the app's banner
//
// RELEASE CHECKLIST: bump APP_VERSION on every deploy. Changing this file is
// what tells browsers a new version exists; old caches are deleted on activate.

const APP_VERSION = 'v3.6';
const CACHE_NAME = `meal-tracker-${APP_VERSION}`;
const FIREBASE_VERSION = '10.8.0';

// The folder this worker lives in, e.g. https://yourname.github.io/repo-name/
const BASE = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('index.html', BASE).href;

const PRECACHE_URLS = [
  BASE,
  INDEX_URL,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`,
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Fetch fresh copies (skip HTTP cache); one failure doesn't break install
      Promise.allSettled(PRECACHE_URLS.map((url) =>
        fetch(url, { cache: 'no-cache' }).then((res) => {
          if (res.ok) return cache.put(url, res);
        })
      ))
    )
  );
  // No skipWaiting() here: the app shows an update banner and the user chooses when to refresh.
  // (On the very first install there's no old version, so it activates right away anyway.)
});

// The app's "Tap to refresh" button sends this message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  // Page loads: always ask the server (bypassing HTTP cache), fall back to cached shell offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(INDEX_URL, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(INDEX_URL).then((r) => r || caches.match(BASE))
        )
    );
    return;
  }

  // Firebase SDK modules: versioned and immutable, so cache first
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Other files in this app's folder: network first (fresh), cached copy when offline
  if (req.url.startsWith(BASE)) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
  // Everything else (Firestore, Auth APIs) passes through untouched
});
