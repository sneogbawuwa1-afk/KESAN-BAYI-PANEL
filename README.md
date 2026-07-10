# Keşan Bayi Takip Paneli — Bölünmüş Yapı

Tek dosyalık `index.html` (~1 MB), GitHub'da diff/inceleme yapılabilmesi ve service worker'ın
yalnızca değişen dosyayı güncelleyebilmesi için parçalara ayrıldı. **Davranış birebir aynıdır** —
kod satırları taşınmadı, yalnızca dosyalara bölündü (tek istisna: `debounce`, `wireSearchInput`,
`wireSearchClear`, `searchClearBtnGuncelle` yükleme sırası gereği çekirdeğe alındı).

## Klasör yapısı

```
/ (repo kökü)
├── index.html                      ← iskelet + küçük inline scriptler
├── styles.css                      ← tüm CSS (eski <style> bloğu)
├── js/
│   ├── 01-cekirdek-ve-arsiv.js     ← yardımcılar, arşiv birleştirme/sıkıştırma, worker
│   ├── 02-bulut-ve-auth.js         ← Firebase auth, bulut okuma/yazma, verimli senkron
│   ├── 03-veri-yukleme-ve-senkron.js ← dosya yükleme panelleri, tarih aralıklı silme, oto senkron
│   ├── 04-genel-bakis.js           ← Genel Bakış dashboard'u
│   ├── 05-musteri-ve-tablolar.js   ← toast, müşteri tablosu, yaşlandırma
│   ├── 06-senet-ve-detay.js        ← senet yazdırma, detay modalları
│   ├── 07-analiz-raporlari.js      ← DSO, nakit akış, şüpheli alacak, karne, CEI
│   ├── 08-kanal-raporlari.js       ← Sell Out + Modern Kanal + aylık arşivler
│   ├── 09-stok-gun.js              ← Stok Gün metodolojisi
│   └── 10-uygulama-ve-gorunumler.js ← merkezi modal, görünüm yönetimi, başlatma
├── sw.js                           ← MEVCUT dosyanız (aşağıdaki güncellemeyi yapın!)
├── manifest.json                   ← mevcut dosyanız, aynen kalır
└── icon-192.png / icon-512.png     ← mevcut ikonlarınız, aynen kalır
```

## GitHub'a ekleme (ilk kez)

**Web arayüzüyle (en kolay):**
1. github.com → sağ üstte **+** → **New repository** → ad verin (örn. `bayi-takip`), Public/Private seçin, **Create**.
2. Repo sayfasında **uploading an existing file** bağlantısına tıklayın.
3. Bu klasördeki `index.html`, `styles.css` ve `js` klasörünü (içindekilerle) sürükleyin; kendi
   `sw.js`, `manifest.json` ve ikon dosyalarınızı da ekleyin. **Commit changes**.
4. **Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save.**
   Birkaç dakika sonra `https://kullaniciadi.github.io/bayi-takip/` adresinde yayında olur.

**Git komutlarıyla:**
```bash
git init
git add index.html styles.css js/ sw.js manifest.json icon-*.png
git commit -m "Uygulama bölünmüş yapıya geçirildi"
git branch -M main
git remote add origin https://github.com/KULLANICIADI/bayi-takip.git
git push -u origin main
```

## sw.js'de YAPILMASI ZORUNLU değişiklik

Precache listenize yeni dosyaları ekleyin ve sürümü artırın — aksi halde eski cache'li cihazlar
yarım uygulama görür:

```js
const CACHE_VERSION = 'vX.Y';   // ← HER yayında artırın
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './js/01-cekirdek-ve-arsiv.js',
  './js/02-bulut-ve-auth.js',
  './js/03-veri-yukleme-ve-senkron.js',
  './js/04-genel-bakis.js',
  './js/05-musteri-ve-tablolar.js',
  './js/06-senet-ve-detay.js',
  './js/07-analiz-raporlari.js',
  './js/08-kanal-raporlari.js',
  './js/09-stok-gun.js',
  './js/10-uygulama-ve-gorunumler.js',
  './manifest.json',
];
```

## Gelecekte kod eklerken 3 kural

1. **Sıra ve `defer` dokunulmaz.** index.html'deki 10 script etiketi belge sırasıyla, HTML tamamen
   ayrıştırıldıktan sonra çalışır — eski `DOMContentLoaded` sarmalayıcısının birebir karşılığı.
2. **Tek global kapsam.** Tüm dosyalar aynı kapsamı paylaşır; bir parçadaki fonksiyon/const
   diğerlerinden görünür. Yeni bir yardımcıyı, onu *yükleme anında* (top-level'da veya IIFE
   içinde senkron) çağıran parçadan **önceki** bir dosyada tanımlayın. Yalnızca olay
   dinleyicisi/çağrı zamanı kullanılıyorsa sıra fark etmez.
3. **Minify etmeyin.** `faturaWorkerOlustur`, üç fonksiyonu `toString()` ile Web Worker'a
   serileştirir; isimler değişirse worker sessizce bozulur.

## Yayın öncesi güvenlik hatırlatması

Repo public olacaksa: `js/01-cekirdek-ve-arsiv.js` içindeki `FATURA_ARSIV_TEMIZLEME_SIFRESI`
düz metin durur — artık gizli değildir. Firebase web apiKey'in görünmesi normaldir; gerçek koruma
tamamen **Realtime Database Rules**'a kayar (yalnızca doğrulanmış kullanıcıya okuma/yazma).
