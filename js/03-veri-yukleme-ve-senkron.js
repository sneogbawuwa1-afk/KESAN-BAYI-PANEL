// ============================== GRUP B: "Günlük Veri Yükle" ÜST PANEL ==============================
// Sipariş Dökümü / Tahsilat Dökümü / Fatura Dökümü / Depozito Tahsilat / Bayi Hak Ediş dosyaları
// artık ana ekrandaki dropzone yerine buradan yüklenir. Panel açıldığında hangi dosya seçilmek
// isteniyorsa (data-gvy-type), aynı #gvyFileInput üzerinden dosya seçtirilir; seçilen dosya AYNI
// handleFiles/detectType mekanizmasından geçer (tip otomatik tanınır, hangi butona basıldığından
// bağımsız olarak state.files[type]'a doğru yere yazılır).
// "Veri Güncelle"ye basınca kasıtlı olarak YENİ bir hesaplama akışı YAZILMAZ — hesaplama motoruna
// dokunmadan, ana ekrandaki "Raporu Oluştur" (buildBtn) ile TAMAMEN AYNI akış tetiklenir. Kalemler
// dosyası zaten önceden yüklenip hafızada/bulutta olduğu için bu sorunsuz çalışır; kullanıcı sadece
// güncellemek istediği 5 dosyayı seçip tek butona basar.
(function(){
  const wrap = document.getElementById('gvyWrap');
  const toggleBtn = document.getElementById('gvyToggleBtn');
  const panel = document.getElementById('gvyPanel');
  const fileInputGvy = document.getElementById('gvyFileInput');
  const updateBtn = document.getElementById('gvyUpdateBtn');
  const syncBtnGvy = document.getElementById('gvySyncBtn');
  const statusMsg = document.getElementById('gvyStatusMsg');
  const lastSyncEl = document.getElementById('gvyLastSync');
  if(!wrap || !toggleBtn || !panel) return;

  let aktifSecimTipi = null; // hangi satırın "Dosya Seç" butonuna basıldı — gvyFileInput change'inde kullanılır

  function openPanel(){
    panel.classList.add('open');
    toggleBtn.setAttribute('aria-expanded','true');
    if(typeof updateGvyPanel === 'function') updateGvyPanel();
    if(typeof updateGvcPanel === 'function') updateGvcPanel();
    gvyKalemlerUyariGuncelle();
  }
  function closePanel(){
    panel.classList.remove('open');
    toggleBtn.setAttribute('aria-expanded','false');
  }

  // ---- Sekme geçişi (Günlük Veri / Arşiv Verisi) ----
  const tabButtons = panel.querySelectorAll('.gvy-tab');
  const tabPanes = panel.querySelectorAll('.gvy-tabpane');
  tabButtons.forEach(tb=>{
    tb.addEventListener('click', ()=>{
      const hedef = tb.getAttribute('data-gvy-tab');
      tabButtons.forEach(b=>{ const aktif=b===tb; b.classList.toggle('active',aktif); b.setAttribute('aria-selected', aktif?'true':'false'); });
      tabPanes.forEach(p=>{
        const aktif = (hedef==='gunluk' && p.id==='gvyPaneGunluk') || (hedef==='arsiv' && p.id==='gvyPaneArsiv');
        p.classList.toggle('active', aktif);
      });
    });
  });

  // Bugün Kalemler yüklendi mi? (Grup C/B için ön koşul.) Ana ekrandaki state.files.kalemler O GÜN
  // yüklenmiş bir dosya varsa doludur (grupATekilDosyalariHazirla yalnızca bugüne ait Kalemler'i geri
  // yükler). Bu yüzden bugün Kalemler yoksa uyarı gösterilir ve güncelleme butonları kilitlenir.
  // Senkron hızlı kontrol: bellekte VEYA (en son tazelemede belirlenen) bugüne ait tek-slot kaydı.
  function bugunKalemlerVarMi(){
    if(state.files && state.files.kalemler && state.files.kalemler.data && state.files.kalemler.data.length) return true;
    return !!state.bugunKalemlerHazir;
  }
  // Asenkron: önce tek-slot arşivini tazeler (bugüne ait Kalemler var mı?), sonra UI'ı günceller.
  // Böylece rapor oluşturulmuş ama state.files bellekte boş olsa bile doğru sonucu verir.
  async function gvyKalemlerUyariGuncelle(){
    try{ if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele(); }catch(_){}
    const uyari = document.getElementById('gvyKalemlerUyari');
    const kalemlerYok = !bugunKalemlerVarMi();
    if(uyari) uyari.classList.toggle('goster', kalemlerYok);
    // Grup B ve Grup C güncelleme butonlarını da senkronla.
    const gb = document.getElementById('gvyUpdateBtn');
    const gc = document.getElementById('gvcUpdateBtn');
    if(gb) gb.disabled = kalemlerYok || (GVY_DOSYA_TIPLERI.filter(t=>state.files[t]).length===0);
    if(gc) gc.disabled = kalemlerYok || GRUP_C_HAZIR_SAYISI()===0;
  }
  window.gvyKalemlerUyariGuncelle = gvyKalemlerUyariGuncelle;
  toggleBtn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    if(panel.classList.contains('open')){ closePanel(); return; }
    // Panel her açılışta şifre ister (kapatmak şifresizdir). Bu, "Veri Yükle" (Günlük Veri +
    // Arşiv Verisi) panelinin yetkisiz kişilerce açılıp dosya yüklenmesini/değiştirilmesini önler.
    if(!(await ortakSifreDogrula('Veri Yükle panelini açmak için şifreyi girin:'))) return;
    openPanel();
  });
  // Panel dışında herhangi bir yere tıklanınca, farenin konumuna bakılmaksızın kapanır.
  document.addEventListener('click', (e)=>{
    if(!wrap.contains(e.target)) closePanel();
  });
  // Panelin İÇİNE tıklamak (satırlara, butonlara) paneli kapatmaz.
  panel.addEventListener('click', (e)=> e.stopPropagation());

  panel.querySelectorAll('[data-gvy-filebtn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.closest('.gvy-row');
      aktifSecimTipi = row ? row.getAttribute('data-gvy-type') : null;
      fileInputGvy.value = '';
      fileInputGvy.click();
    });
  });
  fileInputGvy.addEventListener('change', (e)=>{
    // handleFiles zaten dosya İÇERİĞİNE bakarak tipi otomatik algılıyor (detectType) — hangi
    // "Dosya Seç" butonuna basıldığı sadece dosya seçiciyi tetiklemek için kullanılır, algılamayı
    // etkilemez. Kullanıcı yanlışlıkla farklı bir dosya seçse bile doğru tipe yerleşir.
    handleFiles(e.target.files);
    aktifSecimTipi = null;
  });

  // "Kaldır" butonu: o satırın seçili dosyasını (state.files[tip]) temizler — dosya hiç
  // seçilmemişse veya yükleme sırasında bir sorun oluşup type tanınamamışsa buton zaten gizli kalır
  // (bkz. updateGvyPanel). Kaldırma sonrası hem panel hem ana ekran checklist'i tazelenir.
  panel.querySelectorAll('[data-gvy-removebtn]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const row = btn.closest('.gvy-row');
      const tip = row ? row.getAttribute('data-gvy-type') : null;
      if(!tip) return;
      state.files[tip] = null;
      if(typeof updateChecklist === 'function') updateChecklist();
      updateGvyPanel();
    });
  });

  // Her GVY dosya türü, Fatura Kontrol arşivinde (state.faturaArsivCache, gün->{...}) hangi alanda
  // tutuluyorsa (Yükleme Raporu hariç — o ayrı bir arşivde, state.yuklemeArsivCache), o alanı taşıyan
  // EN GÜNCEL (en büyük tarihli) günü bulur. Böylece "bu dosya türü için arşivde en son hangi günün
  // verisi var" bilgisi GVY panelinde ilgili satırın altında gösterilebilir.
  // NOT: Depozito Tahsilat AYRI bir arşiv alanına yazılmaz — Bozuk İade Faturası ile birlikte
  // tahsilatArsiv'in İÇİNE, formatKaynagi==='DepozitoTahsilat' etiketiyle karışık olarak eklenir
  // (bkz. tahsilatKredisiGunlereEkleVeDegistir). Bu yüzden 'depozitoTahsilat' tipi için ayrı bir
  // özel kontrol gerekir — diğer tipler gibi düz bir alan adı eşlemesiyle bulunamaz.
  const GVY_ARSIV_ALAN_ESLEME = {
    siparis: 'siparisArsiv',
    tahsilat: 'tahsilatArsiv',
    fatura: 'faturaArsiv',
    bayiHakedis: 'bayiHakedisArsiv',
  };
  // ÖNEMLİ: kayitZamani, faturaKontrolArsivineKaydetVeSenkronizeEt() içinde SADECE o günkü
  // "Raporu Oluştur/Veri Güncelle" işleminin GERÇEKTEN çalıştığı günün altına yazılır (bugunKey).
  // Yani bu değer, o dosyanın (Sipariş/Tahsilat/Fatura/…) EN SON HANGİ TARİH VE SAATTE fiilen
  // yüklenip işlendiğini gösterir — verinin İÇİNDEKİ tarihi değil, YÜKLEME ANINI temsil eder.
  // gunKey ile kayitZamani'nin ait olduğu gün FARKLI olabilir (örn. Fatura Dökümü'nde bir satır
  // geçmiş bir Fatura Tarihi'ne dağıtılmış olabilir) — bu yüzden ikisi ayrı ayrı döndürülür.
  function gvyTipiIcinEnGuncelArsivGunu(tip){
    if(tip === 'yukleme'){
      const gunler = Object.keys(state.yuklemeArsivCache || {}).filter(g=>{
        const g2 = state.yuklemeArsivCache[g];
        return g2 && (g2.sevkiyatVerisiVarMi || g2.tahsilatVerisiVarMi);
      });
      const enGuncelGun = gunler.length ? gunler.sort()[gunler.length-1] : null;
      return { gunKey: enGuncelGun, kayitZamani: gvyTipiIcinSonKayitZamani(tip) };
    }
    if(tip === 'depozitoTahsilat'){
      const arsiv = state.faturaArsivCache || {};
      const gunler = Object.keys(arsiv).filter(g=>{
        const kayit = (arsiv[g] && arsiv[g].tahsilatArsiv) || [];
        return kayit.some(r=> r && r.formatKaynagi === 'DepozitoTahsilat');
      });
      const enGuncelGun = gunler.length ? gunler.sort()[gunler.length-1] : null;
      return { gunKey: enGuncelGun, kayitZamani: gvyTipiIcinSonKayitZamani(tip) };
    }
    const alan = GVY_ARSIV_ALAN_ESLEME[tip];
    if(!alan) return { gunKey: null, kayitZamani: null };
    const arsiv = state.faturaArsivCache || {};
    const gunler = Object.keys(arsiv).filter(g=>{
      const kayit = arsiv[g] && arsiv[g][alan];
      return Array.isArray(kayit) ? kayit.length>0 : Boolean(kayit);
    });
    const enGuncelGun = gunler.length ? gunler.sort()[gunler.length-1] : null;
    return { gunKey: enGuncelGun, kayitZamani: gvyTipiIcinSonKayitZamani(tip) };
  }
  // Arşivdeki TÜM günleri tarayıp, o tipe ait veri içeren günlerden kayitZamani'si en güncel
  // (en yeni ISO zaman damgalı) olanını döndürür — bu, o dosyanın gerçekte en son ne zaman
  // yüklendiğini/işlendiğini gösterir. kayitZamani sadece "Raporu Oluştur/Veri Güncelle"
  // işleminin GERÇEKTEN çalıştığı bugünün altına yazıldığı için (bkz.
  // faturaKontrolArsivineKaydetVeSenkronizeEt), bu değer eski/geçmiş arşiv günlerinde bulunmaz —
  // yalnızca o dosyanın en son işlendiği güne ait kayıtta vardır.
  function gvyTipiIcinSonKayitZamani(tip){
    if(tip === 'yukleme'){
      // Yükleme Raporu kendi ayrı arşivinde (state.yuklemeArsivCache) tutulur; her günün
      // kayitZamani'si yuklemeRaporlariniArsivineKaydet() içinde ayrıca yazılır.
      const arsiv = state.yuklemeArsivCache || {};
      let enGuncelIso = null;
      Object.keys(arsiv).forEach(gunKey=>{
        const gun = arsiv[gunKey];
        if(gun && gun.kayitZamani && (!enGuncelIso || gun.kayitZamani > enGuncelIso)) enGuncelIso = gun.kayitZamani;
      });
      return enGuncelIso;
    }
    const alan = (tip==='depozitoTahsilat') ? null : GVY_ARSIV_ALAN_ESLEME[tip];
    const arsiv = state.faturaArsivCache || {};
    let enGuncelIso = null;
    Object.keys(arsiv).forEach(gunKey=>{
      const gun = arsiv[gunKey];
      if(!gun || !gun.kayitZamani) return;
      let buGundeVarMi;
      if(tip === 'depozitoTahsilat'){
        buGundeVarMi = ((gun.tahsilatArsiv)||[]).some(r=> r && r.formatKaynagi === 'DepozitoTahsilat');
      }else{
        const kayit = alan ? gun[alan] : null;
        buGundeVarMi = Array.isArray(kayit) ? kayit.length>0 : Boolean(kayit);
      }
      if(buGundeVarMi && (!enGuncelIso || gun.kayitZamani > enGuncelIso)) enGuncelIso = gun.kayitZamani;
    });
    return enGuncelIso;
  }
  function gvyGunKeyGoster(bilgi){
    if(!bilgi || !bilgi.gunKey) return '';
    // Gerçek yükleme zamanı (tarih+saat) biliniyorsa onu göster; bilinmiyorsa (örn. eski
    // kayıtlar kayitZamani alanından önce oluşturulmuşsa, ya da Yükleme Raporu için) eski
    // "Son veri: gg.aa.yyyy" gösterimine geri düş.
    if(bilgi.kayitZamani){
      const zd = new Date(bilgi.kayitZamani);
      if(!isNaN(zd.getTime())){
        return 'Son güncelleme: ' + zd.toLocaleDateString('tr-TR') + ' ' + zd.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
      }
    }
    const d = new Date(bilgi.gunKey + 'T00:00:00');
    if(isNaN(d.getTime())) return '';
    return 'Son veri: ' + d.toLocaleDateString('tr-TR');
  }

  // Panel her açıldığında/dosya seçildiğinde satırların durumunu (dosya adı / satır sayısı) günceller.
  window.updateGvyPanel = function updateGvyPanel(){
    GVY_DOSYA_TIPLERI.forEach(tip=>{
      const row = panel.querySelector('.gvy-row[data-gvy-type="'+tip+'"]');
      if(!row) return;
      const sub = row.querySelector('[data-gvy-sub]');
      const arsivGunEl = row.querySelector('[data-gvy-arsivgun]');
      if(arsivGunEl) arsivGunEl.textContent = gvyGunKeyGoster(gvyTipiIcinEnGuncelArsivGunu(tip));
      const fileBtn = row.querySelector('[data-gvy-filebtn]');
      const removeBtn = row.querySelector('[data-gvy-removebtn]');
      const info = state.files[tip];
      if(info){
        sub.textContent = info.name + ' · ' + info.data.length.toLocaleString('tr-TR') + ' satır';
        fileBtn.textContent = 'Değiştir';
        fileBtn.classList.add('done');
        if(removeBtn) removeBtn.style.display = '';
      }else{
        sub.textContent = 'Henüz dosya seçilmedi';
        fileBtn.textContent = 'Dosya Seç';
        fileBtn.classList.remove('done');
        if(removeBtn) removeBtn.style.display = 'none';
      }
    });
    const secilenSayisi = GVY_DOSYA_TIPLERI.filter(t=>state.files[t]).length;
    toggleBtn.classList.toggle('has-update', secilenSayisi>0);
    // Buton, dosya seçilmemişse VEYA bugün Kalemler yoksa kilitli (genel kural).
    updateBtn.disabled = secilenSayisi===0 || !bugunKalemlerVarMi();

    // Kanal Raporları (Geleneksel/Modern) bölümü: bu ikisi diğer GVY tipleri gibi günlük
    // arşive değil, kendi "güncel/canlı" rapor nesnesine (state.sellOutReport/modernKanalReport)
    // yazıldığı için — o raporun EN SON NE ZAMAN hesaplandığını (state.sellOut/modernKanalSonGuncelleme
    // zaman damgasını) gösterir.
    const sellOutSonEl = document.getElementById('sellOutKendiSonVeri');
    if(sellOutSonEl){
      sellOutSonEl.textContent = state.sellOutSonGuncelleme
        ? 'Son veri: ' + new Date(state.sellOutSonGuncelleme).toLocaleDateString('tr-TR') + ' ' + new Date(state.sellOutSonGuncelleme).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})
        : '';
    }
    const modernKanalSonEl = document.getElementById('modernKanalKendiSonVeri');
    if(modernKanalSonEl){
      modernKanalSonEl.textContent = state.modernKanalSonGuncelleme
        ? 'Son veri: ' + new Date(state.modernKanalSonGuncelleme).toLocaleDateString('tr-TR') + ' ' + new Date(state.modernKanalSonGuncelleme).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})
        : '';
    }
  };

  async function gvyLastSyncGuncelle(){
    if(!lastSyncEl) return;
    const bugunKey = dateKeyLocal(new Date());
    const arsiv = state.faturaArsivCache || {};
    const kayit = arsiv[bugunKey];
    if(kayit && kayit.kayitZamani){
      const d = new Date(kayit.kayitZamani);
      lastSyncEl.textContent = 'Son güncelleme: ' + d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
    }else{
      lastSyncEl.textContent = 'Son güncelleme: —';
    }
  }

  // "Veri Güncelle": Kalemler zaten hafızada/bulutta olduğu için, mevcut "Raporu Oluştur" akışını
  // (buildBtn.click ile TAMAMEN AYNI kod yolunu) tetikler — hesaplama mantığına dokunulmaz, sadece
  // kullanıcı deneyimi bu ayrı panelden geçer. state.report henüz hiç oluşmadıysa (uygulama daha
  // hiç rapor üretmediyse) bu panel kullanılamaz — önce ana ekrandan Kalemler ile ilk rapor
  // oluşturulmalıdır.
  updateBtn.addEventListener('click', async ()=>{
    // Genel kural: güne mutlaka Kalemler ile başlanmalı. Bugün Kalemler yüklenmemişse (ne bu
    // oturumda ne de bugüne ait tek-slot kaydından geri gelmişse) hiçbir güncellemeye izin yok.
    // Basmadan önce durumu asenkron TAZELE (rapor oluşmuş olabilir, bellek boş olabilir).
    if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele();
    if(!bugunKalemlerVarMi()){
      statusMsg.textContent = 'Önce bugünün Kalemler dosyasını ana ekrandan yükleyip "Raporu Oluştur"a basın.';
      gvyKalemlerUyariGuncelle();
      return;
    }
    if(!(await ortakSifreDogrula('Veriyi güncellemek için şifreyi girin:'))) return;
    updateBtn.disabled = true;
    const oncekiMetin = updateBtn.textContent;
    updateBtn.textContent = 'Güncelleniyor…';
    statusMsg.textContent = '';
    try{
      await raporuOlusturVeyaGuncelleAkisiniCalistir();
      statusMsg.textContent = 'Veriler güncellendi.';
      await gvyLastSyncGuncelle();
      updateGvyPanel();
      closePanel();
    }catch(err){
      console.error(err);
      statusMsg.textContent = 'Güncelleme sırasında hata oluştu: ' + err.message;
    }finally{
      updateBtn.disabled = GVY_DOSYA_TIPLERI.filter(t=>state.files[t]).length===0;
      updateBtn.textContent = oncekiMetin;
    }
  });

  // "Şimdi Senkronize Et": mevcut "Diğer Cihazdan Güncelle" (syncBtn) kısayoludur — ayrı bir
  // kavram eklemez, sadece bu panelden de erişilebilir hale getirir.
  syncBtnGvy.addEventListener('click', async ()=>{
    if(!cloudEnabled()){
      statusMsg.textContent = 'Bulut bağlantısı yapılandırılmamış.';
      return;
    }
    syncBtnGvy.disabled = true;
    statusMsg.textContent = 'Senkronize ediliyor…';
    try{
      syncBtn.click();
      statusMsg.textContent = 'Senkronizasyon başlatıldı.';
      await gvyLastSyncGuncelle();
      updateGvyPanel();
    }finally{
      syncBtnGvy.disabled = false;
    }
  });

  // ============================== GRUP C: "GÜNLÜK VERİ YÜKLE" SEKMESİ ==============================
  // Çek/Senet, Ticari Stok, Ciro Primi, Dönemsel İskonto — gün içinde sürekli güncellenebilir.
  // "Verileri Kaydet"e basınca dosyalar KALICI tek-slot arşive yazılır (grupATekilDosyaKaydet) ve
  // state.files'a da konur ki bir sonraki "Veri Güncelle/Raporu Oluştur" bunları kullansın.
  // KASITLI OLARAK otomatik yeniden hesaplama YAPILMAZ — kullanıcı raporu elle yeniler.
  const gvcFileInput = document.getElementById('gvcFileInput');
  const gvcUpdateBtn = document.getElementById('gvcUpdateBtn');
  const gvcStatusMsg = document.getElementById('gvcStatusMsg');
  let gvcAktifSecimTipi = null;

  panel.querySelectorAll('[data-gvc-filebtn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.closest('.gvy-row');
      gvcAktifSecimTipi = row ? row.getAttribute('data-gvc-type') : null;
      if(gvcFileInput){ gvcFileInput.value=''; gvcFileInput.click(); }
    });
  });
  panel.querySelectorAll('[data-gvc-removebtn]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const row = btn.closest('.gvy-row');
      const tip = row ? row.getAttribute('data-gvc-type') : null;
      if(tip && state.filesC){ delete state.filesC[tip]; updateGvcPanel(); }
    });
  });

  if(gvcFileInput){
    gvcFileInput.addEventListener('change', (e)=>{
      const files = Array.from(e.target.files||[]);
      if(!files.length) return;
      if(!xlsxHazirMi()){ gvcStatusMsg.textContent = 'Excel okuma bileşeni (xlsx) yüklenemedi — sayfayı yenileyin.'; return; }
      // Birden fazla dosya seçilebilir; her biri detectType ile tanınıp DOĞRU Grup C slotuna yazılır.
      // "Dosya Seç"e basılan satır (gvcAktifSecimTipi) bir ipucudur ama tip otomatik doğrulanır.
      let okunan = 0, sorun = [];
      Promise.all(files.map(file=> new Promise(resolve=>{
        const reader = new FileReader();
        reader.onerror = ()=>{ sorun.push(file.name+': okunamadı'); resolve(); };
        reader.onload = (ev)=>{
          try{
            const wb = XLSX.read(ev.target.result, {type:'array', cellDates:true});
            const {type, headers, data} = ilkUygunSayfayiSec(wb);
            if(!type || !GRUP_C_DOSYA_TIPLERI.includes(type)){
              sorun.push('"'+file.name+'" bu sekmeye ait bir dosya değil (yalnızca Çek/Senet, Ticari Stok, Ciro Primi, Dönemsel İskonto).');
              resolve(); return;
            }
            state.filesC[type] = {name:file.name, headers, data};
            okunan++;
          }catch(err){ sorun.push(file.name+': '+err.message); }
          resolve();
        };
        reader.readAsArrayBuffer(file);
      }))).then(()=>{
        updateGvcPanel();
        gvcStatusMsg.textContent = (okunan? okunan+' dosya seçildi. ':'') + (sorun.length? sorun.join(' ') : '');
      });
    });
  }

  if(gvcUpdateBtn){
    gvcUpdateBtn.addEventListener('click', async ()=>{
      // Basmadan önce Kalemler durumunu asenkron tazele (rapor oluşmuş ama bellek boş olabilir).
      if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele();
      if(!bugunKalemlerVarMi()){
        gvcStatusMsg.textContent = 'Önce bugünün Kalemler dosyasını ana ekrandan yükleyin.';
        return;
      }
      if(GRUP_C_HAZIR_SAYISI()===0){ gvcStatusMsg.textContent = 'Önce en az bir dosya seçin.'; return; }
      if(!(await ortakSifreDogrula('Verileri güncellemek için şifreyi girin:'))) return;
      gvcUpdateBtn.disabled = true;
      const oncekiMetin = gvcUpdateBtn.textContent;
      gvcUpdateBtn.textContent = 'Güncelleniyor…';
      try{
        // 1) Her seçili Grup C dosyasını KALICI tek-slot arşive yaz ve state.files'a taşı.
        for(const tip of GRUP_C_DOSYA_TIPLERI){
          const f = state.filesC[tip];
          if(!f) continue;
          state.files[tip] = {name:f.name, headers:f.headers, data:f.data};
          await grupATekilDosyaKaydet(tip, f.data, f.headers, f.name);
        }
        state.filesC = {}; // seçim kuyruğunu temizle (artık kalıcı kaydedildi)
        updateGvcPanel();
        // 2) Raporu YENİDEN HESAPLA: çek/senet, ticari stok vb. veri girişi olduğundan müşteri
        //    kartlarındaki bilgiler ANINDA güncellensin. En son Kalemler arşivi kullanılır
        //    (grupATekilDosyalariHazirla bunu otomatik getirir), tekrar Kalemler istenmez.
        await raporuOlusturVeyaGuncelleAkisiniCalistir();
        gvcStatusMsg.textContent = '✓ Güncellendi — ' + fmtDate(new Date()) + '. Kartlar yeni verilerle yenilendi.';
        if(typeof closePanel === 'function') closePanel();
      }catch(err){
        console.error('Grup C güncelleme hatası:', err);
        gvcStatusMsg.textContent = 'Hata: ' + err.message;
      }finally{
        gvcUpdateBtn.textContent = oncekiMetin;
        gvcUpdateBtn.disabled = !bugunKalemlerVarMi() || GRUP_C_HAZIR_SAYISI()===0;
      }
    });
  }

  // Grup C panel görünümünü tazeler: seçili dosya adları, kalıcı arşivdeki son yüklenme tarihi,
  // buton kilidi. window'a asılır ki openPanel ve dışarıdan çağrılabilsin.
  window.updateGvcPanel = async function updateGvcPanel(){
    for(const tip of GRUP_C_DOSYA_TIPLERI){
      const row = panel.querySelector('.gvy-row[data-gvc-type="'+tip+'"]');
      if(!row) continue;
      const subEl = row.querySelector('[data-gvc-sub]');
      const arsivEl = row.querySelector('[data-gvc-arsivgun]');
      const removeBtn = row.querySelector('[data-gvc-removebtn]');
      const secili = state.filesC && state.filesC[tip];
      if(secili){
        if(subEl) subEl.textContent = secili.name + ' (' + (secili.data?secili.data.length:0) + ' satır) — kaydedilmedi';
        if(removeBtn) removeBtn.style.display = 'inline-flex';
      }else{
        if(subEl) subEl.textContent = 'Dosya seçilmedi';
        if(removeBtn) removeBtn.style.display = 'none';
      }
      // Kalıcı arşivdeki son yüklenme tarihi (kaydedilmiş hali).
      if(arsivEl){
        try{
          const kayit = await grupATekilDosyaYerelOku(tip);
          arsivEl.textContent = (kayit && kayit.tarih)
            ? 'Son kayıt: ' + new Date(kayit.tarih).toLocaleDateString('tr-TR') + ' ' + new Date(kayit.tarih).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})
            : '';
        }catch(_){ arsivEl.textContent=''; }
      }
    }
    if(gvcUpdateBtn) gvcUpdateBtn.disabled = !bugunKalemlerVarMi() || GRUP_C_HAZIR_SAYISI()===0;
  };

  updateGvyPanel();
  updateGvcPanel();
  gvyLastSyncGuncelle();
})();

