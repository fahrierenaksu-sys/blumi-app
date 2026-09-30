# Blumi — Backend, gerçek zamanlı ve push işleri (Codex görev dosyası, 2026-09-30)

**Bu dosya kendi başına okunabilir.** Önceki konuşmayı bilmen gerekmez.

**Kaynak:** `develop` @ `9982882` (= `main`). Üç ayrı kod incelemesi yapıldı (yalnızca okuma, hiçbir dosya ya da veri değişmedi). Kanıtlar `dosya:satır` olarak yazıldı. "DOĞRULANMADI" yazan yerler koddan kanıtlanamadı.

**Sahibin bildirdiği sorunlar (canlıda gördüğü):**
1. Eşleşme odasında bir kişinin avatarı hareket edince diğer kişi görmüyor.
2. Odada mesajlar geç gidiyor.
3. Sohbette tek tik / çift tik ve "görüldü" yok; mesajlar geç geliyor.
4. Push bildirimi telefona hiç gelmiyor.

**Ürün önceliği:** Eşleşme odası (MiniRoom) ürünün en güçlü yeri olmalı.

---

## 0. Başlamadan önce (kurallar, atlanmamalı)

1. `AGENTS.md` ve `docs/quality/ENGINEERING_RULES.md` okunmalı. Bağlayıcı kurallar:
   - Hareket UI thread'de (Reanimated shared value) çalışır, karede React state yok.
   - Reduce Motion yalnızca `ui/animations.ts` store'undan okunur.
   - Yeni runtime ya da native bağımlılık eklenmez.
   - Gizlilik: mesaj metni, telefon numarası ya da özel içerik log'a, analitiğe, push gövdesine yazılmaz.
2. **Veritabanına dokunma kuralı.**
   - Canlı veritabanı gerçek veri sayılır. 18 test hesabı korunur.
   - Railway `DATABASE_URL` okunmaz.
   - Migration yalnızca **yazılır**. Sahibin açık onayı, yedek ve geri yükleme kanıtı olmadan **uygulanmaz**.
   - Mevcut migration'lar checksum'lı ve uygulanmış: `032` iki dosya, `044` yok, `068` ve `069` uygulandı. **Hiçbirini yeniden adlandırma ya da numaralandırma.** Sıradaki numara `070`.
3. Canlı sunucuya dağıtım (deploy), Railway değişkeni değiştirme, gerçek kullanıcıya push gönderme **yapılmaz**. `main`'e push Railway'de otomatik deploy tetikler; `main`'e yalnızca sahibin açık izniyle birleştirilir. Çalışma `develop` üzerinde yapılır.
4. Her iş: önce başarısız test, sonra dar düzeltme, sonra `npm run typecheck`, `npm run lint` ve ilgili testler. Sunucu testleri: `npm --workspace @blumi/server run test`. Mobil testleri: `npm --workspace @blumi/mobile run test:<grup>`. PostgreSQL kapısı (`npm run verify:postgres`) PostgreSQL binary'lerine ihtiyaç duyar ve root olarak `initdb` çalıştırmaz.
5. Commit: `<type>: <description>` biçimi; `git add` ile tek tek dosya seçilir (`git add .` yok).
6. Dürüst etiketler: "Implemented / Tested / Native verified / Production ready" karıştırılmaz. Hiçbir madde telefonda doğrulanmadı.

---

## 1. Push bildirimleri (öncelik 1: diğer işlerin çoğu buna bağlı)

**Sonuç:** Kod zinciri uçtan uca var, sunucu tarafı yapılandırılmış görünüyor. En olası kırılma noktası istemcide.

### P-01 (Yüksek, kesin kod bulgusu): İzin hiç istenmiyor, token üretilmiyor
- `apps/mobile/src/features/notifications/usePushRegistration.ts:244` açılışta `sync(false)` çağırıyor: yani izin istemi kapalı.
- `pushRegistrationCoordinator.ts:54-56`: izin durumu `undetermined` ve istem kapalıysa `permission-not-requested` ile çıkılıyor. `getExpoPushToken` ve `registerDevice` hiç çalışmıyor.
- `requestPermissionsAsync` tüm mobil kodda yalnızca `usePushRegistration.ts:195`'te. O yola yalnızca `RootNavigator.tsx:874` → `SettingsScreen` → `useNotificationSettings.ts:88` zinciriyle Ayarlar'daki "Enable notifications" satırından ulaşılıyor (`SettingsNotificationsSection.tsx:35`: satır yalnızca izin `granted` değilse görünür).
- Onboarding, eşleşme ya da ilk mesajda izin istemi yok.
- **Canlı kanıt:** Railway HTTP günlüklerinde (2026-09-30 03:28–21:22 UTC) iPhone'lardan (`Blumi/13 CFNetwork`) `PUT /v1/notification-preferences` 200 var (saat dilimi senkronu, izin gerektirmez). iPhone kaynaklı **hiç `POST /v1/devices` yok**. Yalnızca 2 kayıt var, ikisi `clientUa: node`, 401. Günlük saklama süresi sınırlı, yani sonuç "son ~18 saatte olmadı".

