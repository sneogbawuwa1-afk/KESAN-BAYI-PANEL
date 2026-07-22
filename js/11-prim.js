/* =====================================================================
   PRİM MODÜLÜ — Temsilci Bazlı Aylık Prim Sistemi
   ---------------------------------------------------------------------
   Tasarım kararları (Prim_Sistemi_Tasarim.docx v1.0):
   - 4 boyut: Tahsilat(net erime) %40, Yaşlandırma %25, Cari Azaltma %20, Ciro %15
   - Net erime = ay içi tahsilat − ay içi (net) yeni fatura
   - Yaşlanan cari = ortalama vadesi 30 gün+ olan cariler
   - Çek/senet yalnızca tahsil edilince sayılır (tahsilat arşivi zaten böyle)
   - İade faturaları düşülür (net fatura); nakit ve çek/senet eşit sayılır
   - Prim tavanı 5.000 ₺, baraj (min puan) elle ayarlanabilir (varsayılan 50)
   - Temsilci ataması TEK kaynak: Müşteri Master (m.temsilci); ay içinde sabit
   - Ay içinde hiç hareketi olmayan / '—' temsilci gösterilmez
   - Ay başı verisi: kullanıcının aldığı "Ay Başı Snapshot" (buluta kaydedilir)
   Tüm katsayılar/ağırlıklar state.primAyarlari üzerinden ayarlanabilir.
   ===================================================================== */

// ---- Bulut / yerel saklama yolları (sellOutHedef desenini izler) ----
const PRIM_AYAR_CLOUD_PATH   = CLOUD.path + '_primAyarlari';
const PRIM_AYAR_LOCAL_KEY    = 'noktaCariTakip_primAyarlari_v1';
const PRIM_SNAPSHOT_CLOUD_PATH = CLOUD.path + '_primSnapshotlar'; // { [ayKey]: {kayitZamani, temsilciYok?, musteriler:[...] } }
const PRIM_SNAPSHOT_LOCAL_KEY  = 'noktaCariTakip_primSnapshotlar_v1';

// ---- Varsayılan prim ayarları ----
const PRIM_VARSAYILAN_AYAR = {
  agirlikTahsilat: 40, agirlikYaslandirma: 25, agirlikCari: 20, agirlikCiro: 15,
  yaslanmaEsigiGun: 30,      // ort. vade bu değerden büyükse "yaşlanmış" sayılır
  hedefNetOran: 10,          // ay başı carinin %10'unu net eritme hedefi
  primTavan: 5000,           // TL
  barajPuan: 50,             // bu puanın altı prim almaz
  ciroHedefOran: 100,        // ay içi ciro hedefi = referans (elle ayar için)
};

// state güvence (01-cekirdek state objesine sonradan eklenir)
if(typeof state !== 'undefined'){
  if(!state.primAyarlari) state.primAyarlari = Object.assign({}, PRIM_VARSAYILAN_AYAR);
  if(!state.primSnapshotlar) state.primSnapshotlar = {};
}

/* =====================================================================
   YARDIMCILAR
   ===================================================================== */
function primAyar(){ return Object.assign({}, PRIM_VARSAYILAN_AYAR, state.primAyarlari||{}); }
function primClamp(x,lo,hi){ lo=(lo==null?0:lo); hi=(hi==null?100:hi); return Math.max(lo, Math.min(hi, x)); }
function primAyKey(d){ // Date -> 'YYYY-MM'
  const dt = (d instanceof Date)? d : new Date();
  return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');
}
function primAyBaslangicKey(ayKey){ return ayKey+'-01'; }
function primAySonuKey(ayKey){
  const [y,m]=ayKey.split('-').map(Number);
  const son=new Date(y, m, 0).getDate(); // ayın son günü
  return ayKey+'-'+String(son).padStart(2,'0');
}
function primFmtTL(n){
  const v=Math.round(Number(n)||0);
  return v.toLocaleString('tr-TR')+' ₺';
}
function primFmtM(n){ // milyon kısaltma
  const v=Number(n)||0;
  if(Math.abs(v)>=1e6) return (v/1e6).toLocaleString('tr-TR',{maximumFractionDigits:1})+'M';
  if(Math.abs(v)>=1e3) return (v/1e3).toLocaleString('tr-TR',{maximumFractionDigits:0})+'K';
  return v.toLocaleString('tr-TR');
}