async function resetAll(){
  state.files = {kalemler:null, siparis:null, tahsilat:null, cekSenet:null, ticariStok:null, fatura:null, bayiHakedis:null, yukleme:null, musteriMaster:null, ciroPrimi:null, donemselIskonto:null, sellOut:null, depozitoTahsilat:null, cariEkstre:null};
  state.filesC = {}; // Grup C seçim kuyruğu da sıfırlanır
  state.report = null;
  state.expanded.clear();
  state.yuklemeReport = null;
  state.yuklemeSeciliGun = null;
  state.bayiHakedisReport = null;
  state.bayiHakedisHata = null;
  state.sellOutReport = null;
  await clearStoredReport();
  const ICON_NUMS = {kalemler:'', siparis:'', tahsilat:'', cekSenet:'', ticariStok:'', fatura:'', bayiHakedis:'', yukleme:'', musteriMaster:'', ciroPrimi:'', donemselIskonto:'', sellOut:'', depozitoTahsilat:''};
  document.querySelectorAll('.check-item').forEach(el=>{
    el.classList.remove('done');
    el.querySelector('.check-icon').textContent = ICON_NUMS[el.getAttribute('data-type')] || '';
    el.querySelector('.check-meta').textContent='';
  });
  buildBtn.disabled = true;
  buildBtn.textContent = 'Raporu Oluştur';
  statusPillMsg.textContent = 'Veri bekleniyor';
  statusPill.classList.remove('ok');
  document.getElementById('uploadCard').style.display='block';
  document.getElementById('reportSection').style.display='none';
  document.body.classList.remove('has-sidebar');
  document.getElementById('storageNote').style.display='none';
  resetBtn.style.display='none';
  syncBtn.style.display='none';
  fileInput.value = '';
  if(typeof updateGvyPanel === 'function') updateGvyPanel();
  document.getElementById('vadeMinInput').value = '';
  document.getElementById('vadeMaxInput').value = '';
  document.getElementById('sevkVadeMinInput').value = '';
  document.getElementById('sevkVadeMaxInput').value = '';
  document.querySelectorAll('.tab-btn').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  document.querySelectorAll('.sb-nav-link').forEach(b=> b.classList.remove('active'));
  const genelBakisTab = document.getElementById('sbbtn-genelBakis');
  if(genelBakisTab) genelBakisTab.classList.add('active');
  document.getElementById('genelBakisView').style.display='block';
  document.getElementById('genelView').style.display='none';
  document.getElementById('sevkView').style.display='none';
  document.getElementById('yuklemeView').style.display='none';
  document.getElementById('yaslandirmaView').style.display='none';
  document.getElementById('ticariStokView').style.display='none';
  document.getElementById('faturaKontrolView').style.display='none';
  document.getElementById('bayiHakedisView').style.display='none';
  document.getElementById('sellOutView').style.display='none';
  document.getElementById('tahsilatVerimlilikView').style.display='none';
  document.getElementById('dsoTrendView').style.display='none';
  document.getElementById('nakitAkisView').style.display='none';
  document.getElementById('supheliAlacakView').style.display='none';
  document.getElementById('temsilciKarnesiView').style.display='none';
  document.getElementById('yonetimOzetiView').style.display='none';
  document.getElementById('ceiView').style.display='none';
}
// "Yeni veri yükle" (resetBtn) için kilit kontrolü: bugün Kalemler zaten yüklenmişse (state.files.kalemler
// bellekte doluysa VEYA bugunKalemlerDurumTazele() ile belirlenen state.bugunKalemlerHazir true ise) ana
// yükleme ekranına geçiş engellenir, sadece bilgilendirici bir uyarı modalı gösterilir. Bu, Kalemler'in
// gün içinde yanlışlıkla ikinci kez yüklenip müşteri kartlarının sıfırdan kurulmasını (ve yeni dosyada
// olmayan müşterilerin kartlarının kaybolmasını) önlemek içindir — bkz. buildReport() ve GRUP_A_TEKIL_DOSYA_TANIMLARI.kalemler.
/* ÖLÜ KOD TEMİZLİĞİ: "Kalemler günde 1 kez" kilidi tamamen kaldırılmıştı (bkz. resetBtn'deki
   not) — modalı açan tek çağrı (kalemlerKilitModalAc) ile birlikte kapatma/geri sayım zinciri
   (kalemlerKilitModalKapat, GeriSayimGuncelle/Baslat/Durdur) ve modal DOM'u da kaldırıldı. */
