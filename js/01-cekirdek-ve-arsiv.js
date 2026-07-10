
// Geliştirme günlükleri (console.warn) tek bir bayrağın ardındadır: üretimde DEBUG=false ile
// konsol gürültüsü kapatılır. Gerçek HATALAR (console.error) her zaman görünür kalır —
// bunlar teşhis için üretimde de gereklidir, bilerek sarmalanmamıştır.
const DEBUG = false;
function dwarn(...a){ if(DEBUG) console.warn(...a); }

// ---- KANAL TEŞHİS (üretimde KAPALI) ----
// Sell Out (Geleneksel) ve Modern Kanal veri akışında ileride bir sorun olursa, aşağıdaki bayrağı
// true yapıp tarayıcı konsolunda (F12 → Console) her adımın "[KANAL]" etiketli izini görebilirsiniz.
// Normal kullanımda false — hiçbir şey konsola yazılmaz, performansa etkisi yoktur.
const KANAL_TESHIS = false;
function ktlog(...a){ if(KANAL_TESHIS) console.log('%c[KANAL]', 'background:#13233F;color:#F3C969;padding:1px 5px;border-radius:3px;', ...a); }
const state = {
  files: { kalemler:null, siparis:null, tahsilat:null, cekSenet:null, ticariStok:null, fatura:null, bayiHakedis:null, yukleme:null, musteriMaster:null, ciroPrimi:null, donemselIskonto:null, sellOut:null, depozitoTahsilat:null, cariEkstre:null },
  report: null,
  sort: { key:'kalanBorc', dir:-1 },
  sevkSort: { key:'toplamRisk', dir:-1 },
  fkSort: { key:'kalanBorc', dir:-1 },
  ySort: { key:'toplam', dir:-1 },
  tSort: { key:'depodaKalanLt', dir:-1 },
  expanded: new Set(),
  // Manuel "Tahsil Edildi mi?" onayları — hem Alınan Çek hem Alınan Senet kayıtları OTOMATİK
  // tahsilat sayılmaz (ikisi de risk olarak kalır); kullanıcı Çek/Senet Detayı popup'ında ilgili
  // çek/senet için "Tahsil Edildi" butonuna tıklarsa o kaydın anahtarı (senetAnahtari alanı, hem
  // çek hem senet için kullanılır) bu Set'e eklenir ve buildReport bir sonraki çalışmasında o
  // kaydı tahsilat sayar. idb ile cihaza kalıcı kaydedilir.
  cekSenetTahsilOnaylari: new Set(),
  faturaArsivCache: {},
  yuklemeReport: null,
  yuklemeSort: { key:'temsilci', dir:1 },
  yuklemeGosterilenRapor: null,
  yuklemeArsivCache: {},
  yuklemeSeciliGun: null,
  faturaModalYedekMap: new Map(), // musteri kodu -> tam satır (bakiyesiz müşteriler için — report.musteriler'de kaydı olmayanların çek/senet detayını Detay popup'ında göstermek amacıyla)
  musteriMasterMap: new Map(),
  musteriMasterDetay: new Map(), // musteri kodu -> {tabelaAdi, musteriAdi, vergiNo, tcKimlikNo, adres, il, ilce} (senet basımı için)
  filesC: {}, // Grup C ("Günlük Veri Yükle") panelinde o an SEÇİLİ ama henüz KAYDEDİLMEMİŞ dosyalar: {tip: {name,headers,data}}
  bugunKalemlerHazir: false, // Bugün için Kalemler yüklendi mi? (bellekte VEYA bugüne ait tek-slot arşivinde) — Grup B/C kilidi bunu kullanır. bugunKalemlerDurumTazele() günceller.
  sellOutKendiDosya: null, // Sell Out sekmesindeki bağımsız yükleme alanından seçilen dosyanın ham verisi ({data, ad})
  stokGunKendiDosya: null, // Stok Gün sekmesindeki bağımsız yükleme alanından seçilen Malzemeler dosyasının ham verisi ({data, ad})
  stokGunTumRows: [], // Stok Gün tablosunun filtrelenmemiş tam veri seti (arama kutusu bunun üzerinde filtreler)
  stokGunSort: { key:'stokGunu', dir:1 }, // Stok Gün tablosu sıralama durumu (varsayılan: en kritik/düşük stok günü önce)
  stokGunSekme: 'tumu', // Stok Gün tablosu üst sekmesi: 'tumu'|'kritik'|'yeni'|'olu'
  stokGunAcikRiskSatirlar: new Set(), // Ürün×temsilci risk detayı genişletilmiş satırların ürün kodları
  malzemelerStok: new Map(), // malzemeKodu -> anlık kullanılabilir stok miktarı (Malzemeler dosyasından)
  musteriMasterDurum: new Map(), // musteri kodu -> 'Aktif' | ham durum metni (Sell Out Raporu FKNS hesaplaması için)
  sellOutHedef: {}, // { [temsilciAdi]: {acik:Number, kapali:Number} } — buluta kayıtlı, şifreyle değiştirilebilir
  sellOutNoktaSort: new Map(), // temsilciKey -> {key:'adi'|'kod', dir:1|-1} — Fatura Kesilmeyen Aktif Noktalar listesi sıralaması
  karneRiskliSort: new Map(), // temsilciAdi -> {key:'adi'|'kod'|'ortVade', dir:1|-1} — Temsilci Karnesi kartındaki Riskli Müşteriler listesi sıralaması
  sellOutReport: null,
  sellOutSonGuncelleme: null, // Güncel Sell Out verisinin en son ne zaman hesaplandığının ISO zaman damgası (GVY panelinde "Son veri" için)
  sellOutArsivCache: {}, // ayKey (YYYY-MM) -> o ayın "Arşivle" ile kaydedilmiş Sell Out rapor anlık görüntüsü
  sellOutSeciliAy: null, // null = Güncel (canlı) veri; dolu ise seçili arşiv ayının verisi gösterilir
  modernKanalKendiDosya: null, // Modern Kanal sekmesindeki bağımsız yükleme alanından seçilen İrsaliye dosyasının ham verisi ({data, ad})
  modernKanalReport: null, // buildIrsaliyeReport çıktısı (güncel/canlı)
  modernKanalSonGuncelleme: null, // Güncel Modern Kanal verisinin en son ne zaman hesaplandığının ISO zaman damgası (GVY panelinde "Son veri" için)
  modernKanalArsivCache: {}, // ayKey (YYYY-MM) -> o ayın arşivlenmiş İrsaliye rapor anlık görüntüsü
  modernKanalSeciliAy: null, // null = Güncel (canlı); dolu ise seçili arşiv ayı
  modernKanalHedef: 0, // Key Account Hedef (Lt.) — tek toplam hedef, buluta kayıtlı
  bayiHakedisReport: null,
  bayiHakedisHata: null,
  bhSort: { key:'toplamKdvli', dir:-1 },
  tvReport: null,
  tvAy: null,
  tvSort: { key:'tahsilatOrani', dir:-1 },
  musteriGosterilen: 30,
  sevkGosterilen: 30,
  bhGosterilen: 30,
  fkGosterilen: 30,
  yaslandirmaGosterilen: 30,
  hukukiGosterilen: 25,
  ticariStokGosterilen: 20,
  gbGosterilen: 16,
  gbRiskFiltre: 'all',
};

const MUSTERI_SAYFA_BOYUTU = 30;
const HUKUKI_SAYFA_BOYUTU = 25;
const TICARI_STOK_SAYFA_BOYUTU = 20;

const STORAGE_KEY = 'noktaCariTakip_report_v1';
const DATE_KEYS = new Set(['faturaTarihi','netVade','vade','belgeTarihi','asOf','istenilenTeslimTarihi','tahsilatTarihi']);