/* =====================================================================
   BULUT / YEREL KAYIT (sellOutHedef dörtlüsü modeli)
   ===================================================================== */
async function savePrimAyarToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_AYAR_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Prim ayarı buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadPrimAyarFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_AYAR_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) return null;
    const t = await res.text();
    if(!t || t==='null') return null;
    return JSON.parse(t);
  }catch(err){ console.error('Prim ayarı buluttan okunamadı:', err); return null; }
}
async function savePrimSnapshotToCloud(obj){
  if(!cloudEnabled()) return {ok:false, reason:'not-configured'};
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_SNAPSHOT_CLOUD_PATH}.json${await authQuery()}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj),
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    return {ok:true};
  }catch(err){ console.error('Prim snapshot buluta kaydedilemedi:', err); return {ok:false, reason:err.message}; }
}
async function loadPrimSnapshotFromCloud(){
  if(!cloudEnabled()) return null;
  try{
    const res = await cloudFetch(`${CLOUD.dbUrl.replace(/\/$/,'')}/${PRIM_SNAPSHOT_CLOUD_PATH}.json${await authQuery()}`);
    if(!res.ok) return null;
    const t = await res.text();
    if(!t || t==='null') return null;
    return JSON.parse(t);
  }catch(err){ console.error('Prim snapshot buluttan okunamadı:', err); return null; }
}

async function primAyarKaydet(obj){
  state.primAyarlari = Object.assign({}, PRIM_VARSAYILAN_AYAR, obj);
  try{ localStorage.setItem(PRIM_AYAR_LOCAL_KEY, JSON.stringify(state.primAyarlari)); }catch(e){}
  if(cloudEnabled()){
    const s = await savePrimAyarToCloud(state.primAyarlari);
    if(!s.ok) throw new Error('Prim ayarı buluta kaydedilemedi: '+(s.reason||''));
  }
}
async function primAyarYenile(){
  let obj=null;
  if(cloudEnabled()) obj = await loadPrimAyarFromCloud();
  if(!obj){ try{ obj = JSON.parse(localStorage.getItem(PRIM_AYAR_LOCAL_KEY)||'null'); }catch(e){} }
  state.primAyarlari = Object.assign({}, PRIM_VARSAYILAN_AYAR, obj||{});
}
async function primSnapshotlariYenile(){
  let obj=null;
  if(cloudEnabled()) obj = await loadPrimSnapshotFromCloud();
  if(!obj){ try{ obj = JSON.parse(localStorage.getItem(PRIM_SNAPSHOT_LOCAL_KEY)||'null'); }catch(e){} }
  state.primSnapshotlar = obj || {};
}
async function primSnapshotKaydet(ayKey, snap){
  state.primSnapshotlar = state.primSnapshotlar || {};
  state.primSnapshotlar[ayKey] = snap;
  try{ localStorage.setItem(PRIM_SNAPSHOT_LOCAL_KEY, JSON.stringify(state.primSnapshotlar)); }catch(e){}
  if(cloudEnabled()){
    const s = await savePrimSnapshotToCloud(state.primSnapshotlar);
    if(!s.ok) throw new Error('Snapshot buluta kaydedilemedi: '+(s.reason||''));
  }
}

/* =====================================================================
   AY BAŞI SNAPSHOT — o anki report.musteriler'in prim alanlarını dondurur
   ===================================================================== */
function primSnapshotOlustur(report){
  const musteriler = (report && report.musteriler || []).filter(m=>m && m.temsilci && m.temsilci!=='—');
  return {
    kayitZamani: new Date().toISOString(),
    asOf: report && report.asOf ? report.asOf : null,
    musteriler: musteriler.map(m=>({
      musteri: m.musteri,
      temsilci: m.temsilci,
      kalanBorc: Number(m.kalanBorc)||0,
      avgVadeGun: Number(m.avgVadeGun)||0,
    })),
  };
}

/* =====================================================================
   HESAP MOTORU — temsilci bazlı prim
   ===================================================================== */