// ===================== ARŞİV VERİSİ: TARİH ARALIKLI SİLME (GENEL) =====================
// Sipariş/Tahsilat/Fatura/Depozito Tahsilat/Bayi Hak Ediş/Yükleme Raporu arşiv satırlarındaki
// çöp kutusu ikonlarının hepsi bu tek modalı ve tek genel silme fonksiyonunu kullanır. Kullanıcı
// "Tek bir gün / Belirli bir ay / Tarih aralığı / Bugünden önceki tüm kayıtlar" seçeneklerinden
// birini seçip [baslangicKey, bitisKey] (dahil-dahil, YYYY-MM-DD) aralığını belirler; silme bu
// aralıktaki günlerin SADECE ilgili tipe ait alanını temizler, diğer tiplere dokunmaz.
//
// Veri yapısı özeti (state.faturaArsivCache[gunKey] = {...}):
//   siparis      -> gun.siparisArsiv (dizi)
//   tahsilat     -> gun.tahsilatArsiv (dizi) — formatKaynagi 'DepozitoTahsilat'/'FaturaIade' OLMAYAN satırlar
//   fatura       -> gun.faturaArsiv (dizi)
//   bayiHakedis  -> gun.bayiHakedisArsiv (dizi)
//   depozitoTahsilat -> gun.tahsilatArsiv İÇİNDEKİ formatKaynagi==='DepozitoTahsilat' satırları
//                       (bkz. tahsilatKredisiGunlereEkleVeDegistir) — ayrı bir alan DEĞİL.
//   yukleme      -> state.yuklemeArsivCache[gunKey] (AYRI bir arşiv, faturaArsivCache'te değil)
const ARSIV_SIL_TIP_ETIKET = {
  siparis:'Sipariş Dökümü', tahsilat:'Tahsilat Dökümü', fatura:'Fatura Dökümü',
  depozitoTahsilat:'Depozito Tahsilat', bayiHakedis:'Bayi Hak Ediş', yukleme:'Yükleme Raporu',
};
async function arsivTarihAraligindaSil(tip, baslangicKey, bitisKey){
  if(tip === 'yukleme'){
    let arsiv = null;
    if(cloudEnabled()) arsiv = await loadYuklemeArsivFromCloud();
    if(!arsiv) arsiv = await loadYuklemeArsivFromLocal();
    arsiv = arsiv || {};
    const yeniArsiv = Object.assign({}, arsiv);
    let etkilenenGunSayisi = 0;
    Object.keys(yeniArsiv).forEach(gunKey=>{
      if(gunKey < baslangicKey || gunKey > bitisKey) return;
      delete yeniArsiv[gunKey];
      etkilenenGunSayisi++;
    });
    if(!etkilenenGunSayisi) return {temizlenenGunSayisi: 0};
    state.yuklemeArsivCache = yeniArsiv;
    await saveYuklemeArsivToLocal(yeniArsiv);
    if(cloudEnabled()) await saveYuklemeArsivToCloud(yeniArsiv);
    return {temizlenenGunSayisi: etkilenenGunSayisi};
  }

  await faturaArsivYenile();
  const eskiArsivTumu = state.faturaArsivCache || {};
  const yeniArsivTumu = Object.assign({}, eskiArsivTumu);
  let etkilenenGunSayisi = 0;

  Object.keys(yeniArsivTumu).forEach(gunKey=>{
    if(gunKey < baslangicKey || gunKey > bitisKey) return;
    const gun = yeniArsivTumu[gunKey];
    if(!gun) return;

    if(tip === 'depozitoTahsilat'){
      const eski = gun.tahsilatArsiv || [];
      const kalan = eski.filter(r=> !(r && r.formatKaynagi === 'DepozitoTahsilat'));
      if(kalan.length !== eski.length){
        yeniArsivTumu[gunKey] = Object.assign({}, gun, {tahsilatArsiv: kalan});
        etkilenenGunSayisi++;
      }
      return;
    }

    const alan = {siparis:'siparisArsiv', tahsilat:'tahsilatArsiv', fatura:'faturaArsiv', bayiHakedis:'bayiHakedisArsiv'}[tip];
    if(!alan) return;
    if(tip === 'tahsilat'){
      // Tahsilat Dökümü sadece "gerçek" tahsilat satırlarını kapsar; Depozito Tahsilat/Bozuk İade
      // Faturası etiketli satırlar bu tipin silme kapsamına dahil edilmez (kendi butonları vardır) —
      // bu yüzden SADECE o iki etiketli satırlar korunur (kalan), etiketsiz/normal tahsilat satırları silinir.
      const eski = gun.tahsilatArsiv || [];
      const kalan = eski.filter(r=> r && (r.formatKaynagi === 'DepozitoTahsilat' || r.formatKaynagi === 'FaturaIade'));
      if(kalan.length !== eski.length){
        yeniArsivTumu[gunKey] = Object.assign({}, gun, {tahsilatArsiv: kalan});
        etkilenenGunSayisi++;
      }
      return;
    }
    if(Array.isArray(gun[alan]) && gun[alan].length){
      yeniArsivTumu[gunKey] = Object.assign({}, gun, {[alan]: []});
      etkilenenGunSayisi++;
    }
  });

  if(!etkilenenGunSayisi) return {temizlenenGunSayisi: 0};
  state.faturaArsivCache = yeniArsivTumu;
  await saveFaturaKontrolArsivToLocal(state.faturaArsivCache).catch(()=>{});
  let bulutHatasi = false;
  if(cloudEnabled()){
    const fark = faturaKontrolArsivGunFarkiniBul(eskiArsivTumu, yeniArsivTumu);
    try{ await saveFaturaKontrolArsivGunleriToCloud(fark); }
    catch(err){
      console.error(ARSIV_SIL_TIP_ETIKET[tip]+' arşiv silme buluta yazılamadı:', err);
      // TUTARLILIK DÜZELTMESİ: hata yutulup başarı döndürülüyordu — kullanıcı "silindi" mesajı
      // görüyor ama bulut kopyası duruyor, bir sonraki buluttan tazelemede kayıtlar GERİ GELİYORDU.
      // Artık çağıran tarafın uyarı gösterebilmesi için bayrakla bildirilir.
      bulutHatasi = true;
    }
  }
  return {temizlenenGunSayisi: etkilenenGunSayisi, bulutHatasi};
}

(function(){
  const overlay = document.getElementById('arsivSilModalOverlay');
  const closeBtn = document.getElementById('arsivSilModalClose');
  const iptalBtn = document.getElementById('arsivSilIptalBtn');
  const onayBtn = document.getElementById('arsivSilOnayBtn');
  const subEl = document.getElementById('arsivSilModalSub');
  const hataEl = document.getElementById('arsivSilHata');
  const kapsamGrup = document.getElementById('arsivSilKapsamGrup');
  const alanGun = document.getElementById('arsivSilAlanGun');
  const alanAy = document.getElementById('arsivSilAlanAy');
  const alanAralik = document.getElementById('arsivSilAlanAralik');
  const alanHepsi = document.getElementById('arsivSilAlanHepsi');
  const gunInput = document.getElementById('arsivSilGunInput');
  const ayInput = document.getElementById('arsivSilAyInput');
  const baslangicInput = document.getElementById('arsivSilBaslangicInput');
  const bitisInput = document.getElementById('arsivSilBitisInput');
  if(!overlay || !kapsamGrup) return;

  let aktifTip = null;

  function kapsamiGuncelle(){
    const secili = kapsamGrup.querySelector('input[name="arsivSilKapsam"]:checked');
    const deger = secili ? secili.value : 'gun';
    alanGun.style.display = deger==='gun' ? 'flex' : 'none';
    alanAy.style.display = deger==='ay' ? 'flex' : 'none';
    alanAralik.style.display = deger==='aralik' ? 'flex' : 'none';
    alanHepsi.style.display = deger==='hepsi' ? 'block' : 'none';
    hataEl.textContent = '';
  }
  kapsamGrup.querySelectorAll('input[name="arsivSilKapsam"]').forEach(r=> r.addEventListener('change', kapsamiGuncelle));

  function ac(tip){
    aktifTip = tip;
    const etiket = ARSIV_SIL_TIP_ETIKET[tip] || tip;
    subEl.textContent = etiket + ' arşiv kayıtlarını silmek için tarih seçin';
    hataEl.textContent = '';
    const bugun = dateKeyLocal(new Date());
    gunInput.value = ''; gunInput.max = bugun;
    ayInput.value = ''; ayInput.max = bugun.slice(0,7);
    baslangicInput.value = ''; baslangicInput.max = bugun;
    bitisInput.value = ''; bitisInput.max = bugun;
    kapsamGrup.querySelector('input[name="arsivSilKapsam"][value="gun"]').checked = true;
    kapsamiGuncelle();
    overlay.classList.add('open');
  }
  function kapat(){ overlay.classList.remove('open'); aktifTip = null; }

  document.querySelectorAll('[data-gvy-arsivsilbtn]').forEach(btn=>{
    btn.addEventListener('click', ()=> ac(btn.getAttribute('data-gvy-arsivsilbtn')));
  });
  if(closeBtn) closeBtn.addEventListener('click', kapat);
  if(iptalBtn) iptalBtn.addEventListener('click', kapat);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) kapat(); });

  onayBtn.addEventListener('click', async ()=>{
    if(!aktifTip) return;
    const secili = kapsamGrup.querySelector('input[name="arsivSilKapsam"]:checked');
    const deger = secili ? secili.value : 'gun';
    const bugunKey = dateKeyLocal(new Date());
    let baslangicKey, bitisKey, aciklama;

    if(deger === 'gun'){
      if(!gunInput.value){ hataEl.textContent = 'Lütfen bir tarih seçin.'; return; }
      baslangicKey = bitisKey = gunInput.value;
      aciklama = new Date(gunInput.value+'T00:00:00').toLocaleDateString('tr-TR');
    }else if(deger === 'ay'){
      if(!ayInput.value){ hataEl.textContent = 'Lütfen bir ay seçin.'; return; }
      baslangicKey = ayInput.value + '-01';
      const [yy, mm] = ayInput.value.split('-').map(Number);
      const ayinSonGunu = new Date(yy, mm, 0).getDate();
      bitisKey = ayInput.value + '-' + String(ayinSonGunu).padStart(2,'0');
      aciklama = ayInput.value + ' ayı';
    }else if(deger === 'aralik'){
      if(!baslangicInput.value || !bitisInput.value){ hataEl.textContent = 'Lütfen başlangıç ve bitiş tarihlerini seçin.'; return; }
      if(baslangicInput.value > bitisInput.value){ hataEl.textContent = 'Başlangıç tarihi bitiş tarihinden sonra olamaz.'; return; }
      baslangicKey = baslangicInput.value; bitisKey = bitisInput.value;
      aciklama = new Date(baslangicKey+'T00:00:00').toLocaleDateString('tr-TR') + ' – ' + new Date(bitisKey+'T00:00:00').toLocaleDateString('tr-TR');
    }else{ // hepsi
      baslangicKey = '0000-00-00';
      bitisKey = bugunKey; // bugün dahil değil; aşağıda '<' ile hariç tutulur
      aciklama = 'bugünden önceki tüm kayıtlar';
    }
    if(deger !== 'hepsi' && bitisKey > bugunKey){ hataEl.textContent = 'Bugünden sonraki bir tarih seçilemez.'; return; }

    if(!(await ortakSifreDogrula((ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip)+' arşiv kayıtlarını silmek için şifreyi girin:'))) return;
    const onayMesaji = deger==='hepsi'
      ? 'Bugünden önceki TÜM '+(ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip)+' arşiv kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?'
      : (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip)+' için '+aciklama+' tarih(ler)ine ait arşiv kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?';
    if(!window.confirm(onayMesaji)) return;

    const oncekiMetin = onayBtn.innerHTML;
    onayBtn.disabled = true;
    onayBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
    try{
      // "hepsi" durumunda bugünkü kayıt korunmalı: bitisKey'i bugünden bir gün öncesine çekiyoruz.
      let etkinBitis = bitisKey;
      if(deger === 'hepsi'){
        const d = new Date(bugunKey+'T00:00:00'); d.setDate(d.getDate()-1);
        etkinBitis = dateKeyLocal(d);
      }
      const sonuc = await arsivTarihAraligindaSil(aktifTip, baslangicKey, etkinBitis);
      if(document.getElementById('faturaKontrolArsivBilgi')) await renderFaturaKontrolArsivBilgi();
      if(typeof updateGvyPanel === 'function') updateGvyPanel();
      if(sonuc.bulutHatasi){
        // Kritik: silme buluta yazılamadı — kullanıcının kaçırmaması için bloke edici alert kalır.
        window.alert(
          (sonuc.temizlenenGunSayisi
            ? sonuc.temizlenenGunSayisi + ' günün ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı silindi.'
            : 'Seçilen tarih aralığında silinecek ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı bulunamadı.')
          + '\n\nUYARI: Silme BULUTA yazılamadı — kayıtlar yalnızca bu cihazdan silindi ve bir sonraki bulut güncellemesinde geri gelebilir. Bağlantınızı kontrol edip işlemi tekrarlayın.'
        );
      } else if(sonuc.temizlenenGunSayisi){
        toastGoster('success', 'Arşiv kayıtları silindi', sonuc.temizlenenGunSayisi + ' günün ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı kaldırıldı.');
      } else {
        toastGoster('warn', 'Silinecek kayıt bulunamadı', 'Seçilen tarih aralığında ' + (ARSIV_SIL_TIP_ETIKET[aktifTip]||aktifTip) + ' kaydı yok.');
      }
      kapat();
    }catch(err){
      console.error(err);
      hataEl.textContent = 'Silme sırasında bir hata oluştu, lütfen tekrar deneyin.';
    }finally{
      onayBtn.disabled = false;
      onayBtn.innerHTML = oncekiMetin;
    }
  });
})();