// --- IndexedDB tabanlı yerel depolama ---
// localStorage'ın (~5-10MB, senkron/arayüz kilitleyen) yerine geçer: çok daha yüksek kapasite,
// tüm okuma/yazmalar asenkron olduğu için büyüyen arşivler arayüzü dondurmaz.
const IDB_DB_NAME = 'noktaCariTakipDB';
const IDB_STORE = 'kv';
let idbOpenPromise = null;
// ================= CİHAZ (IndexedDB) DEPOLAMA TAMAMEN DEVRE DIŞI (kullanıcı isteği) =================
// "Uygulama hiçbir şekilde local kullanmasın, sadece cloud verilerini kullansın" — bu üç fonksiyon
// (idbOpen/idbSet/idbGet/idbDelete) uygulamanın HER YERİNDE cihaz okuma/yazma için TEK giriş
// noktasıdır (grep ile doğrulandı: tüm saveXToLocal/loadXFromLocal fonksiyonları sadece bunları
// çağırır). Bu yüzden gerçek IndexedDB erişimini burada, MERKEZİ olarak kapatmak yeterlidir —
// onlarca ayrı save/load fonksiyonunu tek tek değiştirmeye gerek kalmaz:
//   - idbSet: hiçbir şey yazmaz, her zaman "başarılı" (true) döner (çağıran kodun akışını bozmasın
//     diye) — ama veri gerçekte HİÇBİR YERE kaydedilmez.
//   - idbGet: her zaman null döner — yani "cihazda kayıtlı veri yok" gibi davranır. Bu sayede
//     mevcut "önce buluttan dene, o da yoksa cihazdakine düş" mantığı otomatik olarak sadece
//     "buluttan dene, o da yoksa boş" hâline gelir; ayrı bir kod değişikliği gerekmez.
//   - idbDelete/idbOpen: no-op / hiç açılmayan sahte bir promise.
// Not: Bu, önceki "Çek/Senet Tahsil Edildi buluta yazmıyor" sorununu da kökten çözer — artık
// cihaza yazma diye bir şey OLMADIĞI için o fonksiyonlardaki bulut yazma adımları hatasız çalışırsa
// veri sadece (ve her zaman) buluttadır, cihazda "takılı kalmış" eski bir kopya asla olmaz.
function idbOpen(){
  return Promise.reject(new Error('IndexedDB devre dışı — uygulama yalnızca bulut (Firebase) kullanır.'));
}
async function idbSet(key, value){
  return true;
}
async function idbGet(key){
  return null;
}
async function idbDelete(key){
  return true;
}
// Eskiden localStorage'a yazılmış veriyi bir kereliğine IndexedDB'ye taşır (geriye dönük uyumluluk).
// CİHAZ DEPOLAMA TAMAMEN KAPALI (kullanıcı isteği: "hiçbir işlem cihaza yazılmasın") — bu fonksiyon
// eskiden localStorage'daki (IndexedDB öncesi dönemden kalma) veriyi IndexedDB'ye taşıyıp
// localStorage'daki kopyayı SİLİYORDU. idbSet artık gerçekte hiçbir şey yazmadığı için, bu taşıma
// eskiden olduğu gibi çalıştırılırsa veri hiçbir yere gitmeden localStorage'dan silinir ve GERÇEK
// VERİ KAYBINA yol açar. Bu yüzden fonksiyon artık KASITLI OLARAK no-op'tur: localStorage'daki
// olası eski veriye DOKUNMAZ (ne okur ne siler) — en azından orada durur, kaybolmaz. Bu uygulamanın
// güncel veri kaynağı zaten yalnızca buluttur (bkz. cloudVeriVerimliYukle); bu fonksiyon çağıran
// loadXFromLocal fonksiyonları yalnızca bulut erişilemezse devreye giren YEDEK yoldu, artık o yedek
// yol da anlamsız (idbGet zaten her zaman null döner) ama zararsız bırakılmıştır.
async function idbMigrateFromLocalStorageOnce(key, reviver){
  // Kasıtlı no-op.
}
function reportDateReviver(key, value){
  if(DATE_KEYS.has(key) && typeof value === 'string'){
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

async function saveReportToStorage(report){
  const ok = await idbSet(STORAGE_KEY, report);
  if(!ok) console.error('Rapor cihaza kaydedilemedi.');
  return ok;
}
async function loadReportFromStorage(){
  try{
    await idbMigrateFromLocalStorageOnce(STORAGE_KEY, reportDateReviver);
    return await idbGet(STORAGE_KEY);
  }catch(err){
    console.error('Kayıtlı rapor okunamadı:', err);
    return null;
  }
}
async function clearStoredReport(){
  await idbDelete(STORAGE_KEY);
}


function buildMusteriSnapshot(report){
  const normal = (report.musteriler||[]).map(m=>({
    musteri: m.musteri, musteriAdi: m.musteriAdi, temsilci: m.temsilci,
    kalanBorc: m.kalanBorc, avgVadeGun: m.avgVadeGun, cekSenet: m.cekSenet, toplamRisk: m.toplamRisk,
    vadesizBakiye: m.vadesizBakiye,
  }));
  // Bakiyesiz müşteriler (Kalemler dosyasında kaydı yok ama Sipariş Raporu'nda açık siparişi/sevki
  // ertelenen tutarı var) — bu liste Kalemler'e bağlı DEĞİL, doğrudan Sipariş Raporu'ndan
  // hesaplanıyor (bkz. buildReport'taki "bakiyesiz" dizisi). Önceden bu müşteriler günlük arşive
  // hiç yazılmıyordu; bu yüzden Trend Analizi'nde ne arama listesinde çıkıyorlardı ne de geçmiş
  // günlerdeki sipariş/risk verileri grafiğe yansıyordu. Kalan Borç/Ort. Vade bu müşteriler için
  // anlamsız olduğundan 0/null olarak yazılır. Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı
  // isteği) — yalnızca çek/senet riski yazılır; sipariş tutarı ayrı alanda (Sevk/liste ekranlarında) görünür.
  const bakiyesiz = (report.bakiyesiz||[]).map(b=>({
    musteri: b.musteri, musteriAdi: b.musteriAdi, temsilci: b.temsilci,
    kalanBorc: 0, avgVadeGun: null, cekSenet: b.cekSenet||0, toplamRisk: (b.cekSenet||0),
    vadesizBakiye: 0,
  }));
  return normal.concat(bakiyesiz);
}

// musteriSnapshot her gün TÜM müşteriler için tekrarlanan tek arşiv verisidir (sıkıştırma bile bu
// diziye dokunmaz); bu yüzden alan adlarının (musteri, musteriAdi, temsilci, ...) kendisi bile
// yüzlerce müşteri × yıllarca gün için ciddi bir JSON hacmi oluşturur. Buluta yazarken alan adları
// kısaltılır (k/n/t/b/v/c/r); okurken ise hem bu kısa format hem de eski arşivlerdeki uzun format
// sorunsuzca kabul edilir, böylece geçmiş veriler yeniden yazılmaya gerek kalmadan okunabilir.
function musteriSnapshotKisalt(uzunDizi){
  return (uzunDizi||[]).map(m=>({
    k: m.musteri, n: m.musteriAdi, t: m.temsilci,
    b: m.kalanBorc, v: m.avgVadeGun, c: m.cekSenet, r: m.toplamRisk,
    z: m.vadesizBakiye,
  }));
}
function musteriSnapshotUzat(dizi){
  return (dizi||[]).map(m=>{
    if(!m) return m;
    if(m.musteri !== undefined) return m; // zaten uzun (eski) format
    return {
      musteri: m.k, musteriAdi: m.n, temsilci: m.t,
      kalanBorc: m.b, avgVadeGun: m.v, cekSenet: m.c, toplamRisk: m.r,
      vadesizBakiye: m.z,
    };
  });
}
// Buluttan okunan bir arşiv nesnesindeki HER günün musteriSnapshot dizisini canonical (uzun) alan
// adlarına çevirir; böylece bu normalleştirmeden sonra state.faturaArsivCache'i okuyan hiçbir kod
// (Trend Analizi, Tahsilat Verimliliği, vb.) kısa/uzun format farkını hiç bilmek zorunda kalmaz.
function faturaKontrolArsivSnapshotlariUzat(arsiv){
  if(!arsiv) return arsiv;
  Object.keys(arsiv).forEach(gun=>{
    const g = arsiv[gun];
    if(g && g.musteriSnapshot) g.musteriSnapshot = musteriSnapshotUzat(g.musteriSnapshot);
  });
  return arsiv;
}

// --- Fatura Kontrol arşivi: cihaz içi (IndexedDB) önbellek + kademeli (delta) senkronizasyon ---
// Buraya kadarki optimizasyonlar bir OTURUM içindeki tekrar indirmeleri önlüyordu; bu katman aynı
// kazancı sayfa YENİLENDİĞİNDE/yeniden açıldığında da sağlar: arşivin en son bilinen hali cihazda
// (IndexedDB) saklanır, açılışta önce O kullanılır (ağ beklenmez), ardından buluttaki gün
// anahtarları (shallow=true, hafif) ile karşılaştırılıp SADECE cihazda eksik olan gün(ler) —
// genelde en son birkaç gün — bir aralık isteğiyle çekilir. Böylece yıllarca birikmiş bir arşiv,
// bir kez tam indirildikten sonra, sonraki her açılışta pratikte yalnızca "aradaki farkı" indirir.
const FATURA_ARSIV_LOCAL_KEY = 'noktaCariTakip_faturaKontrolArsiv_v1';
async function loadFaturaKontrolArsivFromLocal(){
  try{ return await idbGet(FATURA_ARSIV_LOCAL_KEY); }
  catch(err){ console.error('Fatura Kontrol arşivi cihazdan okunamadı:', err); return null; }
}
async function saveFaturaKontrolArsivToLocal(arsiv){
  const ok = await idbSet(FATURA_ARSIV_LOCAL_KEY, arsiv);
  if(!ok) console.error('Fatura Kontrol arşivi cihaza kaydedilemedi.');
}

// Yereldeki (cihazdaki) gün anahtarlarıyla buluttakileri karşılaştırır; buluttaki ama yerelde
// olmayan günlerin en küçüğü ile en büyüğünü (tek bir aralık isteğiyle çekilebilmesi için) döndürür.
function faturaKontrolArsivEksikGunAraligi(yerelGunler, uzakGunler){
  const yerelSet = new Set(yerelGunler);
  const eksikler = (uzakGunler||[]).filter(g=>!yerelSet.has(g)).sort();
  if(!eksikler.length) return null;
  return {ilk: eksikler[0], son: eksikler[eksikler.length-1]};
}

// Uygulama açılışında (veya faturaArsivYenile ilk kez çağrıldığında) kullanılır: önce cihazdaki son
// bilinen arşivi anında devreye sokar, sonra buluttaki gün anahtarlarına bakıp SADECE eksik olan
// aralığı indirir. Bulutta artık olmayan (örn. başka bir cihazdan "Arşivi Temizle" ile silinmiş)
// günler yerelden de temizlenir. Herhangi bir adımda ağ hatası olursa elde ne varsa onunla devam
// edilir — hiçbir zaman kullanıcıyı hatayla bekletmez.
async function faturaArsivBaslangicYukle(){
  const yerelArsiv = await loadFaturaKontrolArsivFromLocal();
  if(yerelArsiv) state.faturaArsivCache = yerelArsiv;
  if(!cloudEnabled()){ faturaArsivYuklendiMi = true; return state.faturaArsivCache; }
  try{
    const uzakGunler = await loadFaturaKontrolArsivGunAnahtarlariFromCloud();
    if(uzakGunler === null){
      // Anahtarlar okunamadı (ağ hatası): elimizdeki (cihazdaki) önbellekle devam edilir.
      faturaArsivYuklendiMi = true;
      return state.faturaArsivCache;
    }
    const uzakSet = new Set(uzakGunler);
    const yerelGunler = Object.keys(state.faturaArsivCache||{});
    let degisti = false;
    // Bulutta artık olmayan günleri yerelden çıkar (örn. başka bir cihazdan tam arşiv silme).
    yerelGunler.forEach(g=>{
      if(!uzakSet.has(g)){ delete state.faturaArsivCache[g]; degisti = true; }
    });
    const eksik = faturaKontrolArsivEksikGunAraligi(Object.keys(state.faturaArsivCache||{}), uzakGunler);
    if(eksik){
      const aralik = await loadFaturaKontrolArsivAraligiFromCloud(eksik.ilk, eksik.son);
      if(aralik){
        state.faturaArsivCache = Object.assign({}, state.faturaArsivCache, aralik);
        degisti = true;
      }
    }
    if(degisti) await saveFaturaKontrolArsivToLocal(state.faturaArsivCache);
    faturaArsivYuklendiMi = true;
  }catch(err){
    console.error('Fatura Kontrol arşivi kademeli (delta) yüklenemedi:', err);
  }
  return state.faturaArsivCache;
}

// Bir oturumda arşivin TAMAMI bir kez tam indirildiyse (uygulama açılışı, senkronize butonu ya da
// bir sekmenin ilk kez açılışı), aynı oturumda başka bir sekmeye geçildiğinde artık aynı onlarca/
// yüzlerce günlük veri tekrar tekrar indirilmez — state.faturaArsivCache zaten günceldir.
// zorla=true verilirse (<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i> Yenile butonları, Senkronize Et), önbellek yok sayılır ve buluttan
// gerçekten tam bir tazeleme yapılır (başka bir cihazın eklediği güncel veriyi görmek için).
let faturaArsivYuklendiMi = false;
async function faturaArsivYenile(zorla){
  if(!cloudEnabled()){ return state.faturaArsivCache; }
  if(faturaArsivYuklendiMi && !zorla){ return state.faturaArsivCache; }
  if(!zorla){
    // İlk kez ihtiyaç duyulduğunda (normalde uygulama açılışında zaten yapılmış olur) TÜM arşivi
    // değil, cihazdaki önbellek + buluttaki farkı (delta) çeken kademeli yüklemeyi kullan.
    return await faturaArsivBaslangicYukle();
  }
  const bulut = await loadFaturaKontrolArsivFromCloud();
  state.faturaArsivCache = bulut || {};
  faturaArsivYuklendiMi = true;
  await saveFaturaKontrolArsivToLocal(state.faturaArsivCache);
  return state.faturaArsivCache;
}

// Tahsilat dosyası iki formatta gelebilir: Format A ("Ön Kayıt" — geçici/erken döküm) ve Format B
// (nihai/kesin rapor). Format A zaten geçici bir veri olduğu için olduğu gibi arşivlenmeye devam
// eder. Format B yüklendiğinde ARTIK TÜM Format A kayıtları koşulsuz silinmiyor — sadece bu Format B
// yüklemesindeki satırların Belge Tarihi günlerine denk gelen günlerdeki Format A kayıtları silinir
// (o günler için Format B artık nihai/geçerli veridir); Format B'de hiç verisi olmayan günlerdeki
// Format A kayıtlarına dokunulmaz.
//
// Bu fonksiyon, bir yüklemenin (Format A veya Format B) arşive uygulanması SONUCUNDA tahsilat
// günlerinin nasıl görüneceğini hesaplar (henüz kaydetmeden/senkronize etmeden). Hem gerçek kayıt
// (faturaKontrolArsivineKaydetVeSenkronizeEt) hem de Genel Rapor/Sevk Raporu'ndaki "hangi günü
// göstereyim" hesaplaması (bkz. buildReport) AYNI bu fonksiyonu kullanır; böylece ekranda gösterilen
// gün ile arşive gerçekten yazılacak gün birbirinden asla sapmaz.
//
// mevcutArsivGunler: {gunKey: {tahsilatArsiv:[...], ...}} — arşivin (bu yüklemeden ÖNCEKİ) hali.
// yeniTahsilatSatirlari: bu yüklemenin ürettiği tahsilat satırları ({musteri,belgeTarihi,tutar,formatKaynagi,gecerli}).
// tahsilatFormatB: bu yüklemedeki tahsilat dosyası Format B mi.
// bugunKey: bugünün gün anahtarı (Format A satırları her zaman SADECE bugünün altına yazılır).
// Dönen: Map<gunKey, tahsilatArsiv satırları[]> — sadece tahsilat verisi olan günleri içerir.
function tahsilatEfektifGunMapHesapla(mevcutArsivGunler, yeniTahsilatSatirlari, tahsilatFormatB, bugunKey){
  const sonuc = new Map();
  Object.keys(mevcutArsivGunler||{}).forEach(gunKey=>{
    const satirlar = (mevcutArsivGunler[gunKey]||{}).tahsilatArsiv || [];
    if(satirlar.length) sonuc.set(gunKey, satirlar.slice());
  });

  if(!tahsilatFormatB){
    // Format A: eskiden olduğu gibi SADECE bugünün altına, bugünün ÖNCEKİ tahsilat içeriğinin
    // tamamen yerine geçecek şekilde yazılır (bkz. faturaKontrolArsivineKaydetVeSenkronizeEt'teki
    // bugununKaydiTaban mantığı — burada sadece gösterim hesaplaması için aynısı simüle edilir).
    sonuc.set(bugunKey, (yeniTahsilatSatirlari||[]).slice());
    return sonuc;
  }

  // Format B — Adım 1: KOŞULLU Format A temizliği. Artık TÜM günlerdeki Format A silinmiyor;
  // sadece bu yüklemedeki satırların Belge Tarihi günlerine denk gelen günlerdeki Format A silinir.
  const etkilenenGunler = new Set();
  (yeniTahsilatSatirlari||[]).forEach(r=>{
    if(!r || !r.belgeTarihi) return;
    const gk = dateKeyLocal(new Date(r.belgeTarihi));
    if(gk) etkilenenGunler.add(gk);
  });
  etkilenenGunler.forEach(gunKey=>{
    const mevcut = sonuc.get(gunKey) || [];
    const temiz = mevcut.filter(r=> r.formatKaynagi !== 'A');
    if(temiz.length) sonuc.set(gunKey, temiz); else sonuc.delete(gunKey);
  });

  // Adım 2: Format B satırları kendi Belge Tarihi günlerine dağıtılır; veri gelen günlerin Format B
  // kısmı TAMAMEN bu yüklemenin satırlarıyla değiştirilir (o günün Format A'sı varsa -yukarıdaki
  // koşullu temizlikten sağ çıkmışsa- korunur), veri gelmeyen günlere dokunulmaz.
  const gunBazliYeni = new Map();
  (yeniTahsilatSatirlari||[]).forEach(r=>{
    if(!r || !r.belgeTarihi) return;
    const gk = dateKeyLocal(new Date(r.belgeTarihi));
    if(!gk) return;
    if(!gunBazliYeni.has(gk)) gunBazliYeni.set(gk, []);
    gunBazliYeni.get(gk).push(r);
  });
  gunBazliYeni.forEach((satirlar, gunKey)=>{
    const mevcutGun = sonuc.get(gunKey) || [];
    const eskiFormatA = mevcutGun.filter(r=> r.formatKaynagi === 'A');
    sonuc.set(gunKey, eskiFormatA.concat(satirlar));
  });

  return sonuc;
}

// Fatura Dökümü ve Bayi Hak Ediş İÇİN GENEL GÜN BAZLI DAĞITIM
// ESKİ KURAL (artık geçerli değil): bu iki dosyanın TÜM satırları, kendi tarihleri ne olursa olsun,
// sadece o günkü YÜKLEME/rapor gününün (bugunKey) altına yazılırdı. Bu yüzden: (a) rapor
// oluşturulmayan bir gün için geçmiş fatura/hak ediş verisi arşivde HİÇ görünmezdi, (b) bu dosyalar
// genelde TÜM dönemi (ör. tüm yılı) kapsadığından, aynı kayıtlar art arda yüklemelerde hep "bugün"e
// yığılıp tekrarlanırdı.
// YENİ KURAL: her satır KENDİ tarihine (Fatura Tarihi / Hak Ediş tahsilat tarihi — Türkiye +3 saat
// dilimi düzeltmesiyle, bkz. excelDateToJSArti1Gun) göre ilgili arşiv gününe dağıtılır. Bir güne bu
// yüklemede veri geldiyse, o günün İLGİLİ ALANI (faturaArsiv veya bayiHakedisArsiv) TAMAMEN bu
// yüklemenin satırlarıyla değiştirilir — bu sayede "tüm yılı her gün yeniden yükleme" alışkanlığında
// mükerrer birikme olmaz, o günün en güncel/nihai hali korunur. Bu yüklemede hiç verisi olmayan
// günlere dokunulmaz (o günün önceki verisi aynen durur).
function arsivGunlereDagitVeDegistir(mevcutArsivGunler, yeniSatirlar, tarihAlani, arsivAlanAdi){
  const gunBazliYeni = new Map();
  (yeniSatirlar||[]).forEach(r=>{
    if(!r || !r[tarihAlani]) return;
    const gunKey = dateKeyLocal(new Date(r[tarihAlani]));
    if(!gunKey) return;
    if(!gunBazliYeni.has(gunKey)) gunBazliYeni.set(gunKey, []);
    gunBazliYeni.get(gunKey).push(r);
  });
  const yeniArsiv = Object.assign({}, mevcutArsivGunler);
  gunBazliYeni.forEach((satirlar, gunKey)=>{
    const mevcutGun = yeniArsiv[gunKey] || {};
    yeniArsiv[gunKey] = Object.assign({}, mevcutGun, {[arsivAlanAdi]: satirlar});
  });
  return {arsiv: yeniArsiv, etkilenenGunSayisi: gunBazliYeni.size};
}

// Fatura Dökümü'ndeki "Bozuk İade Faturası" ve Depozito Tahsilatı dosyasındaki (Fatura Belge No'lu)
// satırlarından türeyen tahsilat kredilerini (bkz. buildReport'taki bozukIadeTahsilat/depozitoTahsilat)
// kendi tarihlerine göre ilgili arşiv gününün tahsilatArsiv'ine ekler. Tahsilat Format A/B
// mekanizmasından TAMAMEN BAĞIMSIZDIR — sadece o günün ÖNCEDEN eklenmiş, AYNI etikete sahip
// satırlarını bu yüklemenin güncel haliyle değiştirir (mükerrer birikmeyi önlemek için), diğer TÜM
// tahsilat kayıtlarına (Format A/B veya farklı etiketli krediler) dokunmaz.
function tahsilatKredisiGunlereEkleVeDegistir(mevcutArsivGunler, yeniSatirlar, etiket){
  const gunBazliYeni = new Map();
  (yeniSatirlar||[]).forEach(r=>{
    if(!r || !r.belgeTarihi) return;
    const gunKey = dateKeyLocal(new Date(r.belgeTarihi));
    if(!gunKey) return;
    if(!gunBazliYeni.has(gunKey)) gunBazliYeni.set(gunKey, []);
    gunBazliYeni.get(gunKey).push(r);
  });
  const yeniArsiv = Object.assign({}, mevcutArsivGunler);
  gunBazliYeni.forEach((satirlar, gunKey)=>{
    const mevcutGun = yeniArsiv[gunKey] || {};
    const eskiTahsilat = mevcutGun.tahsilatArsiv || [];
    const digerTahsilatlar = eskiTahsilat.filter(r=> r.formatKaynagi !== etiket);
    yeniArsiv[gunKey] = Object.assign({}, mevcutGun, {tahsilatArsiv: digerTahsilatlar.concat(satirlar)});
  });
  return {arsiv: yeniArsiv, etkilenenGunSayisi: gunBazliYeni.size};
}

async function faturaKontrolArsivineKaydetVeSenkronizeEt(report){
  const bugunKey = dateKeyLocal(new Date());
  const musteriSnapshotUzun = buildMusteriSnapshot(report); // hafızada her zaman canonical (uzun) alan adları kullanılır

  // Sipariş: ARTIK yükleme gününün (bugunKey) altına yazılmıyor — her satır KENDİ teslim tarihine
  // (İstenilen Tsl. Trh.) karşılık gelen arşiv gününe yazılır, sonra Satış Belge No bazlı global
  // temizlik uygulanır (bkz. siparisArsivGunlereDagitVeTemizle). Bu işlemin doğru çalışabilmesi
  // için mevcut yerel arşiv önbelleğini tazeliyoruz — tam garanti için (örn. başka bir cihazdan
  // yapılmış değişiklikleri de yakalamak için) periyodik olarak "<i class="fa-solid fa-eraser" aria-hidden="true"></i> Gölge Kayıtları Temizle"
  // butonuyla TAM bir arşiv taraması yapılması önerilir.
  await faturaArsivYenile();
  const eskiArsivTumu = state.faturaArsivCache || {}; // GERÇEK önceki durum — buluta PATCH farkı bunun üzerinden hesaplanır

  // Bu yüklemede tahsilat dosyası Format B (nihai rapor) ise: önce SADECE bu yüklemedeki satırların
  // Belge Tarihi günlerine denk gelen günlerdeki Format A kayıtları silinir (artık koşulsuz/TÜM
  // günler silinmiyor), sonra Format B satırları KENDİ Belge Tarihi günlerine dağıtılır ve o günlerin
  // Format B kısmı TAMAMEN bu yüklemenin verisiyle değiştirilir (bkz. tahsilatEfektifGunMapHesapla —
  // Genel Rapor/Sevk Raporu'ndaki gösterim hesaplamasıyla AYNI fonksiyon). Tahsilat dosyası Format A
  // ise (veya bu yüklemede tahsilat dosyası hiç yoksa), tahsilat eskisi gibi SADECE bugünün
  // (bugunKey) altına yazılır.
  let calismaArsivi = eskiArsivTumu;
  if(report.tahsilatFormatB){
    const efektifGunMap = tahsilatEfektifGunMapHesapla(calismaArsivi, report.tahsilatArsiv || [], true, bugunKey);
    const guncellenmisArsiv = Object.assign({}, calismaArsivi);
    efektifGunMap.forEach((satirlar, gunKey)=>{
      const mevcutGun = guncellenmisArsiv[gunKey] || {};
      guncellenmisArsiv[gunKey] = Object.assign({}, mevcutGun, {tahsilatArsiv: satirlar});
    });
    // efektifGunMap'te artık yer almayan (Format A temizliğiyle tamamen boşalmış) günlerin
    // tahsilatArsiv'i de boşaltılır.
    Object.keys(calismaArsivi).forEach(gunKey=>{
      const eskiSatirlar = (calismaArsivi[gunKey]||{}).tahsilatArsiv || [];
      if(eskiSatirlar.length && !efektifGunMap.has(gunKey)){
        guncellenmisArsiv[gunKey] = Object.assign({}, guncellenmisArsiv[gunKey], {tahsilatArsiv: []});
      }
    });
    calismaArsivi = guncellenmisArsiv;
  }

  const {arsiv: siparisIslenmisArsiv} = siparisArsivGunlereDagitVeTemizle(calismaArsivi, report.siparisArsiv || []);

  // Fatura Dökümü ve Bayi Hak Ediş artık BUGÜNÜN altına değil, kendi tarihlerine (Fatura Tarihi /
  // hak ediş tahsilat tarihi) göre ilgili arşiv gününe dağıtılır (bkz. arsivGunlereDagitVeDegistir).
  // Bir güne bu yüklemede veri geldiyse o günün ilgili alanı TAMAMEN değiştirilir; veri gelmeyen
  // günlere dokunulmaz. Bu, "tüm yılı her gün yeniden yükleme" alışkanlığında hem mükerrer birikimi
  // önler hem de rapor oluşturmadığınız günlerin geçmiş verisinin arşivde kaybolmasını engeller.
  const {arsiv: faturaIslenmisArsiv} = arsivGunlereDagitVeDegistir(siparisIslenmisArsiv, report.faturaArsiv || [], 'faturaTarihi', 'faturaArsiv');
  const {arsiv: hakedisIslenmisArsiv} = arsivGunlereDagitVeDegistir(faturaIslenmisArsiv, report.bayiHakedis || [], 'tahsilatTarihi', 'bayiHakedisArsiv');

  // Fatura Dökümü'ndeki "Bozuk İade Faturası" ve Depozito Tahsilatı dosyasındaki (Fatura Belge
  // No'lu) satırlarından türeyen tahsilat kredileri (bkz. buildReport'taki bozukIadeTahsilat/
  // depozitoTahsilat), Tahsilat Format A/B mekanizmasından TAMAMEN BAĞIMSIZ olarak, kendi
  // tarihlerine göre ilgili arşiv gününün tahsilatArsiv'ine eklenir/güncellenir — sadece o günün
  // ÖNCEDEN eklenmiş AYNI etiketli satırları bu yüklemenin güncel haliyle değiştirilir, diğer tüm
  // Format A/B tahsilat kayıtlarına dokunulmaz (bkz. tahsilatKredisiGunlereEkleVeDegistir).
  const {arsiv: bozukIadeIslenmisArsiv} = tahsilatKredisiGunlereEkleVeDegistir(hakedisIslenmisArsiv, report.bozukIadeTahsilat || [], 'FaturaIade');
  const {arsiv: depozitoIslenmisArsiv} = tahsilatKredisiGunlereEkleVeDegistir(bozukIadeIslenmisArsiv, report.depozitoTahsilat || [], 'DepozitoTahsilat');

  // ÖNEMLİ: Sipariş/Fatura/Bayi Hak Ediş/Bozuk İade/Depozito Tahsilat verileri BUGÜNÜN altına değil,
  // kendi tarihlerine göre FARKLI arşiv günlerine dağıtılabiliyor (yukarıdaki dağıtım adımları).
  // "Arşiv Verisi" panelindeki "Son güncelleme" göstergesi bu tipler için doğru çalışabilsin diye,
  // kayitZamani SADECE bugünün kaydına değil, bu yüklemede GERÇEKTEN İÇERİĞİ DEĞİŞEN tüm günlere
  // yazılır — böylece bir dosya bugün yüklense bile içindeki satırlar geçmiş bir tarihe (örn. Fatura
  // Tarihi 3 gün önceyse) dağıtılmış olsa dahi, o günün kaydında da doğru "ne zaman yüklendi" bilgisi
  // bulunur (bkz. gvyTipiIcinSonKayitZamani).
  const simdiIso = new Date().toISOString();
  const dagitimdaDegisenGunler = faturaKontrolArsivGunFarkiniBul(eskiArsivTumu, depozitoIslenmisArsiv);
  const depozitoIslenmisArsivZamanDamgali = Object.assign({}, depozitoIslenmisArsiv);
  Object.keys(dagitimdaDegisenGunler).forEach(gunKey=>{
    if(gunKey === bugunKey) return; // bugünün kaydına zaten aşağıda ayrıca yazılıyor
    if(!depozitoIslenmisArsivZamanDamgali[gunKey]) return; // silinmiş (null) günlere dokunma
    depozitoIslenmisArsivZamanDamgali[gunKey] = Object.assign({}, depozitoIslenmisArsivZamanDamgali[gunKey], {kayitZamani: simdiIso});
  });

  // Müşteri Snapshot: bu SADECE bugünün altına yazılmaya devam eder — çünkü bu, Kalemler
  // dosyasının o ANKİ (rapor oluşturma anındaki) donmuş bakiye özetidir; geçmiş bir tarihe
  // dağıtılamaz (geçmişe dönük yeniden hesaplanamaz). Rapor oluşturmadığınız günler için bu alan
  // hâlâ boş kalır — bu, arşivin doğası gereği kaçınılmazdır.
  const bugunGunOncesi = depozitoIslenmisArsivZamanDamgali[bugunKey] || {};
  const bugununKaydiTaban = report.tahsilatFormatB
    ? bugunGunOncesi
    // Format A: SADECE bugünün 'A' etiketli kısmı bu yüklemenin yeni satırlarıyla değiştirilir;
    // 'B', 'FaturaIade' (Bozuk İade kredisi) ve 'DepozitoTahsilat' etiketli kayıtlara dokunulmaz.
    : Object.assign({}, bugunGunOncesi, {tahsilatArsiv: (bugunGunOncesi.tahsilatArsiv||[]).filter(r=>r.formatKaynagi!=='A').concat(report.tahsilatArsiv || [])});
  const bugununKaydi = Object.assign({}, bugununKaydiTaban, {
    musteriSnapshot: musteriSnapshotUzun,
    kayitZamani: simdiIso,
  });
  const yeniArsivTumu = Object.assign({}, depozitoIslenmisArsivZamanDamgali, {[bugunKey]: bugununKaydi});

  // Yerel önbellek her durumda güncellenir; Trend/Tahsilat Verimliliği gibi ekranlar bugünün
  // verisini hemen görsün.
  state.faturaArsivCache = yeniArsivTumu;
  // Cihaz içi (IndexedDB) önbellek de güncellenir ki bir sonraki sayfa açılışında bugünün verisi
  // için tekrar ağa gidilmesin.
  saveFaturaKontrolArsivToLocal(state.faturaArsivCache).catch(()=>{});
  if(!cloudEnabled()){
    if(document.getElementById('faturaKontrolArsivBilgi')) await renderFaturaKontrolArsivBilgi();
    return;
  }
  try{
    // Sipariş artık teslim tarihine göre BİRDEN FAZLA günü (bugünden farklı günler dahil)
    // etkileyebildiği için (ve Satış Belge No temizliği bazı günleri tamamen boşaltabildiği için),
    // artık sadece bugunKey PATCH edilmiyor — eski/yeni arşiv karşılaştırılıp GERÇEKTEN değişen
    // TÜM günler (silinen günler `null` olarak) tek bir çoklu-konum PATCH isteğiyle buluta yazılır.
    const fark = faturaKontrolArsivGunFarkiniBul(eskiArsivTumu, yeniArsivTumu);
    // Buluta giden musteriSnapshot, 978 müşterinin HER GÜN tekrar eden alan adlarının (musteri,
    // musteriAdi, temsilci, ...) JSON'da kapladığı yeri azaltmak için kısaltılmış alan adlarıyla
    // gönderilir (k/n/t/b/v/c/r) — okurken hem eski (uzun) hem yeni (kısa) format kabul edilir.
    Object.keys(fark).forEach(gun=>{
      const deger = fark[gun];
      if(deger && deger.musteriSnapshot){
        fark[gun] = Object.assign({}, deger, {musteriSnapshot: musteriSnapshotKisalt(deger.musteriSnapshot)});
      }
    });
    await saveFaturaKontrolArsivGunleriToCloud(fark);
    if(document.getElementById('faturaKontrolArsivBilgi')) await renderFaturaKontrolArsivBilgi();
  }catch(err){
    console.error('Fatura Kontrol arşivi senkronize edilemedi:', err);
    // GÖRÜNÜRLÜK DÜZELTMESİ: bu hata önceden yalnızca konsola düşüyordu — cihazdaki önbellek
    // güncellendiği için her şey normal GÖRÜNÜYOR ama diğer cihazlar bugünün arşiv verisini
    // alamıyor ve bu cihaz buluttan tazelenirse bugünün verisi kaybolabiliyordu. Kullanıcı,
    // Bayi Hakediş kaydındaki aynı kalıpla açıkça uyarılır.
    alert('UYARI: Bugünün arşiv verisi buluta senkronize EDİLEMEDİ (yalnızca bu cihazda güncel). Bağlantınızı kontrol edip raporu yeniden oluşturun veya "Şimdi Senkronize Et"i deneyin — aksi halde diğer cihazlar bu veriyi göremez.');
  }
}

// Bir Satış Belge No'ya ait KAYITLARDAN herhangi biri bu durumlardan birindeyse, o Satış Belge
// No'ya ait arşivdeki TÜM kayıtlar (farklı teslim tarihlerinde "Teslim Edildi" görünenler dahil)
// kalıcı olarak silinir — çünkü bu durum, önceki teslimatın geçersiz kaldığını/geri alındığını
// gösterir (ör. önce "Teslim Edildi", sonra "Reddedildi" olmuş bir sipariş → ürün geri alınmıştır).
const SIPARIS_IPTAL_DURUMLARI = new Set(['Reddedildi', 'İptal Edildi', 'Teslim Edilemedi']);

/* ============================== SİPARİŞ ARŞİVİ: TESLİM TARİHİNE GÖRE DAĞITIM + SATIŞ BELGE NO
   TEMİZLİĞİ ==============================
   ESKİ KURAL (artık geçerli değil): sipariş satırları o günkü YÜKLEME gününün altına yazılır,
   aynı takvim (teslim) gününe ait birden çok yükleme günü olduğunda yalnızca en son yükleyen
   "kazanır" ve diğerleri arşivde gölge kayıt olarak kalırdı.

   YENİ KURAL: her sipariş satırı, yüklendiği gün ne olursa olsun, KENDİ İstenilen Tsl. Trh.
   (teslim tarihi) değerine karşılık gelen arşiv gününe yazılır. Yerleştirmeden SONRA şu sıra ile
   temizlik uygulanır:
     1) Satış Belge No bazlı GLOBAL tarama: bu numaraya ait (hangi teslim tarihinde/hangi arşiv
        gününde olursa olsun) herhangi bir kayıtta Teslimat Durumu SIPARIS_IPTAL_DURUMLARI
        içindeyse, bu Satış Belge No'ya ait TÜM kayıtlar arşivin tamamından silinir.
     2) Kalan (temiz) kayıtlarda: aynı teslim tarihinde (aynı arşiv günü içinde) aynı Satış Belge
        No birden fazla kez geçiyorsa yalnızca ilk görülen kayıt tutulur, sonrakiler silinir. Aynı
        Satış Belge No farklı teslim tarihlerinde ise HER İKİSİ de bulutta saklanmaya devam eder.
   Satış Belge No veya teslim tarihi olmayan satırlara bu fonksiyon dokunmaz (güvenli tarafta
   bırakılır). Fonksiyon, yalnızca gerçekten değişen günlerin nesnesini yeni referansla döndürür;
   değişmeyen günler eski referanslarıyla kalır (bu sayede faturaKontrolArsivGunFarkiniBul çağrısı
   yalnızca gerçekten değişen günleri buluta PATCH eder). */
function siparisArsivGunlereDagitVeTemizle(mevcutArsiv, yeniSiparisSatirlari){
  const yeniArsiv = Object.assign({}, mevcutArsiv);

  // 0) DÜZELTME: Bu yüklemede gelen satırların Satış Belge No'larını topla ve bu numaralara ait
  // ESKİ kayıtları, hangi takvim gününde (hangi eski İstenilen Tsl. Trh. altında) duruyor olursa
  // olsun TÜM arşivden sil. Bu, bir siparişin teslim tarihi bir yüklemeden ötekine kaydığında
  // (örn. 03.07 -> 04.07) eski günün kaydının arşivde "gölge" olarak kalıp yeni günün kaydıyla
  // birlikte İKİ KEZ sayılmasını (Fatura Kontrol'de mükerrer sipariş tutarı) önler.
  const buYuklemedekiBelgeNolari = new Set();
  (yeniSiparisSatirlari||[]).forEach(r=>{ if(r && r.satisBelgeNo) buYuklemedekiBelgeNolari.add(r.satisBelgeNo); });
  if(buYuklemedekiBelgeNolari.size){
    Object.keys(yeniArsiv).forEach(gunKey=>{
      const gun = yeniArsiv[gunKey];
      const eski = (gun && gun.siparisArsiv) || [];
      if(!eski.length) return;
      const temiz = eski.filter(r=> !(r.satisBelgeNo && buYuklemedekiBelgeNolari.has(r.satisBelgeNo)));
      if(temiz.length !== eski.length){
        yeniArsiv[gunKey] = Object.assign({}, gun, {siparisArsiv: temiz});
      }
    });
  }

  // 1) Yeni satırları kendi teslim tarihi gününe dağıt (o günün mevcut siparisArsiv'ine ekle).
  (yeniSiparisSatirlari||[]).forEach(r=>{
    if(!r || !r.istenilenTeslimTarihi || !r.satisBelgeNo) return;
    const gunKey = dateKeyLocal(new Date(r.istenilenTeslimTarihi));
    if(!gunKey) return;
    const mevcutGun = yeniArsiv[gunKey] || {};
    const mevcutSiparisArsiv = mevcutGun.siparisArsiv || [];
    yeniArsiv[gunKey] = Object.assign({}, mevcutGun, {siparisArsiv: mevcutSiparisArsiv.concat([r])});
  });

  // 2) Satış Belge No bazlı GLOBAL tarama: iptal/red/teslim-edilemedi izine sahip tüm numaraları topla.
  const iptalBelgeNolari = new Set();
  Object.keys(yeniArsiv).forEach(gunKey=>{
    ((yeniArsiv[gunKey] && yeniArsiv[gunKey].siparisArsiv) || []).forEach(r=>{
      if(r.satisBelgeNo && SIPARIS_IPTAL_DURUMLARI.has(r.teslimatDurumu)) iptalBelgeNolari.add(r.satisBelgeNo);
    });
  });

  // 3) DÜZELTME: Aynı Satış Belge No'nun mükerrer kayıtlarını artık GÜNE ÖZGÜ değil, TÜM ARŞİV
  // ÜZERİNDE global olarak tekilleştiriyoruz. Böylece bu fonksiyon yeni satır eklemeden de
  // (bkz. faturaKontrolArsivSikistir çağrısı) geçmişte bu bug nedeniyle birden fazla güne dağılmış
  // kayıtları tarayıp temizleyebiliyor. Aynı belge no birden çok günde bulunuyorsa, takvim günü en
  // büyük (en güncel/son) olan kayıt tutulur — bir siparişin en son bilinen teslim tarihi budur.
  const gunlerSirali = Object.keys(yeniArsiv).sort();
  const belgeNoKazananGun = new Map();
  gunlerSirali.forEach(gunKey=>{
    ((yeniArsiv[gunKey] && yeniArsiv[gunKey].siparisArsiv) || []).forEach(r=>{
      if(r.satisBelgeNo) belgeNoKazananGun.set(r.satisBelgeNo, gunKey); // sıralı ilerlediğimiz için en son atama en son (en güncel) günü verir
    });
  });

  let silinenSatir = 0;
  gunlerSirali.forEach(gunKey=>{
    const gun = yeniArsiv[gunKey];
    const orijinal = gun.siparisArsiv || [];

    // İptal belgesi olan tüm kayıtları çıkar.
    let sonraki = orijinal.filter(r=> !(r.satisBelgeNo && iptalBelgeNolari.has(r.satisBelgeNo)));

    // Belge no'su bu günden BAŞKA bir günde "kazanan" olarak işaretlenmiş kayıtları çıkar (global mükerrer temizliği).
    sonraki = sonraki.filter(r=>{
      if(!r.satisBelgeNo) return true; // belge no'suz satır dokunulmaz
      return belgeNoKazananGun.get(r.satisBelgeNo) === gunKey;
    });

    // Aynı gün içinde (yukarıdaki adımdan sonra) hâlâ kalan aynı Satış Belge No mükerrerlerini
    // (örn. bir günün kendi içinde iki kez yüklenmiş olması) de temizle.
    const gorulenBelgeNo = new Set();
    sonraki = sonraki.filter(r=>{
      if(!r.satisBelgeNo) return true;
      if(gorulenBelgeNo.has(r.satisBelgeNo)) return false;
      gorulenBelgeNo.add(r.satisBelgeNo);
      return true;
    });

    silinenSatir += (orijinal.length - sonraki.length);
    if(sonraki.length !== orijinal.length){
      yeniArsiv[gunKey] = Object.assign({}, gun, {siparisArsiv: sonraki});
    }
  });

  return {arsiv: yeniArsiv, silinenSatir, iptalEdilenBelgeSayisi: iptalBelgeNolari.size};
}

/* DRY YARDIMCI: "Kazanan yükleme günü" haritası — bir takvim gününe ait satırlar arşivde birden
   fazla yükleme gününde bulunabildiğinden, her takvim günü için EN SON yükleme gününü seçer.
   Bu mantık daha önce faturaKontrolArsivBirlestir/tekillestir ve faturaKontrolArsivSikistir/
   kazananHaritasi içinde birebir kopya olarak iki kez yazılmıştı; tek kaynağa indirildi. */
function arsivKazananUploadGunuHaritasi(arsiv, gunler, alanAdi, tarihAlani){
  const sonUploadGunu = new Map();
  gunler.forEach(uploadGunu=>{
    ((arsiv[uploadGunu] && arsiv[uploadGunu][alanAdi]) || []).forEach(r=>{
      if(!r[tarihAlani]) return;
      const takvimGunu = dateKeyLocal(new Date(r[tarihAlani]));
      if(!takvimGunu) return;
      if(!sonUploadGunu.has(takvimGunu) || uploadGunu > sonUploadGunu.get(takvimGunu)){
        sonUploadGunu.set(takvimGunu, uploadGunu);
      }
    });
  });
  return sonUploadGunu;
}

function faturaKontrolArsivBirlestir(arsiv){
  const gunler = Object.keys(arsiv||{}).sort();

  function tekillestir(alanAdi, tarihAlani){
    const sonUploadGunu = arsivKazananUploadGunuHaritasi(arsiv, gunler, alanAdi, tarihAlani);
    const sonuc = new Map();
    gunler.forEach(uploadGunu=>{
      ((arsiv[uploadGunu] && arsiv[uploadGunu][alanAdi]) || []).forEach(r=>{
        const takvimGunu = r[tarihAlani] ? dateKeyLocal(new Date(r[tarihAlani])) : null;
        if(takvimGunu && sonUploadGunu.get(takvimGunu) !== uploadGunu) return;
        // Gerçek belge numarası (örn. Fatura Numarası) varsa tekilleştirme ARTIK BUNA göre yapılır:
        // aynı belge no'ya sahip kayıtlar, arşivde hangi güne/yüklemeye (kayıt tarihi kayması vb.
        // nedenle) düşmüş olursa olsun TEK bir fatura sayılır. Bu, örn. faturaTarihi'nde yükleme
        // günleri arasında oluşan 1 günlük kaymanın aynı faturayı iki farklı takvim gününde ayrı
        // ayrı saydırmasını önler. belgeNo taşımayan (eski/geriye dönük) kayıtlarda önceki
        // müşteri+tarih+tutar bazlı anahtara düşülür.
        const tarihKey = r[tarihAlani] ? new Date(r[tarihAlani]).getTime() : '';
        const key = r.belgeNo ? ('belgeNo|'+r.belgeNo) : [r.musteri, tarihKey, r.tutar].join('|');
        sonuc.set(key, r);
      });
    });
    return Array.from(sonuc.values());
  }

  function tekillestirBayiHakedis(){
    const idBazli = new Map();
    const icerikBazli = new Map();
    gunler.forEach(uploadGunu=>{
      ((arsiv[uploadGunu] && arsiv[uploadGunu].bayiHakedisArsiv) || []).forEach(r=>{
        if(r.efpaSipNo){
          idBazli.set(r.efpaSipNo, r);
        }else{
          const tarihKey = r.tahsilatTarihi ? new Date(r.tahsilatTarihi).getTime() : '';
          const key = [r.musteri, tarihKey, r.tutar].join('|');
          icerikBazli.set(key, r);
        }
      });
    });
    return [...idBazli.values(), ...icerikBazli.values()];
  }

  // Sipariş: ARTIK "kazanan yükleme günü" mantığına tabi DEĞİL. Her arşiv günü zaten kendi teslim
  // tarihine ait, Satış Belge No temizliği yazma anında (siparisArsivGunlereDagitVeTemizle)
  // uygulanmış hâlde tutuluyor — burada sadece tüm günlerin siparisArsiv'lerinin birleşimi alınır.
  function siparisBirlesigi(){
    const sonuc = [];
    gunler.forEach(g=>{ ((arsiv[g] && arsiv[g].siparisArsiv) || []).forEach(r=> sonuc.push(r)); });
    return sonuc;
  }

  return {
    siparisArsiv: siparisBirlesigi(),
    tahsilatArsiv: tekillestir('tahsilatArsiv', 'belgeTarihi'),
    faturaArsiv: tekillestir('faturaArsiv', 'faturaTarihi'),
    bayiHakedisArsiv: tekillestirBayiHakedis(),
    gunSayisi: gunler.length,
    ilkGun: gunler[0] || null,
    sonGun: gunler[gunler.length-1] || null,
  };
}

/* ============================== ARŞİV SIKIŞTIRMA (GÖLGE KAYIT TEMİZLEME) ==============================
   faturaKontrolArsivBirlestir() bir takvim gününe ait veriyi birden fazla yükleme günü arşivde
   tutuyor olsa bile RAPORLARDA yalnızca en son yüklemenin verisini gösterir — ama eski (artık
   "kaybeden") satırlar buluttaki arşivde fiilen kayıtlı kalmaya devam eder ("gölge kayıt").
   Bu fonksiyon, her takvim günü için en son yükleme dışındaki TÜM eski satırları (siparişArsiv/
   tahsilatArsiv/faturaArsiv) kalıcı olarak arşivden çıkarır ve temizlenmiş arşivi döndürür.
   KASITLI OLARAK DOKUNULMAYANLAR:
   - musteriSnapshot: Trend Analizi'ndeki "gün gün bakiye" grafiği bu anlık görüntülere dayanır;
     bir yükleme gününün işlem satırları başka bir günün yüklemesiyle güncellenmiş olsa bile, o günün
     BAKİYE DURUMU tarihsel bir veridir ve silinmemelidir.
   - bayiHakedisArsiv: tekillestirBayiHakedis() takvim günü değil kayıt kimliğine (efpaSipNo/içerik)
     göre eşleştirir; bu farklı mantık burada ayrıca ele alınmaz.
   Tarihsiz satırlar (tarih alanı boş/okunamayan) güvenli tarafta kalınarak SİLİNMEZ. */
function faturaKontrolArsivSikistir(arsiv){
  const gunler = Object.keys(arsiv||{}).sort();
  // "Kazanan yükleme günü" mantığı artık paylaşımlı arsivKazananUploadGunuHaritasi()'nda (DRY).
  const kazananHaritasi = (alanAdi, tarihAlani)=> arsivKazananUploadGunuHaritasi(arsiv, gunler, alanAdi, tarihAlani);
  // NOT: Sipariş artık burada "kazanan yükleme günü" mantığıyla değil, Satış Belge No bazlı global
  // temizlikle (siparisArsivGunlereDagitVeTemizle) ele alınıyor — bkz. aşağıdaki ayrı geçiş.
  // Tahsilat/Fatura için eski "kazanan gün" (gölge kayıt) mantığı DEĞİŞMEDİ.
  const kazananTahsilat = kazananHaritasi('tahsilatArsiv', 'belgeTarihi');
  const kazananFatura = kazananHaritasi('faturaArsiv', 'faturaTarihi');

  let silinenSatir = 0;
  const yeniArsivTahsilatFatura = {};
  gunler.forEach(uploadGunu=>{
    const g = arsiv[uploadGunu] || {};
    function filtrele(alanAdi, tarihAlani, kazananMap){
      const orijinal = g[alanAdi] || [];
      const yeni = orijinal.filter(r=>{
        if(!r[tarihAlani]) return true; // tarihsiz satır: dokunulmaz
        const takvimGunu = dateKeyLocal(new Date(r[tarihAlani]));
        if(!takvimGunu) return true;
        return kazananMap.get(takvimGunu) === uploadGunu;
      });
      silinenSatir += (orijinal.length - yeni.length);
      return yeni;
    }
    yeniArsivTahsilatFatura[uploadGunu] = Object.assign({}, g, {
      tahsilatArsiv: filtrele('tahsilatArsiv', 'belgeTarihi', kazananTahsilat),
      faturaArsiv: filtrele('faturaArsiv', 'faturaTarihi', kazananFatura),
    });
  });

  // Sipariş: Satış Belge No bazlı global temizlik + aynı-gün mükerrer temizliğini TÜM arşiv
  // üzerinde (yeni satır eklemeden, yalnızca mevcut veriyi tarayarak) yeniden çalıştırır. Bu, bu
  // kuraldan ÖNCE arşive girmiş eski/tutarsız sipariş kayıtlarını da geriye dönük temizler.
  const {arsiv: siparisTemizlenmisArsiv, silinenSatir: siparisSilinen} = siparisArsivGunlereDagitVeTemizle(arsiv, []);

  const yeniArsiv = {};
  gunler.forEach(g=>{
    yeniArsiv[g] = Object.assign({}, yeniArsivTahsilatFatura[g], {
      siparisArsiv: (siparisTemizlenmisArsiv[g] && siparisTemizlenmisArsiv[g].siparisArsiv) || [],
    });
  });

  return {arsiv: yeniArsiv, silinenSatir: silinenSatir + siparisSilinen};
}

// --- Web Worker: Fatura Kontrol arşiv birleştirme/tekilleştirme ---
// Arşiv her geçen gün büyüdüğü için bu işlem CPU açısından pahalılaşır; ana thread'de (arayüzü
// kilitleyerek) çalıştırmak yerine ayrı bir worker thread'inde çalıştırılır. Worker'ın kaynak kodu,
// faturaKontrolArsivBirlestir ve dateKeyLocal fonksiyonlarının kendisinden (.toString()) üretilir;
// böylece worker ile ana thread'deki hesaplama mantığı asla birbirinden sapmaz (tek kaynak).
// Worker desteklenmiyorsa/oluşturulamazsa otomatik olarak ana thread'de senkron hesaplamaya döner.
let faturaWorker = null;
let faturaWorkerKurulumBasarisiz = false;
let faturaWorkerReqId = 0;
const faturaWorkerPending = new Map();

function faturaWorkerOlustur(){
  if(faturaWorker) return faturaWorker;
  if(faturaWorkerKurulumBasarisiz) return null;
  if(typeof Worker === 'undefined'){ faturaWorkerKurulumBasarisiz = true; return null; }
  try{
    const src = `
      ${dateKeyLocal.toString()}
      ${arsivKazananUploadGunuHaritasi.toString()}
      ${faturaKontrolArsivBirlestir.toString()}
      self.onmessage = function(e){
        const { id, arsiv } = e.data;
        try{
          const result = faturaKontrolArsivBirlestir(arsiv);
          self.postMessage({ id: id, result: result });
        }catch(err){
          self.postMessage({ id: id, error: (err && err.message) || String(err) });
        }
      };
    `;
    const blob = new Blob([src], {type:'text/javascript'});
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = (e)=>{
      const {id, result, error} = e.data || {};
      const pending = faturaWorkerPending.get(id);
      if(!pending) return;
      faturaWorkerPending.delete(id);
      if(error) pending.reject(new Error(error)); else pending.resolve(result);
    };
    worker.onerror = (err)=>{
      console.error('Fatura Kontrol arşiv worker hatası, ana thread\'e dönülüyor:', err);
      faturaWorkerPending.forEach(p=> p.reject(err));
      faturaWorkerPending.clear();
      faturaWorker = null;
      faturaWorkerKurulumBasarisiz = true;
    };
    faturaWorker = worker;
    return faturaWorker;
  }catch(err){
    console.error('Fatura Kontrol arşiv worker\'ı oluşturulamadı, ana thread\'e dönülüyor:', err);
    faturaWorkerKurulumBasarisiz = true;
    return null;
  }
}

function faturaKontrolArsivBirlestirWorkerdeCalistir(arsiv){
  return new Promise((resolve, reject)=>{
    const worker = faturaWorkerOlustur();
    if(!worker){ reject(new Error('worker-kullanilamiyor')); return; }
    const id = ++faturaWorkerReqId;
    faturaWorkerPending.set(id, {resolve, reject});
    worker.postMessage({id, arsiv});
  });
}

// Aynı arşiv referansı için tekrar tekrar hesaplama yapmamak üzere sonucu (promise olarak) önbelleğe
// alır; state.faturaArsivCache yeni bir nesneyle değiştirilmediği sürece (yani arşiv gerçekten
// değişmediği sürece) önbellekteki sonuç doğrudan döndürülür.
let faturaBirlesikCache = { kaynak: null, promise: null };
async function faturaKontrolArsivBirlestirCached(arsiv){
  arsiv = arsiv || {};
  if(faturaBirlesikCache.kaynak === arsiv && faturaBirlesikCache.promise){
    return faturaBirlesikCache.promise;
  }
  const promise = faturaKontrolArsivBirlestirWorkerdeCalistir(arsiv)
    .catch(err=>{
      return faturaKontrolArsivBirlestir(arsiv); // worker yoksa/başarısızsa ana thread'de senkron üret
    });
  faturaBirlesikCache = { kaynak: arsiv, promise };
  return promise;
}

// Tüm arşivi silen özellik kaldırıldı — musteriSnapshot (ve arşivin tamamı) hiçbir koşulda
// silinmemeli. Bu fonksiyon artık kasıtlı olarak hiçbir şey yapmayan güvenli bir no-op'tur;
// başka bir yerden çağrılırsa bile arşive dokunmaz.
async function clearFaturaKontrolArsiv(){
  dwarn('clearFaturaKontrolArsiv() devre dışı bırakıldı — arşiv kalıcı olarak korunuyor.');
}

// Uygulamadaki TÜM şifre korumalı işlemler (hedef litre düzenleme, arşivleme, arşiv temizleme vb.)
// TEK bir ortak şifre kullanır: 2580.
const FATURA_ARSIV_TEMIZLEME_SIFRESI = '2580';
// Kullanıcıdan ortak şifreyi ister; doğruysa true, kullanıcı iptal ederse veya yanlış girerse
// (uyarı gösterip) false döner. Tüm şifre korumalı butonlar bu tek yardımcıyı kullanır.
// Uygulamanın kendi tasarımına uygun (navy/altın tema) şifre giriş modal'ını açar ve Promise
// döndürür: şifre doğruysa true, kullanıcı İptal'e basarsa/modal'ı kapatırsa false. Native
// prompt() KASITLI OLARAK kullanılmaz — tarayıcının varsayılan (özelleştirilemeyen) diyaloğu
// yerine uygulamanın diğer modalleriyle (bkz. .modal / .modal-head-navy) aynı görünümü sağlar.
function ortakSifreDogrula(mesaj){
  return new Promise((resolve)=>{
    const overlay = document.getElementById('sifreModalOverlay');
    const form = document.getElementById('sifreModalForm');
    const input = document.getElementById('sifreModalInput');
    const hataEl = document.getElementById('sifreModalHata');
    const subEl = document.getElementById('sifreModalSub');
    const closeBtn = document.getElementById('sifreModalClose');
    const iptalBtn = document.getElementById('sifreModalIptalBtn');
    if(!overlay || !form || !input){
      // Modal elementleri herhangi bir sebeple DOM'da yoksa (beklenmeyen durum), güvenli tarafta
      // kalıp işlemi engellememek yerine eski native prompt()'a geri döner.
      const girilen = prompt(mesaj || 'Bu işlem için şifreyi girin:');
      resolve(girilen !== null && girilen === FATURA_ARSIV_TEMIZLEME_SIFRESI);
      return;
    }
    subEl.textContent = mesaj || 'Bu işlem için şifreyi girin';
    hataEl.textContent = '';
    input.value = '';
    overlay.classList.add('open');
    setTimeout(()=> input.focus(), 30);

    function kapat(sonuc){
      overlay.classList.remove('open');
      form.removeEventListener('submit', onSubmit);
      closeBtn.removeEventListener('click', onIptal);
      iptalBtn.removeEventListener('click', onIptal);
      resolve(sonuc);
    }
    function onSubmit(e){
      e.preventDefault();
      if(input.value === FATURA_ARSIV_TEMIZLEME_SIFRESI){
        kapat(true);
      }else{
        hataEl.textContent = 'Şifre hatalı, tekrar deneyin.';
        input.value = '';
        input.focus();
      }
    }
    function onIptal(){ kapat(false); }
    form.addEventListener('submit', onSubmit);
    closeBtn.addEventListener('click', onIptal);
    iptalBtn.addEventListener('click', onIptal);
  });
}

const CLOUD = {
  dbUrl: 'https://test-82b8f-default-rtdb.europe-west1.firebasedatabase.app',
  path: 'nokta_cari_rapor_v1',
};
// Yükleme sırası: debounce, 04-genel-bakis.js top-level kodunda kullanıldığı için çekirdekte tanımlanır.
function debounce(fn, delay){
  let timer = null;
  return function(...args){
    clearTimeout(timer);
    timer = setTimeout(()=> fn.apply(this, args), delay || 180);
  };
}

// Yükleme sırası: arama kutusu kablolama yardımcıları, 04. parçanın top-level kodunda kullanılır.
// Bir "arama kutusu + temizle butonu" ikilisinin görünürlüğünü güncelleyen ortak yardımcı. Aynı üç
// satır (kutunun dolu olup olmadığına bakıp butonu göster/gizle) önceden 5 farklı sekmede ayrı ayrı
// fonksiyon olarak tekrarlanıyordu; artık her biri bu tek yardımcıya delege ediyor.
function searchClearBtnGuncelle(inputId, btnId){
  const hasValue = document.getElementById(inputId).value.trim().length > 0;
  document.getElementById(btnId).style.display = hasValue ? 'flex' : 'none';
}

// Arama kutusuna her yazıldığında "temizle" butonunu güncelleyip tabloyu (debounce ile) yeniden
// çizen ortak yardımcı. Aynı üç satır önceden 5 farklı sekmede ayrı ayrı tekrarlanıyordu.
function wireSearchInput(inputId, clearBtnId, debouncedRenderFn){
  document.getElementById(inputId).addEventListener('input', ()=>{
    searchClearBtnGuncelle(inputId, clearBtnId);
    debouncedRenderFn();
  });
}

// "Temizle" (X) butonuna tıklanınca arama kutusunu boşaltıp tabloyu yeniden çizen ortak yardımcı.
// Aynı beş satır önceden 5 farklı sekmede ayrı ayrı tekrarlanıyordu.
function wireSearchClear(inputId, btnId, renderFn){
  document.getElementById(btnId).addEventListener('click', ()=>{
    const input = document.getElementById(inputId);
    input.value = '';
    searchClearBtnGuncelle(inputId, btnId);
    renderFn();
    input.focus();
  });
}
