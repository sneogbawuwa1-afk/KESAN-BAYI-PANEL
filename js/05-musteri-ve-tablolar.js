/* ===== TOAST BİLDİRİMİ =====
   alert() yerine tema uyumlu, bloke etmeyen bildirim. KULLANIM SINIRI (bilinçli):
   - success/info: işlem sonuçları ("arşivlendi", "silindi", "güncellendi")
   - warn: ön koşul eksikleri ("önce dosya yükleyin")
   Veri kaybı riski taşıyan UYARI'lar ve hata detayları alert() olarak KALIR — bloke edici
   olmaları, kullanıcının mesajı kaçırmaması için bilinçli bir tasarım tercihidir. */
const TOAST_IKON = {success:'fa-circle-check', warn:'fa-triangle-exclamation', danger:'fa-circle-xmark'};
function toastGoster(tur, baslik, mesaj){
  const kap = document.getElementById('toastKap');
  if(!kap){ alert(baslik + (mesaj ? '\n' + mesaj : '')); return; } // güvenli geri dönüş
  const el = document.createElement('div');
  el.className = 'toast ' + (TOAST_IKON[tur] ? tur : 'warn');
  el.innerHTML = `<i class="fa-solid ${TOAST_IKON[tur]||TOAST_IKON.warn}" aria-hidden="true"></i>
    <div class="t-body"><div class="t-title"></div><div class="t-msg"></div></div>
    <button class="t-kapat" type="button" aria-label="Kapat">✕</button>`;
  el.querySelector('.t-title').textContent = baslik;
  const msgEl = el.querySelector('.t-msg');
  if(mesaj) msgEl.textContent = mesaj; else msgEl.remove();
  let kapatildi = false;
  const kapat = ()=>{ if(kapatildi) return; kapatildi = true; el.classList.add('cikiyor'); setTimeout(()=>el.remove(), 220); };
  el.querySelector('.t-kapat').onclick = kapat;
  kap.appendChild(el);
  // En fazla 3 toast üst üste — en eskisi düşer (ekranı kaplamasın).
  while(kap.children.length > 3) kap.firstElementChild.remove();
  setTimeout(kapat, tur==='success' ? 3800 : 6500);
}

// Müşteri Master'daki Tabela Adı — arama filtrelerinde müşteri adının yanı sıra tabela
// adına göre de eşleşme yapabilmek için. Kayıt yoksa boş string döner (arama etkilenmez).
function musteriTabelaAdi(musteriKod){
  const detay = state.musteriMasterDetay && state.musteriMasterDetay.get(String(musteriKod||''));
  return (detay && detay.tabelaAdi) || '';
}
// Arama kutusundaki metnin (q, zaten toLowerCase yapılmış) bir müşteri kaydıyla eşleşip
// eşleşmediğini kontrol eder — müşteri adı, kodu ve varsa Tabela Adı'na bakar. Büyük/küçük
// harf duyarlılığı olmaması için hem q hem de karşılaştırılan alanlar toLowerCase kullanır.
function musteriAramaEslesiyorMu(q, musteriAdi, musteriKod, musteriUnvan){
  if(!q) return true;
  if(String(musteriAdi||'').toLocaleLowerCase('tr-TR').includes(q)) return true;
  if(String(musteriKod||'').toLocaleLowerCase('tr-TR').includes(q)) return true;
  const tabela = musteriTabelaAdi(musteriKod);
  if(tabela && tabela.toLocaleLowerCase('tr-TR').includes(q)) return true;
  // Cari Hesap Ekstre'den gelen müşteri ünvanı da aramaya dahildir (kullanıcı isteği): ör. "OSMAN
  // ÖKTEN" (ünvan) diye arayınca "ÖKTEN BAKKAL" (müşteri adı) kartı da bulunur. Ünvan hem parametre
  // olarak (kart m.musteriUnvan) hem de Cari Ekstre lookup'ından (state) kontrol edilir.
  if(musteriUnvan && String(musteriUnvan).toLocaleLowerCase('tr-TR').includes(q)) return true;
  const unvanState = musteriCariUnvan(musteriKod);
  if(unvanState && unvanState.toLocaleLowerCase('tr-TR').includes(q)) return true;
  return false;
}
// Cari Hesap Ekstre'den bir müşterinin ünvanını (kod bazında) döndürür — arama için. buildReport
// çıktısındaki report.cariEkstreUnvanMap üzerinden çalışır (yoksa boş).
function musteriCariUnvan(musteriKod){
  const map = state.report && state.report.cariEkstreUnvanMap;
  if(!map) return '';
  const v = (map instanceof Map) ? map.get(String(musteriKod||'')) : map[String(musteriKod||'')];
  return v || '';
}

// Bir kart açıldığında (expand), içine eklenen detay/tablo satırları kartın boyunu uzatır; bu da
// bazı durumlarda tıklanan kartın alt kısmının (hatta tamamının) ekranın dışına kaymasına yol
// açabiliyordu. Kart yeniden çizildikten (render) SONRA, DOM'a yeni eklenen elemanı bulup normal
// akışta (sayfayı aniden zıplatmadan) görünür alana kaydırıyoruz — sadece kart AÇILDIĞINDA,
// kapatıldığında değil.
// (debounce, yükleme sırası gereği 01-cekirdek-ve-arsiv.js dosyasına taşındı)