// Ay başı snapshot'ından temsilci bazlı toplamlar (bakiye + yaşlanan bakiye)
function primSnapshotTemsilciTopla(snap, esikGun){
  const map = new Map();
  (snap && snap.musteriler || []).forEach(m=>{
    const t = m.temsilci; if(!t || t==='—') return;
    if(!map.has(t)) map.set(t, {bakiye:0, yaslanan:0, musteriSayisi:0});
    const o = map.get(t);
    o.bakiye += Number(m.kalanBorc)||0;
    if((Number(m.avgVadeGun)||0) > esikGun) o.yaslanan += Number(m.kalanBorc)||0;
    o.musteriSayisi++;
  });
  return map;
}

// Ay sonu (güncel report) temsilci bazlı toplamlar
function primReportTemsilciTopla(report, esikGun){
  const map = new Map();
  (report && report.musteriler || []).forEach(m=>{
    const t = m.temsilci; if(!t || t==='—') return;
    if(!map.has(t)) map.set(t, {bakiye:0, yaslanan:0, musteriSayisi:0});
    const o = map.get(t);
    o.bakiye += Number(m.kalanBorc)||0;
    if((Number(m.avgVadeGun)||0) > esikGun) o.yaslanan += Number(m.kalanBorc)||0;
    o.musteriSayisi++;
  });
  return map;
}

// Ay içi yeni fatura (net: iade türleri zaten faturaArsiv'e girmiyor) temsilci bazlı
function primFaturaTemsilciTopla(report, ilkGunKey, sonGunKey){
  const map = new Map();
  (report && report.faturaArsiv || []).forEach(f=>{
    const t = f.temsilci; if(!t) return;
    const d = f.faturaTarihi instanceof Date ? f.faturaTarihi : (f.faturaTarihi? new Date(f.faturaTarihi):null);
    if(!d) return;
    const gk = dateKeyLocal(d);
    if(ilkGunKey && gk<ilkGunKey) return;
    if(sonGunKey && gk>sonGunKey) return;
    map.set(t, (map.get(t)||0) + (Number(f.tutar)||0));
  });
  return map;
}

// Ay içi tahsilat (çek/senet tahsil edilince zaten arşive girmiş) temsilci bazlı
function primTahsilatTemsilciTopla(ilkGunKey, sonGunKey){
  const map = new Map();
  const dizi = tahsilatArsivindenAralikDiziyeCevir(state.tahsilatArsivi||{}, ilkGunKey, sonGunKey);
  dizi.forEach(r=>{
    const t = r.satisTemsilcisi; if(!t) return;
    map.set(t, (map.get(t)||0) + (Number(r.tutar)||0));
  });
  return map;
}

// Ay içi ciro (faturaArsiv tutarları = satış cirosu) temsilci bazlı
function primCiroTemsilciTopla(report, ilkGunKey, sonGunKey){
  // ciro = ay içi net satış faturası tutarı (faturaArsiv). Fatura toplamıyla aynı kaynak.
  return primFaturaTemsilciTopla(report, ilkGunKey, sonGunKey);
}

// --- Puanlama fonksiyonları ---
function puanTahsilatNet(netErime, netHedef){
  if(netHedef<=0) return 50;
  const o = netErime/netHedef;
  if(o<0) return 0;                 // cari büyüdü
  if(o>=1) return primClamp(85+(o-1)/0.30*15);
  return primClamp(o*85);
}
function puanYaslandirma(basi, sonu){
  if(basi<=0) return (sonu<=0)?100:50;
  const d = (basi-sonu)/basi;
  return primClamp(40 + d/0.40*60);
}
function puanCariAzaltma(basi, sonu){
  if(basi<=0) return 50;
  const d = (basi-sonu)/basi;
  return primClamp(50 + d/0.25*50);
}
function puanCiro(ciro, hedef){
  if(hedef<=0) return 50;
  return primClamp(ciro/hedef*90);
}

// Otomatik net tahsilat hedefi: ay başı carinin %hedefNetOran'ı (yaşlanmaya göre hafif ayar)
function primOtomatikNetHedef(ayBasiBakiye, yaslanmaOrani, ayar){
  const taban = (ayar.hedefNetOran||10)/100;
  const zorluk = taban * (1 - (yaslanmaOrani||0)*0.4);
  return ayBasiBakiye * Math.max(zorluk, taban*0.5); // en fazla yarıya kadar hafifler
}