resetBtn.addEventListener('click', async ()=>{
  // NOT: "Günde sadece 1 Kalemler" kilidi KALDIRILDI. Grup B artık kalıcı arşivlendiği için
  // (siparis/tahsilat/fatura/... tek-slot'ta saklanıyor), gün içinde birden çok kez Kalemler
  // yüklenebilir — her yeni Kalemler öncekinin ÜZERİNE yazılır ve kartlar yeniden şekillenir.
  // Veri kaybı riski olmadığından kilit modalı artık tetiklenmez.
  if(!(await ortakSifreDogrula('Yeni veri yüklemek için şifreyi girin:'))) return;
  await resetAll();
});

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && state.report){
    const eskiFark = state.report.canliGunFarki||0;
    canliGunlerleGuncelle(state.report);
    if(state.report.canliGunFarki !== eskiFark) renderReport(state.report);
  }
});

let uygulamaBaslatildiMi = false;
async function uygulamayiBaslat(){
  if(uygulamaBaslatildiMi) return;
  uygulamaBaslatildiMi = true;

  let report = null, source = null;

  // ÖNEMLİ PERFORMANS DÜZELTMESİ: Bu 9 veri türü (Müşteri Master, Bayi Hakediş, Sell Out
  // Hedef/Rapor/Arşiv, Modern Kanal Hedef/Rapor/Arşiv, Malzemeler Stok) birbirinden TAMAMEN
  // bağımsız — hiçbiri diğerinin sonucunu okumuyor, her biri kendi state.xxx alanına yazıyor.
  // Önceden sırayla (await ... await ... await ...) çalıştırılıyordu; her biri kendi ağ
  // gecikmesini (meta zaman damgası kontrolü + gerekirse indirme) BEKLETEREK topluyor, veri hiç
  // değişmemiş olsa bile 9 ayrı gecikme üst üste binip açılışı yavaşlatıyordu. Promise.all ile
  // hepsi AYNI ANDA başlatılıyor — toplam süre artık en YAVAŞ tekil isteğe eşit, 9'unun
  // TOPLAMINA değil.
  // GÜVENLİK AĞI (açılış donmasın): Bu 9 yardımcı veri isteği tek tek zaman aşımıyla sarılır —
  // biri (ör. ağ/token sorunu) takılırsa 18 sn sonra o istek "yedek (null)" ile çözülür ve açılış
  // devam eder. Böylece tek bir asılı kalan bulut isteği tüm uygulamayı sonsuza kadar bekletmez.
  // Bu isteklerin her biri zaten kendi state alanına yazıyor; başarısız/geç kalan biri sadece o
  // veri türünün bu açılışta cihazdaki son haliyle kalmasına yol açar (bir sonraki açılışta düzelir).
  const ACILIS_ISTEK_TIMEOUT_MS = 18000;
  await Promise.all([
    musteriMasterYenile(),
    bayiHakedisYenile(),
    sellOutHedefYenile(),
    sellOutYenile(),
    sellOutArsivYenile(),
    modernKanalHedefYenile(),
    modernKanalYenile(),
    modernKanalArsivYenile(),
    malzemelerStokYenile(),
    loadSenetTahsilOnaylariFromLocal(),
  ].map(p=> zamanAsimliYaris(p, ACILIS_ISTEK_TIMEOUT_MS, null)));
  if(cloudEnabled()){
    statusPillMsg.textContent = 'Bulut verisi kontrol ediliyor…';
    // Skeleton: bulut kontrolü sürerken kullanıcı boş bir kartla değil, gelecek içeriğin
    // silüetiyle karşılansın (bekleme algısını kısaltır, "dondu mu?" hissini önler).
    const acilisSk = document.getElementById('acilisSkeleton');
    if(acilisSk) acilisSk.style.display = 'block';
    // Uygulama otomatik açılışında, buluttaki küçük zaman damgası cihazdakiyle aynıysa büyük
    // rapor verisi hiç indirilmez — cihazdaki (IndexedDB) kopya doğrudan kullanılır. Kullanıcı
    // "Diğer Cihazdan Güncelle" butonuna BİLEREK bastığında (yukarıdaki syncBtn handler'ı) bu
    // optimizasyon uygulanmaz, orada her zaman zorla tam indirme yapılır.
    // Güvenlik ağı: ana rapor yüklemesi de takılırsa (25 sn) açılış donmasın — yedek olarak
    // cihazdaki (IndexedDB) kopyayı dener, o da yoksa boş sonuçla devam eder.
    const yukleSonuc = await zamanAsimliYaris(
      cloudVeriVerimliYukle(CLOUD.path, loadReportFromCloud, loadReportFromStorage),
      25000,
      null
    ) || { data: (await loadReportFromStorage().catch(()=>null)), source: 'local' };
    const cloudReport = yukleSonuc.data;
    if(cloudReport && cloudReport.musteriler && cloudReport.musteriler.length){
      report = cloudReport;
      // ÖNEMLİ: source, veri gerçekte NEREDEN geldiğine göre atanır — yukleSonuc.source
      // 'local-uptodate' ise (bulut zaten değişmemiş, cihazdaki kopya kullanıldıysa) source da
      // 'local' olmalı; aksi halde alttaki "Bu rapor buluttan alındı" göstergesi, veri aslında
      // cihazdan geldiği halde yanlışlıkla buluttan gelmiş gibi gösterirdi.
      source = (yukleSonuc.source==='cloud') ? 'cloud' : 'local';
      if(yukleSonuc.source==='cloud') await saveReportToStorage(cloudReport);
    }
    // Arşivin TAMAMI değil, cihazdaki (IndexedDB) son bilinen hali + buluttaki farkı (delta)
    // yükleniyor — bu, uygulama her açıldığında/yenilendiğinde tekrar tekrar tam indirme
    // yapılmasını önler; ilk kurulumdan sonra pratikte yalnızca yeni eklenen gün(ler) iner.
    // Fatura arşivi yüklemesi de açılışı bloke etmesin (takılırsa 20 sn sonra devam).
    await zamanAsimliYaris(faturaArsivBaslangicYukle(), 20000, null);
  }
  // Skeleton her durumda kapatılır — rapor geldiyse zaten reportSection açılacak; gelmediyse
  // kullanıcı normal yükleme kartını (dropzone) temiz görmeli.
  { const acilisSk = document.getElementById('acilisSkeleton'); if(acilisSk) acilisSk.style.display = 'none'; }

  if(!report){
    const saved = await loadReportFromStorage();
    if(saved && saved.musteriler && saved.musteriler.length){
      report = saved; source = 'local';
    }
  }

  if(report){
    raporuNormalizeEt(report); // eksik alanları güvenli varsayılanlarla doldur (eski/bozuk raporlara dayanıklılık)
    state.report = report;
    canliGunlerleGuncelle(report);
    renderReport(report);
    document.getElementById('uploadCard').style.display='none';
    document.getElementById('reportSection').style.display='block';
    document.body.classList.add('has-sidebar');
    resetBtn.style.display='inline-block';
    // resetBtn'in "bugün Kalemler yüklendi mi?" kilidi doğru karar verebilsin diye, uygulama
    // açılışında da state.bugunKalemlerHazir tazelenir (aksi halde ilk açılışta bu bayrak
    // henüz hiç hesaplanmamış/false kalabilir ve kilit yanlışlıkla devre dışı görünebilir).
    try{ if(typeof bugunKalemlerDurumTazele === 'function') await bugunKalemlerDurumTazele(); }catch(_){}
    document.getElementById('storageNote').style.display='block';
    if(cloudEnabled()){
      syncBtn.style.display='inline-block';
      // Cihaz depolama kapalı (kullanıcı isteği) — source artık pratikte hep 'cloud' olur (ya da
      // rapor hiç yoktur); 'local' dalı yalnızca eski bir kod yolunda teorik olarak kalmıştır.
      document.getElementById('storageNoteMsg').textContent = source==='cloud'
        ? 'Bu rapor buluttan alındı; tüm cihazlarda ortak görünür ve otomatik olarak güncel tutulur.'
        : 'UYARI: Bu rapor buluttan alınamadı ve cihaz depolama kapalı olduğu için güncel olmayabilir.';
    }
    statusPillMsg.textContent = (source==='cloud' ? 'Buluttan güncel rapor açıldı (' : 'UYARI: Rapor buluttan alınamadı (') + fmtDate(report.asOf) + ')';
    statusPill.classList.add('ok');
  }else if(cloudEnabled()){
    statusPillMsg.textContent = 'Veri bekleniyor';
  }
  // Açılıştaki bilinen "son değişiklik zamanı" ile otomatik arka plan senkronizasyonuna başla —
  // bkz. otomatikBulutSenkronizasyonuBaslat() tanımı ve açıklaması.
  if(cloudEnabled()) otomatikBulutSenkronizasyonuBaslat();
}
window.addEventListener('DOMContentLoaded', async ()=>{
  if(!authAktif) await uygulamayiBaslat();
});

