# Blumi — Derin UX / hareket / "vay" denetimi (2026-09-30, `develop` @ 10c5e38)

**Ne yapıldı:** Beş ayrı inceleme uygulamayı satır satır okudu. Hiçbir dosya değiştirilmedi.
**Doğrulama durumu:** Hiçbir bulgu **Native verified** değil. Hepsi güncel koddan okunan dosya:satır kanıtına dayanıyor.
- Titreşim (haptic) bulguları yalnızca gerçek iPhone'da doğrulanabilir.
- Performans iddiaları için cihazda önce/sonra ölçümü gerekiyor.

**Native build:** Bu dosyadaki bulguların hiçbiri native build gerektirmiyor, hepsi JS ile çözülebilir. Ayrıca belirtilen istisnalar:
- Sunucu tarafı gerektirenler: ROOM-07, DSC-3, CHT typing/okundu.
- Eski FONT-1 maddesi native build gerektiriyor.

**Önceki denetimle ilişkisi:** Önceki denetim `UX_MOTION_AUDIT_2026-09-30.md`. Orada biten maddeler burada tekrarlanmadı. Yalnızca o maddelerin uygulamasındaki gerçek eksikler yazıldı.
**Öncelikli uygulama sırası:** `OPEN_UX_WORK_2026-09-30.md` §"Derin denetim".

**Tablo kolonları:** P0 = açıkça bozuk ya da ilk izlenimi öldüren; P1 = önemli; P2 = cila. Etki ve efor: H/M/L (yüksek/orta/düşük) ve S/M/L (küçük/orta/büyük). Yollar `apps/mobile/src/` altına göre.

---

## 1. Açılış, onboarding, giriş/kayıt (ONB)

| ID | P | Etki/Efor | Kullanıcı ne görüyor | Kanıt | Çözüm |
|---|---|---|---|---|---|
| ONB-01 | **P0** | H/S | Kayıtlı kullanıcı uygulamayı her soğuk açtığında ya da giriş yaptığında tarama animasyonu yarıda kesiliyor. Ekran boş bir arka plana düşüyor, tarama baştan başlıyor, sonra Keşfet bir anda beliriyor. | `navigation/RootNavigator.tsx:591-600`, `:635`; `ui/BlumiLoadingScreen.tsx:141-201`; `features/discovery/DiscoveryStartupBoundary.tsx:46` | Açılışta tek, kalıcı bir yükleme katmanı kullanılmalı ve paylaşılan boot saatinden devam etmeli. Aynı görseller zaten göstermişse görsel kapısı atlanmalı. Katman `FadeOut 220ms` + scale 1→1.03 ile kapanmalı; Reduce Motion açıkken anında. |
| ONB-02 | P1 | H/S | İlk açılışta taranan 6 karakter eriyerek kaybolmuyor, tek karede siliniyor. | `ui/BlumiLoadingScreen.tsx:96-124`; `onboardingBrandPreludeModel.ts:96-108,143-147` | Kapı ve mount kıskacı 1700 ms'ye (`scanDissolveStart`) çekilmeli. Böylece eriyerek kaybolma kısmını prelude üstlenir. Model testleri güncellenmeli. |
| ONB-03 | P1 | H/M | Karşılama baloncuğunda yazı yazılırken tüm metin titreşiyor. Dünya ekranında JS köprüsü her karede meşgul. | `features/session/OnboardingWorldScene.tsx:240-267,630-714`; `OnboardingBrandPrelude.tsx:228-315,457` | `addListener`'lar kaldırılmalı (değer cleanup'ta `stopAnimation` ile okunur). Yazma efekti tek bir Reanimated clip genişliğiyle yapılmalı. Karakter çifti `memo` olmalı, interpolate'ler `useMemo`'ya alınmalı. Telemetri production'da kapanmalı. `FRAME_LOOP_DEBT` küçülür. |
| ONB-04 | P2 | M/M | El sallama JS zamanlayıcısına bağlı; JS meşgulken takılıyor, ilk turda boş kare riski var. | `features/session/OnboardingGreetingPair.tsx:47-80,160-197,294-295` | `OnboardingRunner` deseni uygulanmalı: tüm kareler mount edilir, görünür kare tek bir native saatle opacity üzerinden seçilir. |
| ONB-05 | P1 | H/S | "Whoa!"a basınca buton spinner'a dönüyor; geçiş disk yazması bitince başlıyor. "Hadi başlayalım" titreşim vermiyor. | `screens/AuthEntryScreen.tsx:225-262,419`; `features/session/onboardingIntroAction.ts:11-17` | Kayıt ve geçiş paralel başlamalı. Yerel yazma için "meşgul" gösterilmemeli. Her CTA'da `hapticLight`, basışta UI-thread spring. |
| ONB-06 | P1 | H/S | Kurulumun herhangi bir adımında kenardan geri kaydırınca tüm akış kapanıp başa dönüyor; dönüş de sert bir kesme. | `RootNavigator.tsx:900-908`; `screens/PreAuthSetupFlowScreen.tsx:302-310`; `AuthEntryScreen.tsx:263-308` | `usePreventRemove(step !== "profile")` ile geri kaydırma bir adım geri götürmeli. Dünya ekranına 240 ms ters fade ile dönülmeli. |
| ONB-07 | P2 | M/M | Adım geçişlerinde ileri/geri yönü hissedilmiyor. Başlık, sayaç ve buton iki kopya hâlinde üst üste geçiyor. | `PreAuthSetupFlowScreen.tsx:72-130,353-430`; `setupFlow/SetupFlowPrimaryAction.tsx:59-83` | Yöne göre `translateX ±28` + spring. Başlık ve CTA katmanların dışında tek kopya olmalı; böylece etiket morph'u ve sayaç animasyonu çalışır. Sonraki adım boşta önceden mount edilmeli. |
| ONB-08 | P2 | M/S | Telefon adımında klavye açılınca görünmeyen 3 ekran da yeniden hesaplanıp animasyon oynatıyor. | `setupFlow/BlumiSetupShell.tsx:137-157` | Klavye aboneliği `motionActive` ile koşullandırılmalı. |
| ONB-09 | P1 | H/S | İsmin ilk harfinde ve yaşın ilk rakamında kırmızı hata çıkıyor. İsimde "İleri" tuşu yok, sayı klavyesi kapanmıyor. | `screens/ProfileSetupScreen.tsx:109-115,254`; `ui/fieldInput.tsx` | Hata blur'da ya da submit denemesinde gösterilmeli. `returnKeyType="next"` + yaşa odak (`FieldInput` ref iletmeli). Seçimlerde `hapticSelection`. |
| ONB-10 | P1 | H/S | Karakter stüdyosunda her saç veya kıyafet değişiminde karakter bir anlığına tamamen kayboluyor (göz kırpması gibi). | `features/avatarV2/components/AvatarSetupStudioStage.tsx:94-107,130-136`; `screens/AvatarSetupScreen.tsx:172-183` | Opacity 0.85'in altına inmemeli. Küçük bir "hop" (scale 0.97→1, dampingRatio 0.6) ve `hapticSelection` eklenmeli. |
| ONB-11 | P1 | H/M | İlk oda kurulumunda yatak sürüklenirken takılıyor, yerleşince hiçbir tepki yok. Her parmak hareketinde diske ve sunucuya yazılıyor. | `roomV2/components/RoomRenderer2D.tsx:569-575,688-690`; `screens/RoomSetupScreen.tsx:269,302-327,441-491`; `roomV2/state/RoomV2Provider.tsx:656-758` | `RoomEditorDragGhost` + `Gesture.Pan` (UI thread) kullanılmalı; kayıt yalnızca bırakınca yapılmalı. Geçerli/geçersiz yerleşimde haptic, yatak spring ile düşmeli, kart `FadeIn` ile gelmeli. |
| ONB-12 | P1 | H/S | "Kod gönder"den sonra klavye kapanıyor; kodu yazmak için ekstra dokunuşlar gerekiyor. Yanlış kodda titreşim ya da sallanma yok. | `features/session/register/RegisterOtpEntry.tsx:96-113`; `register/useRegisterFlowController.ts:254-277` | Kod alanına otomatik odak verilmeli; 6 hane dolunca otomatik doğrulama yapılmalı. Hatada `hapticError` + hücre sallama + alanı temizleyip odaklama; başarıda `hapticSuccess`. |
| ONB-13 | P1 | H/M | Hesap oluşunca veya girişte "başardın" anı yok; navigator sert şekilde yeniden kuruluyor ve tarama baştan başlıyor. | `RootNavigator.tsx:651,1060`; `features/session/onboardingFlowModel.ts:219-226` | ONB-01'deki tek katman kullanılmalı: içinde kullanıcının kendi avatarı + `hapticSuccess`, ardından Keşfet'e crossfade. |
| ONB-14 | P1 | M/S | İngilizce cihazda karakter adımı, kurulum başlığı ve telefon/OTP başlıkları Türkçe çıkıyor; bir Alert yalnızca İngilizce. | `AvatarSetupScreen.tsx:50-53,211-285`; `AvatarSetupStudioStage.tsx:159-379`; `setupFlow/SetupFlowHeader.tsx:23-62`; `setupFlow/setupFlowShellModel.ts:21-46`; `onboardingScreenActions.ts:36-46`; `BlumiLoadingScreen.tsx:130,200` | Tüm metinler `*Copy.ts` dosyalarına taşınmalı ve tek bir locale kaynağı kullanılmalı. |
| ONB-15 | P2 | M/S | Cinsiyete ilk dokunuşta karakter bir an boş kalıyor (1024×1536 atlas decode ediliyor). | `features/session/ProfileCharacterReactionStage.tsx:15-16,88-152,269-285` | İki atlas önceden yüklenmeli (prefetch), geçiş 160 ms crossfade olmalı. `entrance` spring'e bağlanmalı. |
| ONB-16 | P2 | M/S | Giriş yapılmış kurulumda "Karakterim hazır" sunucu yanıtını bekliyor. | `RootNavigator.tsx:985-1027` | Profil adımındaki optimistic desen buraya da uygulanmalı. |
| ONB-17 | P2 | H/M | Bildirim izni hiç bağlam içinde istenmiyor; yalnızca Ayarlar'da. | `features/notifications/usePushRegistration.ts:243-244` | **Sahip kararı:** ilk eşleşme veya ilk mesajdan sonra chibi'li bir ön-sorma kartı, ardından sistem izni. |
| ONB-18 | P2 | M/M | Hesap kurtarma penceresi ortada fade ile açılıyor; butonlarda basış tepkisi, otomatik odak ve ülke seçici yok. | `features/session/register/AccountRecoveryModal.tsx:54,72-80` | Basış stili + `autoFocus` + `hapticError`. Uzun vadede `formSheet`. |

