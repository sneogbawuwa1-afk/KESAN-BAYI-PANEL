// ================= BULUTSUZ TEST MODU =================
// Bu bayrak TRUE iken: hiçbir Firebase/bulut isteği yapılmaz (okuma/yazma/senkronizasyon/auth
// hepsi atlanır). Uygulama YALNIZCA cihazdaki (IndexedDB) veriyle çalışır — giriş ekranı istemez,
// doğrudan açılır. Test bittiğinde bu satırı `false` yapmak (veya bu bloğu silmek) bulutu geri
// getirir; başka HİÇBİR yerde değişiklik gerekmez.
// GÜNCELLEME: Yeni Firebase projesiyle (test-82b8f) bulut testine geçilecek — bulut AÇIK.
const BULUTSUZ_TEST = false;
function cloudEnabled(){ if(BULUTSUZ_TEST) return false; return !!(CLOUD.dbUrl && CLOUD.dbUrl.trim()); }

// Çıplak fetch() çağrılarının varsayılan bir zaman aşımı yoktur: ağ yavaşsa, DNS/ISP tarafında
// bulut adresi engelleniyorsa veya bağlantı sessizce düşüyorsa, tarayıcı isteği süresiz olarak
// beklemede tutabilir. Bu da "Bulut verisi kontrol ediliyor…" durumunun ekranda asılı kalmasına
// (hiç sonuçlanmamasına) yol açar. Bulut ile ilgili TÜM istekler bu sarmalayıcıdan geçer; belirli
// bir süre (varsayılan 15 sn) içinde yanıt gelmezse istek iptal edilir ve normal bir hata olarak
// fırlatılır, böylece çağıran taraftaki try/catch bloğu devreye girip yerel/mevcut veriye döner.
// Bir Promise'i zaman aşımıyla yarıştırır: süre dolarsa verilen yedek değerle (varsayılan null)
// çözülür — asla reddetmez. Açılış gibi kritik akışların, tek bir takılan bulut isteği yüzünden
// SONSUZA KADAR beklememesi için kullanılır (donma yerine "elimizdekiyle devam et").
function zamanAsimliYaris(promise, ms, yedekDeger){
  return Promise.race([
    Promise.resolve(promise).catch(()=> yedekDeger),
    new Promise(resolve=> setTimeout(()=> resolve(yedekDeger), ms)),
  ]);
}

async function cloudFetch(url, options, timeoutMs){
  timeoutMs = timeoutMs || 15000;
  const controller = new AbortController();
  const timer = setTimeout(()=> controller.abort(), timeoutMs);
  try{
    // ÖNEMLİ: cache:'no-store' ZORUNLUDUR. Tarayıcı, Firebase Realtime Database REST API'sinin
    // GET yanıtlarını (bazı durumlarda döndürdüğü Cache-Control başlıklarına göre) HTTP
    // önbelleğinde tutabiliyor — bu da F5/normal sayfa yenilemesinde (hard-refresh/Ctrl+Shift+R
    // DEĞİL) fetch()'in ağa hiç gitmeden ESKİ, önbellekteki yanıtı döndürmesine yol açabiliyor.
    // Sonuç: 2. cihazda F5 yapılsa bile bulutta yeni girilen veri (ör. çek/senet onayı sonrası
    // güncellenmiş rapor) görünmüyordu — "Diğer Cihazdan Güncelle" bazen çalışıyor gibi görünmesi
    // de zamanlama/önbellek geçerlilik süresinin rastgele dolmuş olmasından kaynaklanıyor olabilir,
    // güvenilir bir davranış değildi. cache:'no-store' ile HER istek ağa gider, tarayıcı önbelleği
    // asla devreye girmez — hem GET (okuma) hem PUT/PATCH (yazma) istekleri için geçerlidir.
    const nihaiOptions = Object.assign({cache: 'no-store'}, options||{}, {signal: controller.signal});
    return await fetch(url, nihaiOptions);
  }catch(err){
    if(err && err.name === 'AbortError'){
      throw new Error('Bulut isteği zaman aşımına uğradı (' + Math.round(timeoutMs/1000) + ' sn)');
    }
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

// ============================================================================
// VERİMLİ BULUT SENKRONİZASYONU (meta zaman damgası ile "değişmemişse indirme")
// ============================================================================
// Önceden her veri türü (ana rapor, Müşteri Master, Sell Out, Modern Kanal, Bayi Hakediş,
// Malzemeler) uygulama her açıldığında büyük JSON'ının TAMAMINI buluttan indiriyordu — cihazdaki
// veri buluttakiyle birebir aynı olsa bile. Bu, gereksiz veri trafiği/gecikme yaratıyordu.
// Artık her büyük veri, kaydedilirken YANINDA çok küçük bir "_meta/{veriTuru}" kaydına da bir
// updatedAt zaman damgası yazıyor. Yükleme sırasında önce SADECE bu küçük zaman damgası
// okunuyor; cihazda saklanan son bilinen zaman damgasıyla AYNIYSA, büyük veri hiç indirilmeden
// doğrudan cihazdaki (IndexedDB) kopya kullanılıyor. Farklıysa (başka bir cihazdan güncellenmiş),
// büyük veri normal şekilde indirilip hem state'e hem cihaza yazılıyor.
const CLOUD_META_LOCAL_KEY = 'noktaCariTakip_cloudMetaZamanlari_v1';
let cloudMetaZamanCache = null; // {veriTuru: updatedAt} - cihazda bilinen son zaman damgaları, bellekte önbelleklenir

async function cloudMetaZamanlariniYukle(){
  if(cloudMetaZamanCache) return cloudMetaZamanCache;
  try{ cloudMetaZamanCache = (await idbGet(CLOUD_META_LOCAL_KEY)) || {}; }
  catch(err){ cloudMetaZamanCache = {}; }
  return cloudMetaZamanCache;
}
async function cloudMetaZamaniKaydet(veriTuru, zaman){
  const harita = await cloudMetaZamanlariniYukle();
  harita[veriTuru] = zaman;
  cloudMetaZamanCache = harita;
  await idbSet(CLOUD_META_LOCAL_KEY, harita).catch(()=>{});
}
// Buluttaki küçük meta kaydını okur ({updatedAt: number} formatında). Ağ hatasında null döner.
async function cloudMetaOkuUzaktan(cloudPath){
  if(!cloudEnabled()) return null; // BULUTSUZ modda hiç istek atma
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/_meta/${cloudPath}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){
    console.error('Meta zaman damgası okunamadı ('+cloudPath+'):', err);
    return null;
  }
}
// Meta kaydını buluta yazar — asıl veriyi kaydeden fonksiyonlar (saveXToCloud), veriyi
// yazdıktan hemen sonra bunu çağırır.
async function cloudMetaYazUzaktan(cloudPath, zaman){
  if(!cloudEnabled()) return false; // BULUTSUZ modda hiç istek atma
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/_meta/${cloudPath}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({updatedAt: zaman}),
    });
    return !!(res && res.ok);
  }catch(err){ console.error('Meta zaman damgası yazılamadı ('+cloudPath+'):', err); return false; }
}
// Ana verimli yükleme sarmalayıcısı: önce küçük meta zaman damgasını kontrol eder, cihazdaki
// bilinen zamanla aynıysa büyük veriyi HİÇ İNDİRMEDEN cihazdaki kopyayı döndürür; farklıysa
// (veya meta hiç yoksa/ağ hatasıysa, güvenli tarafta kalmak için) büyük veriyi normal şekilde
// indirip hem cihaza hem bellek önbelleğine yazar.
// - veriTuru: meta kaydının anahtarı (genelde cloudPath ile aynı, kısa/benzersiz bir isim)
// - loadCloudDataFn: büyük veriyi buluttan çeken mevcut fonksiyon (ör. loadReportFromCloud)
// - loadLocalDataFn: büyük veriyi cihazdan (IndexedDB) çeken mevcut fonksiyon
async function cloudVeriVerimliYukle(veriTuru, loadCloudDataFn, loadLocalDataFn){
  const bilinenZamanlar = await cloudMetaZamanlariniYukle();
  const bilinenZaman = bilinenZamanlar[veriTuru];
  const uzakMeta = await cloudMetaOkuUzaktan(veriTuru);
  if(uzakMeta && bilinenZaman!=null && uzakMeta.updatedAt === bilinenZaman){
    // Bulut hiç değişmemiş — büyük veriyi indirmeye gerek yok, cihazdaki kopya yeterli.
    const yerelVeri = await loadLocalDataFn();
    if(yerelVeri) return {data: yerelVeri, source: 'local-uptodate'};
    // Cihazda beklenmedik şekilde veri yoksa (ör. cihaz değişmiş), yine de buluttan indir.
  }
  const uzakVeri = await loadCloudDataFn();
  if(uzakVeri){
    // Meta bilgisi varsa onu kullan, yoksa (eski kayıtlarda meta hiç yazılmamışsa) "şimdi"yi
    // bilinen zaman olarak işaretle — bir sonraki açılışta en azından bu andan itibaren
    // karşılaştırma yapılabilsin.
    await cloudMetaZamaniKaydet(veriTuru, uzakMeta ? uzakMeta.updatedAt : Date.now());
    return {data: uzakVeri, source: 'cloud'};
  }
  return {data: null, source: 'none'};
}

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCfHJE6Pcqx92NFgV_1JnB7i6RPGGgQKQg',
  authDomain: 'test-82b8f.firebaseapp.com',
  databaseURL: CLOUD.dbUrl,
  projectId: 'test-82b8f',
  storageBucket: 'test-82b8f.firebasestorage.app',
  messagingSenderId: '59490268572',
  appId: '1:59490268572:web:a451913a8b70f7671f8459',
  measurementId: 'G-F7EEVZ8R28',
};

let authAktif = false;
// BULUTSUZ TEST MODU: Firebase auth'u hiç başlatma — giriş ekranı istenmez, uygulama doğrudan açılır.
if(!BULUTSUZ_TEST){
try{
  if(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'BURAYA_FIREBASE_API_KEY_YAPIŞTIRIN' && window.firebaseAuthAPI){
    // Modüler SDK: initializeApp/getAuth doğrudan çağrılan fonksiyonlardır (namespaced
    // firebase.initializeApp() yerine) — sonucu window.firebaseAuthAPI.authInstance'a
    // yazıyoruz, aşağıdaki tüm auth işlemleri bu instance üzerinden yapılır.
    const app = window.firebaseAuthAPI.initializeApp(FIREBASE_CONFIG);
    window.firebaseAuthAPI.authInstance = window.firebaseAuthAPI.getAuth(app);
    authAktif = true;
  }
}catch(err){ console.error('Firebase Authentication başlatılamadı:', err); }
}