**Yapılacak (kod):**
1. Ana ekrana ulaşıldıktan sonra uygun bir anda (öneri: ilk eşleşme ya da ilk sohbet mesajından sonra) bağlamlı bir ön açıklama kartıyla `sync(true)` çağır, sonra iOS sistem istemini göster. Kart metni TR/EN; chibi görselleri mevcut varlıklardan.
2. `AppState` `active` olduğunda `sync(false)` çalıştır: iOS Ayarları'ndan sonradan verilen izin yakalansın. Şu an kayıt yalnızca oturum ya da token değişince çalışıyor (`:281` efekt bağımlılıkları, `:245` token dinleyicisi).
3. `registerDevice` hatasında sınırlı yeniden deneme (üstel geri çekilme) ekle. Şu an hata yalnızca Sentry'ye gidiyor (`:229`).
4. Testler: `pushRegistrationCoordinator.test.ts` genişletilsin (istem kapalı/açık, foreground'da yeniden senkron, hata sonrası yeniden deneme).

### P-02 (Orta, DOĞRULANAMADI): APNs anahtarı Expo'da yüklü mü?
- Token tipi Expo push token (`usePushRegistration.ts:204`). Expo'nun iOS'a iletebilmesi için EAS projesine (`bc61197e-e1cb-478b-9f1d-61d8582d77c8`) APNs anahtarı yüklenmiş olmalı. Bu bilgi repoda yok.
- Belgeler bunu açık bırakıyor: `LAUNCH_CONTROL.md:101`, `:155`, `APP_STORE_SUBMISSION_GATE.md:12,:51`.
- **Sahibin işi (kod değil):** EAS Dashboard → Credentials → iOS → `com.blumi.mobile` altında **Push Key** var mı? Yoksa `eas credentials` ile yüklenir.
- Doğrulanan yapılandırma: `app.json:43` (`expo-notifications` eklentisi), `:57-62` (`aps-environment: production`, `UIBackgroundModes: [fetch, remote-notification]`), `:88` (`extra.eas.projectId`). Geliştirme build'inde push bilinçli kapalı (`notificationRuntimePolicy.ts:12`).

### P-03 (Orta): Sunucu "çevrimiçi" sayarak push'u atlıyor
- Mesaj (`chatMessageDeliveryService.ts:132-140`), oda daveti (`threadRoutes.ts:477`) ve realtime daveti (`realtimeRouter.ts:516`): alıcının aktif realtime bağlantısı varsa push gitmiyor (`connectionManager.ts:150`).
- İstemci arka plana geçince soketi kapatıyor (`realtimeAppLifecycle.ts`, `globalRealtimeProvider.ts:94-103`). Ama sunucu ölü soketi yalnızca 30 sn'lik ping döngüsüyle temizliyor (`realtimeServer.ts:39,381-397`). Bu pencerede atılan mesajlarda push gitmiyor ve outbox yine tamamlanıyor (yeniden deneme yok).
- **Yapılacak:** Teslim onayı (ack) gelmezse gecikmeli push; ya da "son ön plan etkinliği / arka plana geçti bildirimi" ile kısa tolerans. Ürün kararı gerektiriyor.
- Eşleşme push'u (`matchService.ts:353-365`) bağlantı kontrolü yapmıyor: APNs zincirini en doğrudan sınayan yol budur.

### P-04 (Orta): Saatlik push sınırı ve sessiz saatler
- Varsayılanlar: `max_pushes_per_hour = 6`, tüm bildirim türleri toplam sayılıyor, sınır aşılınca `frequency_cap` ile **sessizce** düşüyor (`036_notification_preferences_policy.sql:5-12`, `postgresNotificationRepository.ts:313-332`, `notificationRepository.ts:150-157`). Sessiz saatler de düşürüyor.
- `chat.room_invite` için politika yok (`notificationService.ts:317-334`, `default: return null`), doğrudan kuyruğa alınıyor.
- **Sahip kararı:** Sohbet push'u saatlik sınırdan muaf olsun mu? Öneri: evet, mesaj ve eşleşme için ayrı, daha yüksek bütçe.

### P-05 (Düşük): Sağlayıcı hataları sessiz
- `PushProviderRejection` ve receipt hataları yalnızca DB'de hata kodu olarak duruyor (`notificationService.ts:197-218,240-243`). Yalnızca `DeviceNotRegistered` cihazı siliyor; `InvalidCredentials` ya da `MismatchSenderId` yalnızca kaydediliyor, günlük ya da uyarı yok.
- Canlı günlükte bir satır: `Notification worker failed ServiceError`, 2026-09-30 12:20 UTC, bir kez; neden belli değil (içerik yazılmıyor).
- **Yapılacak:** PII içermeyen güvenli uyarı günlüğü: hata kodu, bildirim türü, sayaç. Mesaj metni, token ya da kullanıcı kimliği yazılmaz.

### Gizlilik (uyumlu)
- Push gövdesinde içerik yok: "Blumi" / "You have a new message." (`notificationService.ts:370-378`). Eşleşme ve beğeni metinleri kişi adı içermiyor. Tehdit modeli B6 "payload PII review" satırı açık.

### Sahibin iki telefonla test prosedürü
1. Her iki telefonda uygulamada Ayarlar → Bildirimler → "Enable notifications" → izin ver. iPhone Ayarları → Bildirimler → Blumi satırı görünmeli. Sunucu günlüklerinde iPhone kaynaklı `POST /v1/devices` 201 görülmeli.
2. İki uygulamayı da tamamen kapat, 60 sn bekle.
3. **Eşleşme testi** (bağlantı kontrolü yok): yeni bir eşleşme oluştur. İki tarafa "It's a match!" gelmeli.
4. **Mesaj testi:** A uygulamayı kapattıktan 60 sn sonra B mesaj göndersin. Gelmezse ama eşleşme geliyorsa sorun P-03.
5. **Oda daveti:** aynı koşulda B davet göndersin.
6. Bildirime dokun: ilgili sohbet açılmalı.
7. Hiçbiri gelmezse: EAS Push Key (P-02), Expo receipt hataları, `Notification worker failed` satırları.
Sonucu `LAUNCH_CONTROL.md` REL-13 kanıtı olarak kaydet.

---

## 2. Eşleşme odası: hareket senkronu ve mesaj gecikmesi

### RT-01 (Yüksek): Avatar hareketi partnere **hiç gitmiyor** (eksik özellik, hata değil)
Dört katmanın hiçbirinde hareket olayı yok:

| Katman | Durum | Kanıt |
|---|---|---|
| Contract | Yalnızca `presence.move_to_spot` var; payload `{roomId, spotId}` ve lobi noktasına ait. Konum/hedef/gesture olayı yok. | `packages/contracts/src/realtime/ClientEvents.ts`, `presence/MoveToSpotCommand.ts` |
| İstemci gönderme | MiniRoom hiçbir şey göndermiyor. `handleRoomPress` yalnızca yerel `moveLocalAvatar` çağırıyor. | `MiniRoomScene.tsx:~265-275`, `miniRoomSceneStore.ts:271-503` |
| Sunucu | `presence.move_to_spot` handler'ı var (`realtimeRouter.ts:221`) ama `canUsePresenceRoom` deny-all döner (`PRESENCE_ROOM_UNAVAILABLE`, `realtimePresencePolicy.ts:37-42`). Lobi bilinçli kapatıldı (`ServerEvents.ts:66` yorumu, sahip kararı 2026-09-30). | — |
| İstemci alma | Partner avatarı `createInitialAvatars` ile spawn noktasında (0.62, 0.74) yaratılıyor; uzak olay uygulayan yol yok. | `miniRoomSceneStore.ts:105-129,192-203` |

- Ek: `runMovement` çarpışmada `createMiniRoomOccupants(currentAvatars)` kullanıyor (`miniRoomSceneStore.ts:282`): yerel kullanıcı spawn'da donmuş "hayalet" partnerin etrafından dolaşıyor (RT-02).
- Yürüme alanı (`roomWorldGeometry.ts`) yalnızca mobilde; `packages/domain`'de yok.

### RT-03 (Orta): Partner "odada" bilgisi yanlış
- Sunucuda "odadaki kişi" kavramı yok. `POST /v1/room-sessions/:id/join` yalnızca üyelik ve engel kontrolü yapıp snapshot döndürüyor (`threadRoutes.ts:502-553`), partnere bildirim göndermiyor. İstemci bu HTTP çağrısını yalnızca yeniden bağlanmada yapıyor (`MiniRoomScreen.tsx:~198-215`).
- "Partner katıldı" nabzı ve titreşimi **yerel** `connectionStatus === "connected"`'a bağlı (`MiniRoomScene.tsx:186,253-260,384`).
- Arka planda istemci soketi anında kapatıyor; partner hâlâ odada görünüyor. Sunucu ölü soketi 30–60 sn fark etmiyor.

### Hareket senkronu için minimal tasarım
**Migration gerekmez** (konum bellekte, kalıcı değil).

**Sahip kararları:** (1) Sunucu yürüme alanı geometrisini doğrulasın mı, yoksa [0,1] sıkıştırma (clamp) yeterli mi? (2) `RoomWorld` geometrisi `packages/domain`'e taşınsın mı? (3) Yeni olay türleri eski istemcileri etkiler mi: eski istemci bilinmeyen türü sessizce düşürüyor (`ServerEventSchemas.ts:255-256`), zararsız.

1. **Contract** (`packages/contracts`):
   - `ClientEvents.ts`: `mini_room.move` `{ miniRoomId, x, y, hotspotId?, seq }`.
   - `ServerEvents.ts` + `ServerEventSchemas.ts`: `mini_room.avatar_moved` `{ miniRoomId, userId, x, y, hotspotId?, seq }` (x, y `finite` ve [0,1]); `mini_room.presence` `{ miniRoomId, userId, present }`.
   - `realtimeFanout.ts`: `SERVER_EVENT_TYPES` ve `isServerEventPayload` güncellenmeli, aksi halde çok kopyalı kurulumda düşer.
2. **Sunucu** (`realtimeRouter.ts`, yeni `miniRooms/miniRoomPositionStore.ts`):
   - Yeni `case "mini_room.move"`. Üyelik ilk olayda bir kez doğrulanıp bellekte bağlantı başına önbelleklenir (TTL ~10 sn); her harekette DB sorgusu olmaz.
   - `miniRoomId` ona ait ve oda bitmemiş; x, y sonlu ve [0,1]'e sıkıştırılır.
   - **Ayrı hız bütçesi** (örn. 5 olay/sn) ve aşımda **sessizce düşür**. Şu an ortak bütçe (60 olay/10 sn/bağlantı) aşılınca soket 4429 ile **kapanıyor** (`realtimeServer.ts:454-461`); hareket bu bütçeyi tüketmemeli (RT-08).
   - Yalnızca partnere `connectionManager.sendToUser(...)`. Yeni hareket türü `TRANSIENT_EVENT_TYPES`'a eklenmeli (`connectionManager.ts:30`) ki yavaş alıcıda düşürülsün.
   - Son konum `Map<miniRoomId, {userId → {x,y,seq}}>` içinde tutulur; bağlantı kopunca ve oda bitince temizlenir.
3. **İstemci gönderme:** kare başına değil, `runMovement` hedef seçtiğinde **bir kez** (`miniRoomSceneStore.ts`, `MiniRoomScreen.tsx`; `onLocalMove` geri çağrısı).
4. **İstemci alma:** `mini_room.avatar_moved` dinlenir; `runMovement` `runMovementFor(userId, point, options)` olarak genelleştirilir (şu an yerel kullanıcıya sabit: `input.localUser.userId`). Mevcut `createRoomWorldMovementPlan` ve UI thread yürüyüşü aynı kalır. Eski `seq` yok sayılır. Partner gerçek konumuyla çarpışma nesnesi olur (hayalet sorunu çözülür).
5. **Yeniden bağlanma:** katılma/yeniden bağlanmada son konum yeniden gönderilir; sunucu partnerin son konumunu yeni bağlanana verir. `present:false` gelirse partner yarı saydam gösterilir.

**Dosya sırası:** contracts + şema testi → `realtimeFanout.ts` tür listesi → sunucu store + router case + testler → `runMovementFor` yeniden düzenlemesi + testler → gönderim → alım + presence arayüzü.

**Eklenecek testler:** sözleşme gidiş-dönüş (`ServerEventSchemas.test.ts`); sunucuda yalnızca partner alır, üye olmayan reddedilir, sıkıştırma, hız sınırında düşürme (soket kapanmaz), biten oda, engel, çok kopyalı fanout; istemcide `seq` sırası, partner için plan üretimi, yeniden bağlanma senkronu.

### RT-04 (Yüksek, en ucuz iş): Konuşma balonu kuyruğu her mesajı 4 sn serileştiriyor
- `miniRoomSpeechQueue.ts:1,25-33`, `miniRoomSceneStore.ts:589-603`: aktif balon varken sıradaki bekletiliyor. Art arda 3 mesajda 3. balon ~8 sn geç çıkıyor. Geçmiş paneli anında güncelleniyor, yalnızca balon geç.
- **Yapılacak:** Bekleyen balonları kısalt/atla (örn. yeni mesaj gelince öncekini hemen sönümle). Test ekle (`miniRoomSceneStoreLifecycle.test.ts` desenine).

### RT-05 (Yüksek): Arka plandaki ya da ölü soketli partner mesajı geç görüyor
- Bkz. P-03. Çözüm yolu push'un çalışması (bölüm 1) ve partner bağlı değilse arayüzde "çevrimdışı" gösterme (RT-03).

### Mesaj yolu (oda içi chat), ölçülmüş değil, koddan
İstemci `sendRoomMessage` (`useInRoomChat.ts:331-366`) `chat.send_message` gönderir; optimistic balon anında, 15 sn ack zaman aşımı (`:60`). Sunucu sırası: hız sınırı → `authorizeConnection` (2 sn TTL önbellek, `realtimeAuthorizationCache.ts:14`) → `findThread`, `hasBlockBetween` (2 paralel), `sendMessageIdempotently` içinde tekrar `findThread`, `createMessage` (tek CTE: mesaj + önizleme + outbox, `postgresChatRepository.ts:180`) → gönderene ack hemen → partner teslimi ayrı (`dispatchPostPersistEffects`: `claimDeliveries`, `findThread`, `hasBlockBetween`, `sendToUsersDurably`, `pg_notify` bekleniyor, `completeDelivery`). Yaklaşık 7 ardışık sorgu dalgası; önbellek bayatsa +1.
- Tahmin (ölçülmedi): ~3 ms DB gidiş-dönüşte ~30–60 ms; ~95 ms bölgeler arası gidiş-dönüşte ~0,7–0,9 sn.
- Railway tek kopya; `Pool` `max` belirtilmemiş (varsayılan 10), LISTEN bunun 1 bağlantısını kalıcı tutuyor (`config.ts:440`, `postgresRealtimeFanout.ts:234`). Railway ve Supabase bölgeleri repoda yok: **DOĞRULANMADI**.
- Bir günlük-yoklama (polling) yolu var: `chatDeliveryWorker` her 1 sn `dispatchDue()`; yalnızca kurtarma yolu, yeniden deneme geri çekilmesi `1000·2^n` ms, en fazla 60 sn (`chatMessageDeliveryService.ts:143`).
- **RT-06 (Orta):** Mesaj başına tekrarlı sorgular: `findThread` 3×, `hasBlockBetween` 2× (`chatMessageDeliveryService.ts:69,79,123,129`, `chatService.ts:239`). Bulunan `thread` aşağıya iletilsin, satır içi dağıtımda tekrar okuma kaldırılsın.
- **RT-07 (Orta):** Bölge ve havuz boyutu kararı sahibe ait; önce ölç (RT-10).
- **RT-09 (Düşük):** Gelen mesajda `sentAt >= baseline-250ms` filtresi sunucu ile istemci saatini karşılaştırıyor (`inRoomChatThread.ts: shouldRenderIncomingRoomChatMessage`); saat kayması balonu düşürebilir. Sahada görülüp görülmediği DOĞRULANMADI. `seenRef` ve tekrar oynatma kapısıyla yetinip saat filtresi gevşetilebilir.
- **RT-10 (Orta): Gecikme ölçümü yok.** Gönderim, `createMessage`, teslim ve istemci alış zaman damgaları PII'siz (mesaj içeriği hariç) yalnızca staging'de ya da yerelde günlüğe yazılsın; iki test hesabıyla uçtan uca ölçülsün. `pg_stat_statements` yalnızca staging'de.

---

## 3. Sohbet: tek tik / çift tik / "görüldü" ve gecikme

### Bugünkü durum
- **Tek tik var** (`ChatTimelineRow.tsx:148`, sabit kodlu `#C4537C`, `sending` için saat ikonu `:142`). **Çift tik ve "görüldü" yok.**
- Sözleşme ve şema hazır: `ChatMessage.deliveredAt/readAt` (`ChatThread.ts:9-18`) ve migration `042` sütunları (`delivered_at`, `read_at`). **Bu iki sütuna hiçbir yerde yazılmıyor** (yalnızca SELECT ve eşleme).
- Okundu bilgisi okuyanın kendi imleci `last_read_at`'ten geliyor ve **karşıya gitmiyor**: `chat.thread_read` yalnızca okuyana gönderiliyor (`threadRoutes.ts:849-851`); fanout doğrulayıcısı hedefin okuyanın kendisi olmasını zorunlu kılıyor (`realtimeFanout.ts:101-103`, test `realtimeFanout.test.ts:273-278`); istemci başkasının `thread_read` olayını yok sayıyor (`globalRealtimeEventHandler.ts:75-80`).
- Teslim onayı yok: `ClientEvents.ts:16-55` yalnızca list/send.
- Yetenek anahtarı `chat_read_receipts` tanımlı (`capabilityService.ts:83-85`, `Capabilities.ts:18-20`) ama mobilde kullanılmıyor.
- Gönderim üretimde HTTP: `POST /v1/threads/:id/messages` (`threadRoutes.ts:780-829`); WS `chat.send_message` yalnızca oda içi sohbette ve demo modda.

### CHAT-RT-04 (Orta, küçük hata; migration yok): Sohbet açıkken gelen mesajlar sunucuda "okundu" olmuyor
- `useChatThreadSync.ts:30-34` yalnızca `resolvedThreadId` değişince okundu çağırıyor. Sohbet açıkken gelen mesaj yerel olarak okunmuş sayılıyor (`chatStore.ts:392-398`) ama sunucu imleci güncellenmiyor. Sonuç: gelen kutusuna dönünce yine okunmamış görünüyor.
- **Yapılacak:** Ekran odaktayken ve uygulama aktifken, en yeni partner mesajı değiştikçe debounce'lu (~500 ms) okundu çağrısı; blur'da bir kez daha. Test ekle.

### Tasarım: alıcı bilgisi (imleç tabanlı)
**Durumlar ve doğruluk kaynağı:**
- `sending` / `failed`: yalnızca istemci (mevcut).
- `sent`: sunucu ack'i (mevcut).
- `delivered`: `mesaj.sentAt <= partnerLastDeliveredAt`.
- `read`: `mesaj.sentAt <= partnerLastReadAt`.
- Kıyas `(sent_at, message_id)` ile yapılmalı; `sent_at` sunucu saati olduğundan kopyalar arası saat kayması riski **DOĞRULANMADI**. `042` mesaj sütunları kullanılmaz (geriye uyumlu kalır).

**Migration (YALNIZCA yaz, uygulama):** `070`: `blumi_chat_thread_participants` tablosuna nullable `last_delivered_at TIMESTAMPTZ`. İsteğe bağlı: hesap/ayar tarafına `read_receipts_enabled BOOLEAN NOT NULL DEFAULT true`. Yalnızca ileri yönlü, geri doldurma yok. Yazılınca sahibe onay için sunulur; uygulamayı Codex yapmaz.

**Contract:**
- `ServerEvents.ts` + `ServerEventSchemas.ts`: `chat.receipt_updated` `{threadId, userId, deliveredAt?, readAt?}` (mevcut `chat.thread_read` anlamı değişmez).
- `ClientEvents.ts`: `chat.ack_delivered` `{threadId, upToMessageId}`.
- `ChatThread` ve `ChatMessageList`: görüntüleyene özel `partnerLastDeliveredAt?`, `partnerLastReadAt?`.
- `POST /v1/threads/:id/read`: isteğe bağlı gövde `{upToMessageId}` (şu an gövdesiz ve sunucu saatini imlece yazıyor: `chatService.ts:180-185`, `postgresChatRepository.ts:268-275`).

**Sunucu:**
1. `realtimeFanout.ts`: `SERVER_EVENT_TYPES`'a ve `isServerEventPayload`'a yeni tür; `validateRealtimeFanoutMessage` bu tür için hedefi `kind:"user"` ve partner kimliğiyle sınırlamalı.
2. `chatRepository.ts` + `postgresChatRepository.ts`: `markThreadDelivered`, `markThreadRead(upTo)`; thread ve mesaj listesi sorgularına partner imleci için ikinci katılımcı join'i (mevcut `p` join'i `:51`).
3. `chatService.ts`: `markThreadDelivered`, `markThreadRead`; alıcı `listMessages` çağırınca örtük teslim.
4. `realtimeRouter.ts` + `realtimeServer.ts` (`isClientEvent`, `:647`): `chat.ack_delivered` işleme.
5. `threadRoutes.ts:849`: okundu sonrası partnere `chat.receipt_updated` (blok varsa gönderme).
6. `chatMessageDeliveryService.ts`: teslim sonrası gönderene `chat.receipt_updated(deliveredAt)`.

