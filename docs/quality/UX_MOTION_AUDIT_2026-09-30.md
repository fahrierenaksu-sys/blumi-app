# Blumi UX & Motion Audit — 2026-09-30

Historical record — not an instruction; see AGENTS.md.

**Kapsam:** `apps/mobile/src` (screens, navigation, ui, features) + `apps/mobile/App.tsx`, `app.json`.
**Checkout:** `develop` @ ffd4d24 (`/home/user/blumi-app`, read-only; hiçbir dosya değişmedi).
**Kurulu stack (doğrulandı, `apps/mobile/package.json` + `node_modules`):** Expo ~57.0.26, RN 0.86.3, React 19.2.3, Reanimated 4.5.1, Worklets 0.10.1, Gesture Handler 2.32.0, react-native-screens 4.26.2, @react-navigation/native-stack 7.3.16, expo-haptics 57.0.3, expo-image ~57.0.5, expo-blur 57.0.3, expo-symbols ~57.0.3 (kurulu ama kullanılmıyor).
**Durum etiketi:** Bu rapor *research only*. Hiçbir bulgu **Native verified** değil — Simulator/cihaz yoktu. Kod okuması + kurulu type/source doğrulaması.

Kilitli kurallar dikkate alındı: chibi kimliği ve ürün döngüsü değişmez; yeni runtime yok; animasyon UI thread'de (Reanimated shared values), per-frame React state yok; Reduce Motion yalnızca `ui/animations.ts` shared store'dan okunur (`docs/quality/ENGINEERING_RULES.md`).

**Başka yerde düzeltilenler (yeniden önerilmedi, yalnızca ilişkili boşluklar not edildi):** iOS swipe-back'te tab bar'ın geç görünmesi, sheet dismiss backdrop, shop shelf edge swipe hand-off, bulanık ayakkabı thumbnail'ları, yavaş/İngilizce "Reconnecting to Blumi" banner'ı, room editor swipe-back freeze.

---

## 1. Yönetici özeti — en büyük 10 kazanç

1. **Detay ekranlarına native push (NAV-1).** Bugün ProfilePreview, Wardrobe, You, Settings, ProfileEdit, MatchResult, Legal ve MyRoomEditor 240 ms **fade** ile açılıyor. iOS edge swipe-back ise native **slide** ile kapanıyor, yani açılış ile kapanış birbirini tutmuyor ve ekranlar arasında hiyerarşi hissi yok. Detay route'ları `animation: "default"` olmalı (native UIKit push: parallax, dim, interaktif). Fade yalnızca onboarding ve handoff'ta kalsın. *Effort S, feel H.*
2. **Haptic haritası (HAP-1).** Uygulamanın en duygusal anlarında haptic yok: Discover like/pass, eşik geçişi, **match**, MiniRoom mic toggle ve partner katılımı. Bunun yerine tab tap'te `impactLight` var. `selectionAsync` wrapper'ı eklenmeli ve HIG'e uygun bir harita çıkarılmalı. *S, H.*
3. **Discover kartı fiziği (DISC-1/2).** Kart sadece `translateX` ile gidiyor: tilt yok, bırakıştaki hız çıkışa taşınmıyor (190 ms sabit timing). Alttaki kart rol değiştirince 18 px ve 3° **snap** yapıyor. Gerekenler: tilt, velocity-aware exit, promotion spring. *M, H.*
4. **Chat'in iMessage hissi (CHAT-1/2/3).** Interactive keyboard dismiss yok, yeni mesaj entering animasyonu yok, bubble'da long-press ile kopyalama yok. Ayrıca row memo edilmemiş. *S–M, H.*
5. **Root re-render fan-out'u (PERF-1).** Her unread sayısı veya connection değişiminde `RootNavigator` yeniden render oluyor. Inline `renderPage` closure'ı `MainTabPagerPage`'in `memo`'sunu boşa çıkarıyor. Sonuç: gelen her mesajda, açık 4 tab sayfası (Discover deck, Inbox, MyRoom renderer, Shop) ve ChatThread yeniden render oluyor. *M, H (profil ile doğrulanmalı).*
6. **Match kutlaması (MATCH-1).** Kart `scale 0→1` ile beliriyor (ucuz "pop"), kalp sonsuz döngüde atıyor, haptic yok. Önerilen: `0.92→1` spring, `notificationSuccess`, sınırlı sayıda nabız. Signature moment §9-A'ya bağlanıyor. *S, H.*
7. **Toast (TOAST-1).** Çıkış animasyonu hiç oynamıyor (`if (!toast) return null`), klavyenin arkasında kalıyor (`bottom: 110` sabit) ve iOS VoiceOver'da duyurulmuyor. *S, M.*
8. **Inbox listesi (INBOX-1/2).** Thread sayısı değişince (ör. yeni match) **tüm liste** baştan stagger animasyonu oynatıyor. `getItemAnim` her render'da yeni fonksiyon döndürüyor. Loading durumunda skeleton yerine sadece metin var. *S, M.*
9. **Oda kurulumunda "sürükle" hissi yok (ROOMSETUP-1).** Kart "Dokun veya odana sürükle" diyor ama sürüklerken parmağı hiçbir şey takip etmiyor; yatak bırakınca beliriyor. Bu, ilk oturumdaki kritik an. *M, H.*
10. **Cold start'ta font flash (FONT-1).** Altı Inter weight'i runtime'da `useFonts` ile yükleniyor ve navigator beklemiyor (`void fontsReady`). İlk karede system font görünüp sonra Inter'e geçiyor (FOUT/layout shift). `expo-font` config plugin ile fontları embed etmek yeterli. *S, M.*

Hemen ardından gelenler: `borderCurve: "continuous"` (Apple squircle köşeleri, S), VoiceOver'a sızan debug metni (A11Y-1, S) ve bottom sheet'lerin native `formSheet` + detents'e taşınması (SHEET-1, M).

---
## 2. Önceliklendirilmiş tablo

Sıralama: önce feel gain, sonra effort. Dosya yolları `apps/mobile/src/` altına göredir. "NV" sütunu: native verification gerekiyor mu (Evet = Simulator veya cihaz kanıtı olmadan "done" sayılmaz).