// Ana hesap: temsilci başına prim satırı listesi döndürür
function primHesapla(report, ayKey){
  const ayar = primAyar();
  const esik = ayar.yaslanmaEsigiGun;
  const ilkGunKey = primAyBaslangicKey(ayKey);
  const sonGunKey = primAySonuKey(ayKey);

  const snap = (state.primSnapshotlar||{})[ayKey] || null;
  const ayBasiMap = snap ? primSnapshotTemsilciTopla(snap, esik) : null;
  const aySonuMap = primReportTemsilciTopla(report, esik);
  const faturaMap = primFaturaTemsilciTopla(report, ilkGunKey, sonGunKey);
  const tahsilatMap = primTahsilatTemsilciTopla(ilkGunKey, sonGunKey);
  const ciroMap = faturaMap; // ay içi net satış = ciro

  // AKTİF temsilci = ay içinde GERÇEK HAREKETİ olan (fatura VEYA tahsilat).
  // Sadece bakiyesi olan ama ay içinde hiç fatura/tahsilat hareketi olmayan
  // temsilciler (ör. 'Ahmet Selçuk', 'Key Account', 'Hüseyin Edizarslan')
  // prim listesinde GÖSTERİLMEZ (kullanıcı kararı). Bu yüzden aySonuMap (bakiye
  // kaynağı) sete EKLENMEZ; yalnızca fatura ve tahsilat hareketi esas alınır.
  const temsilciSet = new Set();
  faturaMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  tahsilatMap.forEach((tutar,t)=>{ if(Math.abs(tutar)>0) temsilciSet.add(t); });
  temsilciSet.delete('—'); temsilciSet.delete(''); temsilciSet.delete('Key Account');

  const satirlar = [];
  temsilciSet.forEach(t=>{
    const ayBasi = ayBasiMap ? (ayBasiMap.get(t)||{bakiye:0,yaslanan:0,musteriSayisi:0}) : null;
    const aySonu = aySonuMap.get(t) || {bakiye:0,yaslanan:0,musteriSayisi:0};
    const tahsilat = tahsilatMap.get(t)||0;
    const yeniFatura = faturaMap.get(t)||0;
    const ciro = ciroMap.get(t)||0;
    const netErime = tahsilat - yeniFatura;

    // ay başı yoksa (snapshot alınmamışsa) cari azaltma/yaşlandırma hesaplanamaz -> uyarı
    const ayBasiVar = !!ayBasi;
    const ayBasiBakiye = ayBasiVar ? ayBasi.bakiye : aySonu.bakiye;
    const yaslanmaOrani = ayBasiBakiye>0 ? (ayBasiVar?ayBasi.yaslanan:aySonu.yaslanan)/ayBasiBakiye : 0;

    // manuel hedef override kontrolü (state.primAyarlari.hedefOverride[temsilci])
    const override = (ayar.hedefOverride||{})[t];
    const netHedef = (override!=null && override>0) ? Number(override) : primOtomatikNetHedef(ayBasiBakiye, yaslanmaOrani, ayar);

    const pT = puanTahsilatNet(netErime, netHedef);
    const pY = ayBasiVar ? puanYaslandirma(ayBasi.yaslanan, aySonu.yaslanan) : 50;
    const pC = ayBasiVar ? puanCariAzaltma(ayBasi.bakiye, aySonu.bakiye) : 50;
    // ciro hedefi: ay başı carinin bir oranı (basit referans) — elle ayarlanabilir
    const ciroHedef = ayBasiBakiye>0 ? ayBasiBakiye*0.5 : (ciro||1);
    const pR = puanCiro(ciro, ciroHedef);

    const toplam = pT*(ayar.agirlikTahsilat/100) + pY*(ayar.agirlikYaslandirma/100)
                 + pC*(ayar.agirlikCari/100) + pR*(ayar.agirlikCiro/100);

    let prim = 0;
    if(toplam >= ayar.barajPuan){
      const oran = (toplam - ayar.barajPuan) / (100 - ayar.barajPuan);
      prim = ayar.primTavan * (0.20 + oran*0.80);
      prim = Math.min(prim, ayar.primTavan);
    }
    const not = toplam>=80?'A': toplam>=70?'B': toplam>=55?'C':'D';

    // EK GÜVENCE: ay içi tahsilat, fatura ve cironun hepsi sıfırsa bu temsilci
    // ay içinde hiç iş yapmamış demektir -> listede gösterme (kullanıcı kararı).
    if(Math.abs(tahsilat)===0 && Math.abs(yeniFatura)===0 && Math.abs(ciro)===0) return;

    satirlar.push({
      temsilci:t, musteriSayisi: aySonu.musteriSayisi,
      ayBasiBakiye, aySonuBakiye: aySonu.bakiye,
      ayBasiYaslanan: ayBasiVar?ayBasi.yaslanan:null, aySonuYaslanan: aySonu.yaslanan,
      tahsilat, yeniFatura, netErime, ciro, netHedef,
      pT,pY,pC,pR, toplam, prim, not, ayBasiVar,
    });
  });

  satirlar.sort((a,b)=> b.toplam-a.toplam);
  return { satirlar, ayBasiVar: !!snap, snapZamani: snap?snap.kayitZamani:null };
}