function getFilteredSorted(report){
  const q = document.getElementById('searchInput').value.trim().toLocaleLowerCase('tr-TR');
  const temsilci = document.getElementById('temsilciFilter').value;
  const riskFilter = document.getElementById('riskFilter').value;
  const vadeMin = document.getElementById('vadeMinInput').value;
  const vadeMax = document.getElementById('vadeMaxInput').value;

  // Kalemler (bakiye) dosyasında kaydı olmayan ama açık siparişi/sevki ertelenen tutarı olan
  // (bakiyesiz) müşteriler — Sevk Raporu'ndaki (getSevkFilteredSorted) ile AYNI mantık: bu
  // müşteriler daha önce burada hiç gösterilmiyordu, bu yüzden "Açık siparişi olan" filtresi ve
  // arama, KPI toplamlarında sayılan bu müşterileri hiçbir zaman listelemiyordu.
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — yalnızca çek/senet riski yazılır.
  const bakiyesizSatirlari = (report.bakiyesiz||[]).map(b=>({
    musteri: b.musteri, musteriAdi: b.musteriAdi, temsilci: b.temsilci,
    kalanBorc: 0, avgVadeGun: null, siparisTutari: b.siparisTutari||0, emanetSiparis: b.emanetSiparis||0,
    cekSenet: b.cekSenet||0, alinanTahsilat: 0, toplamRisk: (b.cekSenet||0),
    invoices: [], cekSenetDetay: b.cekSenetDetay||[], __bakiyesiz: true,
  }));
  let rows = report.musteriler.concat(bakiyesizSatirlari).filter(m=>{
    if(q && !musteriAramaEslesiyorMu(q, m.musteriAdi, m.musteri, m.musteriUnvan) && !String(m.temsilci).toLocaleLowerCase('tr-TR').includes(q)) return false;
    if(temsilci && m.temsilci !== temsilci) return false;
    if(riskFilter==='over60' && !(m.avgVadeGun>60)) return false;
    if(riskFilter==='hasCek' && !(m.cekSenet>0)) return false;
    if(riskFilter==='hasSiparis' && !(m.siparisTutari>0)) return false;

    if(vadeMin !== '' && !(m.avgVadeGun >= Number(vadeMin))) return false;
    if(vadeMax !== '' && !(m.avgVadeGun <= Number(vadeMax))) return false;

    return true;
  });
  const {key,dir} = state.sort;
  rows = rows.slice().sort((a,b)=>{
    let av=a[key], bv=b[key];
    if(typeof av==='string') return dir*String(av).localeCompare(String(bv),'tr');
    return dir*((av||0)-(bv||0));
  });
  return rows;
}

const VADE_RISK_ESIGI = 28;
function isRiskliMusteri(m){
  return (m.avgVadeGun||0) >= VADE_RISK_ESIGI;
}

function bayiHakedisliMusteriKodlari(){
  const rapor = state.bayiHakedisReport;
  if(!rapor || !Array.isArray(rapor.noktalar)) return new Set();
  return new Set(rapor.noktalar.map(n=>n.kod));
}
function hakedisRozeti(musteriKod, hakedisKodlari){
  if(!hakedisKodlari || !hakedisKodlari.has(musteriKod)) return '';
  // Artık salt bilgi rozeti değil, tıklanınca o müşterinin Bayi Hakediş popup'ını
  // açan bir buton — data-musteri-kod ile taşınan kod, kart grid'lerine (Genel
  // Bakış/Müşteriler/Sevk Erteleme) delege edilen tek bir click listener'da okunuyor.
  return '<button type="button" class="badge hakedis hakedis-btn" data-musteri-kod="'+escapeHtml(musteriKod)+'" title="Bu müşterinin Bayi Hakediş raporunda (Ciro Primi/Dönemsel İskonto) kaydı var — açmak için tıklayın">Hakediş</button>';
}
// Ticari Stok raporunda (depoda kalan emanet ürün) kaydı olan müşteri kodlarının
// seti — ticariStokGrupMap zaten 'stok_'+musteriNo anahtarıyla dolu, burada sade
// müşteri koduna (musteriNo) indirgiyoruz ki hakedisKodlari ile aynı şekilde kontrol edilebilsin.
function ticariStokluMusteriKodlari(){
  const map = state.ticariStokGrupMap;
  if(!map) return new Set();
  const set = new Set();
  map.forEach(g=>{ if(g && g.musteriNo) set.add(String(g.musteriNo)); });
  return set;
}
function emanetRozeti(musteriKod, stokKodlari){
  if(!stokKodlari || !stokKodlari.has(musteriKod)) return '';
  // Aynı şekilde Emanet de artık tıklanınca Ticari Stok/Emanet popup'ını açan bir buton.
  return '<button type="button" class="badge emanet emanet-btn" data-musteri-kod="'+escapeHtml(musteriKod)+'" title="Bu müşterinin Ticari Stok raporunda depoda kalan (emanet) ürün kaydı var — açmak için tıklayın">Emanet</button>';
}
// Kart grid'lerinde (Genel Bakış Nokta Detay, Müşteriler, Sevk Erteleme) render sonrası
// tekil listener eklemek yerine, her üç grid container'ına tek bir delege click listener
// bağlıyoruz — kartlar sık sık yeniden render edildiği için bu, olay dinleyicisi
// birikmesini (memory leak) ve her render sonrası yeniden bağlama ihtiyacını önler.
document.addEventListener('click', (e)=>{
  const hakedisBtn = e.target.closest('.hakedis-btn');
  if(hakedisBtn){
    e.stopPropagation();
    hakedisModalAc(hakedisBtn.getAttribute('data-musteri-kod'));
    return;
  }
  const emanetBtn = e.target.closest('.emanet-btn');
  if(emanetBtn){
    e.stopPropagation();
    stokModalAc('stok_'+emanetBtn.getAttribute('data-musteri-kod'));
  }
});
document.getElementById('dikkatEsikBanner').textContent = VADE_RISK_ESIGI;
document.getElementById('dikkatEsikModal').textContent = VADE_RISK_ESIGI;

function openDikkatModal(){
  document.getElementById('dikkatModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDikkatModal(){
  document.getElementById('dikkatModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('dikkatBanner').addEventListener('click', openDikkatModal);
document.getElementById('dikkatBanner').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openDikkatModal(); }
});
document.getElementById('dikkatModalClose').addEventListener('click', closeDikkatModal);