**İstemci:**
1. `chatStore.ts`: `partnerReceiptByThread` ve `applyChatReceiptUpdated`; durum imleç karşılaştırmasıyla türetilir.
2. `chatThreadModel.ts:13`: durumlara `"delivered" | "read"` eklenir; memo eşitliği `:166` güncellenir.
3. `ChatTimelineRow.tsx:146-149`: `sent` tek `checkmark` (`textMuted`), `delivered` `checkmark-done` (`textMuted`), `read` `checkmark-done` (`uiTheme.colors.primary` ya da `success`). Sabit kodlu renk kalkar (CHAT-RT-10).
4. `chatThreadCopy.ts` (EN `:77-79`, TR `:115-117`): "delivered / iletildi", "read / görüldü"; `chatBubbleAccessibility.ts:getDeliveryStateLabel` güncellenir.
5. `globalRealtimeEventHandler.ts`: partner mesajı gelince debounce'lu toplu `chat.ack_delivered`; `chat.receipt_updated` işleme.
6. `useChatThreadSync.ts`: CHAT-RT-04.

**Gizlilik:** Okundu bilgisi bir davranış sinyali. Öneri: karşılıklı ayar (kapatan kendisi de görmez). İmleç her durumda saklanır (okunmamış sayısı için); yalnızca partnere yayınlanan alan ayara tabi. Teslim bilgisi de çevrimiçi durumu ele verir, ayrı değerlendirilmeli. `legalCopy.ts` gizlilik metni güncellenmeli. Engelli ve silinmiş hesaplara olay gönderilmez.