// ================= OTOMATİK ARKA PLAN SENKRONİZASYONU (kullanıcı isteği) =================
// "En ufak bir veri değişikliğinde diğer cihazlardan güncelle fonksiyonu otomatik devreye girsin"
// — cihaz depolama tamamen kapalı olduğundan (bkz. idbGet/idbSet no-op), her cihaz artık YALNIZCA
// kendi belleğindeki state.report'a güveniyor; başka bir cihaz/tarayıcı bulutta değişiklik
// yaptığında bu cihaz sayfa manuel yenilenmeden veya "Diğer Cihazdan Güncelle"ye elle basılmadan
// bunu ASLA öğrenmiyordu. Aşağıdaki mekanizma bunu otomatikleştirir:
//   1) Periyodik olarak (POLL_ARALIK_MS) SADECE küçük "_meta/{path}" zaman damgasını okur (ana
//      raporun TAMAMINI değil — bkz. cloudMetaOkuUzaktan, hafif bir istektir).
//   2) Zaman damgası son bilinenden farklıysa, o zaman GERÇEK (büyük) raporu indirir ve ekranı
//      sessizce (şifre sormadan, kullanıcıyı kesmeden) günceller.
//   3) Sekme arka plana alınıp tekrar öne geldiğinde (visibilitychange) de aynı kontrol hemen
//      tetiklenir — kullanıcı sekmeye döndüğü an en güncel veriyi görsün diye.
// Not: Fatura/Arşiv verisi (state.faturaArsivCache) bu döngüye DAHİL EDİLMEMİŞTİR — o veri seti
// çok daha büyük olduğundan her polling turunda indirmek gereksiz ağ trafiği yaratır; çek/senet
// onayı zaten güncellenmiş ANA RAPOR üzerinden karta yansır (cekSenetDetay orada tutuluyor), bu
// yüzden bu mekanizma kullanıcının bildirdiği sorunu (kart diğer cihazda güncellenmiyor) çözmek
// için yeterlidir. Arşiv/Trend Analizi ekranları hâlâ "Diğer Cihazdan Güncelle" ile tazelenir.
const OTOMATIK_SENKRON_POLL_ARALIK_MS = 20000; // 20 saniyede bir hafif kontrol
let otomatikSenkronBilinenZaman = null; // en son görülen _meta/{CLOUD.path}.updatedAt değeri
let otomatikSenkronTimerId = null;
let otomatikSenkronCalisiyorMu = false; // aynı anda iki kontrolün üst üste binmesini önler
async function otomatikBulutSenkronizasyonuKontrolEt(){
  // MOBİL PİL/VERİ TASARRUFU: sekme arka plandayken 20 sn'de bir meta isteği atmanın anlamı yok —
  // kullanıcı zaten ekranı görmüyor ve sekme öne geldiğinde visibilitychange dinleyicisi
  // (otomatikBulutSenkronizasyonuBaslat içinde) kontrolü ANINDA tetikliyor. Bu satır, saha
  // cihazlarında arka planda boşa giden ağ isteklerini keser; güncellik kaybı olmaz.
  if(document.visibilityState === 'hidden') return;
  if(!cloudEnabled() || otomatikSenkronCalisiyorMu) return;
  otomatikSenkronCalisiyorMu = true;
  try{
    const uzakMeta = await cloudMetaOkuUzaktan(CLOUD.path);
    const uzakZaman = uzakMeta ? uzakMeta.updatedAt : null;
    if(uzakZaman == null) return; // buluttan meta okunamadıysa (ağ hatası vb.) sessizce vazgeç, bir sonraki turda tekrar denenir
    if(otomatikSenkronBilinenZaman !== null && uzakZaman === otomatikSenkronBilinenZaman) return; // değişiklik yok
    const yeniRapor = await loadReportFromCloud();
    if(yeniRapor && yeniRapor.musteriler && yeniRapor.musteriler.length){
      raporuNormalizeEt(yeniRapor);
      state.report = yeniRapor;
      canliGunlerleGuncelle(yeniRapor);
      renderReport(yeniRapor);
      statusPillMsg.textContent = 'Bulutta değişiklik algılandı, otomatik güncellendi (' + fmtDate(yeniRapor.asOf) + ')';
      statusPill.classList.add('ok');
      otomatikSenkronBilinenZaman = uzakZaman;
    }else if(yeniRapor !== null){
      // Rapor indirildi ama uygulanacak müşteri verisi yok (bulut bilinçli boşaltılmış olabilir) —
      // zaman damgasını yine de işaretle ki her 20 sn'de boş veri tekrar tekrar indirilmesin.
      otomatikSenkronBilinenZaman = uzakZaman;
    }
    // SENKRON HATASI DÜZELTMESİ: yeniRapor === null ise indirme BAŞARISIZ olmuştur
    // (loadReportFromCloud ağ hatasını içeride yutup null döndürür). Önceden zaman damgası yine de
    // "biliniyor" işaretleniyordu — sonraki polling turları "değişiklik yok" sanıyor ve buluttaki
    // güncelleme KALICI olarak kaçıyordu. Artık damga güncellenmez; bir sonraki turda tekrar denenir.
  }catch(err){
    console.error('Otomatik bulut senkronizasyonu kontrolü başarısız:', err);
  }finally{
    otomatikSenkronCalisiyorMu = false;
  }
}
function otomatikBulutSenkronizasyonuBaslat(){
  if(otomatikSenkronTimerId) return; // zaten çalışıyor
  // İlk turda "değişiklik var mı" karşılaştırması yapmadan, o anki zaman damgasını sessizce
  // biliniyor olarak işaretler (açılışta zaten en güncel rapor yüklendi, tekrar indirmeye gerek yok).
  cloudMetaOkuUzaktan(CLOUD.path).then(meta=>{ if(meta) otomatikSenkronBilinenZaman = meta.updatedAt; });
  otomatikSenkronTimerId = setInterval(otomatikBulutSenkronizasyonuKontrolEt, OTOMATIK_SENKRON_POLL_ARALIK_MS);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible') otomatikBulutSenkronizasyonuKontrolEt();
  });
}