/* =====================================================================
   ARAYÜZ
   ===================================================================== */
function primSecilenAyKey(){
  const sel = document.getElementById('primAySecici');
  if(sel && sel.value) return sel.value;
  return primAyKey(new Date());
}

function primNotRenk(not){
  return not==='A'?'var(--gb-good,#008300)': not==='B'?'#2a78d6': not==='C'?'#946400':'#b3261e';
}

async function renderPrimView(report){
  const kpiEl = document.getElementById('primKpiGrid');
  const listEl = document.getElementById('primTbody');
  const cntEl = document.getElementById('primCount');
  if(!listEl) return;
  if(!report){ listEl.innerHTML = '<div class="empty-state">Önce rapor oluşturun.</div>'; return; }

  const ayKey = primSecilenAyKey();
  const sonuc = primHesapla(report, ayKey);
  const ayar = primAyar();
  const satirlar = sonuc.satirlar;

  if(cntEl) cntEl.textContent = satirlar.length + ' aktif temsilci · ' + ayKey;

  // --- KPI ---
  const toplamPrim = satirlar.reduce((s,r)=>s+r.prim,0);
  const ortPuan = satirlar.length? satirlar.reduce((s,r)=>s+r.toplam,0)/satirlar.length : 0;
  const toplamTahsilat = satirlar.reduce((s,r)=>s+r.tahsilat,0);
  const toplamNetErime = satirlar.reduce((s,r)=>s+r.netErime,0);
  if(kpiEl){
    kpiEl.innerHTML = [
      primKpiKart('Toplam Dağıtılan Prim', primFmtTL(toplamPrim), satirlar.length+' temsilci'),
      primKpiKart('Ortalama Puan', ortPuan.toFixed(1)+' / 100', 'Ekip geneli'),
      primKpiKart('Ay İçi Tahsilat', primFmtM(toplamTahsilat)+' ₺', 'Tüm ekip'),
      primKpiKart('Net Cari Erime', primFmtM(toplamNetErime)+' ₺', 'Tahsilat − yeni fatura'),
    ].join('');
  }

  // --- Ay başı uyarısı ---
  let uyari = '';
  if(!sonuc.ayBasiVar){
    uyari = '<div class="empty-state" style="border-left:3px solid #946400;text-align:left;padding:12px 16px;margin-bottom:14px;">'
      + '<b>Ay başı fotoğrafı alınmamış.</b> Bu ay ('+ayKey+') için "Ay Başı Prim Fotoğrafı" kaydı yok. '
      + 'Yaşlandırma ve cari azaltma puanları hesaplanamıyor (varsayılan 50 kullanılıyor). '
      + 'Ayın 1\'inde kalemler dosyasını yükleyip aşağıdaki <b>“Ay Başı Fotoğrafı Al”</b> butonuna basın.</div>';
  } else {
    const dt = new Date(sonuc.snapZamani);
    uyari = '<div class="as-of" style="margin-bottom:12px;">Ay başı fotoğrafı: '
      + dt.toLocaleDateString('tr-TR') + ' ' + dt.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})+'</div>';
  }

  // --- Toolbar (ay seçici + snapshot butonu + ayarlar) ---
  const simdiAy = primAyKey(new Date());
  const aylar = primAySeceneleri();
  const toolbar = '<div class="toolbar" style="gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">'
    + '<label style="font-size:13px;color:var(--text-secondary,#52514e);">Dönem: </label>'
    + '<select class="filter-select" id="primAySecici" onchange="renderPrimView(state.report)">'
    + aylar.map(a=>`<option value="${a}" ${a===ayKey?'selected':''}>${a}</option>`).join('')
    + '</select>'
    + '<button class="btn" id="primSnapshotBtn" onclick="primAyBasiFotografiAlHandler()"><i class="fa-solid fa-camera"></i> Ay Başı Fotoğrafı Al</button>'
    + (sonuc.ayBasiVar ? '<button class="btn" id="primSnapshotSilBtn" onclick="primSnapshotSilHandler()" style="color:#b3261e;"><i class="fa-solid fa-trash"></i> Fotoğrafı Sil</button>' : '')
    + '<button class="btn" id="primAyarBtn" onclick="primAyarPaneliAcKapat()"><i class="fa-solid fa-sliders"></i> Ayarlar</button>'
    + '</div>'
    + primAyarPaneliHTML(ayar);

  // --- Temsilci kartları ---
  let kartlar = '';
  if(!satirlar.length){
    kartlar = '<div class="empty-state">Bu dönemde aktif (hareketi olan) temsilci bulunamadı.</div>';
  } else {
    satirlar.forEach((r,i)=>{ kartlar += primTemsilciKart(r,i); });
  }

  // --- Detay tablo ---
  const tablo = satirlar.length ? primDetayTablo(satirlar, ayar) : '';

  listEl.innerHTML = toolbar + uyari
    + '<div class="cust-card-list" style="margin-bottom:20px;">'+kartlar+'</div>'
    + tablo;
}

