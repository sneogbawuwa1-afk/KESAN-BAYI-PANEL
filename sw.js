
const APP_VERSION = '3.4';
const CACHE_NAME = 'kesan-bayi-takip-v' + APP_VERSION;


const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {

    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((isimler) =>
      Promise.all(
        isimler
          .filter((isim) => isim.startsWith('kesan-bayi-takip-v') && isim !== CACHE_NAME)
          .map((isim) => caches.delete(isim))
      )
    ).then(() => self.clients.claim())
  );
});


self.addEventListener('fetch', (event) => {
  const istekUrl = new URL(event.request.url);
  if (istekUrl.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((yanit) => {
        const kopya = yanit.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopya)).catch(() => {});
        return yanit;
      })
      .catch(() =>
        caches.match(event.request).then((onbellek) => onbellek || caches.match('./index.html'))
      )
  );
});


self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {

    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'GET_VERSION') {
.
    event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
  }
});