**"Vay" fikirleri:**
- Tarama ızgarasındaki 6 karakter küçülüp ilk Keşfet kartının arkasına girer ve kart ızgaradan açılır.
- OTP'den sonra kendi avatarın kurduğun odada belirir, ardından Keşfet'e yakınlaşılır.
- Yatak spring ile düşer ve avatar ilk kez yatağa oturur.
- Karakter stüdyosunda yatay kaydırarak kıyafet değiştirilir; her geçişte titreşim.
- Dünya dokusu büyüyerek kurulumun arka planına dönüşür.

**Zaten çok iyi olanlar:**
- Koşucu kareleri ve tek saat.
- Odometre sayaç.
- Intro'da durdur/devam.
- Pre-auth'ta optimistic adımlar.
- `SetupFlowPrimaryAction`.
- Tek native OTP alanı.
- Paylaşılan Reduce Motion store'u.

---

## 2. Keşfet, eşleşme, profil, ayarlar (DSC)

| ID | P | Etki/Efor | Kullanıcı ne görüyor | Kanıt | Çözüm |
|---|---|---|---|---|---|
| DSC-1 | P1 | H/S | Eşleşme anı Türkçe cihazda tamamen İngilizce ("It's a vibe", "Say Hi"). Üstüne ayrıca İngilizce bir toast çıkıyor. | `features/matches/matchResultPresentation.ts:71-100`; `features/connections/connectionMatchPresentation.ts:28-31` | Metinler `matchResultCopy.ts` (TR/EN) dosyasına taşınmalı ve locale parametre olarak geçilmeli. Modal açıkken toast atlanmalı. |
| DSC-2 | P1 | H/S | Keşfet'ten gelinen asıl eşleşme ekranında kart 0'dan zıplıyor (MATCH-1 düzeltmesi yalnızca modala yapılmış). Haptic kart görünmeden çalıyor; "Selam ver" ~950 ms sonra geliyor. | `screens/MatchResultScreen.tsx:77,85,89-94`; `ui/animations.ts:163-185` | `getMatchCelebrationMotion` (0.92→1 + opacity) Reanimated spring ile uygulanmalı. `hapticSuccess` kartın iniş anında çalmalı; dock gecikmesi ≤250 ms olmalı. |
| DSC-3 | P1 | H/M | Eşleşme modalında karşı tarafın gerçek chibi'si yerine hash'ten türetilmiş varsayılan bir kıyafet ve "Blumi avatar" etiketi görünüyor. İki avatarın boyutu da farklı. | `RootNavigator.tsx:1074-1082`; `navigation/useMatchModal.ts:25-29`; `avatarV2/candidateAvatarSnapshot.ts:55-62`; `components/MatchResultModal.tsx:347-383` | Partnerin `AvatarSelection` bilgisi state'e taşınmalı (payload'da yoksa contract'a eklenmeli; bu sunucu işi). İki avatar aynı boyutta `AvatarPreview2D` ile gösterilmeli. |
| DSC-4 | P1 | H/S | VoiceOver kartta yalnızca "Profil kartını çevir" diyor; isim, yaş ve bio okunmuyor. Kartta beğen/geç aksiyonu yok. | `features/demo/SwipeableDiscoverCard.tsx:376-382` | Label bir model fonksiyonundan üretilmeli (isim, yaş, bio, mesafe) ve testlenmeli. `accessibilityActions` ile like/pass eklenip `runActionSwipe`'a bağlanmalı. |
| DSC-5 | P1 | M/S | Kartta fotoğraf olmadığı hâlde 3–5 story çubuğu duruyor. Her adayda "çevrimiçi" noktası atıyor ama gerçek presence verisi yok. | `SwipeableDiscoverCard.tsx:341,420-430,456`; `screens/ProfilePreviewScreen.tsx:324-331` | Çubuklar kaldırılmalı ya da 2 segmentli bir ön/arka göstergesine çevrilmeli. Nokta yalnızca gerçek presence varsa gösterilmeli. |
| DSC-6 | P1 | M/M | Kart rayda kayıyor: dikey takip yok, eşikte eğim ~2° (hissedilmiyor), yavaş bırakılan kart fırlatılıyor, geri dönüşte karşı damga yanıp sönüyor. | `features/demo/useDiscoverCardSwipe.ts:98-122,216-224`; `features/discovery/discoverySwipeModel.ts:20-24,101` | Dikey takip `translateY = y*0.35` olmalı. Eğim yarı genişlikte ~12°, pivot için `transformOrigin`. Çıkış hız vektörüyle `withSpring(velocity, overshootClamping)`. Reset `withSpring(dampingRatio 0.8, velocity)`. Hepsi saf worklet + test. |
| DSC-7 | P1 | M/M | Çevirme gerçek bir kart dönüşü değil: çerçeve sabit kalıyor, yalnızca içerik dönüyor. 360 ms JS timing ile çalışıyor, araya girilemiyor. Reduce Motion'da sert geçiş var. Test edilen flip modeli hiç kullanılmıyor. | `SwipeableDiscoverCard.tsx:217-275,359-395,642`; `features/discovery/discoveryCardFlipModel.ts:23` | Reanimated `rotateY` tüm karta uygulanmalı; her yüz kendi çerçevesini taşımalı. Dönüşün ortasında scale 0.97 + gölge; `withSpring(springSnappy)`. Reduce Motion'da 150 ms crossfade. Model runtime'a bağlanmalı ya da silinmeli. |
| DSC-8 | P1 | M/S | Kartın arka yüzünde oda vitrini ana paneli örtüyor: iPhone 17'de ~12 px, SE'de ~112 px. Büyük yazı boyutunda metin kırpılıyor. | `SwipeableDiscoverCard.tsx:684-710`; `features/discovery/discoveryLayoutMetrics.ts:27-50` | Arka yüz flex column olmalı. `maxFontSizeMultiplier≈1.3` ve kompakt bir varyant eklenmeli. |
| DSC-9 | P1 | M/M | Profil düzenlerken geri kaydırınca kaydedilmemiş değişiklikler sessizce siliniyor. Kaydet butonu formun en altında. İlgi alanları textarea, placeholder İngilizce. | `screens/ProfileEditScreen.tsx:209-251,454-463` | `usePreventRemove` + uyarı eklenmeli. Kaydet üst bara taşınmalı. İlgi alanları chip girişi olmalı, placeholder TR/EN. Kayıtta `hapticSuccess`. |
| DSC-10 | P2 | M/S | Hızlı art arda kaydırmada sıradaki kart hemen tutulamıyor. Beğen butonunun titreşimi ~190 ms gecikiyor. Buton ile çıkış Reduce Motion'ı yok sayıyor. | `features/discovery/DiscoveryDeckView.tsx:115-126,186,312`; `screen/useDiscoveryDecisions.ts:258,302`; `SwipeableDiscoverCard.tsx:107,217,230` | Haptic bırakış anında çalmalı. `memo(SwipeableDiscoverCard)` + sabit callback'ler. Deste bırakışta ilerlemeli; çıkan kart ayrı bir ghost katmanında kalmalı. Reduce Motion'a uyulmalı. |
| DSC-11 | P2 | M/S | Yeni alt kart birden beliriyor. Buzlu katman kart bırakıldıktan ~300 ms sonra eriyor. Boş durum tek karede geliyor. | `DiscoveryDeckView.tsx:242-244,277,299-301`; `EmptyDiscoveryDeck.tsx:326-345` | Yeni kart `roleProgress` ile girmeli; overlay sürüklemeyle karışmalı. Deste↔boş geçişi `FadeIn`/`FadeOut` olmalı. Boş-deste pozları hizalanmalı. |
| DSC-12 | P2 | M/S | Limit ekranında "00:00 UTC" yazıyor (Türkiye'de 03:00). "10" sabit yazılmış, limite uyarısız çarpılıyor. Çalışmayan bir "ödüllü reklam" satırı var, İngilizce metinler kalmış. | `features/discovery/discoverySurfaceCopy.ts:82-149`; `EmptyDiscoveryDeck.tsx:93-112`; `screen/DiscoverDeckSurface.tsx:119` | `resetsAt` yerel saatle ya da "3 sa 12 dk sonra" şeklinde gösterilmeli. Kalan ≤3 olunca "3 karar kaldı" pill'i çıkmalı. Ödül satırı gizlenmeli. |
| DSC-13 | P2 | M/S | Filtre sheet'inde yaş ±1 stepper'la seçiliyor (17 dokunuş); hedefler 32 pt. Altta çift safe-area boşluğu var, blur ve grabber yok. | `components/DiscoverFiltersBottomSheet.tsx:114,203-243,285,318-322,469-472` | Çift başlıklı range slider + `hapticSelection` + `adjustable` rolü. Tek inset kullanılmalı. Reduce Transparency'de opak fallback. Grabber eklenmeli. |
| DSC-14 | P2 | L/S | "Şimdilik geçtin" pill'i akış içinde duruyor: küçük ekranda nav'ın arkasında kalıyor, içerik zıplıyor, VoiceOver duyurmuyor. | `screens/LobbyScreen.tsx:397-402`; `screen/DiscoveryFeedbackPill.tsx:22-48` | Absolute overlay olmalı. Yalnızca like/match/hata'da gösterilmeli ve `announceForAccessibility` ile duyurulmalı. |
| DSC-15 | P2 | M/S | ProfilePreview'da bounce kapalı, %95 siyah gradient var, beğen/geç'te titreşim yok. Dönüşte kart desteden animasyonsuz kayboluyor. | `screens/ProfilePreviewScreen.tsx:163-217,249,317-321,584-601` | Bounce açılmalı + esneyen hero. Açık bir cam isim plakası. `hapticLight`. Dönüşte deste çıkış animasyonunu oynatmalı. |
| DSC-16 | P2 | L/S | You ve Settings'te geri ikonları farklı. Çıkış butonu iki yerde. Settings satırları basınca küçülüyor (iOS'ta arka plan vurgusu olur). | `screens/YouScreen.tsx:46,123-134`; `SettingsScreen.tsx:156`; `ProfileEditScreen.tsx:252`; `features/settings/SettingsRow.tsx:26-27` | Tek bir `BackButton` (chevron) kullanılmalı. Çıkış yalnızca Settings'te olmalı. Satırlarda basışta `surfaceMuted` tint. |