function faturaModalAc(musteriKod, musteriAdi){
  try{
    state.faturaModalMevcut = {kod: musteriKod, adi: musteriAdi};
    const report = state.report;
    const kod = String(musteriKod||'').trim();
    const m = (report && report.musteriler ? report.musteriler.find(x=>String(x.musteri||'').trim()===kod) : null)
      || state.faturaModalYedekMap.get(kod) || null;
    document.getElementById('faturaModalAvatar').textContent = avatarBaslangic(musteriAdi);
    document.getElementById('faturaModalTitle').textContent = musteriAdi;
    document.getElementById('faturaModalSub').textContent = musteriKod;
    const faturalar = (m && m.invoices) ? m.invoices.filter(inv=>inv.kalanBorc !== 0) : [];
    document.getElementById('faturaModalTbody').innerHTML = faturalar.length ? faturalar.map(inv=>{
      const gun = inv.gunFatura;
      const gunCls = gun>60 ? 'neg' : (gun>30 ? '' : '');
      return `<tr><td>${escapeHtml(inv.belgeNo||'—')}</td><td>${fmtDate(inv.faturaTarihi)}</td><td class="num num-strong">${TL(inv.kalanBorc)}</td><td class="num ${gunCls}">${gun!=null?gun:'—'}</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="empty-state">${m ? 'Açık fatura bulunamadı' : 'Bu müşteri güncel raporda bulunamadı — lütfen Genel Rapor sekmesinde raporun yüklü olduğundan emin olun'}</td></tr>`;
    const toplam = faturalar.reduce((a,inv)=>a+(inv.kalanBorc||0),0);
    let agirlikliGun = 0, agirlikBorc = 0;
    faturalar.forEach(inv=>{
      if(inv.gunFatura!=null && inv.kalanBorc!==0){
        agirlikliGun += inv.kalanBorc * inv.gunFatura;
        agirlikBorc += inv.kalanBorc;
      }
    });
    const ortGun = agirlikBorc!==0 ? Math.round(agirlikliGun/agirlikBorc) : null;
    const ortTarih = ortGun!=null ? new Date(turkiyeBugun().getTime() - ortGun*86400000) : null;
    document.getElementById('faturaModalToplam').innerHTML = `
      <div><div class="fatura-toplam-label">Toplam Kalan Borç</div><div class="fatura-toplam-value">${TL(toplam)}</div></div>
      <div class="fatura-toplam-col"><div class="fatura-toplam-label">Ort. Vade</div><div class="fatura-toplam-value fatura-toplam-vade">${ortGun!=null ? ortGun+' gün' : '—'}</div></div>
      <div class="fatura-toplam-col"><div class="fatura-toplam-label">Ort. Vade Tarihi</div><div class="fatura-toplam-value">${ortTarih ? fmtDate(ortTarih) : '—'}</div></div>
    `;

    // --- Çek / Senet Detayı (varsa) → sadece popup butonunu göster/gizle, içerik cekSenetModalAc'te dolduruluyor ---
    const cekSenetDetay = (m && m.cekSenetDetay) ? m.cekSenetDetay : [];
    document.getElementById('faturaModalCekSenetBtn').style.display = cekSenetDetay.length ? 'inline-flex' : 'none';

    document.getElementById('faturaModalOverlay').classList.add('open');
  }catch(err){
    console.error('Fatura modali açılırken hata:', err);
    document.getElementById('faturaModalAvatar').textContent = avatarBaslangic(musteriAdi);
    document.getElementById('faturaModalTitle').textContent = musteriAdi||'';
    document.getElementById('faturaModalSub').textContent = musteriKod||'';
    document.getElementById('faturaModalTbody').innerHTML = '<tr><td colspan="4" class="empty-state">Bir hata oluştu: '+escapeHtml(err.message)+'</td></tr>';
    document.getElementById('faturaModalToplam').innerHTML = '';
    document.getElementById('faturaModalCekSenetBtn').style.display = 'none';
    document.getElementById('faturaModalOverlay').classList.add('open');
  }
}
function faturaModalKapat(){
  document.getElementById('faturaModalOverlay').classList.remove('open');
}
document.getElementById('faturaModalClose').addEventListener('click', faturaModalKapat);
document.getElementById('faturaModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='faturaModalOverlay') faturaModalKapat();
});

function cekSenetModalSatirDurumHtml(c){
  // Hem Çek hem Senet: kullanıcı elle "Tahsil Edildi" demeden risk olarak kalır (otomatik
  // tahsilat sayılmaz) — kullanıcı isteği: "çekte de riskten sayılsın, en mantıklı çözüm buydu".
  if(c.tahsilatTuru === 'Cek' || c.tahsilatTuru === 'Senet'){
    if(c.tahsilEdildiMi){
      return `<span class="badge" style="background:var(--good-soft,#e6f6ec);color:var(--good,#1a8a4c);">Tahsil Edildi</span>`;
    }
    const etiket = c.tahsilatTuru === 'Cek' ? 'Çek Tahsil Edildi mi?' : 'Senet Tahsil Edildi mi?';
    return `<button type="button" class="btn small senet-tahsil-btn" data-senet-anahtari="${escapeHtml(c.senetAnahtari||'')}">${etiket}</button>`;
  }
  return '—';
}
function cekSenetModalAc(musteriKod, musteriAdi){
  const kod = String(musteriKod||'').trim();
  state.cekSenetModalMevcut = {kod, adi: musteriAdi};
  const report = state.report;
  const m = (report && report.musteriler ? report.musteriler.find(x=>String(x.musteri||'').trim()===kod) : null)
    || state.faturaModalYedekMap.get(kod) || null;
  const detay = (m && m.cekSenetDetay) ? m.cekSenetDetay : [];
  document.getElementById('cekSenetModalAvatar').textContent = avatarBaslangic(musteriAdi);
  document.getElementById('cekSenetModalTitle').textContent = musteriAdi||'';
  document.getElementById('cekSenetModalSub').textContent = kod + ' · ' + detay.length + ' kayıt';
  document.getElementById('cekSenetModalTbody').innerHTML = detay.length ? detay.map(c=>`<tr>
    <td>${escapeHtml(c.no||'—')}</td><td>${escapeHtml(c.tip||'—')}</td>
    <td>${fmtDate(c.belgeTarihi)}</td><td>${fmtDate(c.vade)}</td><td class="num">${TL(c.tutar)}</td>
    <td>${cekSenetModalSatirDurumHtml(c)}</td>
  </tr>`).join('') : `<tr><td colspan="6" class="empty-state">Çek/Senet kaydı bulunamadı.</td></tr>`;
  document.getElementById('cekSenetModalOverlay').classList.add('open');
}
function cekSenetModalKapat(){
  document.getElementById('cekSenetModalOverlay').classList.remove('open');
}
document.getElementById('cekSenetModalClose').addEventListener('click', cekSenetModalKapat);
document.getElementById('cekSenetModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='cekSenetModalOverlay') cekSenetModalKapat();
});
// "Çek/Senet Tahsil Edildi mi?" butonu — tıklanınca ilgili kaydın anahtarı kalıcı onay listesine
// eklenir, rapor bu müşteri için yeniden hesaplanır (tam yeniden yükleme YAPILMADAN — yalnızca
// tahsilatArsiv içindeki gecerli bayrağı ve türetilmiş alanlar güncellenir) ve hem popup hem de
// arkadaki tüm ekranlar (Toplam Risk, Alınan Tahsilat, KPI'lar vb.) tazelenir.
document.getElementById('cekSenetModalTbody').addEventListener('click', async (e)=>{
  const btn = e.target.closest('.senet-tahsil-btn');
  if(!btn) return;
  const anahtar = btn.getAttribute('data-senet-anahtari');
  if(!anahtar) return;
  const onayli = confirm('Bu çek/senedin tahsil edildiğini onaylıyor musunuz? Onaylarsanız bu kayıt artık risk olarak değil, tahsilat olarak sayılacaktır.');
  if(!onayli) return;
  state.cekSenetTahsilOnaylari.add(anahtar);
  const onayBuluttaKaydedildi = await saveSenetTahsilOnaylariToLocal();
  if(cloudEnabled() && !onayBuluttaKaydedildi){
    // Cihaz depolama kapalı — onay buluta yazılamazsa hiçbir yerde kalıcı değildir, sayfa
    // yenilenirse "Tahsil Edildi" durumu sıfırlanmış gibi görünür. Kullanıcıyı açıkça uyarıyoruz.
    alert('UYARI: Bu onay buluta kaydedilemedi (cihaza da kaydedilmiyor) — sayfa yenilenirse "Tahsil Edildi" durumu kaybolabilir. Lütfen bağlantınızı/girişinizi kontrol edip tekrar deneyin.');
  }
  await cekSenetOnayiUyguladiktanSonraRaporuTazele();
  const mevcut = state.cekSenetModalMevcut;
  if(mevcut) cekSenetModalAc(mevcut.kod, mevcut.adi);
  // Arkada açık olan Fatura modalı (Toplam Kalan Borç / Risk başlığı) aynı müşteriye aitse onu da
  // tazele — aksi halde kullanıcı modalı kapatıp tekrar açana kadar eski (onay öncesi) Toplam Risk
  // değerini görmeye devam eder.
  const faturaMevcut = state.faturaModalMevcut;
  if(faturaMevcut && mevcut && String(faturaMevcut.kod).trim()===String(mevcut.kod).trim()){
    faturaModalAc(faturaMevcut.kod, faturaMevcut.adi);
  }
});
// Rapor zaten bellekteyken (state.report) yeni bir dosya yüklemesi olmadan çek/senet onayını
// yansıtmak için: tahsilatArsiv'deki ilgili çek/senet satır(lar)ını "gecerli" yapar, cekSenetMap /
// cekSenetDetay / m.cekSenet / m.toplamRisk / m.alinanTahsilat / m.kalanBorc değerlerini o
// müşteri için yeniden türetir ve ekranı tazeler. buildReport'un ilgili bölümüyle aynı formülleri
// izler (bkz. buildReport içindeki cekSenetMap/cekSenetDetayMap ve toplamRisk hesaplamaları).
// Onaylanan çek/senedin GEÇMİŞ günlük arşiv kopyalarını da günceller (bkz. cekSenetOnayiUyguladiktanSonraRaporuTazele
// yorumu) — aksi halde Trend Analizi/Aylık Ortalama Tahsilat gibi state.faturaArsivCache üzerinden
// hesaplanan ekranlar, arşive o gün yazılmış ESKİ (gecerli:false) hâli okumaya devam eder; sadece
// state.report.musteriler[].cekSenetDetay'ı güncellemek YETERLİ DEĞİLDİR, çünkü bu iki veri kaynağı
// (canlı rapor ile arşiv) birbirinden bağımsız kopyalardır.
async function cekSenetArsivGecerliBayragiGuncelle(){
  const arsiv = state.faturaArsivCache || {};
  const degisenGunler = {}; // gun -> gunKaydi (yalnızca gerçekten değişen günler — kısmi PATCH için)
  Object.keys(arsiv).forEach(gun=>{
    const gunKaydi = arsiv[gun];
    if(!gunKaydi || !Array.isArray(gunKaydi.tahsilatArsiv)) return;
    let buGunDegisti = false;
    gunKaydi.tahsilatArsiv.forEach(r=>{
      if(r.tahsilatTuru !== 'Cek' && r.tahsilatTuru !== 'Senet') return;
      const onaylandi = state.cekSenetTahsilOnaylari.has(r.senetAnahtari);
      if(onaylandi !== r.gecerli){ r.gecerli = onaylandi; buGunDegisti = true; }
    });
    if(buGunDegisti) degisenGunler[gun] = gunKaydi;
  });
  if(Object.keys(degisenGunler).length){
    // Arşiv içeriği değişti — cihaza kalıcı kaydet, bulut açıksa SADECE değişen günleri (kısmi
    // PATCH) oraya da yazar, ve birleştirme önbelleğini (faturaBirlesikCache, referans bazlı)
    // geçersiz kılar ki bir sonraki okuma güncel veriyi worker'da yeniden hesaplasın.
    saveFaturaKontrolArsivToLocal(arsiv).catch(()=>{});
    if(cloudEnabled()){
      const sonuc = await saveFaturaKontrolArsivGunleriToCloud(degisenGunler);
      if(!sonuc.ok) console.error('UYARI: Çek/Senet onayı sonrası arşiv buluta yazılamadı, sadece cihazda kaldı.', sonuc.reason);
    }
    faturaBirlesikCache = { kaynak: null, promise: null };
  }
}
async function cekSenetOnayiUyguladiktanSonraRaporuTazele(){
  await cekSenetArsivGecerliBayragiGuncelle();
  const report = state.report;
  if(!report) return;
  const tumMusteriler = (report.musteriler||[]).concat(report.bakiyesiz||[]);
  tumMusteriler.forEach(m=>{
    if(!m.cekSenetDetay || !m.cekSenetDetay.length) return;
    let degisenVar = false;
    let yeniCekSenetRisk = 0;
    m.cekSenetDetay.forEach(c=>{
      if(c.tahsilatTuru === 'Cek' || c.tahsilatTuru === 'Senet'){
        const onaylandi = state.cekSenetTahsilOnaylari.has(c.senetAnahtari);
        if(onaylandi !== c.tahsilEdildiMi) degisenVar = true;
        c.tahsilEdildiMi = onaylandi;
      }
      if((c.tahsilatTuru === 'Cek' || c.tahsilatTuru === 'Senet') && !c.tahsilEdildiMi) yeniCekSenetRisk += (c.tutar||0);
    });
    if(!degisenVar && yeniCekSenetRisk === (m.cekSenet||0)) return;
    m.cekSenet = yeniCekSenetRisk;
    if(!m.__bakiyesiz){
      m.toplamRisk = m.kalanBorc + m.cekSenet;
    } else {
      m.toplamRisk = m.cekSenet;
    }
  });
  // ÖNEMLİ: computeSevkOzet/computeGenelKPI/computeNoktaYaslandirma/computeNakitAkisTahmini/
  // computeSupheliAlacak gibi fonksiyonlar memoizePure ile önbelleklenir; önbellek anahtarı
  // `report` nesnesinin REFERANSINA (kimliğine) göre üretilir, içeriğine göre değil (bkz.
  // __dataVersion — WeakMap tabanlı). state.report'u YERİNDE (aynı referansla) değiştirirsek bu
  // fonksiyonlar değişikliği fark etmez ve ESKİ (tahsil öncesi) sonucu döndürmeye devam eder — bu
  // yüzden kart/Toplam Risk ekranda güncellenmiyordu, sadece yeni bir dosya yüklemesi (ki o da
  // state.report'u TAMAMEN yeni bir nesneyle değiştiriyor) sorunu "çözüyormuş" gibi görünüyordu.
  // Çözüm: mutasyondan sonra report'u sığ (shallow) kopyalayıp state.report'a YENİ bir referans
  // olarak atıyoruz — böylece tüm memoize önbellekleri otomatik olarak geçersiz sayılır.
  if(report){
    state.report = Object.assign({}, report, {
      musteriler: (report.musteriler||[]).slice(),
      bakiyesiz: (report.bakiyesiz||[]).slice(),
    });
  }
  if(typeof renderReport === 'function' && state.report) renderReport(state.report);
  // Güncellenmiş raporu (yeni Toplam Risk/cekSenetDetay değerleriyle) cihaza VE (bulut açıksa)
  // buluta kalıcı kaydet — aksi halde F5/sayfa yenilemede veya başka bir cihazda state.report,
  // buildReport'un EN SON çalıştığı andaki (onay öncesi) hâliyle geri yüklenir ve "Tahsil Edildi"
  // durumu sıfırlanmış gibi görünür. (Onay bilgisinin kendisi state.cekSenetTahsilOnaylari'nde
  // zaten kalıcıdır, ama raporun KENDİSİ bu onayı yansıtacak şekilde yeniden kaydedilmezse
  // ekranda eski hâli görünmeye devam eder — buildReport yeniden ÇALIŞTIRILMADIĞI sürece.)
  if(state.report){
    saveReportToStorage(state.report).catch(()=>{});
    if(cloudEnabled()){
      saveReportToCloud(state.report).catch(err=> console.error('UYARI: Çek/Senet onayı sonrası rapor buluta yazılamadı, sadece cihazda kaldı.', err));
    }
  }
}