// PERFORMANS DÜZELTMESİ: Açılışta 10 bulut isteği paralel (Promise.all ile) tetiklendiğinde,
// her biri authQuery() çağırıp KENDİ getIdToken(true) isteğini atıyordu — yani aynı anda 10 ayrı
// "taze token" isteği Firebase Auth sunucusuna gidiyordu, hepsi de pratikte aynı token'ı
// döndürecekken. Aşağıdaki kısa ömürlü paylaşımlı önbellek (AUTH_TOKEN_TAZELIK_MS içinde),
// eşzamanlı/art arda gelen çağrıların TEK bir getIdToken(true) isteğini paylaşmasını sağlıyor.
// 401 riskini azaltan asıl davranış (her birkaç saniyede bir taze token) korunuyor; sadece aynı
// anda başlayan onlarca isteğin birbirini kopyalaması önleniyor.
const AUTH_TOKEN_TAZELIK_MS = 4000;
let authTokenOnbellek = null; // {token, alinanZaman}
let authTokenBekleyenIstek = null; // devam eden getIdToken(true) Promise'i (varsa)
async function authQuery(){
  if(!authAktif) return '';
  try{
    const user = window.firebaseAuthAPI.authInstance.currentUser;
    if(!user) return '';
    const simdi = Date.now();
    if(authTokenOnbellek && (simdi - authTokenOnbellek.alinanZaman) < AUTH_TOKEN_TAZELIK_MS){
      return '?auth=' + authTokenOnbellek.token;
    }
    // Zaten devam eden bir yenileme isteği varsa (paralel çağrılar), onun sonucunu paylaş —
    // ikinci bir getIdToken(true) daha başlatma.
    if(!authTokenBekleyenIstek){
      // getIdToken() (parametresiz) SDK'nın önbellekteki token'ını döndürür; süresi dolmuşsa normalde
      // otomatik yeniler ama nadiren (saat kayması, arka arkaya çok sayıda eşzamanlı çağrı vb.) bunu
      // atlayıp süresi geçmiş bir token döndürebilir — bu da TÜM bulut isteklerinin aynı anda 401
      // almasına yol açar. getIdToken(true) her seferinde sunucudan taze bir token ister, bu riski ortadan kaldırır.
      //
      // KRİTİK DÜZELTME (açılış donması): getIdToken(true) bir AĞ isteğidir ve kendi başına
      // TIMEOUT'U YOKTUR. Ağ kötüyse / Firebase Auth yanıt vermezse bu Promise hiç resolve olmaz;
      // authQuery her bulut isteğinde çağrıldığı için açılıştaki Promise.all SONSUZA KADAR asılı
      // kalır (kullanıcıda "sürekli yükleniyor, hata yok" belirtisi). Aşağıdaki yarış (race), token
      // AUTH_TOKEN_TIMEOUT_MS içinde gelmezse isteği reddeder — böylece bulut isteği "auth'suz"
      // devam eder (veya üstteki catch boş döndürür) ve uygulama donmak yerine cihazdaki veriyle açılır.
      const AUTH_TOKEN_TIMEOUT_MS = 10000;
      const tokenIstegi = user.getIdToken(true)
        .then(token=>{ authTokenOnbellek = {token, alinanZaman: Date.now()}; return token; });
      const zamanAsimi = new Promise((_, reject)=> setTimeout(()=> reject(new Error('auth-token-timeout')), AUTH_TOKEN_TIMEOUT_MS));
      authTokenBekleyenIstek = Promise.race([tokenIstegi, zamanAsimi])
        .finally(()=>{ authTokenBekleyenIstek = null; });
    }
    const token = await authTokenBekleyenIstek;
    return '?auth=' + token;
  }catch(err){ return ''; }
}

function girisEkraniGoster(){
  document.getElementById('authGate').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('authLogoutBtn').style.display = 'none';
}
function girisEkraniGizle(){
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('authLogoutBtn').style.display = 'inline-block';
  uygulamayiBaslat();
}

if(authAktif){
  // Modüler API'de onAuthStateChanged(auth, callback) şeklinde çağrılır — namespaced
  // firebase.auth().onAuthStateChanged(callback) yerine, auth instance'ı ilk parametre olur.
  window.firebaseAuthAPI.onAuthStateChanged(window.firebaseAuthAPI.authInstance, user=>{
    if(user) girisEkraniGizle(); else girisEkraniGoster();
  });
}else{
  dwarn('Firebase Authentication yapılandırılmadı veya BULUTSUZ_TEST açık — giriş ekranı devre dışı.');
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  // Auth atlandığında uygulamayı doğrudan başlat (girisEkraniGizle normalde bunu yapardı).
  uygulamayiBaslat();
}

const KULLANICI_KODU_UZANTISI = '@kullanici.noktacari';
function kullaniciKoduEmaile(kod){
  return String(kod||'').trim() + KULLANICI_KODU_UZANTISI;
}

document.getElementById('authLoginBtn').addEventListener('click', async ()=>{
  const kod = document.getElementById('authKullaniciKodu').value.trim();
  const pass = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  const statusEl = document.getElementById('authStatus');
  errEl.style.display = 'none';
  if(!kod || !pass){
    errEl.textContent = 'Kullanıcı kodu ve şifre gerekli.';
    errEl.style.display = 'block';
    return;
  }
  statusEl.textContent = 'Giriş yapılıyor…';
  statusEl.style.display = 'block';
  try{
    // Modüler API'de signInWithEmailAndPassword(auth, email, pass) — auth instance'ı ilk parametre.
    await window.firebaseAuthAPI.signInWithEmailAndPassword(window.firebaseAuthAPI.authInstance, kullaniciKoduEmaile(kod), pass);
    statusEl.style.display = 'none';
  }catch(err){
    statusEl.style.display = 'none';
    errEl.textContent = 'Giriş başarısız: kullanıcı kodu veya şifre hatalı.';
    errEl.style.display = 'block';
  }
});
document.getElementById('authPassword').addEventListener('keydown', e=>{
  if(e.key === 'Enter') document.getElementById('authLoginBtn').click();
});
document.getElementById('authLogoutBtn').addEventListener('click', ()=>{
  if(authAktif) window.firebaseAuthAPI.signOut(window.firebaseAuthAPI.authInstance);
});

async function saveReportToCloud(report){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CLOUD.path}.json${await authQuery()}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(report),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    // Veri kaydedildikten hemen sonra küçük meta zaman damgası da yazılır — bir sonraki
    // yüklemede (bu cihazdan veya başka bir cihazdan) büyük veri hiç indirilmeden "değişmiş
    // mi" kontrolü yapılabilsin diye.
    const simdi = Date.now();
    // META GÜVENİLİRLİK DÜZELTMESİ: Rapor PUT'u başarılı ama meta yazımı başarısız olursa, diğer
    // cihazların 20 sn'lik otomatik senkron kontrolü (yalnızca meta damgasını karşılaştırır)
    // değişikliği HİÇ göremiyordu. Meta yazılamazsa bir kez daha denenir; yine olmazsa veri zaten
    // bulutta güvende olduğundan işlem başarılı sayılır ama konsola hata düşer (tam yükleme
    // akışları meta olmadan da güvenli tarafta kalıp veriyi indirir — bkz. cloudVeriVerimliYukle).
    let metaOk = await cloudMetaYazUzaktan(CLOUD.path, simdi);
    if(!metaOk) metaOk = await cloudMetaYazUzaktan(CLOUD.path, simdi);
    await cloudMetaZamaniKaydet(CLOUD.path, simdi);
    // Otomatik arka plan senkronizasyonuna (bkz. otomatikBulutSenkronizasyonuKontrolEt) bu
    // yazmanın KENDİ cihazımızdan geldiğini bildiriyoruz — aksi halde bir sonraki polling turu
    // "değişiklik var" sanıp raporu gereksiz yere tekrar indirir (zararsız ama gereksiz trafik).
    if(typeof otomatikSenkronBilinenZaman !== 'undefined') otomatikSenkronBilinenZaman = simdi;
    return {ok:true};
  }catch(err){
    console.error('Rapor buluta kaydedilemedi:', err);
    return {ok:false, reason:err.message};
  }
}

async function loadReportFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CLOUD.path}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text, (key, value)=>{
      if(DATE_KEYS.has(key) && typeof value === 'string'){
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      }
      return value;
    });
  }catch(err){
    console.error('Bulut verisi okunamadı:', err);
    return null;
  }
}

const MUSTERI_MASTER_CLOUD_PATH = CLOUD.path + '_musteriMaster';
const MUSTERI_MASTER_LOCAL_KEY = 'noktaCariTakip_musteriMaster_v1';
// Senet basımı için müşteri detayı (Tabela Adı, Vergi No/TC Kimlik No, Adres, İl) — aynı Müşteri
// Master dosyasından, temsilci haritasıyla birlikte ama AYRI bir kayıt olarak saklanır.
const MUSTERI_MASTER_DETAY_CLOUD_PATH = CLOUD.path + '_musteriMasterDetay';
const MUSTERI_MASTER_DETAY_LOCAL_KEY = 'noktaCariTakip_musteriMasterDetay_v1';
// Sell Out Raporu'nda FKNS (Fatura Kesilen Nokta Sayısı) hesaplaması için, Müşteri Master
// dosyasındaki nokta durumu (Aktif/Pasif) — temsilci haritasıyla birlikte ama AYRI kaydedilir.
const MUSTERI_MASTER_DURUM_CLOUD_PATH = CLOUD.path + '_musteriMasterDurum';
const MUSTERI_MASTER_DURUM_LOCAL_KEY = 'noktaCariTakip_musteriMasterDurum_v1';

function buildMusteriMasterMap(rows){
  const map = new Map();
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    let temsilci = String(r['Satış Temsilcisi Adı']||'').trim();
    if(!temsilci) temsilci = 'Key Account';
    map.set(musteri, temsilci);
  });
  return map;
}
// Müşteri Master dosyasındaki "Müşteri Adı" sütunu genellikle aynı ismi iki kez art arda içerir
// (örn. "SEVİM ÇAVUŞ Sevim Çavuş" — önce büyük harf, sonra normal yazım). Kelime sayısı çift ve
// ilk yarı ile ikinci yarı (Türkçe harf duyarlılığı gözetilerek) aynıysa yalnızca ilk yarı bırakılır;
// eşleşmiyorsa (örn. gerçekten farklı iki kelime/şirket adıysa) metin olduğu gibi korunur.
function musteriAdiTekillestir(ad){
  const temiz = String(ad||'').trim().replace(/\s+/g,' ');
  if(!temiz) return temiz;
  const kelimeler = temiz.split(' ');
  if(kelimeler.length < 2 || kelimeler.length % 2 !== 0) return temiz;
  const yari = kelimeler.length / 2;
  const ilkYari = kelimeler.slice(0, yari).join(' ');
  const ikinciYari = kelimeler.slice(yari).join(' ');
  return ilkYari.toLocaleUpperCase('tr-TR') === ikinciYari.toLocaleUpperCase('tr-TR') ? ilkYari : temiz;
}

// Senet basımında kullanılacak müşteri kimlik/adres bilgileri. Vergi No varsa (tüzel kişi) o, yoksa
// TC Kimlik No (şahıs) kullanılır. "İl" alanı, senetteki "Keşide Yeri" için de kullanılır.
function buildMusteriMasterDetay(rows){
  const map = new Map();
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    map.set(musteri, {
      tabelaAdi: String(r['Tabela Adı']||'').trim(),
      musteriAdi: musteriAdiTekillestir(r['Müşteri Adı']),
      vergiNo: String(r['Vergi No']||'').trim(),
      tcKimlikNo: String(r['TC Kimlik No']||'').trim(),
      adres: String(r['Sevk Adresi']||'').trim(),
      il: String(r['İl']||'').trim(),
      ilce: String(r['İlçe']||'').trim(),
    });
  });
  return map;
}
function musteriMasterMapToObj(map){ const o={}; map.forEach((v,k)=>{ o[k]=v; }); return o; }
function musteriMasterObjToMap(obj){ return new Map(Object.entries(obj||{})); }