**"Vay" fikirleri:**
- Karttaki chibi nefes alır, sürüklemeye gecikmeli eğilir; beğen eşiğinde zıplar, geç'te omuz silker.
- Eşleşme destenin içinde oynar: iki chibi birbirine zıplar, kalp çizgisi çizilir ve `hapticSuccess` çalar.
- Beğen/geç butonları sürüklemeyle büyüyüp parlar.
- Karta uzun basınca oda vitrini büyür.
- Limit dolunca chibi uyuklar ve `resetsAt`'e geri sayım halkası görünür.

**Zaten çok iyi olanlar:**
- UI-thread swipe ve yön sahipliği.
- Histerezisli eşik tık'ı.
- Deste terfi spring'i.
- Hata durumunda kartın geri yaylanması.
- LinkedProfile iskeleti.
- Optimistic kararlar.

---

## 3. Sohbet, gelen kutusu, toast, bağlantı (CHT)

| ID | P | Etki/Efor | Kullanıcı ne görüyor | Kanıt | Çözüm |
|---|---|---|---|---|---|
| CHT-01 | **P0** | H/S | Partnerin **her** mesajı, o sohbet açıkken bile ayrıca toast olarak çıkıyor. Aynı metin iki kez görünüyor ve toast 2,5 sn yazma alanını kapatıyor. MiniRoom'da da oluyor olabilir. Toast'a dokunmak sohbeti açmıyor; fallback metni "Someone". | `features/realtime/globalRealtimeEventHandler.ts:103-128`; `navigation/useGlobalRealtimeSession.ts:166-168`; `features/miniRoom/useInRoomChat.ts:316`; `chatStore.ts:125` | Handler'a `shouldNotifyIncomingMessage(threadId)` eklenmeli: açık sohbet ya da o sohbetin MiniRoom'u odaktaysa toast çıkmaz (testli). Toast'a dokununca sohbet açılmalı; "Biri" TR/EN olmalı. |
| CHT-02 | P1 | H/S | Sohbette her toast (gönderme hatası vb.) yazma alanını kapatıyor ve dokunuşları engelliyor. | `ui/toastPresentationModel.ts:81-92`; `ui/toast.tsx:276` | Composer yüksekliği `publishToastBottomBarInset` ile yayınlanmalı (mevcut owner-token modeli). |
| CHT-03 | P1 | H/S | Klavye açılınca composer ile klavye arasında ~34 pt boşluk kalıyor (iMessage'da yapışık). | `features/chat/thread/ChatComposer.tsx:172`; `screens/ChatThreadScreen.tsx:279-283` | `keyboardVerticalOffset={-insets.bottom}`. Tek satırlık düzeltme. |
| CHT-04 | P1 | H/S–M | Kendi mesajının giriş animasyonu yarıda kesiliyor: sunucu yanıtı gelince satırın key'i değişiyor ve satır yeniden mount oluyor. Saat de bir dakika kayabiliyor. | `chatStore.ts:421-486`; `chatRoomInviteModel.ts:86-90`; `thread/chatTimelineEntranceModel.ts:128-144` | Sabit bir render key olmalı: store'da `renderKeyByMessageId` (sunucu id → ilk yerel id) tutulmalı. Böylece imza geçici çözümü de kaldırılabilir. |
| CHT-05 | P1 | H/M | Yukarı kaydırmışken mesaj gönderince mesaj görünmüyor. "↓" butonu yok; yeni gelen mesaj haber verilmiyor. | `ChatThreadScreen.tsx:298-319` | `Animated.FlatList` + `useAnimatedScrollHandler` kullanılmalı. Offset >200 olunca "↓" pill'i ve yeni mesaj sayacı görünmeli. Gönderince listenin başına kaydırılmalı. |
| CHT-06 | P1 | H/S | Sohbet açıkken okunan mesajlar gelen kutusuna dönünce yine okunmamış görünüyor. | `thread/useChatThreadSync.ts:34-38`; `InboxScreen.tsx:229-241`; `chatStore.ts:189-193` | Ekran odaktayken en yeni gelen mesaj değiştikçe `markThreadRead` çağrılmalı (debounce ~500 ms). Blur'da da bir kez çağrılmalı. |
| CHT-07 | P1 | H/S–M | Gönderilemeyen mesaj neredeyse görünmüyor (10 pt gri çizgi). Toast başlığı İngilizce. Sohbet açılamazsa hem toast hem hata kartı çıkıyor. | `thread/ChatTimelineRow.tsx:152-161`; `chatCoordinator.ts:278-484`; `thread/ChatThreadEmptyState.tsx:70-99` | iMessage deseni: kırmızı ünlem + 0.7 opak balon + `hapticError`; dokununca "Tekrar dene / Sil". Başlıklar copy dosyasına taşınmalı, çift hata kaldırılmalı. Bağlantı dönünce otomatik yeniden deneme. |
| CHT-08 | P1 | M/S | Uzun listede hızlı kaydırınca satırlar geç ya da boş geliyor: `getItemLayout` 80 pt varsayıyor ama gerçek satır 88–99 pt + 12 pt ayraç. | `InboxScreen.tsx:44-45,165,439-443` | `getItemLayout` kaldırılmalı ya da satır sabit yükseklikte olmalı. |
| CHT-09 | P2 | M/S | Okunmamış yalnızca bir nokta: kalın isim veya sayaç yok, "Sen:" öneki yok. "Şimdi" donuk kalıyor, "45 gün" gibi görünüyor. VoiceOver önizlemeyi okumuyor. | `InboxScreen.tsx:62-64,176-190,259-282`; `features/chat/inboxCopy.ts:43-65` | Okunmamışta kalın isim + sayı rozeti. Zaman bugün/Dün/gün/tarih formatında; odakta tazelenmeli. Tam erişilebilirlik label'ı. |
| CHT-10 | P2 | M/M | Yeni mesaj bir sohbeti en üste taşıyınca liste zıplıyor. | `features/inbox/useInboxRowEntrance.ts` | `itemLayoutAnimation={LinearTransition.springify()}`. |
| CHT-11 | P2 | M/S | Saatler arayla gönderilen mesajlar tek grupta toplanıyor. Saat her yerde 24 saat biçiminde, 10 pt ve düşük kontrastlı. | `chatRoomInviteModel.ts:99-103`; `thread/chatThreadModel.ts:26-32`; `thread/chatThreadStyles.ts:308-315` | 5 dk'dan uzun arada yeni grup, 60 dk'da saat ayracı. `Intl` ile yerel saat biçimi, 11 pt, kontrast ≥4.5:1. |
| CHT-12 | P2 | M/S | Eski mesajlar yalnızca butonla yükleniyor ve buton hep görünüyor. Yüklenince tüm satırlar yeniden render oluyor. | `ChatThreadScreen.tsx:309-317`; `thread/chatThreadModel.ts:163` | `onEndReached` + footer'da spinner, `hasMore`. Karşılaştırmadan `chronologicalIndex` çıkarılmalı. |
| CHT-13 | P2 | L/S | Davet butonuna basınca tüm mesaj satırları yeniden render oluyor. | `ChatTimelineRow.tsx:46,89-92`; `ChatThreadScreen.tsx:207` | Yalnızca davet satırlarına `isInviteBusy` geçilmeli. |
| CHT-14 | P2 | M/S | "Bildir ve gizle"de ✓ adımı hiç görünmüyor, sohbet anında kapanıyor. "Gizle" tek dokunuşla onaysız çalışıyor. Sebep seçimi Medium titreşim veriyor. | `components/ReportModal.tsx:79,146,169-174,276-290`; `navigation/blockedPartnerChatExit.ts:87` | Sıra: ✓ 600 ms → sheet kapanır → engelleme + navigasyon. "Gizle" için onay sorulmalı. Seçimde `hapticSelection`. |
| CHT-15 | P2 | M/S | Ev ikonu tek dokunuşla oda daveti gönderiyor; kapalıysa ağır bir Alert açılıyor. Davet kartı durum değişince hareketsiz; label'ı erişilemez. "Eşleşmeyi gör" koda gömülü. | `thread/useChatRoomInviteActions.ts:72-78`; `ChatRoomInviteCard.tsx:29-32`; `thread/ChatThreadHeader.tsx:56,61` | Küçük bir onay popover'ı. Kapalıysa bilgi toast'ı. Kabulde crossfade + `hapticSuccess`. Metin copy dosyasına taşınmalı. |
| CHT-16 | P2 | L/S | Bağlantı banner'ı sohbet başlığındaki isim ve avatarı örtüyor. | `features/realtime/connectionBanner/ConnectionBanner.tsx:65` | Sohbetteyken başlığın altında "Bağlanıyor…" alt yazısı gösterilmeli; bekleyen balonlarda "bağlantı bekleniyor". |
| CHT-17 | P2 | L/S | `IncomingInviteCallout` tamamen İngilizce (yalnızca emekli lobi, production dışı). | `components/IncomingInviteCallout.tsx:37-71` | Emekli lobiyle birlikte kaldırılmalı. |

**Sunucu/ürün işi gerektirenler:**
- Okundu bilgisi partnere gitmiyor (`apps/server/src/realtime/realtimeFanout.ts:101-103`).
- "Yazıyor…" göstergesi yok; `chat_typing` yalnızca bir isim olarak duruyor.
- Klavyenin parmağı izlemesi `react-native-keyboard-controller` gerektiriyor: native bağımlılık, sahip kararı.

**"Vay" fikirleri:**
- Gönderilen balon composer'dan yukarı uçup spring ile oturur (iMessage gibi).
- "Yazıyor…" göstergesi olarak partnerin chibi başı hafifçe sallanır.
- Boş sohbette iki chibi yan yana, altında 3 buz kırıcı chip.
- Çift dokunuşla kalp.
- Partnerin chibi başıyla iOS tarzı üst banner.

**Zaten çok iyi olanlar:**
- Idempotent `clientMessageId` ile optimistic gönderme.
- Saf modeller + testler.
- Balon erişilebilirliği.
- Toast reducer'ı.
- ConnectionBanner'ın 3 sn tolerans süresi.
- Gelen kutusu iskeleti.
- Engelleme sonrası sohbetten çıkış.

---

## 4. Oda, oda editörü, MiniRoom, avatar (ROOM)

| ID | P | Etki/Efor | Kullanıcı ne görüyor | Kanıt | Çözüm |
|---|---|---|---|---|---|
| ROOM-01 | P1 | H/S | My Room'da avatara dokununca el sallama → dans → yürüme zinciri **hiç çalışmıyor**. Dokunuş zemine düşüyor, avatar ya küçük bir adım atıyor ya da "zaten buradasın" diyor. | `roomV2/components/RoomRenderer2D.tsx:196,499-502`; `screens/MyRoomScreen.tsx:661-678` | Interact modunda avatara da `onItemTap` verilmeli. Tap, `LiveAvatarFrame`'in **içinde** (`Pressable` ya da `Gesture.Tap`) yakalanmalı; dışına sarılırsa UI-thread yürüyüşü bozulur. Regresyon testi eklenmeli. |
| ROOM-02 | P1 | H/S | Yürürken ayaklar kayıyor ve hız her segmentte değişiyor: köşelerde durup fırlıyor, kısa yürüyüşler yavaş, uzunlar koşar adım. | `roomWorldRuntime.ts:23-27,516-519`; `myRoomAvatarWalkModel.ts:15`; `useMyRoomAvatarWalk.ts:63-78`; `miniRoomAvatarPositions.ts:22,56` | Sabit hız: `süre = mesafe / hız` (üst sınır ~1,8 sn). Ara segmentler linear, ilk segment ease-in, son segment ease-out. Model testleri güncellenmeli. |
| ROOM-03 | P1 | H/S | Arka duvara yürüyen avatar ~%16 saydamlaşıyor, "hayalet" gibi görünüyor. | `RoomRenderer2D.tsx:628`; `AvatarLayer.tsx:303,431`; `avatarRoomSelectors.ts:612-622` | Opacity düşüşü kaldırılmalı; yalnızca 0.96 scale kalmalı. Gerçek arka-yüz yürüyüşü için Workbench'te yeni çizim gerekir. |
| ROOM-04 | P1 | H/S | MiniRoom'da oturan avatar dikeyde ~%14 **basılıyor**. Bu, kilitli chibi oranlarını bozuyor. | `miniRoom/AvatarLayer.tsx:435`; `miniRoomAvatarMotion.ts:29-38`; `roomRendererAvatarMotionStyle.ts:55` | `scaleY 0.86` yalnızca idle fallback'te uygulanmalı; gerçek oturma katmanlarında 1 olmalı. Test eklenmeli. |
| ROOM-05 | P1 | H/M | MiniRoom'da avatarlar hep eşyaların üstünde çiziliyor: koltuğun arkasından yürürken önde görünüyor, oturunca koltuğun "içinde" değil üstünde. My Room'da bu doğru çalışıyor ("tek dünya modeli" kuralına aykırı). | `MiniRoomScene.tsx:421-427`; `MiniRoomRoomDecorLayer.tsx:19-25` | İki avatar da aynı `RoomRenderer2D` içine derinlik sıralı eklenmeli (My Room'daki gibi). Baloncuklar ve isimler overlay'de kalmalı. |
| ROOM-06 | P1 | M/M | MiniRoom yürüyüşünde takılma riski: her karede `left/top/zIndex` animasyonu Fabric'te layout tetikliyor. | `AvatarLayer.tsx:340-345` | `left/top` sıfırda sabitlenmeli; `translateX/Y` animasyonu kullanılmalı. zIndex yalnızca derinlik sırası değişince güncellenmeli. ROOM-05 bunu da çözer. Cihazda ölçülmeli. |
| ROOM-07 | P1 | H/M | Partnerin gerçek varlığı yansımıyor: ilk kareden spawn noktasında duruyor. "Katıldı" nabzı ve titreşimi senin bağlanmana bağlı. Partner senin yürüdüğünü görmüyor. | `MiniRoomScene.tsx:186,238-260`; `miniRoomSceneStore.ts:105-129` | **Sahip kararı + sunucu:** realtime contract'a presence ve konum olayları eklenmeli. O zamana kadar partner kapıda saydam başlamalı, gerçekten katılınca yürüyerek girmeli (nabız + hafif titreşim). |
| ROOM-08 | P1 | H/S | MiniRoom'daki sol üst "←" normal bir geri tuşu gibi görünüyor ama onaysız şekilde odadan çıkarıp Debrief'e götürüyor. Yanlışlıkla dokunuş randevuyu bitiriyor. | `MiniRoomHud.tsx:64-70`; `MiniRoomScreen.tsx:279-302` | "Odadan çık?" onayı sorulmalı ya da ikon "exit" olarak değiştirilmeli. |
| ROOM-09 | P1 | H/M | Partner daveti kabul edince, gönderen nerede olursa olsun (mağaza, yazma ortası) 240 ms düz fade ile odaya çekiliyor. "Kapı açılıyor" anı yok. | `globalRealtimeEventHandler.ts:88-90`; `useRoomInviteRouting.ts:65`; `RootNavigator.tsx:724-726` | Sohbette değilse "Ayşe odada · Katıl" banner'ı gösterilmeli; sohbetteyse kapı geçişi. MiniRoom `animation:"none"` olmalı ki çift fade olmasın. |
| ROOM-10 | P1 | H/M | Editörde bırakınca parça hücreye zıplıyor, yerine oturma hissi yok. Geçerli/geçersiz sınırında tık yok. Her bırakış "success" titreşimi veriyor (yorucu). Kaldırılan parça %82 opak ve gölgesiz. | `useRoomEditorDragGestures.ts:271-295`; `useRoomEditorPlacementGestures.ts:96`; `roomEditorDragModel.ts:33` | Ghost bırakınca hedef hücreye spring ile gitmeli, sonra gizlenmeli. Geçerlilik değişince `hapticSelection`, bırakışta `hapticLight`. Ghost 1.0 opak, altında küçülen bir temas gölgesi. |
| ROOM-11 | P2 | M/S | My Room'da avatarın zemin gölgesi yok, havada süzülüyor gibi (MiniRoom'da var). | `RoomRenderer2D.tsx:911-925` (stil tanımlı ama kullanılmıyor) | Mevcut stil render edilmeli; yürürken daralmalı. |
| ROOM-12 | P2 | M/S | Editörde zoom butonu ve geri al anında zıplıyor; eklenen/silinen parça bir anda çıkıyor/kayboluyor. | `MyRoomEditorScreen.tsx:214`; `RoomEditorStage.tsx:49` | `LinearTransition.springify()` kullanılmalı. Yeni parçalar `ZoomIn.springify()` ile girip `FadeOut` ile çıkmalı. |
| ROOM-13 | P2 | M/S | İki odada farklı dokunma işaretleri var (mint nabız / statik **eski pembe** halka). Geri bildirim pill'i ani çıkıyor; VoiceOver duymuyor. | `RoomRenderer2D.tsx:818-848`; `MiniRoomRoomDecorLayer.tsx:61-70`; `MyRoomScreen.tsx:800-807,1047-1061` | Tek ortak işaret bileşeni (`#F65C9D`) + ripple. Pill `FadeIn`/`FadeOut` ile + `announceForAccessibility`. |
| ROOM-14 | P2 | M/S | Türkçe cihazda VoiceOver metinleri İngilizce ("Sit on…", "Room avatar"). Kilitli tepsi kartı dokunuşa ölü. | `RoomRenderer2D.tsx:525-534`; `InventoryCatalogCard.tsx:47-50` | Metinler `myRoomCopy`'ye taşınmalı. Kilitli kart: sallanma + `hapticError` + "Mağazada gör". |
| ROOM-15 | P2 | M/M | MiniRoom'da klavye açılınca oda kamerası `LayoutAnimation` ile tümden yeniden boyutlanıyor. Baloncuklar 4 sn sonra ani kayboluyor. Geçmiş satırlarında giriş animasyonu yok. | `useMiniRoomKeyboard.ts:36-41`; `MiniRoomScene.tsx:417`; `AvatarLayer.tsx:365`; `MiniRoomChatHistory.tsx:58-70` | Kamera Reanimated `scale/translateY` ile hareket etmeli. Baloncuklar 180 ms fade. Satır girişlerinde `useChatTimelineEntrances` deseni. |
| ROOM-16 | P2 | M/M | Oda ilk açılırken ya da ilk yürüyüşte katmanlar tek tek beliriyor; perde veri gelince açılıyor, pikseller hazır olunca değil. | `MyRoomScreen.tsx:777-791`; `RoomRenderer2D.tsx:152-159`; `RoomAvatarRenderer2D.tsx:126-131` | Perde kabuk ve slot-0 `onDisplay` sonrası açılmalı (600 ms timeout). Yürüme karelerinin ön-mount'u cihazda bellek ölçümünden sonra karara bağlanmalı. |
| ROOM-17 | P2 | L/S | MiniRoom'da yan yürüdükten sonra dururken avatar 2° eğik kalıyor. Başlıkta yalnızca "Match room" yazıyor, partnerin adı yok. | `AvatarLayer.tsx:302,322`; `MiniRoomHud.tsx:72-80`; `miniRoomCopy.ts:58` | Eğim yalnızca yürürken olmalı. Başlık "Sen & Ayşe" + presence noktası. |

**"Vay" fikirleri:**
- "Kapı açılıyor": davet kartı tam ekrana büyür, oda belirir, partner kapıdan yürüyerek girer.
- İki avatar yaklaşınca birbirine döner ve parıltı çıkar.
- Kayıttan sonra yeni parçalar sırayla "düşer", avatar en yeni koltuğa oturur.
- Avatara dokununca el sallar ve küçük bir kalp çıkar.
- Editörde Apple kalitesinde kaldırma: gölge, ayak izi parlaması, oturma spring'i.

**Zaten çok iyi olanlar:**
- UI-thread yürüyüş ve derinlik worklet'i.
- Ortak avatar kare saati ve piksel hizası koruması.
- Editörde `Pan` + ghost.
- Swipe-back koruması.
- MiniRoom klavye modeli.
- Reduce Motion politikaları.

---

## 5. Uygulama kabuğu, mağaza, gardırop, tasarım sistemi (SYS / SHOP / WRD)

| ID | P | Etki/Efor | Kullanıcı ne görüyor | Kanıt | Çözüm |
|---|---|---|---|---|---|
| SYS-1 | P1 | H/S | Gardırop hâlâ fade ile açılıp kayarak kapanıyor (NAV-1 bu ekranda kalmış). | `RootNavigator.tsx:783-787`; `rootNavigationModel.ts:14-20` | `options={detailScreenOptions}` + model testi. |
| SYS-2 | P1 | H/M | Alt bara dokununca sayfa ve pill, 4 sayfa JS'te yeniden render olana kadar yer değiştirmiyor; JS meşgulse sekme gecikiyor. | `MainTabPager.tsx:291-345,490`; `mainTabPagerModel.ts:200-251`; `RootNavigator.tsx:710`; `renderMainTabPage.tsx:37` | UI thread'de optimistic snap. Sayfalara `isSelected: boolean` geçilmeli. `renderPage` `useCallback` + actor ref. Sayfa kökleri `memo`. Profiler ile önce/sonra ölçümü. |
| SYS-3 | P1 | M/S | Her okunmamış sayı ya da bağlantı değişiminde root, 4 sayfa ve push edilmiş ekranlar yeniden render oluyor. | `RootNavigator.tsx:312-313,334,716,1090` | Okunmamış sayısı `MainTabBottomBar` içinde, `useGlobalRealtime` `ConnectionBanner` içinde okunmalı. |
| SYS-4 | P1 | H/M | Filtre ve Şikayet sheet'lerinde karartma sheet'le birlikte alttan "perde" gibi kayıyor; X veya dışarı dokunuşla kapanırken de öyle. | `DiscoverFiltersBottomSheet.tsx:105-114`; `ReportModal.tsx:203-216`; `ui/SwipeDismissSheet.tsx:204-220` | `Modal animationType="none"`. Giriş ve çıkışı `SwipeDismissSheet` spring ile yönetmeli; backdrop yalnızca opacity. Reduce Motion'da crossfade. |
| SYS-5 | P2 | M/S | Filtrelerde grabber yok; kapanış 180 ms sabit ve hızdan bağımsız; yukarı çekince sert duruyor; stepper 32 pt; eski pembe literal. | `ReportModal.tsx:219,386-394`; `SwipeDismissSheet.tsx:161-169`; `sheetDismissModel.ts:46-56`; `DiscoverFiltersBottomSheet.tsx:418,469-476,501` | Grabber `SwipeDismissSheet` içine alınmalı. Hıza bağlı spring çıkış, rubber-band, `hitSlop`, renk token'dan. |
| SYS-6 | P1 | M/S | Büyük yazı boyutunda alt bar etiketi ve rozeti taşıp kırpılıyor. VoiceOver okunmamış sayıyı okumuyor. | `ui/bottomNav.tsx:245-248,282-287,487-535` | `maxFontSizeMultiplier={1.2}`. Sohbet sekmesine `accessibilityValue` ile okunmamış sayısı. |
| SYS-7 | P1 | M/M | Reduce Transparency yalnızca Gardırop'ta uygulanıyor. Gardırop ilk açılışta opaktan cama "flash" yapıyor. | `WardrobeGlass.tsx`; `bottomNav.tsx:405-417`; `ui/glass.tsx:169-180`; `reduceTransparencyStore.ts:52-59` | Reduce Motion ve Transparency store'ları uygulama kökünde başlatılmalı. `getGlassSurfaceStyle(reduceTransparency)` her cam yüzeyde kullanılmalı. |
| SYS-8 | P2 | M/S | Basış hisleri tutarsız (0.965 spring / 0.97 timing / ani / sadece opacity). Yeni spring token'ları neredeyse hiç kullanılmıyor. | `primitives.tsx:36-56`; `bottomNav.tsx:204-230`; `shopScreenStyles.ts:68-70,261-264`; `glass.tsx:246-249` | Tek bir `PressableScale` (GH Tap + `springSnappy`). `springCritical` token'ı. İsim çakışması (`springGentle`) giderilmeli. |
| SYS-9 | P2 | L/S | MatchResult halo'su nabızlardan sonra %90 boyutta kalıyor. | `ui/animations.ts:208-224`; `MatchResultScreen.tsx:79-84` | Dinlenme değeri 1 olmalı. |
| SYS-10 | P2 | L/S | Mağaza arka planı hiçbir view'a bağlı olmayan sonsuz bir 16 sn döngü çalıştırıyor. | `ui/backgrounds.tsx:88-160` | `variantUsesBlobs` koşulu (MQ-2 odak kapısıyla birlikte). |
| SYS-11 | P2 | L/S | Türkçe cihazda günlük ödül toast'u İngilizce. | `RootNavigator.tsx:444-457` | Metin copy dosyasına taşınmalı. |
| SYS-12 | P2 | M/S | Titreşim haritası kaymış: seçimlerde `impactLight` var. Gardıropta her ürün iki titreşim veriyor. "Bitti" değişiklik yokken de success veriyor. | `CosmeticShopScreen.tsx:269,277`; `useShopPreviewSelection.ts:79-84`; `WardrobeV2Screen.tsx:100-107`; `useWardrobeTryOn.ts:135,182`; `useWardrobeDone.ts:41-43` | Seçimlerde `hapticSelection`, giyince tek tık. Success yalnızca gerçek kayıtta. `haptics.ts` haritası güncellenmeli. |
| SHOP-1 | P1 | H/M | "Görünümü satın al" N parça için art arda N tane sistem `Alert`'i açıyor. | `useShopPurchaseActions.ts:96-120`; `confirmAvatarShopPurchase.ts:23-45`; `shopCombinationState.ts:193-236` | Tek bir checkout sheet'i: avatar görünümü giymiş, ürün satırları, toplam. Tek onay; sunucu yine parça parça satın alır, satırlara ✓ düşer, sonda tek `hapticSuccess`. Ekonomi sunucuda kalır. |
| SHOP-2 | P1 | M/S | Mağaza sekmesine tekrar dokunmak varsayılan düzende hiçbir şey yapmıyor. | `CosmeticShopScreen.tsx:316`; `useShopScrollToTop.ts:9-13` | `ClosetBrowser`'da `useMainTabReselect("shop")` → `scrollToOffset(0)` + `setPageIndex(0)`. |
| SHOP-3 | P2 | M/S | Ürün kartında basış ve seçim animasyonsuz "atlıyor"; göz rozeti aniden beliriyor. | `ShopProductCard.tsx:102-137`; `shopScreenStyles.ts:257-264` | `PressableScale`, seçim halkası 150 ms opacity, rozet `springSnappy` ile. |
| SHOP-4 | P2 | L/S | Raf sayacı ("1/3") momentum bitene kadar gecikiyor; "Sende" koda gömülü. | `ClosetBrowser.tsx:194-197`; `ShopProductCard.tsx:77` | Sayaç `useAnimatedReaction` ile scroll offset'ten türetilmeli. Metin copy dosyasına. |
| SHOP-5 | P2 | M/S | Yüklenirken spinner kartı görünüyor, sonra raf aniden geliyor. | `ShopNavigationControls.tsx:62-70` | Raf iskeleti + 160 ms crossfade. |
| WRD-1 | P1 | M/S | Kategori değişince yeni ürünler bir kare görünüyor, yanıp sönüyor, sonra fade ediliyor. | `useWardrobeCategoryMotion.ts:14-26` | `useLayoutEffect` ya da keyed `entering={FadeIn.duration(180)}`. |
| WRD-2 | P2 | M/S | Her sayfa kaydırmada küçük resimler 120 ms fade ile "geç yükleniyor" gibi görünüyor. | `WardrobeCatalogList.tsx:78`; `WardrobeCatalogCard.tsx:62` | `transition={0}` (Mağaza gibi). |
| WRD-3 | P2 | M/M | Bölüm ve kategori seçimi kayan gösterge olmadan anında değişiyor; VoiceOver "düğme" diyor; sayfa noktaları gecikiyor. | `WardrobeSectionSwitcher.tsx:21-28`; `WardrobeCategoryTabs.tsx:26-33`; `WardrobeCatalogList.tsx:103-105` | Kayan kapsül (`springSnappy`), `tab`/`tablist` rolleri, noktalar scroll offset'ten canlı. |
| WRD-4 | P2 | M/S | Cam panelin bulanıklığı hiç görünmüyor ama maliyeti ödeniyor. "Opsiyonel blur" koruması çalışmıyor. | `WardrobeGlass.tsx:25-51`; `wardrobeV2Styles.ts:20`; `optionalBlurView.ts:17-24` | Cam dalında opak renk kaldırılmalı (alfa ~0.7) ya da blur tümden kaldırılmalı. Statik import. |
| WRD-5 | P2 | L/S | Gardıropta geri ikonu `arrow-back` (diğer ekranlarda chevron). Kilitli karta dokunuş ölü. | `WardrobeTopBar.tsx:32`; `WardrobeCatalogCard.tsx:93` | Chevron kullanılmalı. Kilitli kart maddesi (`OPEN_UX_WORK` #1) uygulanmalı. |

### aeb968a tema/animasyon denetimi (madde 8)

**Kasıtlı ve doğru:**
- `primary` `#FF4F98` → `#F65C9D`.
- Gradient'ler ve glow gölgeleri de buna uyumlu güncellenmiş.

**Eksik kalanlar:**
- `accentGlow`, `accentGlowStrong` ve `avatarPreviewGlow` hâlâ eski pembe (`theme.ts:63-65`).
- 12 dosyada 20 eski pembe literal var. Örnekler: `toast.tsx:102,104`, `shopScreenStyles.ts:161,325`, `DiscoverFiltersBottomSheet.tsx:418,501`, `MatchResultScreen.tsx:160`, MiniRoom katmanları.
- `primaryPressed #E24486` hâlâ eski pembeden türetilmiş.
- `brandPink #F45A9F` yeni primary'ye neredeyse eş; ikisi birleştirilmeli.

**Token olmayan davranış değişiklikleri:**
- `useEntranceAnimation` varsayılanları değişti: 500→350 ms ve translateY 24→20. Etkilenen yerler: `InboxScreen.tsx:251`, `MatchResultScreen.tsx:76,85`.
- `useStaggeredEntrance` artık ölü kod.
- `usePulse` sınırlı modda kalıcı küçülme bırakıyor (SYS-9).

Başka beklenmedik renk değişikliği yok.

**"Vay" fikirleri:**
- Tek sheet'te "görünümü satın al": ürün satırlarına sırayla ✓ düşer, coin geri sayar.
- Coin uçuşu: fiyattan coin pill'ine 3–5 elmas yay çizerek gider.
- "Sıvı" alt bar pill'i: iki sekme arasında esneyerek uzar (iOS 26 hissi).
- Try-on parıltısı: eski görünüm crossfade ile silinir, avatar hafifçe "nefes alır".
- Sheet açılınca arkadaki ekran 0.94 ölçekte geri çekilir.

**Zaten çok iyi olanlar:**
- `MainTabPager`: UI-thread sürükleme, velocity projeksiyonu, epoch ile yakalama, sayfa başına hata sınırı.
- `makeMutable` ile alt bar göstergesi.
- `SwipeDismissSheet` jesti.
- Mağaza coin sayacı.
- Gardırop try-on durum makinesi.