function buildReport(files, musteriMasterMap){
  musteriMasterMap = musteriMasterMap || new Map();
  const today = turkiyeBugun();

  const invoices = [];
  const musteriMap = new Map();

  files.kalemler.data.forEach(r=>{
    const musteri = String(r['Müşteri']||'').trim();
    if(!musteri) return;
    const kalanBorc = Number(r['Kalan Borç'])||0;
    if(Math.abs(kalanBorc) < 30) return;
    const musteriAdi = r['Müşteri Adı'] || musteri;
    const faturaTarihi = excelDateToJS(r['Fatura Tarihi']);
    const netVade = excelDateToJS(r['Net vade tarihi']);
    const gunFatura = r['Faturadan Sonr.Gün']!=null ? Number(r['Faturadan Sonr.Gün']) : (faturaTarihi ? Math.round((today-faturaTarihi)/86400000) : null);
    const gunVade = r["Vade'den sonraki gün"]!=null ? Number(r["Vade'den sonraki gün"]) : (netVade ? Math.round((today-netVade)/86400000) : gunFatura);
    const inv = {
      musteri, musteriAdi, belgeNo:r['Belge numarası'], belgeTuru:r['Belge Türü Tanımı'],
      tutar:Number(r['Tutar'])||0, kalanBorc, faturaTarihi, netVade,
      gunFatura, gunVade, gunFaturaHam:gunFatura, gunVadeHam:gunVade,
    };
    invoices.push(inv);
    if(!musteriMap.has(musteri)){
      musteriMap.set(musteri, {musteri, musteriAdi, kalanBorc:0, faturaSayisi:0, vadeAgirlikliToplam:0, agirlikBorc:0, avgVadeGun:0, invoices:[], temsilci:null,
        siparisTutari:0, emanetSiparis:0, cekSenet:0, alinanTahsilat:0, cekSenetDetay:[]});
    }
    const m = musteriMap.get(musteri);
    m.faturaSayisi += 1;
    if(!m.temsilciFromKalemler && r['Satış Temsilcisi Adı']) m.temsilciFromKalemler = r['Satış Temsilcisi Adı'];
    m.invoices.push(inv);
  });

  const siparisNormalMap = new Map();
  const emanetSiparisMap = new Map();
  const siparisMusterileri = new Map();
  const siparisArsiv = [];

  if(files.siparis){
    // Fatura No dolu olan satırlarda, AYNI GÜNE (İstenilen Tsl. Trh.) ait tekrar eden Fatura No'lar
    // mükerrer kayıt sayılır — sadece ilk görülen satır alınır, diğerleri (aynı fatura no + aynı gün)
    // yok sayılır. Fatura No boşsa bu kural hiç uygulanmaz. Aynı Fatura No farklı bir güne ait ise
    // (İstenilen Tsl. Trh. farklıysa) mükerrer sayılmaz, ikisi de ayrı ayrı işlenir.
    const gorulenFaturaNoGun = new Set();
    const siparisSatirlari = files.siparis.data.filter(r=>{
      const faturaNo = String(r['Fatura No']||'').trim();
      if(!faturaNo) return true;
      const t = excelDateToJSArti1Gun(r['İstenilen Tsl. Trh.']);
      const gunKey = t ? dateKeyLocal(t) : '';
      const anahtar = faturaNo + '|' + gunKey;
      if(gorulenFaturaNoGun.has(anahtar)) return false;
      gorulenFaturaNoGun.add(anahtar);
      return true;
    });

    // Sevk Raporu/Genel Rapor ekranındaki "Açık Sipariş"/"Sevki Ertelenen" KPI'ları artık dosyadaki
    // "en güncel gün" e göre DEĞİL, tarayıcının Türkiye yerel (bugünkü) tarihine GÜN OLARAK EN
    // YAKIN olan güne göre gösterilir (Tahsilat'taki aynı kuralla birebir aynı mantık — bkz.
    // enYakinGunKey). Yükleme Raporu yüklenmişse, o dosyadaki tüm Yükleme Tarihi günleri arasından
    // bugüne en yakın olan seçilir (artık bugünün BİREBİR aynı gün olması ŞART DEĞİL). Yükleme
    // Raporu hiç yüklenmemişse, dosyadaki İstenilen Tsl. Trh. günleri arasından bugüne en yakın
    // olan seçilir. Hiçbir tarihli veri yoksa hiçbir sipariş KPI'sı gösterilmez.
    const bugunGunKey = dateKeyLocal(today);
    let siparisGosterimGunKey = null;
    if(files.yukleme){
      const yuklemeGunleri = new Set();
      files.yukleme.data.forEach(r=>{
        const yt = excelDateToJSArti1Gun(r['Yükleme Tarihi']);
        const gk = yt ? dateKeyLocal(yt) : null;
        if(gk) yuklemeGunleri.add(gk);
      });
      siparisGosterimGunKey = enYakinGunKey(Array.from(yuklemeGunleri), bugunGunKey);
    }else{
      const siparisGunleri = new Set();
      siparisSatirlari.forEach(r=>{
        const t = excelDateToJSArti1Gun(r['İstenilen Tsl. Trh.']);
        const gk = t ? dateKeyLocal(t) : null;
        if(gk) siparisGunleri.add(gk);
      });
      siparisGosterimGunKey = enYakinGunKey(Array.from(siparisGunleri), bugunGunKey);
    }

    siparisSatirlari.forEach(r=>{
      const musteri = String(r['Müşteri No']||'').trim();
      if(!musteri) return;
      if(!musteriGecerliMi(musteri)) return;
      const musteriAdi = r['Müşteri Adı'] || musteri;
      const temsilci = r['Satış Temslicisi Adı'] || r['Satış Temsilcisi Adı'] || null;
      const belgeTuru = r['Satış Belge Türü Tnm.'];
      // "Reklam Malzeme Sip." (Satış Belge Türü Tnm.) olan satırlar hiçbir hesaplamaya dahil
      // edilmez ve arşive (siparisArsiv) hiç yazılmaz — bunlar gerçek bir müşteri siparişi değil,
      // reklam malzemesi sevkiyatı olduğu için Sipariş KPI'larını ve Fatura Kontrol arşivini
      // etkilememesi gerekir.
      if(belgeTuru === 'Reklam Malzeme Sip.') return;
      const redStatu = r['Red Statüsü Tnm.'];
      const teslimat = r['Teslimat Durumu'];
      const satisBelgeNo = String(r['Satış Belge No'] ?? r['Satış Belge No '] ?? '').trim() || null;
      const tutar = Number(r['Sipariş Toplam Tutar'])||0;
      const istenilenTeslimTarihi = excelDateToJSArti1Gun(r['İstenilen Tsl. Trh.']);

      const isEmanet = belgeTuru === 'Sevki Ertelenecek Sp' && redStatu === 'Aktif';
      const isNormalAcik = belgeTuru !== 'Sevki Ertelenecek Sp' && redStatu === 'Aktif' && teslimat !== 'Reddedildi';

      // Arşive (siparisArsiv) artık aktiflik durumundan BAĞIMSIZ olarak, teslim tarihi ve Satış
      // Belge No bilgisi olan HER satır aktarılır — Red/İptal/Teslim Edilemedi durumundaki satırlar
      // da dahil. Bu satırlar arşiv katmanında (bkz. siparisArsivGunlereDagitVeTemizle) o Satış
      // Belge No'ya ait TÜM kayıtları arşivden temizlemek için tetikleyici olarak kullanılır.
      if(istenilenTeslimTarihi && satisBelgeNo){
        siparisArsiv.push({musteri, musteriAdi, temsilci, tutar, istenilenTeslimTarihi, belgeTuru, teslimatDurumu: teslimat, satisBelgeNo});
      }

      if(!siparisMusterileri.has(musteri)) siparisMusterileri.set(musteri, {musteriAdi, temsilci});
      else if(temsilci && !siparisMusterileri.get(musteri).temsilci) siparisMusterileri.get(musteri).temsilci = temsilci;

      // Sevk Raporu/Genel Rapor KPI'ları (siparisNormalMap/emanetSiparisMap) sadece yukarıda
      // belirlenen tek "gösterim günü"ne ait siparişleri toplar.
      const gosterilecekGunMu = siparisGosterimGunKey && dateKeyLocal(istenilenTeslimTarihi) === siparisGosterimGunKey;
      if(!gosterilecekGunMu) return;

      if(isEmanet){
        emanetSiparisMap.set(musteri, (emanetSiparisMap.get(musteri)||0) + tutar);
      }else if(isNormalAcik){
        siparisNormalMap.set(musteri, (siparisNormalMap.get(musteri)||0) + tutar);
      }
    });
  }

  const tahsilatMap = new Map();
  const tahsilatArsiv = [];
  let tahsilatFormatB = false; // bu yüklemenin Format B (nihai rapor) olup olmadığı — Format A arşiv temizliği tetikleyicisi
  if(files.tahsilat){
    const tHeaders = new Set(files.tahsilat.headers);
    const formatA = tHeaders.has('Tutar') && tHeaders.has('Tahsilat Alan');
    tahsilatFormatB = !formatA;
    // Format A (Ön Kayıt dökümü) belge tarihini "Tarih" kolonunda taşır; Format B (nihai rapor) ise "Belge Tarihi" kolonunu kullanır.
    const tarihKolonu = formatA ? 'Tarih' : 'Belge Tarihi';

    files.tahsilat.data.forEach(r=>{
      const musteriArsiv = String((formatA ? r['Müşteri'] : r['Müşt. Kodu'])||'').trim();
      const tutarArsiv = Math.abs(Number(formatA ? r['Tutar'] : r['Belge Tutarı'])||0);
      if(musteriArsiv && musteriGecerliMi(musteriArsiv)){
        // TAHSİLAT TÜRÜ SINIFLANDIRMASI (kullanıcı isteği): "Ödeme Tipi" kolonuna göre dört kategori:
        //   Normal -> Nakit / Kredi Kartı / Banka havalesi (ve tanımadığımız diğer tipler, güvenli varsayılan)
        //   Cek    -> Alınan Çek   (OTOMATİK SAYILMAZ — kullanıcı manuel "Tahsil Edildi" onayı
        //   Senet  -> Alınan Senet  vermeden risk olarak kalır; bkz. state.cekSenetTahsilOnaylari / satır altı not)
        //   SanalPos -> Sanal Pos
        const odemeTipiHam = String(r['Ödeme Tipi']||'').trim();
        const odemeTipi = odemeTipiHam.toLocaleLowerCase('tr-TR');
        const cekMi = odemeTipi.includes('çek');
        const senetMi = odemeTipi.includes('senet');
        const sanalPosMu = odemeTipi.includes('sanal');
        const tahsilatTuru = cekMi ? 'Cek' : (senetMi ? 'Senet' : (sanalPosMu ? 'SanalPos' : 'Normal'));
        // ÇEK/SENET İÇİN TARİH: kullanıcı isteği üzerine, çek/senet kayıtlarının TÜM hesaplamalarında
        // (tahsilat arşivi günlere dağıtma, Genel Rapor/Sevk KPI'ları, Trend Analizi/Aylık Ortalama)
        // belge/alınan tarihi değil, "Vade Tarihi" kolonu baz alınır — bu tarih, çekin/senedin fiilen
        // paraya döneceği (vadesinin geldiği) günü yansıttığından tahsilat gerçekleşme zamanlaması
        // olarak daha doğrudur. Normal/Sanal Pos kayıtlar eskisi gibi belge tarihini kullanmaya devam eder.
        const vadeTarihiHam = r['Vade Tarihi'];
        const vadeTarihi = vadeTarihiHam!=null ? excelDateToJSArti1Gun(vadeTarihiHam) : null;
        const belgeTarihiHam = excelDateToJSArti1Gun(r[tarihKolonu]);
        const belgeTarihi = ((cekMi||senetMi) && vadeTarihi) ? vadeTarihi : belgeTarihiHam;
        // Çek/Senet için benzersiz anahtar: manuel "Tahsil Edildi" onayının hangi çek/senede ait
        // olduğunu (state.cekSenetTahsilOnaylari Set'inde) eşleştirmek için kullanılır. Çek/Senet No
        // varsa o baz alınır (en güvenilir); yoksa müşteri+tutar+vade kombinasyonuna düşülür.
        const cekSenetNo = r['Çek/Senet No']||null;
        const cekSenetAnahtari = (cekMi||senetMi) ? ('musteri:'+musteriArsiv+'|no:'+(cekSenetNo||'')+'|tutar:'+tutarArsiv+'|vade:'+(vadeTarihi?dateKeyLocal(vadeTarihi):'')) : null;
        // "gecerli": bu satırın Genel Rapor/Sevk Raporu KPI'sında sayılıp sayılmayacağını önceden
        // hesaplayıp satıra etiketler. ÖNEMLİ (kullanıcı isteği): hem Çek hem Senet OTOMATİK SAYILMAZ
        // — kullanıcı bu çek/senedi state.cekSenetTahsilOnaylari setinde MANUEL olarak
        // "Tahsil Edildi" işaretlemediği sürece gecerli=false kalır (yani risk olarak görünmeye
        // devam eder, tahsilat toplamına girmez). Normal/Sanal Pos kayıtlar etkilenmez.
        let gecerli = true;
        if(r['Belge Türü'] && r['Belge Türü'] !== 'Müşteri Tahsilat' && r['Belge Türü'] !== 'Müşteri Çek Tahsilat') gecerli = false;
        if(formatA && String(r['Belge Tipi']||'').trim() !== 'Ön Kayıt') gecerli = false;
        if((cekMi||senetMi) && !(state.cekSenetTahsilOnaylari && state.cekSenetTahsilOnaylari.has(cekSenetAnahtari))) gecerli = false;
        // formatKaynagi: bu kayıt Format A (geçici Ön Kayıt) mı yoksa Format B (nihai) mı ile mi
        // arşivlendi — Format B yüklendiğinde, kendi Belge Tarihi günlerine denk gelen Format A
        // kayıtlarının silinebilmesi için gerekli (bkz. tahsilatEfektifGunMapHesapla).
        tahsilatArsiv.push({musteri: musteriArsiv, belgeTarihi, tutar: tutarArsiv, formatKaynagi: formatA ? 'A' : 'B', gecerli,
          tahsilatTuru, cekSenetNo, cekSenetDurumu: r['Çek/Senet Durumu']||null, senetAnahtari: cekSenetAnahtari,
          vadeTarihi, belgeTarihiHam, odemeTipiHam});
      }
    });
  }

  const faturaArsiv = [];
  const bozukIadeTahsilat = [];
  if(files.fatura){
    files.fatura.data.forEach(r=>{
      const musteri = String(r['Müşteri Numarası']||'').trim();
      if(!musteri) return;
      // EFES gibi dahili/şirket-içi kayıtlar tamamen göz ardı edilir (bkz. musteriGecerliMi) — ne
      // faturaArsiv'e, ne bozukIadeTahsilat'a eklenir, ne de arşivlenir.
      if(!musteriGecerliMi(musteri)) return;
      const musteriAdi = r['Müşteri Adı'] || musteri;
      const temsilci = r['Satış Temsilcisi Adı'] || null;
      const tutar = Number(r['Ödenecek Tutar'])||0;
      const litre = Number(r['Toplam Litre'])||0;
      // Not: excelDateToJSArti1Gun kullanılır (excelDateToJS DEĞİL) — Türkiye (+3) saat dilimi
      // düzeltmesi; bkz. Sell Out/Yükleme Raporu'ndaki aynı notla birebir aynı sebep.
      const faturaTarihi = excelDateToJSArti1Gun(r['Fatura Tarihi']);
      const faturaTuru = String(r['Fatura Türü Adı']||'').trim();
      // Gerçek Fatura Numarası — arşiv tekilleştirmesinin artık tarih+tutar tahminine değil, bu
      // benzersiz belge numarasına dayanabilmesi için taşınır (bkz. tekillestir()).
      const belgeNo = String(r['Fatura Numarası']||'').trim() || null;

      // "Bozuk İade Faturası": Ödenecek Tutar burada NEGATİF gelir (müşterinin borcundan düşülen
      // bir iade/mahsup tutarıdır) — bu yüzden SATIŞ/FATURA tutarı olarak değil, müşteri TAHSİLATI
      // olarak sayılır ve tüm analiz raporlarına (Trend Analiz, DSO, CEI, Yönetim Özeti, Şüpheli
      // Alacak, Temsilci Karnesi vb.) tahsilatArsiv üzerinden aynı şekilde yansır (bkz.
      // bozukIadeTahsilatGunlereEkleVeDegistir).
      //
      // "Depozito İade" (örn. "Depozito İade Faturası" gibi varyasyonlar da dahil — SAP'ın tam
      // metni değişebildiği için "depozito" VE "iade" kelimelerinin ikisini birden içeren fatura
      // türleri eşleşir): bu da bir SATIŞ değil, müşteriye yapılan bir PARA İADESİDİR — Trend
      // Analizi'ndeki "Fatura · Aylık Ortalama" KPI'sına satış gibi dahil edilmemesi, sadece
      // "Tahsilat · Aylık Ortalama" altında İade/Depozito kalemi olarak görünmesi gerekir. Bu
      // yüzden Bozuk İade Faturası ile AYNI şekilde bozukIadeTahsilat listesine (FaturaIade
      // etiketiyle) yönlendirilir, faturaArsiv'e HİÇ eklenmez.
      //
      // Diğer fatura türleri (Satış Fatura, Boş Kap İade vb.) eskisi gibi faturaArsiv'e (satış
      // tutarı) eklenmeye devam eder.
      const faturaTuruKucuk = faturaTuru.toLocaleLowerCase('tr');
      const depozitoIadeMi = faturaTuruKucuk.includes('depozito') && faturaTuruKucuk.includes('iade');

      // "KA Sanal İade Sip.": HİÇBİR hesaplamaya dahil edilmez — ne satış/fatura tutarı olarak
      // faturaArsiv'e, ne müşteri tahsilatı olarak bozukIadeTahsilat'a. Bu satırlar tamamen göz
      // ardı edilir (Trend Analiz, DSO, CEI, Yönetim Özeti, Şüpheli Alacak, Temsilci Karnesi vb.
      // hiçbirine yansımaz).
      const kaSanalIadeMi = faturaTuruKucuk.includes('ka sanal') && faturaTuruKucuk.includes('iade');
      if(kaSanalIadeMi) return;

      if(faturaTuru === 'Bozuk İade Faturası' || depozitoIadeMi){
        bozukIadeTahsilat.push({musteri, musteriAdi, belgeTarihi: faturaTarihi, tutar: Math.abs(tutar), formatKaynagi:'FaturaIade', gecerli:true, faturaNo: r['Fatura Numarası']});
        return;
      }
      faturaArsiv.push({musteri, musteriAdi, temsilci, tutar, litre, faturaTarihi, belgeNo});
    });
  }

  // Depozito Tahsilatı: "Bozuk İade Faturası" ile AYNI mantık — Fatura Belge No dolu olan satırlar
  // müşteri TAHSİLATI olarak sayılır (Sipariş Net Tutar tutarınca), Fatura Belge No BOŞ olan
  // satırlar tamamen es geçilir (ne tahsilatArsiv'e, ne başka bir yere eklenir, ne kaydedilir).
  const depozitoTahsilat = [];
  if(files.depozitoTahsilat){
    files.depozitoTahsilat.data.forEach(r=>{
      const faturaBelgeNo = String(r['Fatura Belge No']||'').trim();
      if(!faturaBelgeNo) return; // tek kriter: Fatura Belge No zorunlu — yoksa satır tamamen es geçilir
      const musteri = String(r['Müşteri Numarası']||'').trim();
      if(!musteri) return;
      if(!musteriGecerliMi(musteri)) return; // EFES gibi dahili kayıtlar burada da göz ardı edilir
      const musteriAdi = r['Müşteri Adı'] || musteri;
      const tutar = Number(r['Sipariş Net Tutar'])||0;
      // Not: excelDateToJSArti1Gun kullanılır — Türkiye (+3) saat dilimi düzeltmesi (bkz. yukarıdaki
      // faturaTarihi notu ile aynı sebep).
      const belgeTarihi = excelDateToJSArti1Gun(r['Fatura Tarihi']);
      depozitoTahsilat.push({musteri, musteriAdi, belgeTarihi, tutar: Math.abs(tutar), formatKaynagi:'DepozitoTahsilat', gecerli:true, faturaBelgeNo});
    });
  }

  // Genel Rapor/Sevk Raporu'ndaki tahsilat KPI'sı: ARTIK "bugüne en yakın dolu gün" değil, HER ZAMAN
  // SABİT olarak bugünden bir gün önceki takvim gününe göre gösterilir — o günde arşivde/bu
  // yüklemede hiç veri yoksa KPI 0/boş görünür (başka bir güne kaymaz). Format A/Format B farkı
  // gözetilmeksizin, hangi formatın kaydı o güne aitse o kullanılır. Fatura Dökümü'ndeki "Bozuk
  // İade Faturası" ve Depozito Tahsilatı'ndaki (Fatura Belge No'lu) satırlardan türeyen tahsilat
  // kredileri de (bkz. bozukIadeTahsilat, depozitoTahsilat) bu hesaba dahildir — bunlar Tahsilat
  // Dökümü'nden gelmese bile aynı KPI'ya katkı sağlar. Bunun için, arşive gerçekten kaydedilecek
  // durumun AYNISI (bkz. tahsilatEfektifGunMapHesapla) burada da -henüz kaydetmeden- simüle edilip,
  // üzerine bu krediler eklenir, sonra SABİT "dün" gününe ait satırlar okunur.
  const bugunGunKeyTahsilat = dateKeyLocal(today);
  const efektifGunMap = tahsilatEfektifGunMapHesapla(state.faturaArsivCache || {}, tahsilatArsiv, tahsilatFormatB, bugunGunKeyTahsilat);
  bozukIadeTahsilat.forEach(r=>{
    const gk = r.belgeTarihi ? dateKeyLocal(new Date(r.belgeTarihi)) : null;
    if(!gk) return;
    const mevcut = (efektifGunMap.get(gk) || []).filter(x=>x.formatKaynagi!=='FaturaIade');
    efektifGunMap.set(gk, mevcut.concat([r]));
  });
  depozitoTahsilat.forEach(r=>{
    const gk = r.belgeTarihi ? dateKeyLocal(new Date(r.belgeTarihi)) : null;
    if(!gk) return;
    const mevcut = (efektifGunMap.get(gk) || []).filter(x=>x.formatKaynagi!=='DepozitoTahsilat');
    efektifGunMap.set(gk, mevcut.concat([r]));
  });
  const dunTarihi = new Date(bugunGunKeyTahsilat+'T00:00:00'); dunTarihi.setDate(dunTarihi.getDate()-1);
  const hedefTahsilatGunKey = dateKeyLocal(dunTarihi);

  const tahsilatKaynakMap = new Map(); // musteri -> {normal, bozukIade, depozito}
  if(hedefTahsilatGunKey){
    (efektifGunMap.get(hedefTahsilatGunKey)||[]).forEach(r=>{
      if(r.gecerli === false) return;
      tahsilatMap.set(r.musteri, (tahsilatMap.get(r.musteri)||0) + r.tutar);
      if(!tahsilatKaynakMap.has(r.musteri)) tahsilatKaynakMap.set(r.musteri, {normal:0, bozukIade:0, depozito:0});
      const kay = tahsilatKaynakMap.get(r.musteri);
      if(r.formatKaynagi==='FaturaIade') kay.bozukIade += r.tutar;
      else if(r.formatKaynagi==='DepozitoTahsilat') kay.depozito += r.tutar;
      else kay.normal += r.tutar;
    });
  }

  // ÇEK/SENET BİLGİSİ ARTIK AYRI "Çek/Senet Riski" DOSYASINDAN DEĞİL (kullanıcı isteği), doğrudan
  // Tahsilat Dökümü'ndeki "Alınan Çek"/"Alınan Senet" satırlarından besleniyor — ayrı bir Grup B
  // dosyası yüklemeye gerek kalmaz, müşteri kartlarındaki Çek/Senet bilgisi Tahsilat Dökümü ile
  // otomatik güncel kalır. cekSenetDetayMap TÜM çek+senet satırlarını (tahsil edilmiş/edilmemiş
  // fark etmeksizin) listeler — kart üzerindeki detay tablosunda hepsi görünür, "Durum" kolonuyla
  // ayırt edilir. cekSenetMap (Toplam Risk'e eklenen tutar) ise SADECE HENÜZ TAHSİL EDİLMEMİŞ
  // ÇEK/SENETLERİ toplar (kullanıcı isteği — GÜNCELLEME: Çek de Senet gibi artık OTOMATİK
  // tahsilat sayılmaz; ikisi de risk olarak kalır ve kullanıcı ilgili çek/senet için "Tahsil
  // Edildi" onayı verince (gecerli=true) risk olmaktan çıkar). Onaylanmamış çek/senetler
  // (gecerli=false) hâlâ riskli/portföydeki alacak olarak kalır.
  const cekSenetMap = new Map();
  const cekSenetDetayMap = new Map();
  tahsilatArsiv.forEach(r=>{
    if(r.tahsilatTuru !== 'Cek' && r.tahsilatTuru !== 'Senet') return;
    const musteri = r.musteri;
    if(!musteri) return;
    if(!r.gecerli){
      cekSenetMap.set(musteri, (cekSenetMap.get(musteri)||0) + r.tutar);
    }
    if(!cekSenetDetayMap.has(musteri)) cekSenetDetayMap.set(musteri, []);
    cekSenetDetayMap.get(musteri).push({
      no: r.cekSenetNo, tip: r.odemeTipiHam, tutar: r.tutar, tahsilatTuru: r.tahsilatTuru,
      tahsilEdildiMi: !!r.gecerli, senetAnahtari: r.senetAnahtari,
      vade: r.vadeTarihi || r.belgeTarihi, belgeTarihi: r.belgeTarihiHam || r.belgeTarihi,
    });
  });

  // ===== CARİ HESAP EKSTRE PİVOT =====
  // Müşteri kodu bazında GERÇEK cari bakiyeyi (Borç/Alacak sonrası Bakiye) toplar. Aynı müşterinin
  // birden fazla satırı (ör. Bira + Distile) olabilir; hepsi tek bakiyede birleşir. Ayrıca müşteri
  // adı + ünvanı da buradan alınır (karta bunlar yazılacak). İlk satırdaki (müşterisiz) genel toplam
  // atlanır. Bu dosya yüklüyse: müşterinin açık fatura toplamı ile bu bakiye arasındaki FARK,
  // en eski faturadan başlayarak düşülür (aşağıda) — böylece açık faturalar/vade/yaşlandırma bu
  // gerçek cari bakiyeye göre yeniden şekillenir. Çek/senet mahsubu bu durumda ATLANIR (çift düşme
  // olmasın; cari bakiye zaten tüm tahsilatları içerir).
  const cariEkstreMap = new Map(); // musteriKodu -> {bakiye, ad, unvan}
  const cariEkstreVar = !!(files.cariEkstre && files.cariEkstre.data && files.cariEkstre.data.length);
  if(cariEkstreVar){
    files.cariEkstre.data.forEach(r=>{
      const kod = String(r['Müşteri']||'').trim();
      if(!kod) return; // müşterisiz (genel toplam) satırı atla
      const bakiye = Number(r['Bakiye'])||0;
      let kayit = cariEkstreMap.get(kod);
      if(!kayit){ kayit = {bakiye:0, ad:null, unvan:null}; cariEkstreMap.set(kod, kayit); }
      kayit.bakiye += bakiye;
      const ad = r['Müşteri Ad'] ? String(r['Müşteri Ad']).trim() : '';
      const unvan = r['Müşteri Ünvan'] ? String(r['Müşteri Ünvan']).trim() : '';
      if(kayit.ad==null && ad) kayit.ad = ad;
      if(kayit.unvan==null && unvan) kayit.unvan = unvan;
    });
    // Cari Ekstre'de olup Kalemler'de OLMAYAN müşteriler için yeni kart oluştur (açık faturası yok
    // ama gerçek cari bakiyesi var). invoices boş → açık fatura 0; kalanBorc aşağıdaki döngüde
    // cari bakiyeye eşitlenir (fark tüm açık faturalardan düşülür, açık fatura 0 olduğundan kalanBorc
    // doğrudan cari bakiye olur — ama fatura olmadığı için vade/yaşlandırma hesaplanmaz, sadece bakiye görünür).
    cariEkstreMap.forEach((kayit, kod)=>{
      if(musteriMap.has(kod)) return;
      musteriMap.set(kod, {
        musteri: kod, musteriAdi: kayit.ad || kod, kalanBorc:0, faturaSayisi:0,
        vadeAgirlikliToplam:0, agirlikBorc:0, avgVadeGun:0, invoices:[], temsilci:null,
        cekSenet:0, cekSenetDetay:[], siparisTutari:0, emanetSiparis:0, alinanTahsilat:0,
      });
    });
  }

  musteriMap.forEach((m, musteri)=>{
    m.siparisTutari = siparisNormalMap.get(musteri)||0;
    m.emanetSiparis = emanetSiparisMap.get(musteri)||0;
    m.cekSenet = cekSenetMap.get(musteri)||0;
    m.alinanTahsilat = tahsilatMap.get(musteri)||0;
    m.alinanTahsilatKaynak = tahsilatKaynakMap.get(musteri)||null;
    m.cekSenetDetay = cekSenetDetayMap.get(musteri)||[];

    // Cari Ekstre'den müşteri adı + ünvan (varsa karta bunlar yazılır).
    const cariKayit = cariEkstreVar ? cariEkstreMap.get(musteri) : null;
    if(cariKayit){
      if(cariKayit.ad) m.musteriAdi = cariKayit.ad;
      m.musteriUnvan = cariKayit.unvan || '';
      m.cariEkstreBakiye = cariKayit.bakiye;
    }

    const sortedOldestFirst = m.invoices.slice().sort((a,b)=>{
      const at = a.faturaTarihi ? a.faturaTarihi.getTime() : Infinity;
      const bt = b.faturaTarihi ? b.faturaTarihi.getTime() : Infinity;
      return at - bt;
    });

    if(cariEkstreVar){
      // CARİ EKSTRE MODU: açık fatura toplamı ile gerçek cari bakiye arasındaki farkı, en eski
      // faturadan başlayarak düş — böylece kalan açık faturalar toplamı cari bakiyeye eşitlenir.
      // Çek/senet mahsubu YAPILMAZ (cari bakiye zaten tahsilatları içerir; çift düşme önlenir).
      const acikFaturaToplam = sortedOldestFirst.reduce((s,inv)=> s + (inv.kalanBorc>0 ? inv.kalanBorc : 0), 0);
      const hedefBakiye = cariKayit ? cariKayit.bakiye : acikFaturaToplam;
      // Düşülecek fark: açık fatura toplamı hedeften fazlaysa aradaki tutar (negatif olamaz).
      let dusulecek = Math.max(0, acikFaturaToplam - hedefBakiye);
      sortedOldestFirst.forEach(inv=>{
        inv.kalanBorcHam = inv.kalanBorc;
        if(dusulecek>0 && inv.kalanBorc>0){
          const dus = Math.min(inv.kalanBorc, dusulecek);
          inv.kalanBorc -= dus;
          dusulecek -= dus;
        }
        // Mahsup sonrası kuruş/ondalık artığı ("0 ₺" olarak görünen ama teknik olarak 0'dan farklı
        // kalan borç) her yerde "kapalı fatura" gibi davransın diye 1 ₺'nin altındaki kalıntılar
        // tam olarak 0'a sabitlenir. Bunu yapmazsak kart "Toplam Kalan Borç: 0 ₺" gösterirken, bu
        // ufak artık hâlâ "açık fatura" sayılıp Ort. Vade / yaşlandırma hesaplarına dahil oluyor —
        // kullanıcının bildirdiği "borcu yok ama ortalama vadesi var" çelişkisinin kök nedeni buydu.
        if(Math.abs(inv.kalanBorc) < 1) inv.kalanBorc = 0;
      });
      // TERS DURUM: Cari Ekstre'deki gerçek bakiye (hedefBakiye), açık faturalar toplamından
      // FAZLAYSA (kalemlerde henüz görünmeyen bir borç varsa), aradaki fark bugünün tarihiyle
      // YENİ bir "açık fatura" satırı olarak eklenir — böylece kalanBorcToplam (ve buna bağlı
      // vade/yaşlandırma hesapları) da GERÇEK cari bakiyeye eşitlenir; sadece görünen üst bakiye
      // (m.kalanBorc) değil, açık fatura listesinin kendisi de bu farkı yansıtır. Belge No'suz/
      // sanal bu satır "Cari Ekstre Farkı" olarak etiketlenir, bugünün tarihini taşır (gunFatura=0,
      // henüz vadesi gelmemiş sayılır) ve normal bir açık fatura gibi listeye/döngüye dahil olur.
      const eklenecekHam = Math.max(0, hedefBakiye - acikFaturaToplam);
      // Aynı kuruş/ondalık artığı mantığı: 1 ₺'nin altındaki farklar için sanal "Cari Ekstre Farkı"
      // satırı eklenmez (görünmez bir 0,xx ₺'lik satır açık fatura gibi Ort. Vade'yi etkilemesin).
      const eklenecek = eklenecekHam < 1 ? 0 : eklenecekHam;
      if(eklenecek > 0){
        const bugunInv = {
          musteri, musteriAdi: m.musteriAdi, belgeNo:'', belgeTuru:'Cari Ekstre Farkı',
          tutar: eklenecek, kalanBorc: eklenecek, kalanBorcHam: eklenecek,
          faturaTarihi: today, netVade: today,
          gunFatura: 0, gunVade: 0, gunFaturaHam: 0, gunVadeHam: 0,
          cariEkstreFarkSatiri: true,
        };
        m.invoices.push(bugunInv);
        sortedOldestFirst.push(bugunInv);
        m.faturaSayisi += 1;
      }
    }else{
      // NORMAL MOD (Cari Ekstre yok): Çek/Senet ARTIK açık faturalardan MAHSUP EDİLMEZ (kullanıcı
      // isteği) — Çek/Senet bilgisi artık Tahsilat Dökümü'ndeki "Alınan Çek"/"Alınan Senet"
      // satırlarından (tahsilatTuru==='CekSenet') geliyor ve bu tutarlar zaten normal tahsilat
      // hesabına (m.alinanTahsilat, tahsilatMap) vade tarihiyle dahil ediliyor. Burada AYRICA kalan
      // borçtan düşülürse aynı tutar iki kez sayılmış olur (hem tahsilat hem mahsup). m.cekSenet
      // artık sadece bilgi amaçlı — kart üzerinde "Çek/Senet" olarak gösterilir, borç hesabına girmez.
      m.invoices.forEach(inv=>{ inv.kalanBorcHam = inv.kalanBorc; });
    }

    let kalanBorcToplam = 0, vAgirlikliToplam = 0, agirlikBorc = 0, vadesiGelmisBakiye = 0;
    m.invoices.forEach(inv=>{
      kalanBorcToplam += inv.kalanBorc;
      // Ağırlıklı vade ortalaması YALNIZCA pozitif kalan borçlu faturalarla hesaplanır. Negatif
      // kalan borç (iade / fazla ödeme) hem paya hem paydaya negatif katkı verip ortalamayı
      // beklenmedik yöne kaydırabildiği için ağırlıklandırmaya alınmaz. (Kalan borç TOPLAMI,
      // vadesi gelmiş/gelmemiş bakiye gibi gerçek tutarlar ise negatifler dahil hesaplanmaya
      // devam eder — orada iade/fazla ödeme bakiyeyi doğru şekilde azaltmalıdır.)
      if(inv.gunFatura!=null && inv.kalanBorc>0){
        vAgirlikliToplam += inv.kalanBorc * inv.gunFatura;
        agirlikBorc += inv.kalanBorc;
      }
      // Vadesi gelen fatura mantığı: fatura vadesi (Net Vade Tarihi) kriteri değil, açık faturanın
      // kalan borcu + Faturadan Sonr. Gün verisi baz alınır — Faturadan Sonr. Gün eşik ve üstü ise
      // o faturanın kalan borcu "vadesi gelmiş" sayılır (negatifler dahil, gerçek bakiye).
      if(inv.gunFatura!=null && inv.kalanBorc!==0 && inv.gunFatura>=VADE_ESIGI_GUN){
        vadesiGelmisBakiye += inv.kalanBorc;
      }
    });
    // Kartta görünen BAKİYE: Cari Ekstre yüklüyse GERÇEK cari bakiye (kullanıcı isteği), yoksa
    // açık faturaların (mahsup sonrası) toplamı. Açık faturaların düşürülmüş hali (kalanBorcToplam)
    // vade/yaşlandırma hesabı için zaten kullanıldı; ama gösterilen bakiye cari ekstreye eşitlenir.
    m.kalanBorc = cariEkstreVar
      ? (cariKayit ? cariKayit.bakiye : kalanBorcToplam)
      : kalanBorcToplam;
    m.vadeAgirlikliToplam = vAgirlikliToplam;
    m.agirlikBorc = agirlikBorc;
    m.avgVadeGun = agirlikBorc!==0 ? Math.round(vAgirlikliToplam / agirlikBorc) : 0;
    m.vadesiGelmisBakiye = vadesiGelmisBakiye;
    m.vadesizBakiye = m.kalanBorc - vadesiGelmisBakiye;

    // Sipariş tutarı Toplam Risk hesabına DAHİL EDİLMEZ (kullanıcı isteği) — açık sipariş henüz
    // faturalanmamış, tahakkuk etmemiş bir borç olmadığından risk toplamını şişirmemesi istendi.
    // Toplam Risk artık sadece gerçek borç (Kalan Borç) ve çek/senet riskinden oluşur.
    m.toplamRisk = m.kalanBorc + m.cekSenet;
    const sp = siparisMusterileri.get(musteri);
    m.temsilci = musteriMasterMap.get(musteri) || m.temsilciFromKalemler || (sp && sp.temsilci) || '—';
    m.invoices.sort((a,b)=> (b.faturaTarihi||0) - (a.faturaTarihi||0));
  });

  const bakiyesiz = [];
  const allSiparisMusteri = new Set([...siparisNormalMap.keys(), ...emanetSiparisMap.keys(), ...cekSenetMap.keys()]);
  allSiparisMusteri.forEach(musteri=>{
    if(musteriMap.has(musteri)) return;
    const sp = siparisMusterileri.get(musteri) || {};
    bakiyesiz.push({
      musteri, musteriAdi: sp.musteriAdi || musteri, temsilci: musteriMasterMap.get(musteri) || sp.temsilci || '—',
      siparisTutari: siparisNormalMap.get(musteri)||0, emanetSiparis: emanetSiparisMap.get(musteri)||0,
      cekSenet: cekSenetMap.get(musteri)||0, cekSenetDetay: cekSenetDetayMap.get(musteri)||[],
    });
  });
  bakiyesiz.sort((a,b)=> (b.siparisTutari+b.emanetSiparis+b.cekSenet)-(a.siparisTutari+a.emanetSiparis+a.cekSenet));

  const musteriler = Array.from(musteriMap.values());
  const tahsilatToplamHam = Array.from(tahsilatMap.values()).reduce((a,b)=>a+b,0);
  const tahsilatEslesenToplam = sum(musteriler,'alinanTahsilat');
  const kpi = {
    toplamBakiye: sum(musteriler,'kalanBorc'),
    toplamSiparis: sum(musteriler,'siparisTutari') + sumArr(bakiyesiz,'siparisTutari'),
    toplamEmanet: sum(musteriler,'emanetSiparis') + sumArr(bakiyesiz,'emanetSiparis'),
    toplamCekSenet: sum(musteriler,'cekSenet') + sumArr(bakiyesiz,'cekSenet'),
    toplamTahsilat: tahsilatToplamHam,
    tahsilatEslesenToplam,
    tahsilatEslesmeyenToplam: tahsilatToplamHam - tahsilatEslesenToplam,
    musteriSayisi: musteriler.length,
  };

  const repMap = new Map();
  musteriler.forEach(m=>{
    const key = m.temsilci || '—';
    if(!repMap.has(key)) repMap.set(key, {temsilci:key, musteriSayisi:0, kalanBorc:0, toplamRisk:0});
    const r = repMap.get(key);
    r.musteriSayisi += 1; r.kalanBorc += m.kalanBorc; r.toplamRisk += m.toplamRisk;
  });
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz müşterilerin yalnızca
  // çek/senet riski (varsa) temsilci risk toplamına eklenir.
  bakiyesiz.forEach(b=>{
    const key = b.temsilci || '—';
    if(!repMap.has(key)) repMap.set(key, {temsilci:key, musteriSayisi:0, kalanBorc:0, toplamRisk:0});
    repMap.get(key).toplamRisk += (b.cekSenet||0);
  });

  const ticariStokRows = [];
  if(files.ticariStok){
    files.ticariStok.data.forEach(r=>{
      const depodaKalanLt = Number(r['Depoda Kalan Lt.'])||0;
      if(depodaKalanLt === 0) return;
      ticariStokRows.push({
        temsilci: r['Satış Temsilcisi Adı'] || '—',
        musteriNo: r['Müşteri No']!=null ? String(r['Müşteri No']) : '—',
        musteriAdi: r['Müşteri Ad'] || '—',
        urunKodu: r['Malzeme Kodu']!=null ? String(r['Malzeme Kodu']) : '—',
        urunAdi: r['Malzeme Açıklaması'] || '—',
        urunHiyerarsi: r['Ürün Hiyerarşi Tanımı'] || '—',
        ambalaj: r['Tanım'] || '—',
        depodaKalanMk: Number(r['Depoda Kalan Mk.'])||0,
        depodaKalanLt,
      });
    });
  }
  const ticariStokOzetMap = new Map();
  ticariStokRows.forEach(r=>{
    const key = r.temsilci || '—';
    if(!ticariStokOzetMap.has(key)) ticariStokOzetMap.set(key, {temsilci:key, kalemSayisi:0, depodaKalanMk:0, depodaKalanLt:0, noktaSet:new Set()});
    const o = ticariStokOzetMap.get(key);
    o.kalemSayisi += 1;
    o.depodaKalanMk += r.depodaKalanMk;
    o.depodaKalanLt += r.depodaKalanLt;
    o.noktaSet.add(r.musteriNo);
  });
  const ticariStok = {
    rows: ticariStokRows,
    ozet: Array.from(ticariStokOzetMap.values())
      .map(o=>({temsilci:o.temsilci, kalemSayisi:o.kalemSayisi, depodaKalanMk:o.depodaKalanMk, depodaKalanLt:o.depodaKalanLt, noktaSayisi:o.noktaSet.size}))
      .sort((a,b)=>b.depodaKalanLt-a.depodaKalanLt),
  };

  const bayiHakedis = [];
  if(files.bayiHakedis){
    files.bayiHakedis.data.forEach(r=>{
      const musteri = String(r['Müşteri']||'').trim();
      if(!musteri) return;
      if(!musteriGecerliMi(musteri)) return;
      const musteriAdi = r['Müşteri Unvanı'] || musteri;
      const tutarHam = Number(r['Tutar'])||0;
      const tutar = tutarHam * 1.20;
      // Not: excelDateToJSArti1Gun kullanılır — bkz. yukarıdaki faturaTarihi notu (Türkiye saat
      // dilimi kaynaklı 1 gün geriye kayma düzeltmesi).
      const tahsilatTarihi = excelDateToJSArti1Gun(r['Fatura Tarihi']);
      const efpaSipNoHam = r['Efpa Sip No'];
      const efpaSipNo = (efpaSipNoHam!==null && efpaSipNoHam!==undefined && String(efpaSipNoHam).trim()!=='') ? String(efpaSipNoHam).trim() : null;
      bayiHakedis.push({musteri, musteriAdi, tutar, tahsilatTarihi, efpaSipNo});
    });
  }

  // Cari Ekstre ünvan lookup'ı (kod -> ünvan) — arama fonksiyonu (musteriCariUnvan) bunu kullanır.
  // Düz obje olarak saklanır ki buluta/cihaza sorunsuz serileştirilebilsin (Map değil).
  const cariEkstreUnvanMap = {};
  if(cariEkstreVar){
    cariEkstreMap.forEach((kayit, kod)=>{ if(kayit && kayit.unvan) cariEkstreUnvanMap[kod] = kayit.unvan; });
  }

  return {
    asOf: today, musteriler, invoices, bakiyesiz, kpi, ticariStok,
    temsilciler: Array.from(repMap.values()).sort((a,b)=>b.kalanBorc-a.kalanBorc),
    siparisArsiv, tahsilatArsiv, faturaArsiv, bayiHakedis, bozukIadeTahsilat, depozitoTahsilat, tahsilatFormatB,
    cariEkstreUnvanMap,
  };
}
// DAYANIKLILIK: arr undefined/null ise (ör. buluttan/cihazdan gelen ESKİ bir raporda 'bakiyesiz'
// gibi sonradan eklenmiş bir alan hiç yoksa) 'undefined.reduce' ile çökmesin — boş toplam döndür.
function sum(arr,key){ return Array.isArray(arr) ? arr.reduce((a,b)=>a+(b[key]||0),0) : 0; }
const sumArr = sum; // sumArr, sum ile birebir aynı gövdeye sahipti — tekilleştirildi, çağrı yerleri değişmedi.