// Müşteri Master dosyasında nokta durumunu (Aktif/Pasif) taşıyan kolonun adı dosyadan dosyaya
// değişebilir — bu yüzden bilinen aday kolon adları sırayla denenir, ilk bulunan kullanılır.
// Gerçek dosyanızdaki kolon adı bu listede yoksa, buraya eklemeniz yeterlidir.
const DURUM_KOLON_ADAYLARI = ['Durum','Statü','Müşteri Statüsü','Müşteri Durumu','Hesap Durumu','Nokta Durumu','Aktiflik Durumu','Status','Cari Durum'];
function musteriDurumKolonunuBul(headers){
  const set = new Set((headers||[]).map(h=>String(h||'').trim()));
  return DURUM_KOLON_ADAYLARI.find(k=>set.has(k)) || null;
}
function buildMusteriMasterDurumMap(rows, headers){
  const map = new Map();
  const kolon = musteriDurumKolonunuBul(headers || (rows && rows[0] ? Object.keys(rows[0]) : []));
  if(!kolon) return map; // Durum kolonu bulunamadı — harita boş döner, FKNS hesaplamasında tüm noktalar aktif varsayılır.
  (rows||[]).forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    const ham = String(r[kolon]||'').trim();
    const normalize = ham.toLocaleUpperCase('tr-TR');
    map.set(musteri, normalize === 'AKTİF' || normalize === 'AKTIF' ? 'Aktif' : (ham || 'Pasif'));
  });
  return map;
}
// Nokta statüsü "Pasif" veya "İptal" (yazım/boşluk farklarına toleranslı) ise true döner — Sell Out
// Raporu'nda bu noktalar hem "Fatura kesilmeyen aktif noktalar" listesinden hem de FKNS
// hesaplamasından (payda/pay) tamamen çıkarılır. Durum metninde geçen başka ifadeler (örn. "Beklemede",
// "Yeni Nokta" gibi Aktif dışı ama Pasif/İptal de olmayan statüler) burada elenmez — sadece açıkça
// Pasif veya İptal olanlar hesap dışına alınır.
function noktaPasifVeyaIptalMi(durum){
  if(!durum) return false;
  const n = String(durum).trim().toLocaleUpperCase('tr-TR');
  if(!n) return false;
  return n.includes('PASİF') || n.includes('PASIF') || n.includes('İPTAL') || n.includes('IPTAL');
}

async function saveMusteriMasterToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master cihaza kaydedilemedi.');
}
async function loadMusteriMasterFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

async function saveMusteriMasterDetayToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DETAY_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_DETAY_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_DETAY_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master Detay buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterDetayFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DETAY_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master Detay buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterDetayToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_DETAY_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master Detay cihaza kaydedilemedi.');
}
async function loadMusteriMasterDetayFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_DETAY_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_DETAY_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

// Çek/Senet Tahsil Edildi onayları — cihaza (IndexedDB) VE bulut açıksa (BULUTSUZ_TEST=false)
// Firebase'e de kaydedilir. Set halinde tutulan senetAnahtari değerleri (hem çek hem senet
// kayıtları için), kayıt için diziye çevrilip saklanır. Eski anahtar adı (v1) geriye dönük
// okunur, yeni anahtarla (v2) yazılır.
const CEK_SENET_TAHSIL_ONAY_LOCAL_KEY = 'noktaCariTakip_cekSenetTahsilOnaylari_v2';
const CEK_SENET_TAHSIL_ONAY_LOCAL_KEY_ESKI = 'noktaCariTakip_senetTahsilOnaylari_v1';
const CEK_SENET_TAHSIL_ONAY_CLOUD_PATH = CLOUD.path + '_cekSenetTahsilOnaylari';
async function saveSenetTahsilOnaylariToCloud(arr){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CEK_SENET_TAHSIL_ONAY_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(arr),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Çek/Senet tahsil onayları buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadSenetTahsilOnaylariFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${CEK_SENET_TAHSIL_ONAY_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Çek/Senet tahsil onayları buluttan okunamadı:', err); return null; }
}
async function saveSenetTahsilOnaylariToLocal(){
  const arr = Array.from(state.cekSenetTahsilOnaylari||[]);
  try{
    const ok = await idbSet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY, arr);
    if(!ok) console.error('Çek/Senet tahsil onayları cihaza kaydedilemedi.');
  }catch(err){ console.error(err); }
  // Bulut açıksa aynı anda oraya da yazılır — cihaz kaydı başarısız olsa bile bulut denemesi
  // ayrıca yapılır (biri diğerini engellemesin diye ayrı try/catch, Promise.all ile paralel).
  if(cloudEnabled()){
    const sonuc = await saveSenetTahsilOnaylariToCloud(arr);
    if(!sonuc.ok) console.error('UYARI: Çek/Senet tahsil onayı buluta yazılamadı, sadece cihazda kaldı.');
    return sonuc.ok;
  }
  return true;
}
async function loadSenetTahsilOnaylariFromLocal(){
  try{
    // Bulut açıksa ÖNCE bulut denenir (diğer cihazlarda/tarayıcılarda yapılan onaylar da görünsün);
    // bulut yoksa/erişilemezse cihazdaki (IndexedDB) son bilinen haline düşülür.
    let arr = cloudEnabled() ? await loadSenetTahsilOnaylariFromCloud() : null;
    if(!Array.isArray(arr) || !arr.length){
      arr = await idbGet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY);
    }
    if(!Array.isArray(arr) || !arr.length){
      // Geriye dönük uyumluluk: önceden sadece Senet onayları bu eski anahtarla kaydedilmişti.
      const eski = await idbGet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY_ESKI);
      if(Array.isArray(eski) && eski.length) arr = eski;
    }
    state.cekSenetTahsilOnaylari = new Set(Array.isArray(arr) ? arr : []);
    // Cihazdaki kopyayı bulutla/eski anahtarla senkron tut (bir sonraki açılış hızlı olsun).
    if(Array.isArray(arr) && arr.length) idbSet(CEK_SENET_TAHSIL_ONAY_LOCAL_KEY, arr).catch(()=>{});
  }catch(err){ console.error(err); state.cekSenetTahsilOnaylari = new Set(); }
}

// Malzemeler (anlık depo stoğu) — son yüklenen dosya buluta kaydedilir, yeni biri yüklenene
// kadar kullanılmaya devam eder (Müşteri Master ile aynı desen). Stok Gün sekmesi açıldığında
// bu kayıt otomatik geri yüklenir, kullanıcı her seferinde dosyayı tekrar yüklemek zorunda kalmaz.
const MALZEMELER_STOK_CLOUD_PATH = CLOUD.path + '_malzemelerStok';
const MALZEMELER_STOK_LOCAL_KEY = 'noktaCariTakip_malzemelerStok_v1';
async function saveMalzemelerStokToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MALZEMELER_STOK_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MALZEMELER_STOK_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MALZEMELER_STOK_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Malzemeler stoğu buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMalzemelerStokFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MALZEMELER_STOK_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Malzemeler stoğu buluttan okunamadı:', err); return null; }
}
async function saveMalzemelerStokToLocal(obj){
  const ok = await idbSet(MALZEMELER_STOK_LOCAL_KEY, obj);
  if(!ok) console.error('Malzemeler stoğu cihaza kaydedilemedi.');
}
async function loadMalzemelerStokFromLocal(){
  try{ return await idbGet(MALZEMELER_STOK_LOCAL_KEY); }catch(err){ console.error(err); return null; }
}
async function malzemelerStokYenile(){
  let obj = null;
  if(cloudEnabled()){
    const sonuc = await cloudVeriVerimliYukle(MALZEMELER_STOK_CLOUD_PATH, loadMalzemelerStokFromCloud, loadMalzemelerStokFromLocal);
    obj = sonuc.data;
  }
  if(!obj) obj = await loadMalzemelerStokFromLocal();
  state.malzemelerStok = musteriMasterObjToMap(obj);
  return state.malzemelerStok;
}
async function malzemelerStokKaydet(map){
  state.malzemelerStok = map;
  const obj = musteriMasterMapToObj(map);
  await saveMalzemelerStokToLocal(obj);
  if(cloudEnabled()){
    const sonuc = await saveMalzemelerStokToCloud(obj);
    if(!sonuc.ok){
      // Cihaz depolama kapalı — buluta yazılamazsa bu veri hiçbir yere kalıcı kaydedilmez.
      console.error('Malzemeler Stok buluta kaydedilemedi:', sonuc.reason);
      alert('UYARI: Malzemeler Stok verisi buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse kaybolur: ' + (sonuc.reason||'bilinmeyen hata'));
    }
  }
}

// ============================== GRUP A "TEK-SLOT" DOSYA KALICILIĞI ==============================
// Ana ekrandaki A Grubu dosyalarından Kalemler DIŞINDAKİ dördü (Ticari Stok, Çek/Senet Riski,
// Ciro Primi, Dönemsel İskonto) günlük olarak yeniden yüklenmesi beklenen ama HER GÜN mutlaka
// yüklenmesi gerekmeyen dosyalardır — Müşteri Master ve Malzemeler (Stok Gün) ile TAMAMEN AYNI
// deseni kullanırlar: en son yüklenen dosyanın HAM satırları (rows) + kolon başlıkları (headers)
// buluta (ve cihaza) tek bir slotta kaydedilir; yeni bir dosya yüklendiğinde öncekinin üzerine
// yazılır. "Raporu Oluştur" sırasında o dosya seçilmemişse, buluttan/cihazdan geri yüklenen en
// son bilinen hali otomatik olarak kullanılır — kullanıcı her gün bu 4 dosyayı yeniden yüklemek
// zorunda kalmaz. Kaydedilen obje şekli: {data: rows[], headers: string[], adi: string, tarih: ISO}.
const GRUP_A_TEKIL_DOSYA_TANIMLARI = {
  ticariStok: { cloudPath: CLOUD.path + '_ticariStokDosya', localKey: 'noktaCariTakip_ticariStokDosya_v1' },
  cekSenet: { cloudPath: CLOUD.path + '_cekSenetDosya', localKey: 'noktaCariTakip_cekSenetDosya_v1' },
  ciroPrimi: { cloudPath: CLOUD.path + '_ciroPrimiDosya', localKey: 'noktaCariTakip_ciroPrimiDosya_v1' },
  donemselIskonto: { cloudPath: CLOUD.path + '_donemselIskontoDosya', localKey: 'noktaCariTakip_donemselIskontoDosya_v1' },
  // Kalemler DE bu tek-slot desene dahildir. Kullanıcı gün içinde Kalemler'i SADECE BİR KEZ yükleyip
  // diğer dosyaları (Sipariş/Tahsilat/Fatura vb.) gün içinde birden çok kez güncelliyor — bu yüzden
  // Kalemler'in HAM (ham satırlar + başlıklar) hali burada saklanıp, o gün yeniden seçilmemişse
  // otomatik geri yükleniyor. Bu, Trend Analizi/Finansal Analiz'in kullandığı GÜN-GÜN musteriSnapshot
  // arşivini (bkz. faturaKontrolArsivineKaydetVeSenkronizeEt) HİÇ ETKİLEMEZ — o arşiv tamamen ayrı,
  // bağımsız bir mekanizma ve her "Raporu Oluştur/Veri Güncelle" işleminde günün altına eklenmeye
  // devam eder, hiçbir zaman silinmez/üzerine yazılmaz. Buradaki tek-slot kayıt SADECE
  // "buildReport()'un çalışabilmesi için gereken EN GÜNCEL HAM Kalemler verisi"ni saklar.
  kalemler: { cloudPath: CLOUD.path + '_kalemlerDosya', localKey: 'noktaCariTakip_kalemlerDosya_v1' },
  // GRUP B (Sipariş/Tahsilat/Fatura/Depozito/Bayi Hakediş/Yükleme): Bu dosyalar da artık kalıcı
  // tek-slot arşivinde tutulur. Önceden yalnızca bellekteydi (state.files); sayfa yenilenip yeni
  // Kalemler yüklenince buildReport bunları bulamayıp müşteri kartlarından SİLİYORDU. Artık EN SON
  // yüklenen hali (tarih fark etmeksizin — toplu/çok-günlü dosyalar dahil, olduğu gibi) kalıcı
  // saklanır ve buildReport'a otomatik geri yüklenir. Bu, GÜN-GÜN faturaArsiv arşivini HİÇ ETKİLEMEZ
  // (o ayrı mekanizma; her satırı kendi gününe dağıtıp Belge No bazlı temizlikle biriktirmeye devam
  // eder). Buradaki tek-slot sadece "canlı kartların (Genel Rapor/Sevk) en son yüklenen dosyayı
  // yansıtabilmesi" içindir — kullanıcının onayladığı davranış: canlı kartlar en son yüklenen dosyayı
  // gösterir, geçmiş günler zaten arşivde/Fatura Kontrol'de kalıcı durur.
  siparis: { cloudPath: CLOUD.path + '_siparisDosya', localKey: 'noktaCariTakip_siparisDosya_v1' },
  tahsilat: { cloudPath: CLOUD.path + '_tahsilatDosya', localKey: 'noktaCariTakip_tahsilatDosya_v1' },
  fatura: { cloudPath: CLOUD.path + '_faturaDosya', localKey: 'noktaCariTakip_faturaDosya_v1' },
  depozitoTahsilat: { cloudPath: CLOUD.path + '_depozitoTahsilatDosya', localKey: 'noktaCariTakip_depozitoTahsilatDosya_v1' },
  bayiHakedis: { cloudPath: CLOUD.path + '_bayiHakedisHamDosya', localKey: 'noktaCariTakip_bayiHakedisHamDosya_v1' },
  yukleme: { cloudPath: CLOUD.path + '_yuklemeDosya', localKey: 'noktaCariTakip_yuklemeDosya_v1' },
  cariEkstre: { cloudPath: CLOUD.path + '_cariEkstreDosya', localKey: 'noktaCariTakip_cariEkstreDosya_v1' },
};