async function tahsilatTahminiModalAc(musteriKod, musteriAdi){
  document.getElementById('tahsilatTahminiModalAvatar').textContent = avatarBaslangic(musteriAdi);
  document.getElementById('tahsilatTahminiModalTitle').textContent = musteriAdi||'';
  const body = document.getElementById('tahsilatTahminiModalBody');
  body.innerHTML = `<div class="empty-state">Yükleniyor…</div>`;
  document.getElementById('tahsilatTahminiModalOverlay').classList.add('open');

  const kod = String(musteriKod||'').trim();
  const report = state.report;
  const m = (report && report.musteriler ? report.musteriler.find(x=>String(x.musteri||'').trim()===kod) : null)
    || state.faturaModalYedekMap.get(kod) || null;
  const kalanBorc = (m && m.kalanBorc) || 0;
  // DÜZELTME (2. tur): Bu popup üç farklı görünümden açılabiliyor — Fatura Kontrol (tarihe özgü
  // "seciliSiparis" alanı), ve Müşteri Bazlı Cari Özet / Sevk Kontrol (genel açık sipariş tutarı,
  // "siparisTutari" alanı). state.faturaModalYedekMap, hangi görünüm en son render edildiyse onun
  // satırını taşıyor. "seciliSiparis" anahtarı GERÇEKTEN varsa (Fatura Kontrol'den geldiyse, değeri
  // 0 olsa bile) onu kullan; yoksa (Cari Özet/Sevk'ten geldiyse) genel siparisTutari alanına düş.
  const yedekSatir = state.faturaModalYedekMap.get(kod);
  const siparisTutari = (yedekSatir && typeof yedekSatir.seciliSiparis === 'number')
    ? yedekSatir.seciliSiparis
    : ((m && m.siparisTutari) || (yedekSatir && yedekSatir.siparisTutari) || 0);
  const toplam = kalanBorc + siparisTutari;

  let ozet = null;
  try{ ozet = await computeMusteriAylikOzet(kod); }catch(err){ console.error('Tahsilat tahmini hesaplanırken hata:', err); }
  const gunlukHiz = (ozet && ozet.aylikTahsilat>0) ? (ozet.aylikTahsilat/30) : null;

  // Üstteki Kalan Borç / Sipariş / Toplam özeti + (varsa) tahmini tahsil rozeti + manuel "anlık tahsilat ekle" alanı.
  // Not: girilen "anlık tahsilat" hiçbir arşive/kayda YAZILMAZ — sadece bu popup açıkken yaşayan,
  // sunucuya gönderilmeyen geçici bir senaryo hesabıdır. Hesap her zaman BUGÜNDEN itibaren sayılır.
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
      <div><div style="font-size:11px;color:var(--ink-soft);margin-bottom:2px;">Kalan borç</div><div style="font-weight:700;font-size:14px;color:var(--ink);">${TL(kalanBorc)}</div></div>
      <div><div style="font-size:11px;color:var(--ink-soft);margin-bottom:2px;">Sipariş</div><div style="font-weight:700;font-size:14px;color:var(--ink);">${TL(siparisTutari)}</div></div>
      <div><div style="font-size:11px;color:var(--ink-soft);margin-bottom:2px;">Toplam</div><div style="font-weight:700;font-size:14px;color:var(--ink);">${TL(toplam)}</div></div>
    </div>
    <div style="font-size:11px;color:var(--ink-faint);margin-bottom:16px;">Aylık ortalama tahsilat (arşivden, sabit): ${ozet ? TL(ozet.aylikTahsilat) : '—'}</div>
    <div style="height:1px;background:var(--line-soft);margin:0 0 16px;"></div>
    <div id="ttSonucAlani"></div>
    <div style="height:1px;background:var(--line-soft);margin:18px 0;"></div>
    <label style="font-size:13px;color:var(--ink-soft);display:block;margin-bottom:8px;">Teslimde alınacak tahsilat</label>
    <div style="display:inline-flex;align-items:stretch;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;">
      <span style="display:flex;align-items:center;padding:0 4px 0 12px;font-size:13px;color:var(--ink-faint);background:var(--surface);">₺</span>
      <input id="ttAnlikTahsilat" type="number" placeholder="0" style="width:130px;border:none;box-shadow:none;padding:0 8px;" />
      <button id="ttEkleBtn" aria-label="Ekle" style="width:38px;border:none;border-left:1px solid var(--line);background:var(--accent-soft);color:var(--accent-deep);display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:0;font-size:16px;cursor:pointer;">+</button>
    </div>
    <div id="ttNot" style="font-size:11px;color:var(--ink-faint);margin-top:8px;display:none;"></div>
    <button type="button" id="ttSifirlaBtn" class="btn small" style="margin-top:8px;display:none;"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Temel hesaba dön</button>
  `;

  const sonucAlani = document.getElementById('ttSonucAlani');
  const notEl = document.getElementById('ttNot');
  const sifirlaBtn = document.getElementById('ttSifirlaBtn');

  function tahminGoster(kalanTutar){
    if(gunlukHiz==null){
      sonucAlani.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">Bu müşteri için tahsilat geçmişi bulunamadığından tahmin hesaplanamıyor.</div>`;
      return;
    }
    const gun = Math.max(0, Math.round(kalanTutar / gunlukHiz));
    const tarih = new Date(); tarih.setDate(tarih.getDate() + gun);
    // Gün rozeti, "ORT VADE"/"DÖNÜŞ" rozetleriyle AYNI dil ve renk skalasıyla (donusRenk) gösterilir:
    // kısa süre mavi/yeşil, uzun süre turuncu/kırmızı.
    const renk = donusRenk(gun);
    sonucAlani.innerHTML = `
      <div style="font-size:10.5px;font-weight:700;letter-spacing:.03em;color:var(--ink-soft);margin-bottom:7px;">TAHMİNİ TAHSİL TARİHİ</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <span style="font-size:17px;font-weight:700;color:var(--ink);">${fmtDate(tarih)}</span>
        <span class="htk-badge-pill" style="background:${renk.soft};color:${renk.renk};">
          <span class="htk-badge-circle" style="background:${renk.renk};">${gun.toLocaleString('tr-TR')}</span>GÜN SONRA
        </span>
      </div>`;
  }
  tahminGoster(toplam);

  document.getElementById('ttEkleBtn').addEventListener('click', ()=>{
    const eklenen = parseFloat(document.getElementById('ttAnlikTahsilat').value) || 0;
    if(eklenen<=0) return;
    const kalan = Math.max(0, toplam - eklenen);
    tahminGoster(kalan);
    notEl.style.display = 'block';
    notEl.textContent = `${TL(eklenen)} tahsilat eklendi — bu değer kaydedilmez, sadece bu senaryo için geçerlidir.`;
    sifirlaBtn.style.display = 'inline-flex';
  });
  sifirlaBtn.addEventListener('click', ()=>{
    document.getElementById('ttAnlikTahsilat').value = '';
    tahminGoster(toplam);
    notEl.style.display = 'none';
    sifirlaBtn.style.display = 'none';
  });
}
function tahsilatTahminiModalKapat(){
  document.getElementById('tahsilatTahminiModalOverlay').classList.remove('open');
}
document.getElementById('tahsilatTahminiModalClose').addEventListener('click', tahsilatTahminiModalKapat);
document.getElementById('tahsilatTahminiModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='tahsilatTahminiModalOverlay') tahsilatTahminiModalKapat();
});
document.getElementById('faturaModalTahsilatTahminiBtn').addEventListener('click', ()=>{
  const mevcut = state.faturaModalMevcut;
  if(!mevcut) return;
  tahsilatTahminiModalAc(mevcut.kod, mevcut.adi);
});