// ---- Saf (pure) hesaplama fonksiyonları için basit önbellekleme yardımcısı ----
// Bazı compute* fonksiyonları (computeNoktaYaslandirma, computeSupheliAlacak vb.) aynı `report`
// referansıyla tek bir render sırasında birden fazla kez çağrılıyor (örn. hem tablo hem özet
// paneli için), üstelik "Daha Fazla Göster" gibi yalnızca gösterilen satır sayısını artıran bir
// tıklamada bile view'in tamamı yeniden render edildiği için bu ağır hesaplamalar sıfırdan tekrar
// çalıştırılıyordu. Bu yardımcı, girdiler (nesne referansları + ilkel değerler) bir önceki
// çağrıyla birebir aynıysa sonucu yeniden hesaplamak yerine önbellekten döndürür.
// NOT: Yalnızca TÜM girdilerini parametre olarak alan, global/mutable state (örn.
// state.faturaArsivCache) okumayan saf fonksiyonlar için güvenlidir — bu yüzden yalnızca bu
// koşulu sağlayan fonksiyonlara uygulandı (aşağıdaki ilgili tanımların hemen altında).
let __dvSayac = 0;
const __dvMap = new WeakMap();
function __dataVersion(deger){
  if(deger === null || typeof deger !== 'object') return typeof deger+':'+deger;
  if(!__dvMap.has(deger)) __dvMap.set(deger, ++__dvSayac);
  return 'o'+__dvMap.get(deger);
}
function memoizePure(fn){
  let sonAnahtar = null, sonSonuc;
  return function(...args){
    const anahtar = args.map(__dataVersion).join('|');
    if(sonAnahtar !== null && anahtar === sonAnahtar) return sonSonuc;
    sonSonuc = fn.apply(this, args);
    sonAnahtar = anahtar;
    return sonSonuc;
  };
}