async function grupATekilDosyaKaydet(tip, data, headers, adi){
  const tanim = GRUP_A_TEKIL_DOSYA_TANIMLARI[tip];
  if(!tanim) return;
  // Cihaza (IndexedDB) düz obje olarak kaydedilir — orada anahtar kısıtlaması yoktur.
  const obj = { data: data||[], headers: headers||[], adi: adi||'', tarih: new Date().toISOString() };
  const ok = await idbSet(tanim.localKey, obj);
  if(!ok) console.error(LABELS[tip] + ' cihaza kaydedilemedi.');
  if(!cloudEnabled()) return;
  try{
    // KRİTİK (HTTP 400 düzeltmesi): Firebase Realtime Database, ANAHTAR isimlerinde '.', '$', '#',
    // '[', ']', '/' karakterlerini yasaklar. Excel kolon başlıkları (ör. "Faturadan Sonr.Gün",
    // "Çek/Senet Numarası", "Depoda Kalan Mk.") doğrudan JSON anahtarı olarak yazılınca Firebase
    // PUT'u 400 Bad Request ile REDDEDİYORDU — bu yüzden hiçbir Grup A/C dosyası buluta yazılamıyordu.
    // Çözüm: data ve headers'ı tek bir JSON STRING olarak (dataJson/headersJson alanlarında) yaz —
    // string bir DEĞERdir, içindeki noktalar/slash'lar anahtar olmadığı için Firebase'i ilgilendirmez.
    const bulutObj = {
      dataJson: JSON.stringify(data||[]),
      headersJson: JSON.stringify(headers||[]),
      adi: adi||'',
      tarih: obj.tarih,
      format: 'json-string-v1', // okuma tarafı bu bayrakla yeni formatı tanır (eski kayıtlar düz obje)
    };
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${tanim.cloudPath}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(bulutObj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(tanim.cloudPath, simdi);
    await cloudMetaZamaniKaydet(tanim.cloudPath, simdi);
  }catch(err){ console.error(LABELS[tip] + ' buluta kaydedilemedi:', err); }
}

// Buluttan gelen Grup A tek-slot kaydını normalize eder: yeni format (dataJson/headersJson string)
// VEYA eski format (düz data/headers dizisi) — ikisini de {data, headers, adi, tarih} olarak döndürür.
function grupATekilKaydiCoz(ham){
  if(!ham || typeof ham !== 'object') return null;
  if(ham.format === 'json-string-v1' || typeof ham.dataJson === 'string'){
    let data = [], headers = [];
    try{ data = JSON.parse(ham.dataJson || '[]'); }catch(_){ data = []; }
    try{ headers = JSON.parse(ham.headersJson || '[]'); }catch(_){ headers = []; }
    return { data, headers, adi: ham.adi || '', tarih: ham.tarih || null };
  }
  // Eski (düz) format — geriye dönük uyumluluk.
  return { data: ham.data || [], headers: ham.headers || [], adi: ham.adi || '', tarih: ham.tarih || null };
}

async function grupATekilDosyaYerelOku(tip){
  const tanim = GRUP_A_TEKIL_DOSYA_TANIMLARI[tip];
  if(!tanim) return null;
  try{ return await idbGet(tanim.localKey); }catch(err){ console.error(err); return null; }
}

async function grupATekilDosyaBuluttanOku(tip){
  const tanim = GRUP_A_TEKIL_DOSYA_TANIMLARI[tip];
  if(!tanim || !cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${tanim.cloudPath}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    // Yeni (json-string-v1) VEYA eski (düz) formatı normalize et.
    return grupATekilKaydiCoz(JSON.parse(text));
  }catch(err){ console.error(LABELS[tip] + ' buluttan okunamadı:', err); return null; }
}

// Ticari Stok/Çek-Senet/Ciro Primi/Dönemsel İskonto için: bugün yeniden seçilmemişse, ne kadar eski
// olursa olsun en son bilinen hal sorgusuz kullanılır (bu dosyalar "her gün yüklenmesi gerekmez").
// Kalemler için ise bu, KASITLI OLARAK farklıdır — bkz. KALEMLER_BUGUN_ZORUNLU aşağıda.
const GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR = new Set(['ticariStok','ciroPrimi','donemselIskonto',
  // Grup B de tarih kısıtlaması OLMADAN saklanır: en son yüklenen (çok-günlü/toplu dosyalar dahil)
  // tarih fark etmeksizin geri yüklenir. Yalnızca Kalemler bugüne-özeldir.
  'siparis','tahsilat','fatura','depozitoTahsilat','bayiHakedis','yukleme','cariEkstre']);

// Bu dosyaların hepsini paralel olarak yükler; her biri için o gün ekranda yeni bir dosya SEÇİLMİŞSE
// (state.files[tip] doluysa) o veri KULLANILIR ve aynı zamanda yeni "son bilinen hal" olarak kaydedilir;
// seçilmemişse buluttan/cihazdan en son bilinen hal geri getirilip state.files[tip]'e (buildReport'un
// beklediği {data, headers} şekliyle) yerleştirilir — böylece buildReport çağrısı her zaman aynı arayüzü
// görür, dosyanın "bugün mü yüklendi yoksa önceki gün mü kaldı" farkını bilmesine gerek kalmaz.
//
// KALEMLER_BUGUN_ZORUNLU: Kalemler diğer 4 dosyadan farklı olarak HER GÜN en az bir kez yüklenmiş
// olmalıdır (kullanıcı isteği: "Kalemleri yüklemediği hiçbir gün veri yüklemesi yapamamalı" — örn.
// bugün Kalemler yüklendi, yarın unutulup sadece Sipariş yüklenirse bu ENGELLENMELİ). Bu yüzden
// Kalemler için geri yüklenen tek-slot kaydının tarihi BUGÜNE ait değilse, state.files.kalemler
// KASITLI OLARAK DOLDURULMAZ (null bırakılır) — ardından raporuOlusturVeyaGuncelleAkisiniCalistir
// içindeki güvenlik kontrolü bunu yakalayıp net bir hata verir. Aynı GÜN içinde Kalemler bir kez
// yüklendikten sonra ise (tek-slot kaydının tarihi bugüne aitse) o gün boyunca sınırsız sayıda Grup B
// güncellemesi yapılabilir, Kalemler'in tekrar seçilmesine gerek kalmaz.
// "Bugün Kalemler yüklendi mi?" durumunu güvenilir biçimde belirler ve state.bugunKalemlerHazir'a
// yazar. İki kaynağa bakar: (1) bu oturumda bellekteki state.files.kalemler, (2) tek-slot Kalemler
// arşivindeki kaydın TARİHİ bugüne aitse. Böylece kullanıcı Kalemler'i yükleyip rapor oluşturduktan
// sonra (state.files bellekte boşalsa bile) Grup B/C panelleri "Kalemler yok" sanmaz.
async function bugunKalemlerDurumTazele(){
  // 1) Bellekte bu oturumda yüklü mü?
  if(state.files && state.files.kalemler && state.files.kalemler.data && state.files.kalemler.data.length){
    state.bugunKalemlerHazir = true;
    return true;
  }
  // 2) Tek-slot arşivinde BUGÜNE ait bir Kalemler kaydı var mı?
  try{
    const bugunKey = dateKeyLocal(new Date());
    let kayit = cloudEnabled() ? await grupATekilDosyaBuluttanOku('kalemler') : null;
    if(!kayit) kayit = await grupATekilDosyaYerelOku('kalemler');
    const kayitGunKey = (kayit && kayit.tarih) ? dateKeyLocal(new Date(kayit.tarih)) : null;
    const varMi = !!(kayit && kayit.data && kayit.data.length && kayitGunKey === bugunKey);
    state.bugunKalemlerHazir = varMi;
    return varMi;
  }catch(_){
    // Hata durumunda mevcut bilineni koru (yanlışlıkla kilitlememek için).
    return state.bugunKalemlerHazir;
  }
}

async function grupATekilDosyalariHazirla(){
  const tipler = Object.keys(GRUP_A_TEKIL_DOSYA_TANIMLARI);
  const bugunKey = dateKeyLocal(new Date());
  await Promise.all(tipler.map(async (tip)=>{
    if(state.files[tip] && state.files[tip].data && state.files[tip].data.length){
      // Bu oturumda kullanıcı yeni bir dosya seçti — bunu "son bilinen hal" olarak sakla.
      await grupATekilDosyaKaydet(tip, state.files[tip].data, state.files[tip].headers, state.files[tip].name);
      return;
    }
    // Yeni seçim yok — önce buluttan (varsa), yoksa cihazdaki önbellekten en son bilinen hali getir.
    let kayit = cloudEnabled() ? await grupATekilDosyaBuluttanOku(tip) : null;
    if(!kayit) kayit = await grupATekilDosyaYerelOku(tip);
    if(!kayit || !kayit.data || !kayit.data.length) return;
    if(!GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR.has(tip)){
      // Kalemler (tarih kısıtlaması olan tek dosya): kaydın tarihi bugüne ait değilse KASITLI
      // OLARAK doldurmadan çık — güvenlik kontrolü bunu "bugün için Kalemler yok" olarak yakalasın.
      const kayitGunKey = kayit.tarih ? dateKeyLocal(new Date(kayit.tarih)) : null;
      if(kayitGunKey !== bugunKey) return;
    }
    state.files[tip] = { name: kayit.adi || (LABELS[tip]+' (önceki yükleme)'), headers: kayit.headers||[], data: kayit.data };
  }));
}

async function saveMusteriMasterDurumToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DURUM_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(MUSTERI_MASTER_DURUM_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(MUSTERI_MASTER_DURUM_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Müşteri Master Durum buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadMusteriMasterDurumFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${MUSTERI_MASTER_DURUM_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text);
  }catch(err){ console.error('Müşteri Master Durum buluttan okunamadı:', err); return null; }
}
async function saveMusteriMasterDurumToLocal(obj){
  const ok = await idbSet(MUSTERI_MASTER_DURUM_LOCAL_KEY, obj);
  if(!ok) console.error('Müşteri Master Durum cihaza kaydedilemedi.');
}
async function loadMusteriMasterDurumFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(MUSTERI_MASTER_DURUM_LOCAL_KEY);
    return await idbGet(MUSTERI_MASTER_DURUM_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}

async function musteriMasterYenile(){
  // Aşağıdaki üç veri (Master/Detay/Durum) birbirinden bağımsız — üçü de aynı anda kontrol
  // edilip indirilir (bkz. uygulamayiBaslat'taki Promise.all açıklaması, aynı mantık).
  const [masterSonuc, detaySonuc, durumSonuc] = await Promise.all([
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_CLOUD_PATH, loadMusteriMasterFromCloud, loadMusteriMasterFromLocal) : Promise.resolve(null),
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_DETAY_CLOUD_PATH, loadMusteriMasterDetayFromCloud, loadMusteriMasterDetayFromLocal) : Promise.resolve(null),
    cloudEnabled() ? cloudVeriVerimliYukle(MUSTERI_MASTER_DURUM_CLOUD_PATH, loadMusteriMasterDurumFromCloud, loadMusteriMasterDurumFromLocal) : Promise.resolve(null),
  ]);

  let obj = masterSonuc ? masterSonuc.data : null;
  if(!obj) obj = await loadMusteriMasterFromLocal();
  state.musteriMasterMap = musteriMasterObjToMap(obj);

  let detayObj = detaySonuc ? detaySonuc.data : null;
  if(!detayObj) detayObj = await loadMusteriMasterDetayFromLocal();
  state.musteriMasterDetay = musteriMasterObjToMap(detayObj);

  let durumObj = durumSonuc ? durumSonuc.data : null;
  if(!durumObj) durumObj = await loadMusteriMasterDurumFromLocal();
  state.musteriMasterDurum = musteriMasterObjToMap(durumObj);

  return state.musteriMasterMap;
}