function primKpiKart(lab, val, cap){
  return '<div class="gb-kpi-card">'
    + '<div class="gb-kpi-top"><i class="fa-solid fa-percent" aria-hidden="true"></i> '+lab+'</div>'
    + '<div class="gb-kpi-value">'+val+'</div>'
    + '<div class="gb-kpi-foot"><span class="gb-kpi-sub">'+(cap||'')+'</span></div>'
    + '</div>';
}

function primTemsilciKart(r,i){
  const renk = primNotRenk(r.not);
  const madalya = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.';
  const bar = (lab,puan,clr)=>'<div style="display:grid;grid-template-columns:96px 1fr 34px;gap:8px;align-items:center;font-size:12px;margin:5px 0;">'
    + '<span style="color:var(--text-secondary,#52514e);">'+lab+'</span>'
    + '<span style="height:8px;background:var(--surface-0,#f0f0ec);border-radius:5px;overflow:hidden;display:block;"><span style="display:block;height:100%;width:'+Math.round(puan)+'%;background:'+clr+';border-radius:5px;"></span></span>'
    + '<span style="text-align:right;font-weight:600;">'+Math.round(puan)+'</span></div>';
  const ayBasiNot = r.ayBasiVar? '' : ' <span style="font-size:11px;color:#946400;">(ay başı yok)</span>';
  return '<div class="htk-card" style="padding:16px 18px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">'
    +   '<div><div style="font-weight:700;font-size:16px;">'+primEsc(r.temsilci)+'</div>'
    +     '<div style="font-size:12px;color:var(--text-secondary,#52514e);">'+r.musteriSayisi+' cari'+ayBasiNot+'</div></div>'
    +   '<div style="text-align:right;"><span style="font-size:11px;font-weight:700;">'+madalya+'</span></div>'
    + '</div>'
    + '<div style="display:flex;align-items:baseline;gap:10px;margin:6px 0 4px;">'
    +   '<span style="font-size:32px;font-weight:800;">'+r.toplam.toFixed(0)+'<span style="font-size:14px;color:var(--text-secondary,#52514e);">/100</span></span>'
    +   '<span style="font-size:12px;font-weight:700;padding:2px 9px;border-radius:8px;color:'+renk+';background:'+renk+'22;">'+r.not+'</span>'
    + '</div>'
    + '<div style="font-size:13px;margin:4px 0 10px;">Prim: <b style="font-size:15px;color:'+(r.prim>0?'var(--gb-good,#008300)':'#b3261e')+';">'+primFmtTL(r.prim)+'</b></div>'
    + bar('Tahsilat', r.pT, '#2a78d6')
    + bar('Yaşlandırma', r.pY, '#eda100')
    + bar('Cari Azaltma', r.pC, '#1baf7a')
    + bar('Satış/Ciro', r.pR, '#4a3aa7')
    + '</div>';
}

