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
