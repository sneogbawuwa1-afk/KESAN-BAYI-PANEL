// Keşan Bayi Takip Paneli - basit service worker
// Amaç: PWA "yüklenebilir" kriterlerini karşılamak ve son açılan sayfayı
// cihazda önbelleğe alarak internet olmadan da uygulamanın açılabilmesini sağlamak.
//
// GÜNCELLEME NOTU: Her yeni deploy'da CACHE_NAME değerini artırın (v1 -> v2 -> v3...).
// Bu, tarayıcının yeni bir service worker sürümü olduğunu fark etmesini sağlar.
// Yeni sürüm hemen devreye girmez; kullanıcı index.html'deki "güncelleme var" bildirimine
// dokunana kadar "waiting" (bekleme) durumunda kalır — böylece kullanıcı işini yaparken
// panel aniden yenilenip yarım kalan bir işlemi bozmaz.
const CACHE_NAME = 'bayi-takip-cache-v3.3';
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  // Not: Kasıtlı olarak self.skipWaiting() ÇAĞRILMIYOR — yeni sürüm, kullanıcı
  // onay verene kadar (bkz. SKIP_WAITING mesajı) beklemede kalsın istiyoruz.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

// index.html tarafından "şimdi güncelle" butonuna basıldığında gönderilen mesaj.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Ağ öncelikli (network-first): panel canlı veri kullandığı için önce internetten
// yüklemeyi dener, başarısız olursa (çevrimdışıysa) önbellekten döner.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
