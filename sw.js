// Keşan Bayi Takip Paneli - basit service worker
// Amaç: PWA "yüklenebilir" kriterlerini karşılamak ve son açılan sayfayı
// cihazda önbelleğe alarak internet olmadan da uygulamanın açılabilmesini sağlamak.
//
// GÜNCELLEME NOTU: Her yeni deploy'da SADECE APP_VERSION değerini artırın (ör. '2.1' -> '2.2').
// CACHE_NAME bu değerden otomatik türetildiği için tarayıcı yeni bir service worker
// sürümü olduğunu fark eder. index.html'deki "V2.1" gibi rozetler de sayfa açılışında
// bu SW'den bu değeri sorup kendini otomatik günceller — yani versiyonu SADECE burada
// değiştirmeniz yeterli, index.html'i elle düzenlemenize gerek yok.
// Yeni sürüm hemen devreye girmez; kullanıcı index.html'deki "güncelleme var" bildirimine
// dokunana kadar "waiting" (bekleme) durumunda kalır — böylece kullanıcı işini yaparken
// panel aniden yenilenip yarım kalan bir işlemi bozmaz.
const APP_VERSION = '2.9';
const CACHE_NAME = 'bayi-takip-cache-v' + APP_VERSION;
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
// Ayrıca index.html sayfa açılışında bu SW'nin sürümünü sorabilir (GET_VERSION),
// böylece ekrandaki "V2.1" rozetleri her zaman buradaki APP_VERSION ile eşleşir.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'GET_VERSION') {
    if (event.source) {
      event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
    }
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