| ID | Ekran/alan | Kullanıcı ne hissediyor | Evidence (file:line) | Önerilen fix | Feel | Effort | Risk | NV |
|---|---|---|---|---|---|---|---|---|
| NAV-1 | Tüm detay route'ları (ProfilePreview, Wardrobe, You, Settings, ProfileEdit, MatchResult, Legal, MyRoomEditor) | Ekran "belirerek" açılıyor, geri kaydırınca ise yana kayıyor. Nereden gelip nereye gittiği hissedilmiyor, web gibi duruyor. | `navigation/rootNavigationModel.ts:14-20` (`animation: "fade"`, 240 ms, tüm stack default); `navigation/RootNavigator.tsx:659-663`; route'lar `:752, :777, :782, :811, :822, :858`. native-stack 7.3.16 types: `animationMatchesGesture` default `false` → gesture ile pop, fade değil native slide kullanıyor. | Detay route'larında `animation: "default"` (UIKit push, parallax + dim, interaktif). Fade yalnızca onboarding/handoff route'larında kalsın. Reduce Motion'da `"none"` override'ı korunsun (`getReducedMotionScreenOptions`). Push'lar `navigation/` altında tek bir `DETAIL_SCREEN_OPTIONS` sabitinde toplansın. | H | S | Düşük. Rootnav yorumu (`:8-12`) onboarding'deki "dikey zıplama" nedeniyle fade seçildiğini söylüyor; bu yüzden onboarding'e dokunulmamalı. MyRoomEditor için swipe-back freeze fix'iyle koordine edilmeli. | Evet |
| HAP-1 | Discover, Match, MiniRoom, Inbox | En duygusal anlar (like, **match**, odaya partnerin girmesi, mic açma) sessiz. Buna karşılık tab tap'i "tık"lıyor. Dokunsal hiyerarşi ters. | `features/demo/useDiscoverCardSwipe.ts`, `features/discovery/*`, `components/MatchResultModal.tsx`, `screens/MatchResultScreen.tsx`, `features/miniRoom/*`: haptic çağrısı 0 (grep). `ui/haptics.ts:1-40` `selectionAsync` sunmuyor. Tab tap: `ui/bottomNav.tsx:164`. | `ui/haptics.ts`'e `hapticSelection()` eklenir (`Haptics.selectionAsync`, expo-haptics 57.0.3'te var). Harita: swipe eşiği geçişi → selection (UI thread'den `scheduleOnRN` ile, eşik başına bir kez); like/pass commit → light; match → `notificationSuccess`; mic toggle → light; partner join → soft/light; pull-to-refresh tetiklenince → light; tab tap → selection (Light yerine). Haritayı `ui/haptics.ts` başında belge olarak tut. | H | S | Düşük. Aşırı haptic yorar; tek eşik tick'i, tekrar yok. | Evet (cihaz; Simulator haptic vermez) |
| DISC-1 | Discover kart swipe | Kart rayda kayar gibi, "elde tutulan kart" hissi yok. Hızlı fırlatınca 190 ms'lik sabit animasyon kartı yavaşlatıyor, yavaş bırakınca ise aniden fırlatıyor. | `features/demo/useDiscoverCardSwipe.ts:149-151` (sadece `translateX`); `:66-77` (`withTiming` 190 ms, `SWIPE_OUT_DURATION`, velocity yok); `features/discovery/discoverySwipeModel.ts:5`. Buton ile swipe: `features/discovery/DiscoveryDeckView.tsx:103-113`. | (a) `rotate = clamp(x / width) * ~8°`, pivot parmağın tutulduğu yarıya göre (üst yarı: normal, alt yarı: ters). (b) Exit: `event.velocityX` ile süre hesapla (`distance / max(v, v_min)`, 120–260 ms aralığına clamp) veya başlangıç hızı release velocity olan `withSpring`. (c) Eşik geçişinde stamp'e küçük bir scale pop + HAP-1 tick. Tüm hesaplar `discoverySwipeModel.ts`'te saf worklet fonksiyon olarak kalsın ve node testi eklensin. | H | M | Orta. Pager'la gesture sahipliği değişmiyor. Chibi kart artwork'ü aynı kalıyor, sadece container transform'u değişiyor. | Evet |
| DISC-2 | Discover deste geçişi | Üstteki kart gidince arkadaki kart bir anda "yerine oturuyor" (18 px + 3° zıplama). Glass overlay de aniden kalkıyor. | `features/discovery/DiscoveryDeckView.tsx:229-265` (`BOTTOM_CARD_MOTION` → middle, role değişince stil anında değişiyor); `:170` (`GlassDeckOverlay` koşullu render). | Kartın rolünü bir shared value'ya (0 = bottom, 1 = middle, 2 = top) çevir ve role değişince `withSpring` ile interpolate et. Glass overlay'in opacity'si aynı progress'e bağlansın. `DeckCardContainer` zaten tek bir animated style şekli kullanıyor, yani değişiklik küçük. | M | S | Düşük | Evet |
| PERF-1 | Global (RootNavigator → 4 tab sayfası + ChatThread) | Mesaj gelirken ya da bağlantı durumu değişirken, özellikle MyRoom veya Discover açıkken ve pager sürüklenirken olası mikro takılmalar. | `navigation/RootNavigator.tsx:312-313` (`useTotalUnreadCount`, `useGlobalRealtime` root'ta); `:585-589` (`renderMainTabPage` her render'da yeniden oluşturuluyor); `:710` (inline `renderPage`); `navigation/mainTabPager/MainTabPager.tsx:511` (`MainTabPagerPage = memo(...)`, `renderPage` prop'u her seferinde yeni olduğu için memo işe yaramıyor). Sayfa ekranları (`LobbyScreen`, `MyRoomScreen`, `CosmeticShopScreen`) `memo` değil. React Compiler kapalı (`babel.config.js`). | (1) Önce React DevTools Profiler ile ölç: tek bir gelen mesajda hangi ağaçlar render oluyor? (2) `renderMainTabPage`'i `useCallback` ile sabitle ve `sessionActor`'ı ref/`useEffectEvent` ile oku. (3) Unread badge aboneliğini `RootNavigationChrome`/bottom nav'a indir. (4) Ağır sayfa kökleri `memo` olsun. Uzun vadede React Compiler değerlendirilebilir (§6). | H | M | Orta. Stale closure riski var; `exhaustive-deps` suppression'ı yasak, `useEffectEvent` kullanılmalı. | Evet (profil + frame pacing ölçümü) |
| CHAT-1 | Chat thread klavye | Listeyi aşağı çekince klavye inmiyor (iMessage'da parmakla birlikte iner). Klavye açılırken içerik bir kere "zıplıyor". | `screens/ChatThreadScreen.tsx:252-261` (FlatList'te `keyboardDismissMode` yok); `:233-237` (KAV `padding`, `keyboardVerticalOffset={0}`). Aynı pattern MiniRoom'da da var: `features/miniRoom/scene/MiniRoomScene.tsx:315-317`. Reanimated 4.5.1'de `useAnimatedKeyboard` deprecated (`node_modules/react-native-reanimated/src/hook/useAnimatedKeyboard.ts:18` → keyboard-controller'a yönlendiriyor). | Faz 1 (S): inverted listeye `keyboardDismissMode="interactive"` + `keyboardShouldPersistTaps="handled"`. Faz 2 (M, sahip kararı): `react-native-keyboard-controller` (yeni native dependency; OTA ile gelmez, dev build gerekir) ile composer'ın klavyeye frame-by-frame yapışması. | H | S→M | Faz 1 düşük. Faz 2 yeni native modül getiriyor. | Evet |
| CHAT-2 | Chat thread liste | Uzun sohbette yeni mesaj gelince ya da gönderilince kısa takılma ihtimali var. | `features/chat/thread/ChatTimelineRow.tsx:18` (`memo` yok); `screens/ChatThreadScreen.tsx:270-287` (inline `renderItem`, her render'da `getChatTimelineRowModel` ile tüm timeline). | Row model'lerini `useMemo` ile tek geçişte hesapla (id → model map). `ChatTimelineRow`'u `memo` yap. `renderItem`'ı `useCallback` ile sabitle. Kural: "Lists … memoised rows" (`ENGINEERING_RULES.md`). | M | S | Düşük | Evet (uzun thread'de profil) |
| CHAT-3 | Chat bubble etkileşimi | Mesajı kopyalayamıyorum. Yeni mesaj "pat" diye beliriyor. Gönderdiğim balon composer'dan yükselmiyor. | `features/chat/thread/ChatTimelineRow.tsx:87-94` (`Text`'te `selectable` yok, long-press yok); entering animasyonu yok (Reanimated layout animasyonu yalnızca `features/session/setupFlow/BlumiSetupShell.tsx:21-52`'de var). | (a) `<Text selectable>` iOS'un native kopyala menüsünü verir; dependency gerekmez. (b) Son gönderilen mesaja `entering={FadeInDown.springify()}` benzeri kısa bir giriş animasyonu (sadece yeni `clientMessageId` için, ilk yüklemede değil). Reduce Motion shared store'dan okunur ve `entering` undefined geçilir. | H | S | Inverted FlatList + layout animation kombinasyonu cihazda test edilmeli. | Evet |
| MATCH-1 | Match modal (realtime) ve MatchResult screen | Match anı bir sistem uyarısı gibi "pop" ediyor. Kalp sonsuza kadar atıyor. Titreşim yok. | `components/MatchResultModal.tsx:189,223-229` (`scale 0→1`, tension/friction); `:230-245` (sonsuz `Animated.loop`); `:261` (RN `Modal animationType="fade"`); `screens/MatchResultScreen.tsx:68-71` (`usePulse` halo sonsuz loop); iki dosyada da haptic yok. | Kart `opacity 0→1` + `scale 0.92→1` (hafif underdamped spring), başlıkla avatarlar arasında 60–80 ms stagger. Kalp 2–3 nabızdan sonra dursun. Görünür olduğu anda `hapticSuccess()`. Reduce Motion: crossfade + haptic (mevcut `getMatchCelebrationMotion` genişletilir). Signature moment §9-A. | H | S | Düşük | Evet |
| ROOMSETUP-1 | Onboarding "İlk odan" | Kart "sürükle" diyor ama sürüklerken hiçbir şey hareket etmiyor. Parmak kalkınca yatak bir yerde beliriyor, "bozuk mu?" hissi veriyor. | `screens/RoomSetupScreen.tsx:319-336` (PanResponder'da `onPanResponderMove` yok); `:462-470` (kart copy'si "Dokun veya odana sürükle"); yerleşik yatağı long-press ile taşımak her move'da JS `setState` tetikliyor (`:311-317` → `placeBedAtWindowPoint`). | Mevcut `features/roomV2/editor/RoomEditorDragGhost.tsx` desenini kullan: Gesture Handler `Pan` + shared value ile ghost thumbnail parmağı UI thread'de takip etsin, bırakınca spring ile hedefe otursun, yerleşince haptic. Taşımada da ghost kullanılsın, JS'e sadece bırakınca gidilsin. | H | M | Orta. `room-setup-long-press-contract` testleri etkilenebilir. | Evet |
| TOAST-1 | Global toast | Toast birden kayboluyor. Chat'te klavye açıkken toast görünmüyor. VoiceOver kullanıcısı hata duymuyor. | `ui/toast.tsx:146` (`if (!toast) return null` → çıkış animasyonu `:130-142` hiç render edilmiyor); `:213` (`bottom: 110` sabit, safe area ve klavyeden habersiz); iOS'ta hiç `AccessibilityInfo.announceForAccessibility` çağrısı yok (grep 0; `accessibilityLiveRegion` yalnızca Android'de çalışır); `:169` (İngilizce "Dismiss notification"). | Son toast'u ayrı bir state'te tut ve exit animasyonu bitince (`start(cb)`) unmount et. Pozisyonu safe area + bottom nav görünürlüğü + klavye yüksekliğine göre hesapla. `showToast` içinde iOS için `announceForAccessibility(title)`. Toast `type`'ına göre haptic eşlemesi (success → success, warning → warning). Yukarı swipe ile kapatma opsiyonel. Toast'u Reanimated'a taşımak CONS-3 ile birlikte yapılabilir. | M | S | Düşük (68 çağrı yeri var, API değişmiyor) | Evet |
| INBOX-1 | Chats listesi | Yeni match ya da thread gelince **bütün liste** kaybolup tek tek yeniden beliriyor. | `ui/animations.ts:115-121` (`useStaggeredEntrance`: `itemCount` değişince tüm `Animated.Value(0)`'lar yeniden oluşturuluyor); `screens/InboxScreen.tsx:244` (`threads.length` veriliyor); `:350-370` (`getItemAnim` her render'da yeni fonksiyon → `renderThreadRow` bağımlılıkları sürekli değişiyor). | Stagger yalnızca ilk görünümde bir kere oynasın (bir ref ile). Sonradan eklenen satırlar `entering`/`LinearTransition` ile tek tek girsin; en üste taşınan thread yumuşakça yukarı kaysın (`Animated.FlatList` `itemLayoutAnimation`). `getItemAnim`'i stabil hale getir. | M | S | Düşük | Evet |
| INBOX-2 | Chats loading | Açılışta liste yerine "açılıyor" yazan bir kart çıkıyor, sonra liste aniden geliyor. Başlık da sayıya dönüşüyor (layout shift). | `screens/InboxScreen.tsx:455-468` (loading = metin kartı); `:388-392` (başlık `threads.length`'e göre değişiyor); satır yüksekliği sabit ve `getItemLayout` zaten var (`:409-413`). | `CONVERSATION_ROW_HEIGHT` ile 4–5 skeleton satırı göster; Reduce Motion kapalıysa hafif shimmer, açıksa statik. Veri gelince crossfade yap. | M | S | Düşük | Evet |
| FONT-1 | Cold start | Açılışta yazılar bir anlığına farklı fontta görünüp Inter'e geçiyor, satırlar kayıyor. | `App.tsx` `useFonts` (6 Inter weight'i runtime'da); `navigation/RootNavigator.tsx:270` (`void fontsReady`, navigator beklemiyor); `app.json` `"expo-font"` plugin'i `fonts` opsiyonu olmadan tanımlı (plugin `fonts?: string[]` destekliyor, `node_modules/expo-font/plugin/build/withFonts.d.ts:15`). | Fontları `expo-font` config plugin'i ile build'e embed et (native font, yükleme beklemesi yok). Ardından `useFonts` kaldırılabilir. | M | S | Düşük. Native değişiklik: yeni build gerekir, OTA ile gelmez. | Evet (cold start kaydı) |
| A11Y-1 | My Room (VoiceOver) | VoiceOver "Walk in room, shellId: …; savedItemCount: 3; renderedFurnitureCount: …" gibi debug metni okuyor. | `screens/MyRoomScreen.tsx:786-788` → `features/roomV2/components/RoomRenderer2D.tsx:165-170` (stage `Pressable`'ına `accessibilityValue` olarak geçiyor); label İngilizce sabit (`:167`, ayrıca `:525-531` "Sit on …/Interact with …"). | Debug değeri yalnızca `testID`/QA build'inde kalsın (ya da tamamen kaldırılsın). Kullanıcıya yerelleştirilmiş bir label ve value verilsin ("Odada yürü", "3 eşya"). E2E testlerinin bu değeri okuyup okumadığı kontrol edilmeli. | M | S | Düşük (E2E bağımlılığı kontrol edilmeli) | Evet (VoiceOver) |
| SHEET-1 | Discover filtreleri, Report, ülke kodu seçici, hesap doğrulama modalları | Sheet bir "custom" katman gibi duruyor: detent yok, native grabber yok, arka ekran küçülmüyor. Filtre metinleri İngilizce. | RN `Modal`: `components/DiscoverFiltersBottomSheet.tsx:115` (`animationType="slide"`), `components/ReportModal.tsx:201-203`, `components/CountryCallingCodePicker.tsx:107`, `features/settings/AccountVerificationModals.tsx:20,92,191`; İngilizce sabit metinler: `DiscoverFiltersBottomSheet.tsx:119,131-132,136,154`. | Uzun vadede native-stack route'u: `presentation: "formSheet"`, `sheetAllowedDetents: [0.5, 1]` veya `"fitToContents"`, `sheetGrabberVisible`, `sheetCornerRadius` (native-stack 7.3.16 types'ta mevcut). Native pan, backdrop, VoiceOver modal odağı ve klavye davranışı ücretsiz gelir. Kısa vadede sadece copy'yi yerelleştir. **Backdrop fix'i başka yerde yapılıyor, onunla koordine edilmeli.** | M | M | Orta. Android formSheet davranışı farklı; route param'ları serialisable olmalı (kural); SwipeDismissSheet contract testleri etkilenir. | Evet |
| MICRO-1 | Shop coin bakiyesi | Satın aldım, rakam bir anda değişti. "Harcadım" hissi yok. | `screens/CosmeticShopScreen.tsx:361-366` (statik `Text`); başarı yalnızca toast + haptic (`features/shop/shopPurchaseCoordinator.ts:87,116,148,168`). | Sunucu onaylı yeni bakiye geldiğinde (optimistic değil; ekonomi server-authoritative) 400–600 ms'lik bir sayı sayma animasyonu + coin ikonunda küçük bir pulse. Reduce Motion: anında. Signature moment §9-C. | M | S | Düşük | Evet |
| MICRO-2 | Bottom nav | Açık olan tab'a basınca hiçbir şey olmuyor (iOS'ta listeyi başa sarar). Badge sessizce belirip kayboluyor. | `ui/bottomNav.tsx:162` (`disabled={isCurrent}`); `:188-198` (badge animasyonsuz); `:155` (`accessibilityRole="button"`). | Current tab'e tekrar basınca scroll-to-top (Inbox listesi, Shop, MyRoom scroll). Badge'e 0 → n geçişinde scale pop, sayı değişiminde küçük bir bump. Rolleri `tab`/`tablist` yap. | M | S | Düşük | Evet |
| MICRO-3 | Wardrobe kilitli ürün | Kilitli kıyafete dokununca hiçbir tepki yok ("ölü dokunuş"). | `features/avatarV2/wardrobe/WardrobeCatalogCard.tsx:57` (`disabled={locked}`). | Dokununca kısa bir önizleme + aynı canonical ID ile "Shop'ta gör" CTA'sı (yeni ID üretilmez). Ya da en azından yumuşak bir shake + warning haptic + açıklama. | M | S | Düşük. Canonical ID zinciri korunmalı. | Evet |
| MICRO-4 | Inbox header | Tab sayfasında bir "geri" oku var. Basınca Discover'a "replace" ediyor, pager mantığıyla çelişiyor. | `screens/InboxScreen.tsx:376-382`, `:345`; `navigation/rootNavigationModel.ts:52-58`. | Tab kökünde geri okunu kaldır (bottom nav ve pager var). Sadece stack'te gerçekten geri gidilebiliyorsa göster. | L-M | S | Düşük (ürün kararı: sahip onayı) | Evet |
| MQ-1 | Tüm press state'leri | Uygulama JS ile meşgulken (liste render'ı, navigasyon) butonlara basınca küçülme gecikiyor. Butonlar birbirinden farklı "his" veriyor. | Press-scale 11 dosyada kopyalanmış (`onPressIn` + RN `Animated.spring`, JS'ten başlatılıyor): `ui/primitives.tsx:31-72, 204-268, 274-333, 430-543`, `screens/InboxScreen.tsx:76-119`, `ui/bottomNav.tsx:116-142`, `features/chat/thread/ChatComposer.tsx:37-70` vb. 29 dosya RN Animated, 26 dosya Reanimated kullanıyor. | Tek bir `PressableScale` primitive'i: Gesture Handler `Gesture.Tap()` `onBegin/onFinalize` worklet'leri shared value'yu UI thread'de sürer, `onPress` `scheduleOnRN` ile JS'e gider. Spring token'ı `uiTheme.animation` üzerinden gelir. Reduce Motion: scale yerine opacity. Kopyaları kademeli olarak buna taşı. | M | M | Orta. Çok dosyaya dokunuyor, kademeli yapılmalı. | Evet |
| MQ-2 | Arka plan loop'ları | Pil/ısı. Eski cihazlarda pager kaydırırken ve üstteki ekranlarda gereksiz GPU yükü. | `ui/backgrounds.tsx:92-116` (`SoftBlobBackground`: 16 s sonsuz loop, 460–660 px yarı saydam blob'lar; 34 kullanım; focus'tan bağımsız çalışıyor); `screens/InboxScreen.tsx:310-331` (unread pulse, scale 1.45, sonsuz); `screens/MatchResultScreen.tsx:70`; `components/MatchResultModal.tsx:230`. | Loop'ları sayfa focus'una bağla (pager her sayfaya `isFocused` veriyor). Unread noktasını statik yap ya da en fazla 2 nabızla sınırla. Blob animasyonunu tek bir app-level arka planda topla ya da blur/scale yerine yalnızca `translate` kullan. Önce/sonra GPU ölçümü yapılmalı. | M | S | Düşük | Evet (Instruments) |
| MQ-3 | Onboarding brand prelude (ilk izlenim) | İlk açılışta prelude'da düşük FPS riski var. | `features/session/OnboardingBrandPrelude.tsx:301-306` (5 native-driven `Animated.Value`'ya `addListener`; listener native değeri her frame JS'e taşır); `:287-297` (`requestAnimationFrame` telemetry loop'u, frame-loop allowlist'inde); `:269-274` (38 ms'de bir karakter `setTimeout` + `setState` typing). | Listener'ları kaldır ve ilerlemeyi `start(({finished}) => …)` callback'lerinden türet. Telemetry'yi prod'da kapat ya da UI thread'e (`useFrameCallback`) taşı. Typing efektini tek bir shared value'ya bağlı karakter-reveal'a çevir. Bu dosya frame-loop allowlist'inden düşürülebilir (kural: allowlist yalnızca küçülür). | M | M | Orta. Onboarding contract testleri çok. | Evet (cold install) |
| PERF-2 | Pushed ekranların altındaki pager | Chat'te yazarken ya da scroll ederken arkadaki 4 sayfa React render'ına devam ediyor. | Hiçbir yerde `freezeOnBlur`/`enableFreeze` yok (grep 0). Pager dokümanı sayfalar arası freeze'i bilerek kapatıyor (`docs/quality/MAIN_TAB_PAGER_2026-09-30.md`, "Mount policy"). | Değerlendirilecek: pager slot route'una `freezeOnBlur: true`. Detay ekranı push edildiğinde tüm pager donar, swipe-back başlarken react-native-screens çözer. Sayfa içi freeze'e dokunulmaz. Önce PERF-1 yapılmalı ve ölçülmeli. | M | S | **Orta-yüksek.** Swipe-back sırasında boş frame ve bottom nav return preview etkileşimi riski var. Tab bar geç görünme fix'iyle çakışmamalı. | Evet |
| LOAD-1 | ChatThread, MyRoom, ProfilePreview loading | "Açılıyor" metni ya da spinner, ardından içerik aniden geliyor (layout jump). | `features/chat/thread/ChatThreadEmptyState.tsx:101-118`, `screens/ChatThreadScreen.tsx:239-240`; `screens/MyRoomScreen.tsx:775-779` (metin → renderer, fade yok); `navigation/LinkedProfileScreen.tsx:69-75` (`ActivityIndicator`). | Chat: header + 3–4 bubble skeleton'ı, liste gelince crossfade. MyRoom: oda shell'i placeholder olarak (renk/gradient) + renderer gelince 180 ms opacity. ProfilePreview: kart iskeleti. | M | S | Düşük | Evet |
| MICRO-5 | Discover karar hatası | Like başarısız olunca kart bir anda geri beliriyor. | `features/discovery/screen/useDiscoveryDecisions.ts:117-122` (`cardDragX.x.value = 0`, deck'e geri ekleniyor). | Kart çıktığı kenardan spring ile geri gelsin + warning haptic. Toast zaten var. | L-M | S | Düşük | Evet |
| MQ-4 | Discover kart flip | Kart dönerken like/pass butonları bir anda kayboluyor ya da beliriyor. | `features/discovery/DiscoveryDeckView.tsx:176-186` (`opacity: isFeaturedFlipped ? 0 : 1`); flip `features/demo/SwipeableDiscoverCard.tsx:259-264`. | Action row opacity'sini `flipProgress`'e bağla (ya da 150 ms timing). Reduce Motion: anında değil, crossfade (Apple'ın reduce-motion önerisi dissolve). | L | S | Düşük | Evet |
| CONS-1 | Köşeler ve radius | Kartlar "yuvarlatılmış dikdörtgen", Apple'ın squircle'ı değil. Radius'lar ekrandan ekrana değişiyor. | `borderCurve` hiç kullanılmıyor (grep 0; RN 0.86 destekliyor: `StyleSheetTypes.d.ts:480`). 281 literal `borderRadius` (≈30 farklı değer) vs 144 token kullanımı (`ui/theme.ts:94-102`). | Kart, buton, sheet ve bubble'lara `borderCurve: "continuous"` ekle (iOS, sıfır maliyet). Yeni kodda radius yalnızca token'dan gelsin, mevcut literal'ler zamanla token'a eşlensin. | M | S | Çok düşük | Evet (görsel) |
| CONS-2 | Dil tutarlılığı / VoiceOver | TR cihazda bazı etiketler İngilizce okunuyor. EN cihazda onboarding oda adımı Türkçe. | `features/discovery/screen/DiscoverHomeHeader.tsx:34,64`; `features/avatarV2/wardrobe/WardrobeTopBar.tsx:16`; `screens/InboxScreen.tsx:253` ("Someone"); `components/DiscoverFiltersBottomSheet.tsx:119,131-136,154`; `screens/RoomSetupScreen.tsx:325,385,409-465` (yalnızca TR sabit metin). | `*Copy.ts` desenine taşı (kural: user-facing metin TR + EN). | M | S | Düşük | Evet (VoiceOver TR/EN) |
| A11Y-2 | Bottom nav, chat bubble semantiği | VoiceOver tab çubuğunu "düğme" olarak okuyor. Bubble'da gönderen ve saat bilgisi dağınık. | `ui/bottomNav.tsx:155`; `features/chat/thread/ChatTimelineRow.tsx:69-116` (birleşik label yok). | `accessibilityRole="tab"` + container `"tablist"`. Bubble'a birleşik label: "Sen, 14:02, gönderildi: …". | L-M | S | Düşük | Evet |
| NAV-2 | ChatThread push | Chat açılışı diğer ekranlardan farklı; gölgesiz ve düz bir kayma. | `navigation/RootNavigator.tsx:794-799` (`simple_push`, 240 ms). | NAV-1 ile birlikte `"default"` yapılabilir (native gölge + parallax). Ayrıca `fullScreenGestureEnabled: true` ile ekranın her yerinden geri kaydırma (Instagram/Telegram hissi). Bu seçenek swipe-back'i `simple_push` tarzına döndürür (types doc), ChatThread için kabul edilebilir. | M | S | Düşük-orta. Tam ekran gesture, bubble üzerindeki olası yatay gesture'larla çakışabilir (şu an yok). | Evet |

---

## 3. Kategori detayları

### 3.1 Transitions

- **Push/pop:** Stack'in varsayılanı fade 240 ms (NAV-1). Pager'ın dört tab'ı arası geçiş iyi durumda: sürüklemede UI thread, settle'da velocity projection ve kritik damped spring, rubber band (`docs/quality/MAIN_TAB_PAGER_2026-09-30.md`). Tab tap'lerinin anında geçmesi iOS ile uyumlu, olduğu gibi kalmalı.
- **Modal vs sheet:** Dört RN `Modal` + `SwipeDismissSheet` var (SHEET-1). `SwipeDismissSheet` UI thread'de, iyi yazılmış (`ui/SwipeDismissSheet.tsx:55-66`) ama native formSheet'in detent'lerini, arka plan "scale-back"ini ve VoiceOver/klavye entegrasyonunu tekrar yazmak zorunda kalıyor.
- **Shared element:** Hiç yok. Reanimated 4.5.1'de SET hâlâ **experimental** ve kapalı bir static flag'in arkasında (`node_modules/react-native-reanimated/src/featureFlags/staticFeatureFlags.ts:22` → `ENABLE_SHARED_ELEMENT_TRANSITIONS: false`). Bu yüzden prod için önerilmiyor. Alternatif olarak "measured overlay" tekniği var: kaynak view'ı `measure()` ile ölç, aynı chibi görselini root overlay'de hedef frame'e spring ile taşı, bu sırada hedef route `animation: "none"` ile altta mount olsun. Aday akışlar:
  - MyRoom avatar → Wardrobe stage,
  - Chat room-invite kartı → MiniRoom (§9-B),
  - Discover kart → MatchResult (§9-A).
  Effort M–L, reversible.
- **Chat klavyesi:** CHAT-1.
- **Liste ekle/çıkar:** Layout animasyonu yalnızca setup shell'de var. Inbox (INBOX-1), chat (CHAT-3) ve Room Editor envanteri adaylar.
- **Skeleton vs spinner:** Discover'ın boş kart iskeleti iyi (`features/discovery/EmptyDiscoveryDeck.tsx:203-219`). Inbox, Chat, MyRoom ve ProfilePreview'da metin ya da spinner var (INBOX-2, LOAD-1).
- **Görsel fade-in:** Bundled asset'lerde `transition={0}` ve first-frame warmup bilinçli seçilmiş (`features/discovery/discoveryFirstFrameAssets.ts:13`, `features/roomV2/components/RoomRenderer2D.tsx:156-157`). Doğru karar, değiştirilmemeli: local PNG'de fade yalnızca gecikme hissi yaratır.
- **Optimistic UI:** Chat gönderimi (`features/chat/thread/useChatMessageSending.ts:47-66`) ve Discover kararı (`features/discovery/screen/useDiscoveryDecisions.ts:137` `markCandidateSeen`) zaten optimistic. Geri alma anı animasyonsuz (MICRO-5). Ekonomi ve envanter doğru biçimde server-authoritative; burada optimistic **önerilmiyor**.

### 3.2 Motion kalitesi

- **Curve'ler:** Çoğu yerde `Easing.out(cubic)` timing kullanılıyor (entrance 350–500 ms, `ui/animations.ts:66-92`). Press ve toast'ta spring var. iOS hissi için:
  - Kullanıcı başlatan her hareket **spring** olmalı: press, sheet, kart, badge, sayfa.
  - Timing yalnızca opacity ve crossfade için kalsın.
  - Reanimated 4'te `withSpring({ duration, dampingRatio })` Apple'ın `response/dampingFraction` modeline yakın ve okunaklı.
  - Öneri: `ui/theme.ts` `animation` altında 3 named spring (`snappy` ≈ 0.35 s / 0.85; `gentle` ≈ 0.5 s / 1.0; `celebrate` ≈ 0.55 s / 0.7) ve ad-hoc sürelerin (190, 240, 360, 900 + i·60 …) bu token'lara bağlanması.
- **Süreler:** Entrance 500 ms (`useEntranceAnimation` default) ve 60 ms stagger iOS standardına göre uzun. 280–350 ms ve 30–40 ms stagger daha "çevik" hissettirir.
- **JS-thread animasyonları:** RN Animated'ın hepsi `useNativeDriver: true` (`useNativeDriver: false` araması 0). Bu iyi. Ama başlatmalar JS'ten yapılıyor: JS meşgulken press feedback ve entrance gecikiyor (MQ-1). Gerçek per-frame JS maliyeti olan yerler: onboarding prelude (MQ-3), RoomSetup long-press move (ROOMSETUP-1), root re-render fan-out (PERF-1).
- **Interruptibility:**
  - Pager, Discover swipe ve sheet interruptible (gesture yakalıyor), bu iyi.
  - Match modalı, toast ve entrance'lar interruptible değil ama kısa, sorun değil.
  - Discover exit'i `ReduceMotion.Never` + `finished` kontrolüyle yarıda kesilince commit etmiyor (`features/demo/useDiscoverCardSwipe.ts:73-75`). Doğru.
- **Gesture vs time:** Discover exit gesture'dan time-driven animasyona geçiyor, hız kaybı var (DISC-1).

### 3.3 Micro-interactions

- **Haptics:**
  - Tutarsız: Report submit'te `Heavy` impact var (`components/ReportModal.tsx:108,162`). HIG'e göre sonuç bildirimi `notificationSuccess` olmalı.
  - Tab tap `impactLight` yerine `selection` olmalı.
  - Eksik anlar HAP-1'de.
  - Referans: Apple HIG "Playing haptics", https://developer.apple.com/design/human-interface-guidelines/playing-haptics.
- **Press state/scale:** Primitives'te var ama kopyalanmış (MQ-1). Pek çok özel `Pressable` sadece opacity kullanıyor (Inbox retry `pressed ? { opacity: 0.85 }`, ShopProductCard, Wardrobe kartı). `PressableScale`'e geçildiğinde tutarlı hale gelir.
- **Pull-to-refresh:** Sadece Discover'da var (`screens/LobbyScreen.tsx:328-333`). Inbox'ta yok. Realtime sync olsa bile "elle yenile" güven verir. Refresh tetiklenince light haptic.
- **Like/match kutlaması:** MATCH-1 ve §9-A.
- **Satın alma:** Haptic ve toast var, görsel kutlama yok (MICRO-1, §9-C).
- **Avatar tepkileri:** MiniRoom'da partner arrival pulse var (`features/miniRoom/scene/AvatarLayer.tsx:276-299`). Onboarding'de wave sekansı var (`features/session/OnboardingGreetingPair.tsx`, `ONBOARDING_GREETING_WAVE_SEQUENCE`). Bu mevcut motion contract'ları yeni anlarda tekrar kullanılabilir (§9).
- **Empty/error/offline tonu:** Copy'ler çoğunlukla sıcak ve yerelleştirilmiş, ama karışık dil noktaları var (CONS-2). Hata kartları (`features/discovery/EmptyDiscoveryDeck.tsx:221-248`) iyi. Offline banner başka yerde düzeltiliyor.
- **Toast:** TOAST-1.

### 3.4 Perceived performance

- **Cold start:**
  - FONT-1.
  - `BlumiLoadingScreen` ve prelude var.
  - Deferred screen bundle'lar idle'da preload ediliyor (`navigation/RootNavigator.tsx` `scheduleDeferredPreload`), bu iyi.
  - `NavigationContainer` fallback'i çıplak bir `ActivityIndicator` (`RootNavigator.tsx:643`, sabit renk `#F26779`). Linking çözülürken görünür; `BlumiLoadingScreen` ile değiştirilirse splash → app geçişi tek parça olur.
- **Resume:** Pager, arka plan veya ön plan geçişinde tam sayfaya dönüyor (doküman). Ekstra bir bulgu yok.
- **Prefetch:** Inbox, ilk 6 thread'in mesajlarını focus'ta ısıtıyor (`screens/InboxScreen.tsx:281-304`), Discover first-frame asset'leri prefetch ediliyor. İyi.
- **Görsel cache:** `expo-image` + `memory-disk` yaygın. MiniRoom `AvatarLayer`/`RoomMapLayer` ve onboarding sahneleri RN `Image` kullanıyor (`features/miniRoom/scene/AvatarLayer.tsx:2,445`). Bundled asset olduğu için risk düşük. MiniRoom girişinde decode hitch'i görülürse `expo-image` + `priority="high"`'a geçilebilir (NV ile karar verilmeli).
- **Virtualization:** Inbox `getItemLayout`/`windowSize`/`removeClippedSubviews` ile iyi (`screens/InboxScreen.tsx:406-420`). Chat'te row memo yok (CHAT-2). Discover ekranı `ScrollView` + deck, sorun değil.
- **Layout shift:** FONT-1, INBOX-2 (başlık değişimi), LOAD-1 (MyRoom metin → renderer).

### 3.5 Tutarlılık, erişilebilirlik

- **İki animasyon sistemi:** 29 dosya RN Animated, 26 dosya Reanimated (MQ-1). Kural gereği yeni motion Reanimated ile yazılmalı. `ui/animations.ts` hook'larının Reanimated karşılıkları (`useEntranceAnimation` → `entering` builder ya da `useSharedValue` tabanlı) eklenip kademeli taşınmalı.
- **Radius/renk:** CONS-1. `.tsx` içinde 334 hex + 361 `rgba(` literal var. Token dışı renklerin çoğu bilinçli "glass" tonları, ama tek bir `glass` token setinde toplanmalı (`ui/glass.tsx` var).
- **Tipografi:** Inter tek aile, `uiTheme.font` ölçeği tutarlı. Sorun sadece yükleme (FONT-1).
- **Dark mode:** `app.json` `"userInterfaceStyle": "light"`. Bilinçli kilit olarak kabul edildi, bulgu değil. İleride açılırsa 700'e yakın literal renk en büyük engel.
- **Dynamic Type:** 45 `maxFontSizeMultiplier` ve `fontScale`'e duyarlı layout modelleri var (`ui/layout/appViewportMetrics.ts`, `features/shop/ShopPreviewPanel.tsx`), iyi. Bottom nav label'ı ve chat bubble'ları büyük metinde NV ile kontrol edilmeli.
- **Reduce Motion:**
  - Shared store her yerde kullanılıyor, kural uygulanmış.
  - Store fail-closed (`ui/reducedMotionStore.ts:19-24`): cold start'ta ilk mount olan ekranın entrance animasyonu atlanıyor. Bilinçli ve güvenli, olduğu gibi kalmalı.
  - İyileştirme: Reduce Motion'da hareketin tamamen kesilmesi yerine **crossfade** ikamesi (Apple önerisi). Kart flip'i, match ve sheet için geçerli.
- **VoiceOver:**
  - A11Y-1 (debug metni), A11Y-2 (tab/bubble semantiği).
  - Toast ve hataların iOS'ta duyurulmaması (TOAST-1).
  - Pager, seçili olmayan sayfaları erişilebilirlikten gizliyor. Doğru.

---

## 4. Kurulu stack'te hazır Apple tarzı pattern'ler (maliyet/risk)

Versiyonlar `node_modules` içindeki type ve source dosyalarından doğrulandı. Doküman linkleri ilgili major sürüm içindir.

| Pattern | Kurulu destek | Blumi'de kullanım | Maliyet | Risk | Not |
|---|---|---|---|---|---|
| Native push (`animation: "default"`), `animationMatchesGesture`, `fullScreenGestureEnabled` | native-stack 7.3.16 `types.d.ts:426-443`. https://reactnavigation.org/docs/7.x/native-stack-navigator | NAV-1, NAV-2 | S | Düşük | iOS-only prop'lar Android'de yok sayılır. |
| `presentation: "formSheet"` + `sheetAllowedDetents` / `sheetGrabberVisible` / `sheetCornerRadius` / `sheetLargestUndimmedDetentIndex` | native-stack 7.3.16 `types.d.ts:518-636`, react-native-screens 4.26.2 | SHEET-1 (filtreler, report, ülke seçici) | M | Orta | Modal'lar route'a dönüşür, param'lar serialisable olmalı. Android davranışı NV ile kontrol edilmeli. Backdrop fix'i ile koordine edilmeli. |
| `headerLargeTitle` + `headerTransparent` + `headerBlurEffect` | native-stack 7.3.16 `types.d.ts:150-238` | Yalnızca Settings/Legal gibi "sistem" ekranlarında (opsiyonel) | M | Orta | Mevcut özel `TopBar` diliyle çelişebilir; tasarım kararı. Ana ekranlarda **önerilmiyor**. |
| expo-haptics `selectionAsync`, `notificationAsync`, `impactAsync(Soft/Rigid)` | 57.0.3 (`src/Haptics.ts:14,33,47`). https://docs.expo.dev/versions/v57.0.0/sdk/haptics/ | HAP-1 | S | Düşük | Simulator haptic vermez, cihaz testi gerekir. |
| Reanimated layout animations (`entering`/`exiting`/`LinearTransition`, `Animated.FlatList` `itemLayoutAnimation`) | 4.5.1 (`src/component/FlatList.tsx:32-42`). https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations | CHAT-3, INBOX-1, toast, movement pill | S–M | Düşük-orta | Reduce Motion shared store'dan okunur ve `entering` `undefined` geçilir. `ReduceMotion.System` kullanmak kuralın ruhuna aykırı olur (ikinci kaynak). |
| Shared element transitions | 4.5.1'de static flag `false` (experimental) | — | — | Yüksek | Prod için önerilmiyor. Yerine measured overlay (§3.1). |
| Gesture Handler `ReanimatedSwipeable` | 2.32.0 (`src/components/ReanimatedSwipeable`). https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable | Inbox row swipe action'ları (ör. "Profili gör", "Şikayet et") | M | Orta | Pager yatay pan'i ile çakışır: swipeable `blocksExternalGesture(pager)` ile sahiplenmeli (pager dokümanındaki ownership modeli). Aksiyon seti bir ürün kararı. |
| Context menu + preview (iMessage long-press) | **Kurulu değil.** `@expo/ui` (SwiftUI ContextMenu) veya başka bir native lib gerekir. | Chat bubble, Inbox row | L | Orta-yüksek | Yeni native dependency, sahip kararı. Kısa vadede `Text selectable` (CHAT-3) yeterli. |
| `react-native-keyboard-controller` | Kurulu değil. Reanimated `useAnimatedKeyboard` deprecated. | CHAT-1 faz 2, MiniRoom chat | M | Orta | Yeni native modül, OTA ile gelmez. |
| expo-blur `BlurView` | 57.0.3, MiniRoom HUD'da kullanılıyor (`features/miniRoom/scene/MiniRoomHud.tsx:146-148`) | Bottom nav glass'ında gerçek blur (şu an tint katmanları) | S–M | Orta | Eski cihazlarda GPU maliyeti ve Android blur yöntemi. Önce/sonra ölçülmeli. |
| `borderCurve: "continuous"` | RN 0.86 (`StyleSheetTypes.d.ts:480`) | CONS-1 | S | Çok düşük | Yalnızca iOS, Android'de yok sayılır. |
| `AccessibilityInfo.announceForAccessibility` | RN 0.86 (`AccessibilityInfo.d.ts:146`) | TOAST-1 | S | Düşük | — |
| expo-font config plugin (`fonts: [...]`) | `expo-font/plugin/build/withFonts.d.ts:15`. https://docs.expo.dev/versions/v57.0.0/sdk/font/ | FONT-1 | S | Düşük | Native build gerekir. |
| React Compiler (`experiments.reactCompiler`) | Expo SDK 57 destekliyor. https://docs.expo.dev/guides/react-compiler/ | PERF-1 uzun vade | L | Orta | Tüm kod tabanını etkiler. Ayrı bir dal + ölçüm + tam test gerekir. |
| expo-symbols (SF Symbols + symbol effects) | Kurulu, kullanılmıyor | — | — | — | `scripts/mobile-core-icon-contract.test.mjs` çekirdek nav'da Ionicons'u zorunlu tutuyor. Değiştirmek ikonografi kararı olur; **önerilmiyor**. |

---

## 5. Quick wins (≈1 gün, düşük risk)

Her biri küçük, geri alınabilir, test eklenebilir. Hepsi NV ister.

1. **NAV-1 + NAV-2:** Detay route'larında `animation: "default"`. `rootNavigationModel.ts`'e `DETAIL_SCREEN_OPTIONS` + node testi. Onboarding'e dokunulmaz.
2. **HAP-1:** `hapticSelection()` ekle. Discover commit ve eşik (UI thread'den `scheduleOnRN`), match success, mic toggle, tab tap → selection, Report → success.
3. **MATCH-1:** `scale 0→1` yerine `0.92→1` + opacity, kalp nabzı sınırlı, `hapticSuccess()`.
4. **TOAST-1:** Exit animasyonu, safe-area ve klavye farkındalığı, iOS announce, TR/EN a11y label.
5. **INBOX-1 + INBOX-2:** Stagger bir kere oynasın, skeleton satırlar.
6. **CHAT-1 faz 1 + CHAT-2 + CHAT-3(a):** `keyboardDismissMode="interactive"`, row memo, `Text selectable`.
7. **A11Y-1 + CONS-2:** Debug `accessibilityValue`'yu kaldır, sabit İngilizce/Türkçe etiketleri `*Copy.ts`'e taşı.
8. **CONS-1:** Kart, buton, sheet ve bubble stillerine `borderCurve: "continuous"`.
9. **MQ-2:** Arka plan blob loop'unu ve unread pulse'u focus'a bağla, unread pulse'u sınırla.
10. **MICRO-2:** Current tab'e tekrar dokununca scroll-to-top + badge pop.

(FONT-1 de küçük bir iş ama native build gerektiriyor. Bir sonraki build'e eklenmeli.)

---

## 6. Signature moments (chibi kimliği korunur, Reduce Motion'a saygılı)

Hepsi **mevcut** layered-PNG runtime ve mevcut motion contract'ları ile yapılır. Yeni runtime, yeni karakter çizimi ya da yeni cosmetic ID yok. Yeni poz veya kare gerekirse `.agents/skills/blumi-character-asset-production/SKILL.md` süreci zorunlu, bu rapor çizim önermiyor.

### A. "Match: iki chibi selamlaşıyor"
- **Tetik:** Server'dan match sonucu (`features/discovery/screen/useDiscoveryDecisions.ts:176-191`) veya realtime match (`useMatchModal`).
- **Akış:**
  1. Discover kartındaki chibi, measured overlay ile MatchResult'taki konumuna süzülür.
  2. Karşı taraf sağdan girer.
  3. İki avatar arasındaki kalp bağlantı çizgisi soldan sağa "çizilir" (scaleX, 280 ms).
  4. Temas anında `hapticSuccess()`.
  5. Wave sekansı (`ONBOARDING_GREETING_WAVE_SEQUENCE`, `features/session/OnboardingGreetingPair.tsx`) **sadece** mevcut asset'ler kullanıcının loadout'u ile uyumluysa oynatılır. Değilse mevcut idle/breathe yeterli.
  6. Confetti mevcut `ConfettiOverlay`'dan, parçacık sayısı azaltılmış olarak.
- **Reduce Motion:** Overlay yok. 200 ms crossfade + statik çift + haptic.
- **Kanıt gerekenler:** Loadout'lu wave uyumu (Workbench/skill kapısı), frame pacing.

### B. "Davetten odaya: kapı açılıyor"
- **Tetik:** Chat'te room invite kabulü → MiniRoom (`navigation/useRoomInviteRouting.ts:67`).
- **Akış:**
  1. Invite kartı (`features/chat/ChatRoomInviteCard.tsx`) overlay olarak ölçülür ve ekranı dolduracak şekilde spring ile büyür (köşe radius 22 → 0, `borderCurve` continuous).
  2. İçinde MiniRoom oda arka planı crossfade ile belirir.
  3. MiniRoom route'u `animation: "none"` ile altta hazır olur.
  4. Partner odaya girdiğinde mevcut arrival pulse (`features/miniRoom/scene/AvatarLayer.tsx:276-299`) + light haptic.
  5. Mic başlangıçta muted/off kalır (ürün kuralı). Açılırken light haptic + ikon morph.
- **Reduce Motion:** Kart → oda crossfade, pulse yok, haptic var.
- **Kanıt gerekenler:** Realtime bağlantı gecikmesinde "bekleme" durumu (overlay'in tutulacağı süre ve iptal).

### C. "Satın alma: kıyafet avatara uçar"
- **Tetik:** **Server-confirmed** satın alma başarısı (`features/shop/shopPurchaseCoordinator.ts:87/116/148/168`). Optimistic değil.
- **Akış:**
  1. Ürün thumbnail'ı measured overlay ile preview avatarına küçülerek uçar (350 ms, arc).
  2. Avatar preview'da ilgili katman (aynı canonical ID) 120 ms crossfade ile "giyilir".
  3. Coin bakiyesi yeni server değerine sayarak iner (MICRO-1).
  4. Coin ikonu bir kez pulse eder.
  5. `hapticSuccess()` (şu an toast ile birlikte var, uçuşun varışına senkronlanır).
- **Reduce Motion:** Uçuş yok. Katman crossfade + anında bakiye + haptic.
- **Kanıt gerekenler:** Shop preview katman anchor'ları (mevcut fit data ile), NV.

### D. (Küçük) "Swipe eşiği tık"
- Discover kartı eşiği geçtiğinde LIKE/NOPE stamp'i hafifçe "oturur" (scale 1.08 → 1 spring) + tek bir selection haptic. Geri çekilince stamp söner, ikinci tık olmaz.
- Tamamen UI thread'de, `discoverySwipeModel.ts` saf fonksiyonlarıyla.
- **Reduce Motion:** Scale yok, haptic var.

---

## 7. Başka yerde düzeltilen konularla ilişkili boşluklar (yalnızca not)

- **Tab bar geç görünme:** Bottom nav görünürlüğü anında `opacity: visible ? 1 : 0` (`ui/bottomNav.tsx:280`). NAV-1 ile push animasyonu değişirse bar'ın gizlenme ve gösterilme zamanlaması (push başında anında gizlenme) yeniden kontrol edilmeli.
- **Sheet backdrop:** SHEET-1'deki native formSheet yönü, backdrop fix'inin uzun vadeli alternatifi. Kısa vadeli fix ile çakışmamalı.
- **Reconnecting banner:** Toast (TOAST-1) ve banner aynı alt bölgeyi paylaşabilir. Konumlandırma birlikte yapılmalı.
- **Room editor swipe-back freeze:** NAV-1'de MyRoomEditor'ı `"default"`'a almak o fix'le birlikte değerlendirilmeli. Editor'da `fullScreenGestureEnabled` **açılmamalı** (obje sürükleme ile çakışır).
- **Shop shelf hand-off:** Inbox'a `ReanimatedSwipeable` eklenirse aynı `MainTabPagerHorizontalScrollOwner` ownership modeli kullanılmalı.

---

## 8. Açık kapılar (Open)

- Tüm bulgular **Implemented değil / Native verified değil**. Kod okuması ve kurulu paket doğrulamasıdır.
- PERF-1, PERF-2, MQ-2 ve MQ-3 için önce/sonra cihaz ölçümü şart (kural: "Performance claims need a before/after measurement on a device").
- Haptic'ler yalnızca fiziksel iPhone'da doğrulanabilir.
- Signature moment'lerde yeni poz ya da kare gerekirse karakter asset production skill'inin kapıları uygulanır. Bu rapor çizim kararı vermiyor.
- Yeni native dependency önerileri (keyboard-controller, context menu için `@expo/ui`) sahip kararı gerektirir ve OTA ile gelmez.