async function analizModalAc(musteriKod, musteriAdi){
  document.getElementById('analizModalAvatar').textContent = avatarBaslangic(musteriAdi);
  document.getElementById('analizModalTitle').textContent = musteriAdi;
  const body = document.getElementById('analizModalBody');
  body.innerHTML = `<div class="empty-state">Yükleniyor…</div>`;
  document.getElementById('analizModalOverlay').classList.add('open');
  let ozet = null;
  try{
    ozet = await computeMusteriAylikOzet(String(musteriKod||'').trim());
  }catch(err){
    console.error('Analiz hesaplanırken hata:', err);
  }
  if(!ozet){
    body.innerHTML = `<div class="empty-state">Bu müşteri için fatura/tahsilat arşiv verisi bulunamadı.</div>`;
    return;
  }
  const toplamTahsilatPay = ozet.aylikTahsilat>0 ? ozet.aylikTahsilat : 1;
  const normalPay = Math.max(0, ozet.aylikNormalTahsilat);
  const hakedisPay = Math.max(0, ozet.aylikHakedisTahsilat);
  const krediPay = Math.max(0, ozet.aylikKrediTahsilat);
  const normalYuzde = (normalPay/toplamTahsilatPay*100);
  const hakedisYuzde = (hakedisPay/toplamTahsilatPay*100);
  const krediYuzde = (krediPay/toplamTahsilatPay*100);
  const geriDonusRenk = ozet.geriDonusGun==null ? {renk:'var(--ink-faint)', soft:'var(--line-soft)'} : donusRenk(ozet.geriDonusGun);
  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--ink-soft);">FATURA · AYLIK ORTALAMA</div>
        <div style="font-family:var(--font-figures);font-size:28px;font-weight:700;color:var(--ink);margin-top:4px;">${TL(ozet.aylikFatura)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--ink-soft);">LİTRE</div>
        <div style="font-family:var(--font-figures);font-size:19px;font-weight:700;color:var(--ink-soft);margin-top:4px;">${ozet.aylikLitre!=null?Math.round(ozet.aylikLitre).toLocaleString('tr-TR')+' Lt':'—'}</div>
      </div>
    </div>

    <div style="height:1px;background:var(--line-soft);margin:16px 0;"></div>

    <div style="font-size:10.5px;font-weight:700;letter-spacing:.05em;color:var(--ink-soft);margin-bottom:9px;">TAHSİLAT · AYLIK ORTALAMA</div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;">
      <div style="font-family:var(--font-figures);font-size:22px;font-weight:700;color:var(--ink);">${TL(ozet.aylikTahsilat)}</div>
      ${ozet.aylikTahsilat>0 ? `<div style="font-size:11px;color:var(--ink-soft);">%${normalYuzde.toFixed(1).replace('.',',')} normal</div>` : ''}
    </div>
    ${ozet.aylikTahsilat>0 ? `
    <div style="height:8px;border-radius:5px;background:var(--line-soft);margin-top:8px;overflow:hidden;display:flex;">
      <div style="width:${normalYuzde.toFixed(2)}%;background:var(--accent);"></div>
      <div style="width:${hakedisYuzde.toFixed(2)}%;background:#1D5FB8;"></div>
      <div style="width:${krediYuzde.toFixed(2)}%;background:var(--danger);"></div>
    </div>
    <div style="display:flex;gap:14px;margin-top:7px;font-size:10.5px;color:var(--ink-soft);flex-wrap:wrap;">
      <span><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--accent);margin-right:4px;"></span>Normal ${TL(normalPay)}</span>
      ${hakedisPay>0 ? `<span><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:#1D5FB8;margin-right:4px;"></span>Hakediş ${TL(hakedisPay)}</span>` : ''}
      ${krediPay>0 ? `<span><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:var(--danger);margin-right:4px;"></span>İade/Depozito ${TL(krediPay)}</span>` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:9px;flex-wrap:wrap;">
      ${ozet.aylikTuruNormal>0 ? `<span class="badge" style="background:var(--accent-soft,#eef2ff);color:var(--accent);">Normal tahsilat ${TL(ozet.aylikTuruNormal)}</span>` : ''}
      ${ozet.aylikTuruCekSenet>0 ? `<span class="badge" style="background:#FFF3E0;color:#B8630A;">Çek senet ${TL(ozet.aylikTuruCekSenet)}</span>` : ''}
      ${ozet.aylikTuruSanalPos>0 ? `<span class="badge" style="background:#EAE6FB;color:#5B3FBD;">Sanal Pos ${TL(ozet.aylikTuruSanalPos)}</span>` : ''}
    </div>` : ''}

    <div style="height:1px;background:var(--line-soft);margin:16px 0;"></div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:14px;"><i class="fa-solid fa-bolt" aria-hidden="true"></i></span>
        <span style="font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--accent);">VERİMLİLİK</span>
      </div>
      ${ozet.geriDonusGun!=null ? `<span class="htk-badge-pill" style="background:${geriDonusRenk.soft};color:${geriDonusRenk.renk};">
        <span class="htk-badge-circle" style="background:${geriDonusRenk.renk};">${Math.round(ozet.geriDonusGun)}</span>DÖNÜŞ
      </span>` : `<span style="font-size:12px;color:var(--ink-faint);">—</span>`}
    </div>
  `;
}
function analizModalKapat(){
  document.getElementById('analizModalOverlay').classList.remove('open');
}
document.getElementById('analizModalClose').addEventListener('click', analizModalKapat);
document.getElementById('analizModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='analizModalOverlay') analizModalKapat();
});
document.getElementById('faturaModalAnalizBtn').addEventListener('click', ()=>{
  const mevcut = state.faturaModalMevcut;
  if(!mevcut) return;
  analizModalAc(mevcut.kod, mevcut.adi);
});
document.getElementById('faturaModalCekSenetBtn').addEventListener('click', ()=>{
  const mevcut = state.faturaModalMevcut;
  if(!mevcut) return;
  cekSenetModalAc(mevcut.kod, mevcut.adi);
});
document.getElementById('dikkatModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'dikkatModalOverlay') closeDikkatModal();
});