function primDetayTablo(satirlar, ayar){
  const head = '<tr>'
    + ['Temsilci','Ay Başı Cari','Ay Sonu Cari','Tahsilat','Yeni Fatura','Net Erime','Yaşlanan (B→S)','Puan','Not','Prim']
      .map(h=>'<th style="padding:9px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-secondary,#52514e);border-bottom:1px solid var(--border,#e3e2dc);">'+h+'</th>').join('')
    + '</tr>';
  const td=(c,al)=>'<td style="padding:9px 10px;text-align:'+(al||'right')+';border-bottom:1px solid var(--border,#e3e2dc);font-variant-numeric:tabular-nums;">'+c+'</td>';
  let rows='';
  satirlar.forEach(r=>{
    const dCari = r.aySonuBakiye - r.ayBasiBakiye;
    const dCariStr = r.ayBasiVar ? (dCari<=0?'<span style="color:#008300;">'+primFmtM(dCari)+'</span>':'<span style="color:#b3261e;">+'+primFmtM(dCari)+'</span>') : '—';
    const yasStr = r.ayBasiVar ? (primFmtM(r.ayBasiYaslanan)+' → '+primFmtM(r.aySonuYaslanan)) : '—';
    const netStr = r.netErime<0? '<span style="color:#b3261e;">'+primFmtM(r.netErime)+'</span>' : primFmtM(r.netErime);
    rows += '<tr>'
      + td(primEsc(r.temsilci),'left')
      + td(r.ayBasiVar?primFmtM(r.ayBasiBakiye):'—')
      + td(primFmtM(r.aySonuBakiye))
      + td(primFmtM(r.tahsilat))
      + td(primFmtM(r.yeniFatura))
      + td(netStr)
      + td(yasStr)
      + td(r.toplam.toFixed(1))
      + td('<span style="font-weight:700;color:'+primNotRenk(r.not)+';">'+r.not+'</span>')
      + td('<b>'+primFmtTL(r.prim)+'</b>')
      + '</tr>';
  });
  return '<div class="stok-section-divider"><span class="stok-section-divider-title">Ay Başı → Ay Sonu Detay</span></div>'
    + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">'
    + '<thead>'+head+'</thead><tbody>'+rows+'</tbody></table></div>';
}

/* ---- Ayar paneli ---- */
function primAyarPaneliHTML(ayar){
  const inp=(id,lab,val,step)=>'<div style="display:flex;flex-direction:column;gap:3px;">'
    + '<label style="font-size:12px;color:var(--text-secondary,#52514e);">'+lab+'</label>'
    + '<input type="number" class="filter-select" id="'+id+'" value="'+val+'" step="'+(step||1)+'" style="width:110px;"></div>';
  return '<div id="primAyarPaneli" style="display:none;background:var(--surface-1,#fcfcfb);border:1px solid var(--border,#e3e2dc);border-radius:12px;padding:16px 18px;margin-bottom:16px;">'
    + '<div style="font-weight:700;margin-bottom:12px;">Prim Ayarları</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:14px;">'
    +   inp('primAgTahsilat','Tahsilat ağırlığı %',ayar.agirlikTahsilat)
    +   inp('primAgYas','Yaşlandırma ağırlığı %',ayar.agirlikYaslandirma)
    +   inp('primAgCari','Cari ağırlığı %',ayar.agirlikCari)
    +   inp('primAgCiro','Ciro ağırlığı %',ayar.agirlikCiro)
    +   inp('primEsik','Yaşlanma eşiği (gün)',ayar.yaslanmaEsigiGun)
    +   inp('primHedefOran','Net hedef oranı %',ayar.hedefNetOran)
    +   inp('primTavan','Prim tavanı ₺',ayar.primTavan,100)
    +   inp('primBaraj','Baraj puanı',ayar.barajPuan)
    + '</div>'
    + '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">'
    +   '<button class="btn" onclick="primAyarKaydetHandler()"><i class="fa-solid fa-floppy-disk"></i> Kaydet</button>'
    +   '<span style="font-size:12px;color:var(--text-secondary,#52514e);">Ağırlıklar toplamı 100 olmalıdır.</span>'
    + '</div></div>';
}
function primAyarPaneliAcKapat(){
  const p=document.getElementById('primAyarPaneli');
  if(p) p.style.display = (p.style.display==='none'?'block':'none');
}
async function primAyarKaydetHandler(){
  const g=id=>Number((document.getElementById(id)||{}).value)||0;
  const yeni={
    agirlikTahsilat:g('primAgTahsilat'), agirlikYaslandirma:g('primAgYas'),
    agirlikCari:g('primAgCari'), agirlikCiro:g('primAgCiro'),
    yaslanmaEsigiGun:g('primEsik'), hedefNetOran:g('primHedefOran'),
    primTavan:g('primTavan'), barajPuan:g('primBaraj'),
    hedefOverride: (state.primAyarlari||{}).hedefOverride||{},
  };
  const top=yeni.agirlikTahsilat+yeni.agirlikYaslandirma+yeni.agirlikCari+yeni.agirlikCiro;
  if(top!==100){ alert('Ağırlıklar toplamı 100 olmalı. Şu an: '+top); return; }
  if(!(await ortakSifreDogrula('Prim ayarlarını değiştirmek için şifreyi girin:'))) return;
  try{ await primAyarKaydet(yeni); }catch(e){ alert(e.message); return; }
  renderPrimView(state.report);
}

