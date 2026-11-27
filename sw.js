// Service worker: makes the app installable and usable offline.
// Strategy: network first (always the newest version when online), cache as fallback (offline).
// Bump CACHE when the list of files changes.
const CACHE = 'trenazer-v1';

const FILES = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/ble/ftms.js',
  'js/ble/heartrate.js',
  'js/ble/simulator.js',
  'js/fit/fit-encoder.js',
  'js/ui/chart.js',
  'js/ui/zones.js',
  'js/workout/model.js',
  'js/workout/samples.js',
  'js/workout/my-workouts.js',
  'js/workout/polarized-workouts.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