function renderDikkatPanel(report){
  const banner = document.getElementById('dikkatBanner');
  const temsilci = document.getElementById('dikkatTemsilciFilter').value;
  const riskli = report.musteriler
    .filter(isRiskliMusteri)
    .filter(m=> !temsilci || m.temsilci === temsilci)
    .slice()
    .sort((a,b)=> (b.avgVadeGun||0) - (a.avgVadeGun||0));

  const toplamRiskli = report.musteriler.filter(isRiskliMusteri).length;
  if(!toplamRiskli){
    banner.style.display = 'none';
    closeDikkatModal();
    return;
  }
  banner.style.display = 'flex';
  document.getElementById('dikkatBannerCount').textContent = toplamRiskli.toLocaleString('tr-TR') + ' ';
  document.getElementById('dikkatCount').textContent = riskli.length.toLocaleString('tr-TR') + ' müşteri';

  const tbody = document.getElementById('dikkatTbody');
  if(!riskli.length){
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">Bu temsilci için dikkat gerektiren müşteri bulunamadı.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = riskli.map(m=>`
    <tr data-musteri="${escapeHtml(m.musteri)}">
      <td><div class="musteri-name">${escapeHtml(m.musteriAdi)}</div><div class="musteri-code">${escapeHtml(m.musteri)}</div></td>
      <td><span class="temsilci-tag">${escapeHtml(m.temsilci)}</span></td>
      <td class="num"><span class="num-strong">${TL(m.kalanBorc)}</span></td>
      <td class="num">${vadeBadge(m.avgVadeGun)}</td>
      <td class="num"><span class="num-strong">${TL(m.toplamRisk)}</span></td>
    </tr>`).join('');

  document.getElementById('dikkatTbody').querySelectorAll('tr').forEach(tr=>{
    tr.addEventListener('click', ()=>{
      const musteri = tr.getAttribute('data-musteri');
      closeDikkatModal();
      document.getElementById('searchInput').value = musteri;
      updateSearchClearBtn();
      renderMusteriTable(state.report);
      document.getElementById('musteriPanel').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

document.getElementById('dikkatTemsilciFilter').addEventListener('change', ()=>renderDikkatPanel(state.report));


function vadeBadge(gun){
  if(gun==null) return '';
  if(gun>60) return `<span class="badge over">${gun} gün</span>`;
  if(gun>0) return `<span class="badge soon">${gun} gün</span>`;
  return `<span class="badge ok">${gun<0?gun:0} gün</span>`;
}

// Kart tasarımındaki "95 gün gecikme" satırı için — Şüpheli Alacak'taki htk-gecikme ile aynı üslup.

// ORT VADE rozeti — sabit kırmızı yerine, gün sayısına göre kademeli renk (yeşil→sarı→turuncu→kırmızı).
function ortVadeRenk(gun){
  const g = Math.round(Number(gun)||0);
  if(g<=7) return {renk:'var(--success)', soft:'var(--success-soft)'};
  if(g<=20) return {renk:'var(--warn)', soft:'var(--warn-soft)'};
  if(g<=25) return {renk:'#C2571B', soft:'#F5DDD0'};
  return {renk:'var(--danger)', soft:'var(--danger-soft)'};
}

// "Dönüş" rozeti (Analiz popup'ı — fatura tutarının geri dönüş süresi) — 5 kademeli renk skalası,
// ORT VADE'den farklı olarak en hızlı (0-3 gün) mavi ile başlar.
function donusRenk(gun){
  const g = Math.round(Number(gun)||0);
  if(g<=3) return {renk:'#185FA5', soft:'#E6F1FB'};
  if(g<=7) return {renk:'var(--success)', soft:'var(--success-soft)'};
  if(g<=14) return {renk:'var(--warn)', soft:'var(--warn-soft)'};
  if(g<=21) return {renk:'#C2571B', soft:'#F5DDD0'};
  return {renk:'var(--danger)', soft:'var(--danger-soft)'};
}

function avatarBaslangic(ad){
  const parcalar = String(ad||'').trim().split(/\s+/).filter(Boolean);
  const h1 = parcalar[0] ? parcalar[0][0] : '';
  const h2 = parcalar[1] ? parcalar[1][0] : '';
  return (h1+h2).toLocaleUpperCase('tr-TR');
}

function renderMusteriDahaFazlaBtn(gosterilenSayi, toplamSayi){
  const wrap = document.getElementById('musteriDahaFazlaWrap');
  const info = document.getElementById('musteriDahaFazlaInfo');
  if(!wrap) return;
  if(toplamSayi > gosterilenSayi){
    wrap.style.display = 'flex';
    info.textContent = `${gosterilenSayi.toLocaleString('tr-TR')} / ${toplamSayi.toLocaleString('tr-TR')} müşteri gösteriliyor`;
  } else {
    wrap.style.display = 'none';
  }
}

function renderMusteriTable(report, resetSayfa=true){
  if(resetSayfa) state.musteriGosterilen = MUSTERI_SAYFA_BOYUTU;
  const rows = getFilteredSorted(report);
  document.getElementById('musteriCount').textContent = rows.length.toLocaleString('tr-TR') + ' müşteri';
  const list = document.getElementById('musteriTbody');
  if(!rows.length){
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Filtreyle eşleşen müşteri bulunamadı.</div>`;
    renderMusteriDahaFazlaBtn(0, 0);
    return;
  }
  const hakedisKodlari = bayiHakedisliMusteriKodlari();
  const stokKodlari = ticariStokluMusteriKodlari();
  const gosterilecekSayi = Math.min(state.musteriGosterilen, rows.length);
  const gosterilecekRows = rows.slice(0, gosterilecekSayi);
  list.innerHTML = gosterilecekRows.map(m=>{
    state.faturaModalYedekMap.set(m.musteri, m);
    const risk = hukukiRiskSeviyesi(m.avgVadeGun);
    const vadeRenk = ortVadeRenk(m.avgVadeGun);
    return `<div class="htk-card" data-musteri="${escapeHtml(m.musteri)}" style="--htk-risk:${risk.renk};--htk-risk-bg:${risk.bg};">
      <div class="htk-head">
        <div style="min-width:0;">
          <div class="htk-musteri-row">
            <span class="htk-musteri">${escapeHtml(m.musteriAdi)}</span>
          </div>
          <div class="htk-temsilci">${HTK_USER_ICON}${escapeHtml(m.temsilci)}</div>
        </div>
        <div class="htk-badge-col">
          <span class="htk-badge-vade" style="border-color:${vadeRenk.renk};"><span class="htk-badge-vade-num" style="color:${vadeRenk.renk};">${Math.round(m.avgVadeGun)||0}</span><span class="htk-badge-vade-lbl" style="color:${vadeRenk.renk};">Ort. Vade</span></span>
          ${isRiskliMusteri(m)?'<span class="badge dikkat" title="Ortalama vade '+VADE_RISK_ESIGI+' gün ve üzeri"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Dikkat</span>':''}${hakedisRozeti(m.musteri, hakedisKodlari)}${emanetRozeti(m.musteri, stokKodlari)}
        </div>
      </div>
      <div class="htk-borc-satir">
        <span class="htk-borc">${TL(m.kalanBorc)}</span>
      </div>
      <div class="htk-inline-stats">
        <div class="htk-stat-item"><span class="l">Sipariş</span><span class="v${m.siparisTutari>0?' c-siparis':' zero'}">${m.siparisTutari>0?TL(m.siparisTutari):'—'}</span></div>
        <div class="htk-stat-item"><span class="l">Sevk Ert.</span><span class="v${m.emanetSiparis>0?' c-sevk':' zero'}">${m.emanetSiparis>0?TL(m.emanetSiparis):'—'}</span></div>
        <div class="htk-stat-item"><span class="l">Tahsilat</span><span class="v${m.alinanTahsilat>0?' c-tahsilat':' zero'}">${m.alinanTahsilat>0?TL(m.alinanTahsilat):'—'}</span></div>
      </div>
      <div class="htk-alt">
        <span class="htk-ceksenet">Çek/Senet: ${TL(m.cekSenet||0)}</span>
        <div class="htk-alt-actions">
          <button type="button" class="btn small senet-yazdir-btn" data-musteri="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}" data-tutar="${m.siparisTutari||0}" data-emanet="${m.emanetSiparis||0}" data-kalan-borc="${m.kalanBorc||0}"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Senet</button>
          <button type="button" class="nokta-detay-btn primary fatura-detay-btn" data-musteri-kod="${escapeHtml(m.musteri)}" data-musteri-adi="${escapeHtml(m.musteriAdi)}">Detay ↗</button>
        </div>
      </div>
    </div>`;
  }).join('');

  renderMusteriDahaFazlaBtn(gosterilecekSayi, rows.length);
}