// Dönüş: {map, hatalar: string[]} — cihaz depolama kapalı olduğundan (kullanıcı isteği), buluta
// yazma başarısız olan alt-veriler artık HİÇBİR YERE kalıcı kaydedilmez. Eskiden bu hatalar
// sessizce yutulup sadece console.error'a düşüyordu; artık çağıran tarafa (raporuOlusturVeyaGuncelleAkisiniCalistir)
// bildirilip kullanıcıya gösterilebiliyor.
async function musteriMasterKaydet(rows, headers){
  const hatalar = [];
  const map = buildMusteriMasterMap(rows);
  state.musteriMasterMap = map;
  const obj = musteriMasterMapToObj(map);
  await saveMusteriMasterToLocal(obj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterToCloud(obj);
    if(!sonuc.ok) hatalar.push('Müşteri Master buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  const detayMap = buildMusteriMasterDetay(rows);
  state.musteriMasterDetay = detayMap;
  const detayObj = musteriMasterMapToObj(detayMap);
  await saveMusteriMasterDetayToLocal(detayObj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterDetayToCloud(detayObj);
    if(!sonuc.ok) hatalar.push('Müşteri Master Detay buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  const durumMap = buildMusteriMasterDurumMap(rows, headers);
  state.musteriMasterDurum = durumMap;
  const durumObj = musteriMasterMapToObj(durumMap);
  await saveMusteriMasterDurumToLocal(durumObj);
  if(cloudEnabled()){
    const sonuc = await saveMusteriMasterDurumToCloud(durumObj);
    if(!sonuc.ok) hatalar.push('Müşteri Master Durum buluta kaydedilemedi: '+(sonuc.reason||'bilinmeyen hata'));
  }

  if(hatalar.length) console.error('musteriMasterKaydet: bazı veriler buluta yazılamadı:', hatalar);
  map.__kaydetmeHatalari = hatalar;
  return map;
}

const BAYI_HAKEDIS_CLOUD_PATH = CLOUD.path + '_bayiHakedis';
const BAYI_HAKEDIS_LOCAL_KEY = 'noktaCariTakip_bayiHakedis_v1';

function bayiHakedisReviver(key, value){
  if(key==='tarih' && typeof value === 'string'){
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}
async function saveBayiHakedisToCloud(rapor){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${BAYI_HAKEDIS_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rapor),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const simdi = Date.now();
    await cloudMetaYazUzaktan(BAYI_HAKEDIS_CLOUD_PATH, simdi);
    await cloudMetaZamaniKaydet(BAYI_HAKEDIS_CLOUD_PATH, simdi);
    return {ok:true};
  }catch(err){ console.error('Bayi Hakediş buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadBayiHakedisFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${BAYI_HAKEDIS_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return JSON.parse(text, bayiHakedisReviver);
  }catch(err){ console.error('Bayi Hakediş buluttan okunamadı:', err); return null; }
}
async function saveBayiHakedisToLocal(rapor){
  const ok = await idbSet(BAYI_HAKEDIS_LOCAL_KEY, rapor);
  if(!ok) console.error('Bayi Hakediş cihaza kaydedilemedi.');
}
async function loadBayiHakedisFromLocal(){
  try{
    await idbMigrateFromLocalStorageOnce(BAYI_HAKEDIS_LOCAL_KEY, bayiHakedisReviver);
    return await idbGet(BAYI_HAKEDIS_LOCAL_KEY);
  }catch(err){ console.error(err); return null; }
}
async function bayiHakedisYenile(){
  let rapor = null;
  if(cloudEnabled()){
    const sonuc = await cloudVeriVerimliYukle(BAYI_HAKEDIS_CLOUD_PATH, loadBayiHakedisFromCloud, loadBayiHakedisFromLocal);
    rapor = sonuc.data;
  }
  if(!rapor) rapor = await loadBayiHakedisFromLocal();
  state.bayiHakedisReport = rapor;
  return rapor;
}
async function bayiHakedisKaydet(rapor){
  await saveBayiHakedisToLocal(rapor);
  if(cloudEnabled()){
    const sonuc = await saveBayiHakedisToCloud(rapor);
    // Cihaz depolama kapalı — buluta yazılamazsa bu veri hiçbir yere kalıcı kaydedilmez. Kullanıcı
    // isteği: bu durum artık sessiz kalmasın, ana rapor uyarılarıyla aynı tutarlılıkta alert de
    // gösterilsin (konsol logu da korunur).
    if(!sonuc.ok){
      console.error('UYARI: Bayi Hakediş raporu buluta kaydedilemedi, hiçbir yerde kalıcı değil:', sonuc.reason);
      alert('UYARI: Bayi Hakediş raporu buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse kaybolur. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
    }
  }
}

const FATURA_ARSIV_CLOUD_PATH = CLOUD.path + '_faturaKontrolArsiv';


async function loadFaturaKontrolArsivFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return null;
    return faturaKontrolArsivSnapshotlariUzat(JSON.parse(text, (key, value)=>{
      if(DATE_KEYS.has(key) && typeof value === 'string'){
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      }
      return value;
    }));
  }catch(err){
    console.error('Fatura Kontrol arşivi buluttan okunamadı:', err);
    return null;
  }
}

// authQuery() ile aynı token'ı döndürür ama '?auth=' önekini eklemez — shallow/orderBy gibi başka
// sorgu parametreleriyle birlikte kullanılabilmesi için.
async function authTokenParam(){
  if(!authAktif) return '';
  try{
    const user = window.firebaseAuthAPI.authInstance.currentUser;
    if(!user) return '';
    return await user.getIdToken(true);
  }catch(err){ return ''; }
}

// Arşivin TAMAMINI değil, yalnızca üst seviye gün ANAHTARLARINI çeker (Firebase'in shallow=true
// parametresiyle); değerler indirilmediği için veri hacmi kaç gün arşivlenmiş olursa olsun birkaç
// KB'ı geçmez. Ay dropdown'unu doldurmak veya "kaç gün arşivlenmiş" bilgisini göstermek için
// arşivin tamamını indirmeye gerek bırakmaz.
async function loadFaturaKontrolArsivGunAnahtarlariFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const params = new URLSearchParams({shallow:'true'});
    const token = await authTokenParam();
    if(token) params.set('auth', token);
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json?${params.toString()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return [];
    const obj = JSON.parse(text); // { "2026-07-01": true, "2026-07-02": true, ... }
    return Object.keys(obj).sort();
  }catch(err){
    console.error('Fatura Kontrol arşivi gün anahtarları okunamadı:', err);
    return null;
  }
}

// Yalnızca [baslangicGunKey, bitisGunKey] (uçlar dahil) aralığındaki günleri buluttan çeker.
// Firebase Realtime Database'in orderBy="$key"&startAt=...&endAt=... sorgu parametreleri sunucu
// tarafında filtreleme yapar; aralık dışındaki günlerin verisi ağa hiç inmez. Örn. Tahsilat
// Verimliliği bir ay açtığında, yıllarca birikmiş arşivin tamamı yerine yalnızca o ayın (ve
// önceki bakiye karşılaştırması için gereken birkaç günün) verisi çekilir.
async function loadFaturaKontrolArsivAraligiFromCloud(baslangicGunKey, bitisGunKey){
  if(!cloudEnabled()) return null;
  try{
    const params = new URLSearchParams({
      orderBy: '"$key"',
      startAt: `"${baslangicGunKey}"`,
      endAt: `"${bitisGunKey}"`,
    });
    const token = await authTokenParam();
    if(token) params.set('auth', token);
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json?${params.toString()}`);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const text = await res.text();
    if(!text || text==='null') return {};
    return faturaKontrolArsivSnapshotlariUzat(JSON.parse(text, (key, value)=>{
      if(DATE_KEYS.has(key) && typeof value === 'string'){
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
      }
      return value;
    }));
  }catch(err){
    console.error('Fatura Kontrol arşivi aralığı okunamadı:', err);
    return null;
  }
}

// Yalnızca DEĞİŞEN gün(ler)i buluttaki arşive PATCH eder — Firebase'in "çoklu konum güncellemesi"
// özelliğiyle, her anahtar arşiv ağacında ayrı bir alt yol olarak güncellenir; diğer günlere
// dokunulmaz. Bir günün değeri `null` verilirse o gün buluttan kalıcı olarak silinir. Bu, "Raporu
// Oluştur" her tıklandığında TÜM arşivin yeniden indirilip yeniden yazılmasının yerini alır.
async function saveFaturaKontrolArsivGunleriToCloud(guncellemeler){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  if(!guncellemeler || !Object.keys(guncellemeler).length) return {ok:true};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${FATURA_ARSIV_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(guncellemeler),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){
    console.error('Fatura Kontrol arşivi (kısmi) buluta kaydedilemedi:', err);
    return {ok:false, reason:err.message};
  }
}

// İki arşiv nesnesini (gün -> kayıt) karşılaştırır ve yalnızca içeriği değişmiş günlerin listesini
// döndürür. Yeni tarafta artık olmayan bir gün varsa değeri `null` olur (bulutta silinmesi için).
// Kullanım: sıkıştırma/temizlik gibi TÜM arşivi tarayan işlemlerden sonra, değişikliği buluta
// yazarken artık tüm ağacı değil sadece gerçekten değişen günleri PATCH etmek için.
function faturaKontrolArsivGunFarkiniBul(eskiArsiv, yeniArsiv){
  const fark = {};
  const tumGunler = new Set([...Object.keys(eskiArsiv||{}), ...Object.keys(yeniArsiv||{})]);
  tumGunler.forEach(g=>{
    const eskiVar = eskiArsiv && Object.prototype.hasOwnProperty.call(eskiArsiv, g);
    const yeniVar = yeniArsiv && Object.prototype.hasOwnProperty.call(yeniArsiv, g);
    const eskiJson = eskiVar ? JSON.stringify(eskiArsiv[g]) : null;
    const yeniJson = yeniVar ? JSON.stringify(yeniArsiv[g]) : null;
    if(eskiJson !== yeniJson){
      fark[g] = yeniVar ? yeniArsiv[g] : null;
    }
  });
  return fark;
}

const SAHA_MUDUR_MAP = {
  'Sıtkı Berkay Katrancı': 'Uğur Ergin',
  'Alican Akbaş': 'Uğur Ergin',
  'Altuğ Aksu': 'Mertcan Çınar',
  'Ali Yüksel': 'Mertcan Çınar',
  'Mehmetcan Yılmaz': 'Mertcan Çınar',
  'Berk Kutay Korkmaz': 'Mertcan Çınar',
  'Doğuş Ark': 'Yusuf Akdoğan',
  'Ferhat Fatih İrkin': 'Yusuf Akdoğan',
  'Hasan Akel': 'Yusuf Akdoğan',
};
function normalizeAdSoyad(s){
  return String(s||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('tr');
}
const SAHA_MUDUR_LOOKUP = {};
Object.keys(SAHA_MUDUR_MAP).forEach(k=>{ SAHA_MUDUR_LOOKUP[normalizeAdSoyad(k)] = SAHA_MUDUR_MAP[k]; });
function getSahaMuduru(temsilci){
  if(!temsilci || temsilci==='—') return 'Tanımsız';
  return SAHA_MUDUR_LOOKUP[normalizeAdSoyad(temsilci)] || 'Tanımsız';
}

const TL = n => (Math.round(n||0)).toLocaleString('tr-TR') + ' ₺';
const NUM = n => (Math.round(n||0)).toLocaleString('tr-TR');
const MK = n => NUM(n) + ' Mk.';
const LT = n => NUM(n) + ' Lt.';
const fmtDate = d => d instanceof Date && !isNaN(d) ? d.toLocaleDateString('tr-TR') : '—';
// EFES gibi dahili/şirket-içi kayıtlar gerçek bir cari değildir — Fatura Dökümü, Depozito
// Tahsilatı, Tahsilat Dökümü, Sipariş Dökümü ve Bayi Hak Ediş dosyalarındaki İLGİLİ satırlar bu
// fonksiyonla TUTARLI şekilde filtrelenir (tek bir yerde tanımlı, her dosya döngüsünde aynı kural).
const GECERSIZ_MUSTERI_KODLARI = new Set(['EFES']);
function musteriGecerliMi(musteriNo){
  const kod = String(musteriNo||'').trim().toUpperCase();
  if(!kod) return false;
  return !GECERSIZ_MUSTERI_KODLARI.has(kod);
}

function dateKeyLocal(d){
  if(!(d instanceof Date) || isNaN(d)) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Verilen gün anahtarları (YYYY-MM-DD) listesinden, hedef güne (yine YYYY-MM-DD) GÜN OLARAK EN
// YAKIN olanını döndürür (geçmiş veya gelecek fark etmez, en küçük mutlak gün farkı kazanır;
// eşitlik durumunda geçmişteki gün tercih edilir — veri zaten gerçekleşmiş kabul edilir). Liste
// boşsa veya hedef günü yoksa null döner.
function enYakinGunKey(gunListesi, hedefGunKey){
  if(!gunListesi || !gunListesi.length || !hedefGunKey) return null;
  const hedefMs = new Date(hedefGunKey+'T00:00:00Z').getTime();
  if(isNaN(hedefMs)) return null;
  let enYakinGun = null, enKucukFark = Infinity, enYakinMs = null;
  gunListesi.forEach(g=>{
    const ms = new Date(g+'T00:00:00Z').getTime();
    if(isNaN(ms)) return;
    const fark = Math.abs(ms - hedefMs);
    if(fark < enKucukFark || (fark === enKucukFark && (enYakinMs===null || ms < enYakinMs))){
      enKucukFark = fark; enYakinGun = g; enYakinMs = ms;
    }
  });
  return enYakinGun;
}

const SIGNATURES = {
  kalemler: [['Kalan Borç','Faturadan Sonr.Gün','Borç/alacak']],
  siparis: [['Sipariş Toplam Tutar','Teslimat Durumu']],
  tahsilat: [
    ['Belge Tipi','Tahsilat Alan','Ödeme Tipi'],
    ['Belge Tutarı','Çek/Senet Durumu','Müşt. Kodu'],
  ],
  cekSenet: [['Esas Borçlu','Çek/Senet Numarası']],
  ticariStok: [['Depoda Kalan Mk.','Depoda Kalan Lt.','Malzeme Kodu']],
  fatura: [['Ödenecek Tutar','Toplam Litre','Fatura Numarası']],
  bayiHakedis: [['Bayi Tutar','Efes Payı %','Müşteri Alacak Dekont No']],
  yukleme: [['Müşteri Numarası','Litre Total','Yükleme Tarihi']],
  musteriMaster: [['Müşteri','Tabela Adı','Kredi limiti']],
  ciroPrimi: [['Grup Tanım','Efpa Payı Tutar','Net Tutar']],
  donemselIskonto: [['Nokta Kodu','Hakediş Tutar','Perid']],
  sellOut: [['Müşteri Kanalı Tnm.','Açık/Otel Tnm.','Hacim Segmenti Tnm.']],
  depozitoTahsilat: [['Fatura Belge No','Sipariş Net Tutar','İstenilen Sevk Tarihi']],
  // Cari Hesap Ekstre Özet: müşteri bazlı gerçek cari bakiye (Borç/Alacak/Bakiye). "Müşteri Ünvan"
  // + "Bakiye" kombinasyonu bu dosyaya özgüdür — başka hiçbir dosyada birlikte bulunmaz.
  cariEkstre: [['Müşteri Ünvan','Bakiye','Müşteri Ad']],
};
const LABELS = { kalemler:'Kalemler (Fatura / Bakiye)', siparis:'Sipariş Dökümü', tahsilat:'Tahsilat Dökümü', cekSenet:'Çek / Senet Riski', ticariStok:'Ticari Stok', fatura:'Fatura Dökümü', bayiHakedis:'Bayi Hak Ediş', yukleme:'Yükleme Raporu', musteriMaster:'Müşteri Master', ciroPrimi:'Ciro Primi', donemselIskonto:'Dönemsel İskonto', sellOut:'Sell Out Raporu', depozitoTahsilat:'Depozito Tahsilatı', cariEkstre:'Cari Hesap Ekstre' };

// "Vadesi gelmiş" fatura eşiği (TEK KAYNAK): bir faturanın "Faturadan Sonr. Gün" değeri bu eşik
// ve üstündeyse kalan borcu "vadesi gelmiş" sayılır; altındaysa "vadesi gelmemiş" kabul edilir.
// İş kuralı değişirse yalnızca burası güncellenir (önceden 23 sayısı üç ayrı yere gömülüydü).
const VADE_ESIGI_GUN = 23;

// GRUP B: bu dosya tipleri artık ana ekran dropzone/checklist'inde DEĞİL, üst panelde
// ("Günlük Veri Yükle" — bkz. #gvyPanel) yükleniyor. Aynı state.files yapısı ve aynı
// handleFiles/detectType mekanizması kullanılır — sadece dosya SEÇİMİNİN yapıldığı arayüz
// ayrı bir yere taşınmıştır; buildReport ve arşivleme mantığına dokunulmamıştır.
const GVY_DOSYA_TIPLERI = ['siparis','tahsilat','fatura','depozitoTahsilat','bayiHakedis','yukleme','cariEkstre'];
// Grup C ("Günlük Veri Yükle"): gün içinde sürekli güncellenebilen, son yüklenen hali kalıcı
// tek-slot arşivde saklanan dosyalar. Bunlar GRUP_A_TEKIL_DOSYA_TANIMLARI'nda zaten kayıtlı
// (aynı kalıcı mekanizmayı kullanır) ve GRUP_A_TARIH_KISITLAMASI_OLMAYANLAR üyesidir — yani
// tarih fark etmeksizin en son yüklenen hali otomatik geri getirilir.
// "cekSenet" ARTIK Grup C'de DEĞİL (kullanıcı isteği) — Çek/Senet Riski dosyası kaldırıldı; bu
// bilgi artık doğrudan Tahsilat Dökümü'ndeki "Alınan Çek"/"Alınan Senet" satırlarından (bkz.
// buildReport'taki tahsilatArsiv/cekSenetMap) besleniyor, ayrı bir dosya yüklemeye gerek yok.
const GRUP_C_DOSYA_TIPLERI = ['ticariStok','ciroPrimi','donemselIskonto'];
// Grup C'de o an ekranda seçili (henüz kaydedilmemiş) dosya sayısı — buton kilidi için.
function GRUP_C_HAZIR_SAYISI(){ return GRUP_C_DOSYA_TIPLERI.filter(t=>state.filesC && state.filesC[t]).length; }

function detectType(headers){
  const set = new Set(headers.map(h=>String(h||'').trim()));
  for(const type of Object.keys(SIGNATURES)){
    if(SIGNATURES[type].some(sig=>sig.every(k=>set.has(k)))) return type;
  }
  return null;
}

function sheetToObjects(ws){
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  if(!rows.length) return {headers:[], data:[]};
  const headers = rows[0].map(h=>String(h||'').trim());
  const data = [];
  for(let i=1;i<rows.length;i++){
    const r = rows[i];
    if(r.every(v=>v===null||v==='')) continue;
    const obj = {};
    headers.forEach((h,idx)=>{ if(h) obj[h] = r[idx]===undefined?null:r[idx]; });
    data.push(obj);
  }
  return {headers, data};
}

function excelDateToJS(v){
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(typeof v === 'number'){
    const d = XLSX.SSF.parse_date_code(v);
    if(d) return new Date(Date.UTC(d.y,d.m-1,d.d));
  }
  // GÜVENLİK AĞI: bazı satırlarda SheetJS'in cellDates dönüşümü (kaynak SAP dosyasındaki karma/
  // özel hücre biçimleri nedeniyle) tarihi Date/sayı yerine METİN olarak bırakabiliyor — bu
  // durumda "Tarih" sütunu sessizce "—" görünüyordu (Gün/Vade sütunları zaten dosyadaki hazır
  // sayısal alanlardan geldiği için etkilenmiyordu). Böyle bir string gelirse önce ISO/olağan
  // tarih biçimleriyle, olmazsa gün.ay.yıl (tr) biçimiyle ayrıştırmayı dener.
  if(typeof v === 'string' && v.trim()){
    const s = v.trim();
    const isoDenemesi = new Date(s);
    if(!isNaN(isoDenemesi.getTime())) return isoDenemesi;
    const trEslesme = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/);
    if(trEslesme){
      let [, gun, ay, yil] = trEslesme;
      if(yil.length===2) yil = '20'+yil;
      const d = new Date(Date.UTC(Number(yil), Number(ay)-1, Number(gun)));
      if(!isNaN(d.getTime())) return d;
    }
  }
  return null;
}
function turkiyeSimdi(){
  return new Date(Date.now() + 3*60*60*1000);
}
function turkiyeBugun(){
  const t = turkiyeSimdi();
  // BİLİNEN KISIT (bilinçli): Dönen değer UTC gece yarısına çapalıdır ama uygulama genelinde
  // dateKeyLocal()/getDate() gibi YEREL erişimcilerle okunur. Cihaz saat dilimi UTC+0 veya
  // pozitifse (Türkiye dahil, +3) gün DOĞRU çıkar; yalnızca NEGATİF ofsetli bir cihazda
  // (ör. Amerika kıtası) gün 1 geri kayar. Kullanıcılar Türkiye'de olduğundan ve bu anahtarlar
  // arşivde tarihsel olarak bu şekilde yazıldığından, geriye dönük uyumluluk adına DEĞİŞTİRMEYİN.
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
function excelDateToJSArti1Gun(v){
  const d = excelDateToJS(v);
  if(!d) return null;
  return new Date(d.getTime() + 86400000);
}

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const uploadError = document.getElementById('uploadError');
const buildBtn = document.getElementById('buildBtn');
const statusPill = document.getElementById('statusPill');
const statusPillMsg = document.getElementById('statusPillMsg');
const resetBtn = document.getElementById('resetBtn');
const syncBtn = document.getElementById('syncBtn');

// Sidebar'daki (sbResetBtn/sbSyncBtn/sbLogoutBtn) ikon butonları, gerçek topbar butonlarının
// (resetBtn/syncBtn/authLogoutBtn) görünürlüğünü ve tıklama davranışını birebir yansıtır —
// böylece iki ayrı görünürlük durumu elle senkron tutulmak zorunda kalınmaz.
function syncSidebarFooterButtons(){
  const pairs = [['sbResetBtn','resetBtn'], ['sbSyncBtn','syncBtn'], ['sbLogoutBtn','authLogoutBtn']];
  pairs.forEach(([sbId, realId])=>{
    const sb = document.getElementById(sbId);
    const real = document.getElementById(realId);
    if(!sb || !real) return;
    sb.style.display = (real.style.display==='none' || getComputedStyle(real).display==='none') ? 'none' : 'inline-flex';
  });
}
['sbResetBtn','sbSyncBtn','sbLogoutBtn'].forEach((sbId,i)=>{
  const realId = ['resetBtn','syncBtn','authLogoutBtn'][i];
  document.getElementById(sbId)?.addEventListener('click', ()=> document.getElementById(realId)?.click());
});
new MutationObserver(syncSidebarFooterButtons).observe(document.getElementById('resetBtn'), {attributes:true, attributeFilter:['style']});
new MutationObserver(syncSidebarFooterButtons).observe(document.getElementById('syncBtn'), {attributes:true, attributeFilter:['style']});
new MutationObserver(syncSidebarFooterButtons).observe(document.getElementById('authLogoutBtn'), {attributes:true, attributeFilter:['style']});
syncSidebarFooterButtons();

// Üst action bar'daki durum rozeti (statusPillMain), asıl statusPill ile birebir aynı metni ve
// "ok" (başarılı) durumunu gösterir — tek bir yerden (statusPillMsg/statusPill) güncellenen
// mevcut mantığı iki kez yazmak yerine burada pasif olarak yansıtıyoruz.
function syncStatusPillMain(){
  const mainMsg = document.getElementById('statusPillMainMsg');
  const mainPill = document.getElementById('statusPillMain');
  if(!mainMsg || !mainPill) return;
  mainMsg.textContent = statusPillMsg.textContent;
  mainPill.classList.toggle('ok', statusPill.classList.contains('ok'));
}
new MutationObserver(syncStatusPillMain).observe(statusPillMsg, {characterData:true, childList:true, subtree:true});
new MutationObserver(syncStatusPillMain).observe(statusPill, {attributes:true, attributeFilter:['class']});
syncStatusPillMain();

dropzone.addEventListener('click', ()=>fileInput.click());
dropzone.addEventListener('keydown', e=>{
  if(e.key==='Enter' || e.key===' ' || e.key==='Spacebar'){
    e.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', e=>{e.preventDefault(); dropzone.classList.add('drag');});
dropzone.addEventListener('dragleave', ()=>dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e=>{
  e.preventDefault(); dropzone.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', e=>handleFiles(e.target.files));

function showError(msg){
  uploadError.textContent = msg;
  uploadError.style.display = 'block';
}
function clearError(){ uploadError.style.display='none'; uploadError.textContent=''; }

// Kabul edilen dosya uzantıları ve maksimum güvenli boyut (ana iş parçacığında okunduğu için
// aşırı büyük dosyalar UI'ı dondurabilir — üstünde uyarı verilir ama okuma yine denenir).
const KABUL_EDILEN_UZANTILAR = ['.xlsx', '.xls'];
const MAKS_DOSYA_BOYUTU_MB = 25;

// Bir çalışma kitabındaki TÜM sekmeleri sırayla deneyip başlıkları tanınabilen (detectType
// bir tip döndüren) İLK sekmeyi döndürür. Böylece veri ilk sekmede değil de ikinci/üçüncü
// sekmedeyse ya da ilk sekme boş bir kapak sayfasıysa dosya sessizce boş okunmaz.
// Hiçbir sekme tanınamazsa, teşhis için ilk sekmenin başlıklarıyla birlikte null tip döner.
function ilkUygunSayfayiSec(wb){
  let ilkParse = null;
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    if(!ws) continue;
    const parsed = sheetToObjects(ws);
    if(ilkParse === null) ilkParse = {...parsed, sheetName};
    const type = detectType(parsed.headers);
    if(type) return {type, headers:parsed.headers, data:parsed.data, sheetName};
  }
  // Tanınan sekme yok: en azından ilk (boş olmayan) sekmenin başlıklarını teşhise geri ver.
  return ilkParse ? {type:null, headers:ilkParse.headers, data:ilkParse.data, sheetName:ilkParse.sheetName}
                  : {type:null, headers:[], data:[], sheetName:null};
}

// Tek bir dosyayı okur ve {file, durum, mesaj} döndürür (durum: 'ok' | 'bos' | 'taninmadi' | 'hata').
// Hiçbir yan etki (state/DOM) YOK — çağıran, tüm dosyalar bitince tek seferde uygular ve özetler.
function dosyaOku(file){
  return new Promise(resolve=>{
    // 1) Uzantı doğrulaması: .xlsx/.xls dışındaki dosyalar (ör. sürüklenen bir .pdf/.png) XLSX.read'e
    //    hiç gitmeden erken, anlaşılır bir mesajla reddedilir.
    const ad = String(file.name||'');
    const uzantiUygun = KABUL_EDILEN_UZANTILAR.some(u=>ad.toLowerCase().endsWith(u));
    if(!uzantiUygun){
      resolve({file, durum:'hata', mesaj:'"'+ad+'" bir Excel dosyası değil (yalnızca '+KABUL_EDILEN_UZANTILAR.join(' / ')+' desteklenir).'});
      return;
    }
    // 2) Boyut uyarısı (okuma yine denenir).
    const buyukMu = file.size && file.size > MAKS_DOSYA_BOYUTU_MB*1024*1024;

    const reader = new FileReader();
    reader.onerror = ()=> resolve({file, durum:'hata', mesaj:'Dosya okunamadı: '+ad});
    reader.onload = ev => {
      try{
        const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
        const {type, headers, data} = ilkUygunSayfayiSec(wb);
        if(!type){
          // En yakın imzayı ve eksik kolonları göstererek teşhisi hızlandır.
          const headerSet = new Set(headers.map(h=>String(h||'').trim()));
          let enYakinTip = null, enYakinEksik = null, enAzEksikSayisi = Infinity;
          Object.keys(SIGNATURES).forEach(tip=>{
            SIGNATURES[tip].forEach(sig=>{
              const eksik = sig.filter(k=>!headerSet.has(k));
              if(eksik.length < enAzEksikSayisi){
                enAzEksikSayisi = eksik.length; enYakinTip = tip; enYakinEksik = eksik;
              }
            });
          });
          const ipucu = (enYakinTip && enAzEksikSayisi>0 && enAzEksikSayisi<=2)
            ? ' "'+(LABELS[enYakinTip]||enYakinTip)+'" dosyasına en çok benziyor ama şu kolon(lar) eksik: '+enYakinEksik.join(', ')+'.'
            : ' Bulunan kolonlar: '+headers.slice(0,8).join(', ')+(headers.length>8?'…':'')+'.';
          resolve({file, durum:'taninmadi', mesaj:'"'+ad+'" tanınamadı ve atlandı.'+ipucu+' Beklenen kolon başlıklarını içeren bir SAP dışa aktarım dosyası olduğundan emin olun.'});
          return;
        }
        // Başarılı: veriyi taşı (state değişikliği burada yapılır; tek dosya = tek yazma, yarış yok).
        state.files[type] = {name:ad, headers, data};
        const bosMu = !data.length;
        let mesaj = null;
        if(bosMu){
          mesaj = '"'+ad+'" '+(LABELS[type]||type)+' olarak tanındı ancak içinde hiç veri satırı yok (yalnızca başlık satırı bulundu). Dosyanın doğru/filtrelenmemiş SAP dışa aktarımı olduğundan emin olun.';
        } else if(buyukMu){
          mesaj = '"'+ad+'" '+(LABELS[type]||type)+' olarak işlendi (dosya '+MAKS_DOSYA_BOYUTU_MB+' MB üzerinde olduğundan işlem biraz sürebilir).';
        }
        resolve({file, durum:bosMu?'bos':'ok', tip:type, mesaj});
      }catch(err){
        resolve({file, durum:'hata', mesaj:'Dosya okunamadı: '+ad+' — '+err.message});
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// Birden fazla dosya aynı anda yüklendiğinde her biri kendi asenkron onload'ında showError
// çağırıp öncekini EZİYORDU (yalnızca son biten mesaj görünüyordu). Artık tüm okumalar
// Promise.all ile toplanır ve bittiğinde TEK BİRLEŞİK özet gösterilir.
// xlsx kütüphanesi yüklendi mi? (CDN erişilemezse veya onerror tetiklendiyse false.)
function xlsxHazirMi(){
  return typeof XLSX !== 'undefined' && !window.__xlsxYuklenemedi;
}

function handleFiles(fileList){
  clearError();
  const files = Array.from(fileList);
  if(!files.length) return;
  // KRİTİK: Excel okuma kütüphanesi (xlsx) yüklenemediyse, dosyalar sessizce/anlamsız hatayla
  // çökmesin — kullanıcıya net bir açıklama göster ve işlemi durdur.
  if(!xlsxHazirMi()){
    showError('Excel okuma bileşeni (xlsx) yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin. Sorun sürerse ağ, CDN erişimini (cdnjs.cloudflare.com) engelliyor olabilir.');
    return;
  }
  Promise.all(files.map(dosyaOku)).then(sonuclar=>{
    const basarili = sonuclar.filter(s=>s.durum==='ok');
    const bos      = sonuclar.filter(s=>s.durum==='bos');
    const atlanan  = sonuclar.filter(s=>s.durum==='taninmadi');
    const hatali   = sonuclar.filter(s=>s.durum==='hata');

    // DOM'u tek seferde güncelle.
    updateChecklist();
    if(typeof updateGvyPanel === 'function') updateGvyPanel();

    // Birleşik özet mesajı. Sorunlu (boş/atlanan/hatalı) dosyalar tek tek ayrıntılı listelenir;
    // sadece başarı varsa hata alanı temiz bırakılır.
    const sorunlar = [...bos, ...atlanan, ...hatali];
    if(!sorunlar.length){ clearError(); return; }

    const parcalar = [];
    if(basarili.length) parcalar.push(basarili.length+' dosya sorunsuz tanındı.');
    sorunlar.forEach(s=>{ if(s.mesaj) parcalar.push(s.mesaj); });
    showError(parcalar.join(' '));
  });
}

function updateChecklist(){
  Object.keys(state.files).forEach(type=>{
    const item = document.querySelector('.check-item[data-type="'+type+'"]');
    // Grup B dosyaları (Sipariş/Tahsilat/Fatura/Depozito Tahsilat/Bayi Hak Ediş) artık ana ekran
    // checklist'inde DEĞİL, üst panelde "Günlük Veri Yükle" panelinde gösteriliyor — bu tipler için
    // ana ekranda karşılık gelen bir .check-item elementi yok, o yüzden burada güvenle atlanır.
    if(!item) return;
    const meta = item.querySelector('.check-meta');
    const info = state.files[type];
    if(info){
      // 0 satırlık dosyalar teknik olarak "yüklendi" sayılsa da (kullanıcı bilerek devam
      // edebilir, bkz. handleFiles'daki showError uyarısı), checklist'te normal bir "✓ tamam"
      // ile aynı yeşil görünüme sahip olmaları kullanıcının bu satırı atlamasına neden
      // olabiliyordu. Boşsa "done" yerine ayrı bir uyarı sınıfı ve ikonuyla gösteriyoruz.
      const bosDosya = info.data.length === 0;
      item.classList.toggle('done', !bosDosya);
      item.classList.toggle('bos-veri-uyari', bosDosya);
      item.querySelector('.check-icon').innerHTML = bosDosya
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-check" aria-hidden="true"></i>';
      meta.textContent = info.name + ' · ' + info.data.length.toLocaleString('tr-TR') + ' satır' + (bosDosya ? ' — ⚠️ veri boş' : '');
    }else{
      item.classList.remove('done');
    }
  });
  // Ana ekran (Grup A) artık YALNIZCA Kalemler (zorunlu) + Müşteri Master (opsiyonel) gösterir.
  // Sayaç bu iki dosyaya göre hesaplanır — Grup B (Sipariş/Tahsilat/… üst panel "Arşiv Verisi")
  // ve Grup C (Çek/Senet/Stok/Ciro/İskonto üst panel "Günlük Veri") ile kanal dosyaları buraya
  // dahil edilmez. Ana ekranda tek zorunlu dosya Kalemler'dir; Müşteri Master opsiyoneldir.
  const anaEkranTipleri = ['kalemler','musteriMaster'];
  const kalemlerLoaded = Boolean(state.files.kalemler);
  const total = anaEkranTipleri.length;
  const loadedCount = anaEkranTipleri.filter(t=> Boolean(state.files[t])).length;
  const allLoaded = loadedCount === total;
  buildBtn.disabled = !kalemlerLoaded;
  // Kalemler zorunlu, Müşteri Master opsiyonel: Kalemler yüklüyse rapor oluşturulabilir. Buton
  // metni kullanıcıyı yanıltmasın — Müşteri Master eksikse "opsiyonel" olduğu için engel yok.
  buildBtn.textContent = 'Raporu Oluştur';
  statusPillMsg.textContent = allLoaded
    ? (total+'/'+total+' dosya hazır')
    : (kalemlerLoaded
        ? (loadedCount+'/'+total+' dosya · Kalemler hazır (Müşteri Master opsiyonel)')
        : ('Kalemler bekleniyor (zorunlu)'));
  if(kalemlerLoaded) statusPill.classList.add('ok');
}

// "Raporu Oluştur" (ana ekran) ve "Veri Güncelle" (Grup B / Günlük Veri Yükle paneli) AYNI akışı
// kullanır — hesaplama/arşivleme mantığı tek bir yerde (burada) yaşar, iki farklı buton bunu
// tetikler. Bu sayede Grup B paneli için ayrı/bağımsız bir hesaplama motoru yazmaya gerek kalmaz.
async function raporuOlusturVeyaGuncelleAkisiniCalistir(){
  try{
    let musteriMasterMapKullanilacak = state.musteriMasterMap;
    if(state.files.musteriMaster){
      musteriMasterMapKullanilacak = buildMusteriMasterMap(state.files.musteriMaster.data);
      state.musteriMasterMap = musteriMasterMapKullanilacak;
      const kaydedilenMap = await musteriMasterKaydet(state.files.musteriMaster.data, state.files.musteriMaster.headers);
      if(kaydedilenMap.__kaydetmeHatalari && kaydedilenMap.__kaydetmeHatalari.length){
        // Cihaz depolama kapalı — Müşteri Master buluta yazılamazsa bu veri HİÇBİR YERDE
        // kalıcı değildir, sayfa yenilenirse kaybolur. Rapor oluşturmayı durdurmuyoruz (Kalemler
        // zaten işlenecek) ama kullanıcıyı açıkça uyarıyoruz.
        alert('UYARI: Müşteri Master verisi buluta kaydedilemedi (cihaza da kaydedilmiyor, bu özellik kapalı) — sayfa yenilenirse bu veri kaybolur:\n\n' + kaydedilenMap.__kaydetmeHatalari.join('\n'));
      }
    }
    // Ticari Stok/Çek-Senet/Ciro Primi/Dönemsel İskonto: bugün yeniden seçilmemişse en son bilinen
    // hali (ne kadar eski olursa olsun) otomatik getirir. Kalemler için ise SADECE BUGÜNE ait bir
    // kayıt varsa doldurulur — aynı gün içinde tekrar seçmenize gerek kalmaz, ama YENİ bir güne
    // geçilip Kalemler o gün için hiç yüklenmediyse bilerek BOŞ bırakılır (bkz.
    // grupATekilDosyalariHazirla ve KALEMLER_BUGUN_ZORUNLU açıklaması).
    await grupATekilDosyalariHazirla();
    // GÜVENLİK KONTROLÜ: Kalemler bugün için hiç yüklenmediyse (ne bu oturumda ne tek-slot kaydında)
    // hiçbir dosya işlenmez — kullanıcı isteği: "Kalemleri yüklemediği hiçbir gün veri yüklemesi
    // yapamamalı" (bugün Kalemler yüklenip yarın unutulup sadece Sipariş yüklenmesi senaryosunun
    // önüne geçmek için). Eskiden bu durumda "Cannot read properties of null (reading 'data')" diye
    // anlamsız bir hata fırlatılıyordu, artık net bir mesaj veriliyor.
    if(!state.files.kalemler || !state.files.kalemler.data || !state.files.kalemler.data.length){
      throw new Error('Bugün için Kalemler dosyası henüz yüklenmedi. Diğer dosyalar (Sipariş/Tahsilat/Fatura vb.) işlenmeden önce bugün en az bir kez Kalemler dosyasını yüklemeniz gerekir.');
    }
    state.report = buildReport(state.files, musteriMasterMapKullanilacak);
    // Bu noktada Kalemler kesinlikle yüklü ve grupATekilDosyalariHazirla ile bugünün tarihiyle
    // tek-slot arşivine kaydedildi — Grup B/C panellerinin "Kalemler yok" sanmaması için bayrağı set et.
    state.bugunKalemlerHazir = true;
    await bayiHakedisRaporuOlustur();
    await sellOutRaporuOlustur();
    renderReport(state.report);
    document.getElementById('uploadCard').style.display='none';
    document.getElementById('reportSection').style.display='block';
    document.body.classList.add('has-sidebar');
    resetBtn.style.display='inline-block';
    // ÖNEMLİ: Cihaz depolama (IndexedDB) tamamen devre dışı (kullanıcı isteği) — saveReportToStorage
    // artık gerçekte HİÇBİR YERE yazmayan bir no-op'tur, her zaman true döner. Bu yüzden onun
    // sonucuna güvenip "kaydedildi" demek YANLIŞ OLURDU; gerçek kalıcılık YALNIZCA bulut yazması
    // (saveReportToCloud) başarılı olursa vardır. Aşağıdaki mesajlar buna göre düzenlenmiştir.
    await saveReportToStorage(state.report);
    faturaKontrolArsivineKaydetVeSenkronizeEt(state.report);
    await yuklemeRaporuOlusturVeArsivle();
    document.getElementById('storageNote').style.display = 'block';
    if(cloudEnabled()){
      syncBtn.style.display = 'inline-block';
      statusPillMsg.textContent = 'Rapor oluşturuldu, buluta yükleniyor…';
      const res = await saveReportToCloud(state.report);
      if(res.ok){
        statusPillMsg.textContent = 'Rapor buluta yüklendi — diğer cihazlarda da görünecek';
        statusPill.classList.add('ok');
        document.getElementById('storageNoteMsg').textContent = 'Bu rapor buluta yüklendi; aynı bağlantıyı kullanan diğer cihazlar sayfayı açtığında (veya "Diğer Cihazdan Güncelle" ile) otomatik görecek.';
        // iOS'ta kullanıcı ilk raporunu başarıyla oluşturduğunda — uygulamayı ana ekrana
        // eklemeye en istekli olduğu an — kurulum ipucunu (bir kereye mahsus) gösteriyoruz.
        if(typeof window.iosKurulumIpucunuGoster === 'function') window.iosKurulumIpucunuGoster(true);
      }else{
        // Cihaz depolama olmadığı için bulut yazması başarısız olursa rapor HİÇBİR YERDE kalıcı
        // DEĞİLDİR — sayfa yenilenirse kaybolur. Bunu kullanıcıdan gizlemek yerine açıkça belirtiyoruz.
        statusPillMsg.textContent = 'UYARI: Rapor buluta kaydedilemedi — sayfa yenilenirse kaybolur!';
        statusPill.classList.remove('ok');
        document.getElementById('storageNoteMsg').textContent = 'Bulut bağlantısı/yetkisi başarısız olduğu için bu rapor HİÇBİR YERE kalıcı kaydedilmedi (cihaz depolama kapalı). Lütfen giriş durumunuzu ve internet bağlantınızı kontrol edip "Diğer Cihazdan Güncelle" veya tekrar "Raporu Oluştur" ile yeniden deneyin.';
        alert('UYARI: Rapor buluta kaydedilemedi. Cihaza da kaydedilmiyor (bu özellik kapalı) — sayfayı yenilerseniz bu rapor kaybolur. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
      }
    }else{
      // Bulut kapalıyken (BULUTSUZ_TEST açık veya CLOUD yapılandırması eksik) veri kesinlikle
      // hiçbir yere kalıcı yazılamaz — kullanıcıyı yanıltmamak için net şekilde uyarıyoruz.
      statusPillMsg.textContent = 'UYARI: Bulut bağlantısı kapalı — rapor kalıcı kaydedilmedi!';
      statusPill.classList.remove('ok');
      document.getElementById('storageNoteMsg').textContent = 'Bulut bağlantısı şu an kapalı (cihaz depolama da devre dışı) — bu rapor hiçbir yere kalıcı kaydedilmedi, sayfa yenilenirse kaybolur.';
    }
  }catch(err){
    showError('Rapor oluşturulurken hata oluştu: ' + err.message);
    console.error(err);
    throw err; // Grup B panelinin "Veri Güncelle" butonu da bu hatayı yakalayıp kendi durum mesajında gösterebilsin diye yeniden fırlatılır.
  }
}
buildBtn.addEventListener('click', raporuOlusturVeyaGuncelleAkisiniCalistir);

syncBtn.addEventListener('click', async ()=>{
  if(!cloudEnabled()) return;
  if(!(await ortakSifreDogrula('Diğer cihazdan güncellemek için şifreyi girin:'))) return;
  syncBtn.disabled = true;
  const prevText = syncBtn.textContent;
  syncBtn.textContent = '🔄 Güncelleniyor…';
  try{
    // Bu 6 çağrı da (uygulamayiBaslat'taki gibi) birbirinden bağımsız — paralel çalıştırılır.
    const [cloudReport] = await Promise.all([
      loadReportFromCloud(),
      faturaArsivYenile(true),
      musteriMasterYenile(),
      bayiHakedisYenile(),
      sellOutHedefYenile(),
      sellOutYenile(),
      sellOutArsivYenile(true),
    ]);
    if(document.getElementById('bayiHakedisView') && document.getElementById('bayiHakedisView').style.display !== 'none') renderBayiHakedisView();
    if(document.getElementById('sellOutView') && document.getElementById('sellOutView').style.display !== 'none') renderSellOutView();
    if(document.getElementById('faturaKontrolArsivBilgi')) await renderFaturaKontrolArsivBilgi();
    if(cloudReport && cloudReport.musteriler && cloudReport.musteriler.length){
      raporuNormalizeEt(cloudReport); // eksik alanlara dayanıklılık
      state.report = cloudReport;
      state.expanded.clear();
      await saveReportToStorage(cloudReport);
      canliGunlerleGuncelle(cloudReport);
      renderReport(cloudReport);
      statusPillMsg.textContent = 'Buluttan güncellendi (' + fmtDate(cloudReport.asOf) + ')';
      statusPill.classList.add('ok');
    }else{
      statusPillMsg.textContent = 'Buluttan veri alınamadı, mevcut rapor gösteriliyor';
    }
  }catch(err){
    console.error('Diğer cihazdan güncelleme başarısız:', err);
    alert('Güncelleme sırasında bir hata oluştu: ' + err.message + '\n\nLütfen tekrar deneyin.');
  }finally{
    syncBtn.disabled = false;
    syncBtn.textContent = prevText;
  }
});
