# Blumi — Açık UX işleri (2026-09-30'da açıldı, 2026-10-02'de güncellendi)

Çalışma dalı: `develop`. Aşağıdaki kod maddelerinin hepsi JS-only (native build gerekmez). Backend: tek canlı sunucu Railway `production`, tek veritabanı da onun; yerel önizleme `.env.local` ile buna bağlanıyor (UXO-09). Canlıda yalnız sahibin mevcut test hesaplarını kullan; veri tohumlama, toplu hesap açma ve silme yok. Veri yazan denemeler için yerel bellek sunucusunu tercih et (`npm run server:qa`, `BLUMI_AUTH_REPOSITORY=memory`).

Madde bazında güncel durum: `SESSION_INVENTORY_2026-10-01.md` (UXO-*, UX_DELIGHT ve UX_MOTION ID'leri). O tarihten sonraki commit'ler için durumu `git log` ile yeniden doğrula.

## Açık JS-only maddeler

- **#3 Sohbet açılış iskeleti (UXO-03, LOAD-1 kalanı).** Sohbet yüklenirken `ChatThreadEmptyState` görünüyor; hedef, mesaj düzenine benzeyen bir yükleme hali ve liste gelince yumuşak geçiş (Reduce Motion'da anında). Hazır ama 0 mesajlı boş durum değişmez. Kabul: `npm --workspace @blumi/mobile run test:chat` yeşil, yeni davranışı kilitleyen test var.
- **#4 Odam sekmesine tekrar dokununca başa dönme (UXO-04).** Mağaza ve Sohbetler bunu `useMainTabReselect` ile yapıyor, Odam yapmıyor. `MyRoomScreen.tsx` 1071 satır, sınırı 1082 (`mobile-engineering-rules.test.mjs`). Kabul: tekrar dokunuş Odam'ı başa getiriyor; typecheck ve dosya boyutu kuralı yeşil.
- **#5 Gelen kutusu yenileme hatası (UXO-05).** Liste doluyken aşağı çekip yenileme başarısız olursa kullanıcı hiçbir geri bildirim almıyor (`inboxPullRefreshModel.ts` hatayı yutuyor). Hedef: TR/EN geri bildirim. Kabul: `test:chat` yeşil, başarısızlık yolu testli.
- **#7 Sohbet giriş animasyonu tekrarı (UXO-07).** Giriş animasyonu sürerken ekran dışına çıkıp geri gelen yeni satır animasyonu yeniden oynatabilir (`useChatTimelineEntrances`). Hedef: bir satır girişini en fazla bir kez oynatsın. Kabul: `test:chat` yeşil, yeniden mount senaryosu testli.

Bitenler: #1 kilitli gardırop (`394aa25`), #2 arka plan döngüsü (`b5413a4`), #6 toast dili (`27b29d9`), #8 tema denetimi (`UX_DELIGHT_AUDIT_2026-09-30.md` §5), Reduce Transparency (`f34d52c`, `ef018e1`), PRD-4 engel kontrolü (`bae0ee7`; 2026-10-02'de canlı deploy `76a195e` içinde), belge senkronu DOC-1..8 (`1e70d4b`).

## Derin denetimden kalanlar

Kanıt ve öneri çözümler: `UX_DELIGHT_AUDIT_2026-09-30.md` (satır numaralarını güncel kodla kontrol et; oradaki çözümler öneri, yaklaşımı sen seç). 2026-10-01 envanterine göre açık ya da kısmi olanlar, önerilen sırayla (zorunlu değil):

1. **Bozuk hissettirenler:** CHT-02 (toast composer'ı kapatıyor), CHT-03 (klavye ile composer arasında 34 pt), CHT-07 (gönderilemeyen mesaj zor fark ediliyor), SYS-01 (Gardırop solarak açılıp kayarak kapanıyor), ROOM-05 / VIS-04 (MiniRoom'da avatar hep eşyanın önünde).
2. **Dokunuş hissi:** DSC-06/07 (kart fiziği, gerçek 3B çevirme), DSC-10 (kısmi), DSC-11, ROOM-02 (kısmi, ayak kayması), ROOM-12, ROOM-16, SYS-04/05 (kısmi), SYS-08 (kısmi), SYS-12 (kısmi), CHT-10, ONB-13 (hesap açılınca "başardın" anı yok).
3. **Erişilebilirlik ve dil:** DSC-04 (VoiceOver kartı okumuyor), SYS-06 (kısmi), ROOM-13, ROOM-14 (kısmi), CHT-11 (kısmi), DSC-08, DSC-12, DSC-14, CHT-14, CHT-16, ONB-16, ONB-18 (kısmi).
4. **Performans:** SYS-02, CHT-12, CHT-13, ROOM-15 (kısmi), ROOM-17 (kısmi). "Akıcılaştı" demek için cihazda önce/sonra ölçüm gerekir.

Onboarding doğrulama bulguları (ONBV-01..14) ayrıca envanterde.

### "Vay" anları (SIG-01)

Diğer dalgaların bitmesini beklemez; sahibin hedeflerine hizmet ettiği an yapılabilir. Yaklaşım serbest: mevcut PNG runtime'ı, rig/Spine, Skia, 2.5D/3D ya da yeni bir sistem. Kozmetik ID'ler aynı kalır; yeni görünüm sahibin görsel onayından geçer. Yeni bir native kütüphane native build ister (build hakkı sınırlı; FONT-1 ile aynı build'de toplanabilir).

- Eşleşmede iki chibinin birbirine koşup selamlaşması.
- Davetten odaya "kapı açılıyor" geçişi (sohbet içi davet kartındaki kapı sahnesi `95a63e6`'da eklendi; odaya giriş anı açık).
- Gönderilen mesaj balonunun composer'dan uçması.
- Satın almada coin uçuşu ve kıyafetin avatara uçması; tek sheet'te "görünümü satın al".
- "Sıvı" alt bar pill'i.
- Açılış taramasının ilk Keşfet kartına dönüşmesi.

## Açık kararlar

- **DSC-5:** Veri yokken gösterilen story çubukları ve çevrimiçi noktası kalsın mı? Gerekçeli bir öneriyle karar sahibe sunulabilir.
- **CHT-15:** Oda daveti göndermeden önce onay sorulsun mu? Gerekçeli bir öneriyle karar sahibe sunulabilir.
- **Klavye kütüphanesi (KBD-01):** native build gerektirir; build hakkını korumak için FONT-1 ile aynı build'de toplanmalı.
- **Güvenli QA backend (UXO-09):** MiniRoom yeni tasarımı (`71350df`) Simulator'da hiç açılmadı, çünkü yerel önizleme `.env.local` değerleriyle production sunucusuna bağlanıyor. Yerel bellek sunucusu (`npm run server:qa`, `BLUMI_AUTH_REPOSITORY=memory`) ve ona işaret eden geçici `.env.development.local` ücretsizdir ve veriye dokunmaz; sahip kararı gerekmez. Yalnız para tutan barındırılmış bir QA backend sahip kararıdır.
- **Migration 070 (okundu bilgisi):** yedek, geri yükleme kanıtı ve sahibin açık onayı gerekli (`docs/release/MIGRATION_070_RUNBOOK.md`).

## Lansman öncesi (ayrıntı `OPEN_WORK_2026-09-30.md`)

- Veritabanı yedekleme ve geri yükleme provası (REL-6/REL-4): en yüksek veri riski.
- `develop` → `main` birleştirmesi ve Railway deploy'u 2026-10-02'de yapıldı (`76a195e`, `/health` ve `/ready` 200). Sonraki birleştirme ve deploy yine sahibin onayıyla.
- Mağaza engelleri: hukuk metninin insan incelemesi (REL-11; sayfalar 200 dönüyor), AASA (REL-12), APNs/SMS (REL-13), App Store Connect formları (REL-9).
- Native build gerektirenler tek build'de toplanmalı: FONT-1 font gömme, klavye kütüphanesi, varsa yeni render kütüphaneleri.

## Telefonda doğrulanacaklar (hiçbiri native verified değil)

Keşfet kart hissi (eğilme, eşik tık, deste yayı), eşleşme ekranı, yana kayan ekran geçişleri, toast, sohbet klavyesi/kopyalama/giriş animasyonu, sinematik davet kartı, gelen kutusu (iskelet, yenileme, "Biri"), alt bar (tekrar dokunma, rozet, VoiceOver "sekme"), mağaza coin sayacı, Odam VoiceOver, Gardırop ve oda düzenleme yeni tasarımı, açılış animasyonu, Reduce Motion açıkken hareketlerin kapanması. Titreşimler yalnız gerçek iPhone'da.
