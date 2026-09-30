# Blumi — Kalan işler (2026-09-30 sonu, bulut oturumu için)

Çalışma dalı: `develop`. Önce AGENTS.md ve docs/quality/ENGINEERING_RULES.md okunmalı. Tümü JS-only (native build gerekmez). Backend gerçek (Railway); simülatörde veri yazan dokunuş yapma.

1. **Gardırop kilitli ürünler (SAHİP KARARI: GÖRÜNSÜN).** `src/features/avatarV2/wardrobe/wardrobeCatalogModel.ts`: `getWardrobeActiveItems` sahip olunmayan ama kataloğa/vücuda uygun ürünleri de döndürsün; `buildWardrobeCards` bunları `locked=true` işaretlesin. Kilitli karta dokunuş equip ETMESİN (sahiplik/sunucu mantığı aynı kalır); kart görseli (`itemArt`) kısa shake + `hapticError()` + TR/EN info toast. İç içe Pressable yok. Mağaza yönlendirmesi ayrı karar. Kabul: `npm --workspace @blumi/mobile run test:wardrobe` + tsc yeşil, yeni model testi.
2. **Arka plan animasyonları (MQ-2).** `src/ui/backgrounds.tsx` `SoftBlobBackground` sonsuz döngüsünü ekran odağına (`useIsFocused`; pager için `navigation/mainTabPager/mainTabPageFocus.ts`) ve AppState'e bağla. Reduce Motion yolu değişmez. Kabul: test:theme + test:accessibility yeşil.
3. **Sohbet açılış iskeleti (LOAD-1).** `features/chat/thread/ChatThreadEmptyState.tsx` yerine yüklenirken balon iskeleti (yeni `ChatThreadOpeningSkeleton.tsx` + saf model + test), liste gelince 160 ms crossfade (RM'de anında). Hazır ama 0 mesajlı boş durum değişmez. Kabul: test:chat yeşil.
4. **Odam sekmesine tekrar dokununca başa kaydırma.** `useMainTabReselect("myroom", ...)` (`src/ui/layout/useMainTabReselect.ts`); MyRoomScreen satır sınırı 1082 (şu an ~1071).
5. **Gelen kutusu yenileme hatası.** `features/inbox/useInboxPullToRefresh.ts`: liste doluyken yenileme başarısız olursa kullanıcıya TR/EN toast.
6. **Toast dili.** `src/ui/toastCopy.ts` cihaz Intl dilini kullanıyor; uygulama diline bağlamak için `ui` katmanından erişilebilir bir dil kaynağı gerekir (import-boundaries kuralına uy).
7. **Sohbet giriş animasyonu sınırı.** `useChatTimelineEntrances`: animasyon sırasında ekran dışına çıkıp dönen yeni satır bir kez daha animasyon oynatabilir; "oynatıldı" kümesini kalıcı tut.
8. **Denetim:** `git diff` ile `ui/animations.ts` ve `ui/theme.ts` W2-D değişikliklerini gözden geçir (W2-D yalnız token eklemeli; tek bilinçli renk değişikliği sahip onaylı ana pembe `#FF4F98` → `#F65C9D`, commit aeb968a).

## Daha büyük / lansman öncesi (Fable inceleme raporundan)
- Veritabanı yedekleme ve geri yükleme provası (REL-6/REL-4) — en yüksek veri riski.
- ~~`mini_room.decide` engel kontrolü (PRD-4)~~ — kodda ve testte yapıldı (komut adı `mini_room.invite_decision`, commit bae0ee7); canlıya geçmesi için `main` birleştirme + deploy gerekiyor.
- `develop` → `main` birleştirme ve Railway deploy doğrulaması (telefon testlerinden sonra).
- Mağaza engelleri: hukuk sayfaları (REL-11), AASA (REL-12), APNs/SMS (REL-13), App Store Connect formları (REL-9).
- Native build gerektirenler (tek build'de toplanmalı): FONT-1 font gömme, (karar verilirse) klavye kontrol kütüphanesi.
- ~~Belge senkronu (DOC-1..8)~~ — yapıldı (commit 1e70d4b); AGENTS.md ve ENGINEERING_AUDIT kapsam matrisi hariç.
- MiniRoom yeni tasarımı (commit 71350df) simülatörde hiç açılmadı: yerel önizleme `.env.local` değerleri yüzünden üretim sunucusuna bağlanıyordu. Güvenli doğrulama için geçici `.env.development.local` ya da QA backend gerekiyor (sahip kararı).
- Reduce Transparency: açılışta bir kez opak→cam geçişi var ve cam yüzeylerin tint'i opak olduğu için blur görünmüyor (WardrobeGlass).

## Telefonda doğrulanacaklar (hiçbiri native verified değil)
Keşfet kart hissi (eğilme, eşik tık, deste yayı), eşleşme ekranı, yana kayan ekran geçişleri, toast, sohbet klavyesi/kopyalama/giriş animasyonu, gelen kutusu (iskelet, yenileme, "Biri"), alt bar (tekrar dokunma, rozet, VoiceOver "sekme"), mağaza coin sayacı, Odam VoiceOver, Gardırop ve oda düzenleme yeni tasarımı, açılış animasyonu, Reduce Motion açıkken hareketlerin kapanması. Titreşimler yalnız gerçek iPhone'da.

## Durum özeti: OPEN_WORK ve UX_MOTION_AUDIT (2026-09-30 sonu)

Kaynak belgeler: `docs/quality/OPEN_WORK_2026-09-30.md`, `docs/quality/UX_MOTION_AUDIT_2026-09-30.md`. Hiçbir madde Native verified değil.

### UX_MOTION_AUDIT (31 bulgu)
- **Yapıldı (19):** NAV-1, NAV-2, HAP-1, MATCH-1, TOAST-1, DISC-1, DISC-2, MICRO-5, MQ-4, CHAT-1 (faz 1; MiniRoom kısmı MiniRoom yeniden tasarımında), CHAT-2, CHAT-3, INBOX-1, INBOX-2, A11Y-1, A11Y-2, CONS-1 (`ui/primitives.tsx` hariç: dosya boyut sınırında), CONS-2, MICRO-1, MICRO-2.
- **Kısmen (3):** MQ-2 (Inbox okunmamış nabzı sınırlandı; `SoftBlobBackground` döngüsü kaldı → yukarıda madde 2), LOAD-1 (Odam ve ProfilePreview tamam; sohbet iskeleti kaldı → madde 3), MICRO-3 (karar verildi, kod yok → madde 1).
- **Yapılmadı (9):** PERF-1 (önce Profiler ölçümü), PERF-2 (`freezeOnBlur`, PERF-1'e bağlı), ROOMSETUP-1 (onboarding sürükleme hissi), FONT-1 (native build gerekir), SHEET-1 (native formSheet), MICRO-4 (sahip onayı gerekir), MQ-1 (`PressableScale`), MQ-3 (onboarding prelude JS döngüsü), imza anları (§6 A–D).

### OPEN_WORK
- **Yapıldı:** §3.2 UX hızlı kazanımları ve §3.3'ün bir kısmı (yukarıdaki liste); PRD-4 sunucu engel kontrolü (`bae0ee7`); DOC-1..8 belge senkronu (`1e70d4b`).
- **Açık:**
  - §2 Telefon/native testleri: T-1..T-9 ve NQA-1..6 (105 maddelik QA turu). Bu oturumun değişiklikleri de telefonda doğrulanmadı (liste yukarıda).
  - §4 Ürün kararları: PRD-1, PRD-2, PRD-3, PRD-5, PRD-6, PRD-7.
  - §5 Performans: PERF-A..E (cihaz ölçümü yok).
  - §6 Yayın/operasyon: REL-1 (OTA dosya sınırı), REL-2 (`develop` → `main`), REL-3, REL-4, **REL-6 (veritabanı yedeği; en yüksek risk)**, REL-5, REL-7, REL-8..REL-18 (App Store, hukuk sayfaları, AASA, APNs/SMS, izleme, RevenueCat, audit).
  - §7 Güvenlik: SEC-R1, R3, R4, R5, R6, R8, R9, R10, SEC-A..F.
  - §8 Sanat/varlık: ART-1..ART-6.
  - §9 Teknik borç: TD-1..TD-13.
  - §3.4: UX-1 (renk/font token taşıması), UX-2 (409 hesap kurtarma ekranı).

### Önerilen sıra (bulut)
1. Telefonda bu oturumun değişikliklerini ve T-1..T-9'u test et.
2. REL-6/REL-4 veritabanı yedeği ve geri yükleme provası.
3. REL-2 `develop` → `main` + Railway deploy doğrulaması (REL-3 24 saat log).
4. App Store engelleri: REL-8, REL-9, REL-11, REL-12, REL-13.
5. Bu dosyanın üstündeki JS-only UX maddeleri (1'den başlayarak).