**Kademeli açılış:** `chat_read_receipts` yetenek anahtarı ile.

**Dosya sırası:** contracts (şema + test) → `070` migration (yalnızca yaz) → repository → service → router/route/fanout → mobil store/model → arayüz/kopya → gizlilik ayarı → kademeli açılış.

**Testler (yeni):** fanout doğrulayıcı (partner hedefi geçer, yabancı hedef reddedilir); teslim ve okundu imlecinin monoton ilerlemesi (postgres testi); blok ve ayar kapalıyken olay yayınlanmaması; mobil store imleç karşılaştırması ve eski sunucuda alanların yokluğu; sohbet açıkken gelen mesajın okundu tetiklemesi; bubble erişilebilirlik etiketi TR/EN; eski istemci uyumluluğu.

### Sohbet gecikmesinin nedenleri (etki sırasıyla, ölçülmedi)
1. Arka plandaki alıcı yalnızca push ile ulaşılır (soket anında kapanıyor) → bölüm 1.
2. Push saatlik sınırı (P-04).
3. Hayalet soket push'u bastırıyor, yeniden deneme yok (P-03, CHAT-RT-07).
4. Push yolu: outbox + 1 sn worker turu + Expo/APNs (Expo/APNs gecikmesi DOĞRULANMADI).
5. Yeniden bağlanınca yalnızca thread listesi ve **aktif** konuşma senkronize ediliyor; diğer thread'lerin mesajları açılışa kadar bayat (`globalRealtimeLifecycle.ts:147-165`); aynı thread için 10 sn içinde ikinci ilk sayfa isteği atlanıyor (`chatCoordinator.ts:~340-360`) → CHAT-RT-09.
6. Yeniden bağlanma geri çekilmesi: ilk 10 denemede tavan 30 sn, sonra 60 sn tavanla sonsuz deneme (`realtimeClient.ts:26-30,464-488`).
7. Teslim başına yetki kontrolü, TTL 2 sn, önbellek ıskalarsa 2 sıralı DB sorgusu; kuyruk 64'ü aşarsa soket 4429 ile kapanıyor (`connectionManager.ts:~300-330`, `realtimeAuthorizationCache.ts:15,60-85`).
8. Teslim öncesi sıralı DB turları (`chatMessageDeliveryService.ts:115-139`).
9. Çok kopyalı kurulumda yük 7,9 KB'ı aşarsa `payload_refs` tablosuna gidip ek SELECT; LISTEN boşluğunda kopyadaki tüm soketler 1012 ile kapanıyor. Üretimde kopya sayısı: tek (`.railway/railway.ts: numReplicas: 1`).
- Ön planda alıcı gerçekten ws ile push tabanlı; periyodik yoklama yok.