function canliGunlerleGuncelle(report){
  if(!report || !report.asOf || !report.musteriler) return report;
  const farkGun = Math.round((turkiyeBugun().getTime() - new Date(report.asOf).getTime()) / 86400000);
  report.musteriler.forEach(m=>{
    let vAgirlik = 0, aBorc = 0, vadesiGelmis = 0;
    (m.invoices||[]).forEach(inv=>{
      if(inv.gunFaturaHam == null) inv.gunFaturaHam = inv.gunFatura;
      if(inv.gunVadeHam == null) inv.gunVadeHam = inv.gunVade;
      inv.gunFatura = farkGun > 0 && inv.gunFaturaHam != null ? inv.gunFaturaHam + farkGun : inv.gunFaturaHam;
      inv.gunVade = farkGun > 0 && inv.gunVadeHam != null ? inv.gunVadeHam + farkGun : inv.gunVadeHam;
      // Ağırlıklı vade YALNIZCA pozitif kalan borçlu faturalarla (negatif iade/fazla ödeme
      // ortalamayı çarpıtmasın diye); vadesi gelmiş bakiye ise gerçek tutar olarak negatifler
      // dahil hesaplanır. (buildReport'taki hesapla birebir aynı mantık.)
      if(inv.gunFatura != null && inv.kalanBorc > 0){
        vAgirlik += inv.kalanBorc * inv.gunFatura;
        aBorc += inv.kalanBorc;
      }
      if(inv.gunFatura != null && inv.kalanBorc !== 0 && inv.gunFatura>=VADE_ESIGI_GUN){
        vadesiGelmis += inv.kalanBorc;
      }
    });
    m.avgVadeGun = aBorc !== 0 ? Math.round(vAgirlik / aBorc) : 0;
    m.vadeAgirlikliToplam = vAgirlik;
    m.agirlikBorc = aBorc;
    m.vadesiGelmisBakiye = vadesiGelmis;
    m.vadesizBakiye = (m.kalanBorc||0) - vadesiGelmis;
  });
  report.canliGunFarki = farkGun;
  return report;
}

// TEK KAYNAK: Yaşlandırma kovaları hem Yaşlandırma sayfasında hem Genel Bakış donut'unda
// bu ortak tanımdan okunur. Böylece iki ekran arasında kova sınırı tutarsızlığı oluşamaz.
// (Önceden Genel Bakış "0-30 gün"ü tek parça alıp vadesi gelmemiş bakiyeyi de içine katıyordu;
//  artık "Vadesinde" ayrı kova olarak her iki ekranda da aynı gösterilir.)
const AGING_BUCKETS = [
  {label:'Vadesinde', test:g=>g<=0, color:'var(--success)'},
  {label:'1–30 gün', test:g=>g>0&&g<=30, color:'#1B5FAE'},
  {label:'31–60 gün', test:g=>g>30&&g<=60, color:'var(--warn)'},
  {label:'61–90 gün', test:g=>g>60&&g<=90, color:'#C2571B'},
  {label:'90+ gün', test:g=>g>90, color:'var(--danger)'},
];
function computeAging(musteriler){
  const agingAmount = AGING_BUCKETS.map(b=>({label:b.label, value:0}));
  const agingCount = AGING_BUCKETS.map(b=>({label:b.label, value:0}));
  musteriler.forEach(m=>{
    // Kullanıcı isteği: bakiyesi (kalan borcu) olmayan müşteriler Yaşlandırma raporuna dahil
    // edilmesin — ne tutar toplamına ne de müşteri sayısına katkı versinler.
    if(Math.abs(m.kalanBorc||0) < 1) return;
    const g = m.avgVadeGun||0;
    const idx = AGING_BUCKETS.findIndex(b=>b.test(g));
    if(idx>=0){ agingAmount[idx].value += m.kalanBorc; agingCount[idx].value += 1; }
  });
  return {agingAmount, agingCount};
}

function computeSevkOzet(report, temsilciFilter){
  let musteriler = report.musteriler.filter(m=>m.siparisTutari>0 || m.emanetSiparis>0);
  let bakiyesiz = report.bakiyesiz;
  if(temsilciFilter){
    musteriler = musteriler.filter(m=>m.temsilci===temsilciFilter);
    bakiyesiz = bakiyesiz.filter(b=>b.temsilci===temsilciFilter);
  }
  const toplamSiparis = sum(musteriler,'siparisTutari') + sumArr(bakiyesiz,'siparisTutari');
  const toplamEmanet = sum(musteriler,'emanetSiparis') + sumArr(bakiyesiz,'emanetSiparis');
  const toplamTahsilat = sum(musteriler,'alinanTahsilat');
  const toplamKalanBorc = sum(musteriler,'kalanBorc');
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz müşterilerin yalnızca
  // çek/senet riski eklenir (musteriler'deki toplamRisk zaten sipariş içermiyor, bkz. buildReport).
  const toplamRisk = sum(musteriler,'toplamRisk') + sumArr(bakiyesiz,'cekSenet');
  const vAgirlikli = sum(musteriler,'vadeAgirlikliToplam');
  const vBorc = sum(musteriler,'agirlikBorc');
  const ortalamaVade = vBorc!==0 ? Math.round(vAgirlikli/vBorc) : null;
  const siparisliMusteriSayisi = musteriler.length + bakiyesiz.length;
  return {
    musteriSayisi: siparisliMusteriSayisi,
    toplamSiparis, toplamEmanet, toplamTahsilat, toplamKalanBorc, toplamRisk,
    siparisliMusteriSayisi, ortalamaVade,
  };
}
computeSevkOzet = memoizePure(computeSevkOzet);

function computeGenelKPI(report, temsilciFilter){
  const musteriler = temsilciFilter ? report.musteriler.filter(m=>m.temsilci===temsilciFilter) : report.musteriler;
  const bakiyesiz = temsilciFilter ? report.bakiyesiz.filter(b=>b.temsilci===temsilciFilter) : report.bakiyesiz;
  const toplamBakiye = sum(musteriler,'kalanBorc');
  const toplamCekSenet = sum(musteriler,'cekSenet');
  const toplamTahsilat = temsilciFilter ? sum(musteriler,'alinanTahsilat') : report.kpi.toplamTahsilat;
  const tahsilatEslesmeyenToplam = temsilciFilter ? 0 : report.kpi.tahsilatEslesmeyenToplam;
  // Toplam Risk'e sipariş tutarı DAHİL EDİLMEZ (kullanıcı isteği) — bakiyesiz müşterilerin yalnızca
  // çek/senet riski eklenir (musteriler'deki toplamRisk zaten sipariş içermiyor, bkz. buildReport).
  const toplamRisk = sum(musteriler,'toplamRisk') + sumArr(bakiyesiz,'cekSenet');
  const vAgirlikli = sum(musteriler,'vadeAgirlikliToplam');
  const vBorc = sum(musteriler,'agirlikBorc');
  const ortalamaVade = vBorc!==0 ? Math.round(vAgirlikli/vBorc) : null;
  return {
    musteriSayisi: musteriler.length,
    toplamBakiye, toplamCekSenet, toplamTahsilat, tahsilatEslesmeyenToplam, toplamRisk, ortalamaVade,
  };
}
computeGenelKPI = memoizePure(computeGenelKPI);