/* ---- Ay başı fotoğrafı al ---- */
async function primAyBasiFotografiAlHandler(){
  if(!state.report){ alert('Önce rapor oluşturun.'); return; }
  const ayKey = primSecilenAyKey();
  const mevcut = (state.primSnapshotlar||{})[ayKey];
  const mesaj = mevcut
    ? ayKey+' için zaten bir ay başı fotoğrafı var. ÜZERİNE YAZILSIN mı? Bu işlem geri alınamaz.'
    : ayKey+' dönemi için ay başı fotoğrafı alınacak. Bugünkü rapor "ay başı" referansı olarak kaydedilecek. Onaylıyor musunuz?';
  if(!confirm(mesaj)) return;
  if(!(await ortakSifreDogrula('Ay başı fotoğrafı almak için şifreyi girin:'))) return;
  const snap = primSnapshotOlustur(state.report);
  try{ await primSnapshotKaydet(ayKey, snap); }
  catch(e){ alert('Kaydedilemedi: '+e.message); return; }
  alert('Ay başı fotoğrafı kaydedildi ('+snap.musteriler.length+' cari).');
  renderPrimView(state.report);
}

/* ---- Ay başı fotoğrafını sil (test verisi temizleme) ---- */
async function primSnapshotSilHandler(){
  const ayKey = primSecilenAyKey();
  if(!(state.primSnapshotlar||{})[ayKey]){ alert(ayKey+' için silinecek bir fotoğraf yok.'); return; }
  if(!confirm(ayKey+' dönemine ait ay başı fotoğrafı SİLİNECEK. Bu işlem geri alınamaz. Onaylıyor musunuz?')) return;
  if(!(await ortakSifreDogrula('Fotoğrafı silmek için şifreyi girin:'))) return;
  const kopya = Object.assign({}, state.primSnapshotlar);
  delete kopya[ayKey];
  state.primSnapshotlar = kopya;
  try{
    localStorage.setItem(PRIM_SNAPSHOT_LOCAL_KEY, JSON.stringify(kopya));
    if(cloudEnabled()){ const s=await savePrimSnapshotToCloud(kopya); if(!s.ok) throw new Error(s.reason||''); }
  }catch(e){ alert('Silinemedi: '+e.message); return; }
  alert(ayKey+' fotoğrafı silindi.');
  renderPrimView(state.report);
}

/* ---- Ay seçenekleri: SADECE fotoğrafı olan aylar + içinde bulunulan ay ----
   Boş geçmiş aylar (fotoğrafı olmayan 4./5. ay gibi) LİSTELENMEZ (kullanıcı kararı). */
function primAySeceneleri(){
  const set = new Set();
  set.add(primAyKey(new Date()));  // içinde bulunulan ay (fotoğraf almak için)
  Object.keys(state.primSnapshotlar||{}).forEach(k=>set.add(k));  // fotoğrafı olan aylar
  return Array.from(set).sort().reverse();
}

/* ---- yardımcı ---- */
function primEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Açılışta ayar + snapshot yükle (uygulama başlatma akışına eklenir)
async function primVerileriniYukle(){
  try{ await primAyarYenile(); }catch(e){}
  try{ await primSnapshotlariYenile(); }catch(e){}
}