---

## 4. Önerilen uygulama sırası

| # | İş | Migration | Sunucu değişir | Not |
|---|---|---|---|---|
| 1 | **P-01**: izin istemini doğru anda göster, öne gelince yeniden senkron, kayıt hatasında yeniden dene | hayır | hayır | Push'un çalışması her şeyin ön koşulu |
| 2 | **RT-04**: konuşma balonu kuyruğu | hayır | hayır | En ucuz, saniyeleri kazandırır |
| 3 | **CHAT-RT-04**: sohbet açıkken okundu | hayır | hayır | Küçük bilinen hata |
| 4 | **P-05**: PII'siz push hata günlüğü | hayır | evet | Teşhis |
| 5 | **RT-10**: gecikme ölçümü (yalnızca staging/yerel) | hayır | evet | Kalan gecikmeyi tahmin yerine ölç |
| 6 | **RT-01/02/03**: hareket senkronu ve gerçek partner varlığı | hayır | evet | Sahip kararları gerekli (bölüm 5) |
| 7 | **Çift tik / görüldü** | **evet (`070`, yalnızca yaz)** | evet | Sahip kararları gerekli |
| 8 | **P-03/P-04**: push'un çevrimiçi/bağlantı bastırması ve saatlik sınır | olası | evet | Ürün kararı |
| 9 | **RT-06**: tekrarlı sorguların azaltılması | hayır | evet | Ölçümden sonra |

Her iş ayrı commit; `develop`'a push. `main`'e birleştirme ve Railway deploy yalnızca sahibin açık izniyle.

## 5. Sahibin vermesi gereken kararlar (Codex sormadan varsaymasın)

1. **Okundu bilgisi:** Varsayılan açık mı kapalı mı? Karşılıklı mı (kapatan göremez)? Teslim bilgisi her zaman açık mı?
2. **Sohbet push'u** saatlik 6 sınırından muaf olsun mu? Sessiz saatler sohbeti de bastırsın mı?
3. **Odada hareket:** Sunucu yürüme alanı geometrisini doğrulasın mı, yoksa yalnızca [0,1] sıkıştırma mı? Geometri `packages/domain`'e taşınsın mı?
4. **`070` migration:** Yazılıp sahibe sunulur; yedek ve geri yükleme kanıtıyla onaylanmadan uygulanmaz.
5. **İzin istemi anı:** İlk eşleşme mi, ilk mesaj mı?
6. **Bölge ve havuz:** Railway ve Supabase bölgeleri ile `Pool` `max` değeri (ölçümden sonra).
7. **`chat.ack_delivered`:** WebSocket mi HTTP mi? İmleç `sent_at` mi `message_id` mi?

## 6. Bu dosyanın kapsamadığı ve açık kalanlar

- **DOĞRULANMADI:** canlı `BLUMI_PUSH_PROVIDER` ve `EXPO_PUSH_ACCESS_TOKEN` değerleri (yalnızca değişken **adlarının** var olduğu ve `config.ts:325,328`'in üretimde bunları zorunlu kıldığı görüldü); Expo hesabındaki APNs anahtarı; `blumi_push_devices` satır sayısı; `Notification worker failed ServiceError` satırının kök nedeni; iOS'ta gerçek teslim; Railway ve Supabase bölgeleri; saat kayması etkisi.
- Bu bulguların hiçbiri telefonda ya da Simulator'da doğrulanmadı. Titreşim ve push yalnızca gerçek iPhone'da doğrulanabilir.
- Uygulama arayüzü bulguları (`UX_DELIGHT_AUDIT_2026-09-30.md`) ve genel iş listesi (`OPEN_WORK_2026-09-30.md`) ayrı dosyalarda. Örtüşenler: ROOM-07 = RT-01/RT-03; CHT-06 = CHAT-RT-04; CHT-01 (açık sohbette toast) bu dosyanın kapsamı dışında, arayüz işi.
