# Blumi — Backend, gerçek zamanlı ve push işleri (ajan görev dosyası, 2026-09-30)

**Bu dosya kendi başına okunabilir.** Önceki konuşmayı bilmen gerekmez.

**Kaynak:** `develop` @ `9982882` (= `main`). Üç ayrı kod incelemesi yapıldı (yalnızca okuma, hiçbir dosya ya da veri değişmedi). Kanıtlar `dosya:satır` olarak yazıldı. "DOĞRULANMADI" yazan yerler koddan kanıtlanamadı.

**Durum (2026-10-01):** Maddelerin çoğu uygulandı ve otomatik testlerden geçti; hiçbiri telefonda ya da Simulator'da doğrulanmadı. Güncel durum ve kalan işler [`SESSION_INVENTORY_2026-10-01.md`](SESSION_INVENTORY_2026-10-01.md) dosyasında; [`BACKEND_REALTIME_PUSH_PROGRESS_2026-10-01.md`](BACKEND_REALTIME_PUSH_PROGRESS_2026-10-01.md) yalnızca yapılanların tarihli kaydıdır (aşağıdaki "PROGRESS" atıfları). Envanterdeki `RT-xx` kimlikleri bu dosyadaki `RT-xx` maddeleriyle aynı değildir (ayrı seri). Aşağıdaki `dosya:satır` kanıtları `9982882` anına aittir; güvenmeden önce koda bakın.

**Sahibin bildirdiği sorunlar (canlıda gördüğü):**
1. Eşleşme odasında bir kişinin avatarı hareket edince diğer kişi görmüyor.
2. Odada mesajlar geç gidiyor.
3. Sohbette tek tik / çift tik ve "görüldü" yok; mesajlar geç geliyor.
4. Push bildirimi telefona hiç gelmiyor.

**Ürün önceliği:** Eşleşme odası (MiniRoom) ürünün en güçlü yeri olmalı.

---

## 0. Sınırlar

- **Gizlilik:** mesaj metni, telefon numarası ya da özel içerik log'a, analitiğe, push gövdesine yazılmaz.
- **Veritabanı:** canlı veritabanı gerçek veri sayılır; 18 test hesabı korunur. Railway `DATABASE_URL` okunmaz. Migration yazılabilir; sahibin açık onayı, yedek ve geri yükleme kanıtı olmadan **uygulanmaz**.
- **Migration dosyaları** checksum'lı: `032` iki dosya, `044` yok; hiçbirini yeniden adlandırma ya da numaralandırma. `070_chat_delivery_receipts.sql` yazıldı, uygulanmadı ([`MIGRATION_070_RUNBOOK.md`](../release/MIGRATION_070_RUNBOOK.md)). Yeni dosya en yüksek mevcut numaradan sonrakini alır (bugün `071`); `044` boşluğunu doldurma, bir öneki tekrar kullanma.
- **Dağıtım:** canlıya deploy, Railway değişkeni değiştirme, gerçek kullanıcıya push yok. Railway `main`'den build eder (otomatik deploy güvenilir değil; canlı commit'i kontrol et); `main`'e yalnızca sahibin açık izniyle birleştirilir.
- **Kontroller:** `npm run typecheck`, `npm run lint`; sunucu `npm --workspace @blumi/server run test`; mobil `npm --workspace @blumi/mobile run test:<grup>` (ör. `notifications`, `chat`, `realtime`, `match-room`). PostgreSQL kapısı (`npm run verify:postgres`) PostgreSQL binary'lerine ihtiyaç duyar ve root olarak `initdb` çalıştırmaz.
- **Commit:** `<type>: <description>`; `git add` ile dosyalar tek tek seçilir (`git add .` yok).
- **Dürüst etiketler:** "Implemented / Tested / Native verified / Production ready" karıştırılmaz.

---

## 1. Push bildirimleri

**Sonuç (9982882):** Kod zinciri uçtan uca var, sunucu tarafı yapılandırılmış görünüyor. En olası kırılma noktası istemcide.

### P-01 (Yüksek, kesin kod bulgusu): İzin hiç istenmiyor, token üretilmiyor
- `apps/mobile/src/features/notifications/usePushRegistration.ts:244` açılışta `sync(false)` çağırıyor: yani izin istemi kapalı.
- `pushRegistrationCoordinator.ts:54-56`: izin durumu `undetermined` ve istem kapalıysa `permission-not-requested` ile çıkılıyor. `getExpoPushToken` ve `registerDevice` hiç çalışmıyor.
- `requestPermissionsAsync` tüm mobil kodda yalnızca `usePushRegistration.ts:195`'te. O yola yalnızca `RootNavigator.tsx:874` → `SettingsScreen` → `useNotificationSettings.ts:88` zinciriyle Ayarlar'daki "Enable notifications" satırından ulaşılıyor (`SettingsNotificationsSection.tsx:35`: satır yalnızca izin `granted` değilse görünür).
- Onboarding, eşleşme ya da ilk mesajda izin istemi yok.
- **Canlı kanıt:** Railway HTTP günlüklerinde (2026-09-30 03:28–21:22 UTC) iPhone'lardan (`Blumi/13 CFNetwork`) `PUT /v1/notification-preferences` 200 var (saat dilimi senkronu, izin gerektirmez). iPhone kaynaklı **hiç `POST /v1/devices` yok**. Yalnızca 2 kayıt var, ikisi `clientUa: node`, 401. Günlük saklama süresi sınırlı, yani sonuç "son ~18 saatte olmadı".

**Durum:** Uygulandı ve test edildi. İlk sohbet girişinde açıklama kartı (`ChatNotificationPermissionCard.tsx`, `useChatNotificationPrompt.ts`), ön plana dönüşte izin/kayıt eşitleme, kayıtta sınırlı yeniden deneme (PROGRESS P01; envanter PSH-02). Native doğrulama açık.

### P-02 (Orta, DOĞRULANAMADI): APNs anahtarı Expo'da yüklü mü?
- Token tipi Expo push token (`usePushRegistration.ts:204`). Expo'nun iOS'a iletebilmesi için EAS projesine (`bc61197e-e1cb-478b-9f1d-61d8582d77c8`) APNs anahtarı yüklenmiş olmalı. Bu bilgi repoda yok.
- Belgeler bunu açık bırakıyor: `LAUNCH_CONTROL.md:101`, `:155`, `APP_STORE_SUBMISSION_GATE.md:12,:51`.
- **Sahibin işi (kod değil):** EAS Dashboard → Credentials → iOS → `com.blumi.mobile` altında **Push Key** var mı? Yoksa `eas credentials` ile yüklenir.
- Doğrulanan yapılandırma: `app.json:43` (`expo-notifications` eklentisi), `:57-62` (`aps-environment: production`, `UIBackgroundModes: [fetch, remote-notification]`), `:88` (`extra.eas.projectId`). Geliştirme build'inde push bilinçli kapalı (`notificationRuntimePolicy.ts:12`).

**Durum:** Açık, sahip işi (envanter PSH-01).

### P-03 (Orta): Sunucu "çevrimiçi" sayarak push'u atlıyor
- Mesaj (`chatMessageDeliveryService.ts:132-140`), oda daveti (`threadRoutes.ts:477`) ve realtime daveti (`realtimeRouter.ts:516`): alıcının aktif realtime bağlantısı varsa push gitmiyor (`connectionManager.ts:150`).
- İstemci arka plana geçince soketi kapatıyor (`realtimeAppLifecycle.ts`, `globalRealtimeProvider.ts:94-103`). Ama sunucu ölü soketi yalnızca 30 sn'lik ping döngüsüyle temizliyor (`realtimeServer.ts:39,381-397`). Bu pencerede atılan mesajlarda push gitmiyor ve outbox yine tamamlanıyor (yeniden deneme yok).
- Eşleşme push'u (`matchService.ts:353-365`) bağlantı kontrolü yapmıyor: APNs zincirini en doğrudan sınayan yol budur.

**Durum:** Uygulandı ve test edildi. Sohbet, oda daveti ve eski realtime push yolları soket durumundan bağımsız kuyruğa alınır; yalnızca ilgili sohbet/oda ekrandayken banner gizlenir (PROGRESS P03 ve "Bildirim sistemi denetimi").

### P-04 (Orta): Saatlik push sınırı ve sessiz saatler
- Varsayılanlar: `max_pushes_per_hour = 6`, tüm bildirim türleri toplam sayılıyor, sınır aşılınca `frequency_cap` ile **sessizce** düşüyor (`036_notification_preferences_policy.sql:5-12`, `postgresNotificationRepository.ts:313-332`, `notificationRepository.ts:150-157`). Sessiz saatler de düşürüyor.
- `chat.room_invite` için politika yok (`notificationService.ts:317-334`, `default: return null`), doğrudan kuyruğa alınıyor.

**Durum:** Uygulandı. Sohbet push'u ve oda daveti saatlik toplamdan muaf; sessiz saatler, tercih ve tekrar engelleme korunur (PROGRESS P04).

### P-05 (Düşük): Sağlayıcı hataları sessiz
- `PushProviderRejection` ve receipt hataları yalnızca DB'de hata kodu olarak duruyor (`notificationService.ts:197-218,240-243`). Yalnızca `DeviceNotRegistered` cihazı siliyor; `InvalidCredentials` ya da `MismatchSenderId` yalnızca kaydediliyor, günlük ya da uyarı yok.
- Canlı günlükte bir satır: `Notification worker failed ServiceError`, 2026-09-30 12:20 UTC, bir kez; neden belli değil (içerik yazılmıyor).

**Durum:** Uygulandı. PII'siz hata kodu, bildirim türü ve sayaç günlüğü (PROGRESS P05 ve "ikinci tur").

### Gizlilik (uyumlu)
- Push gövdesinde içerik yok: "Blumi" / "You have a new message." (`notificationService.ts:370-378`). Eşleşme ve beğeni metinleri kişi adı içermiyor. Tehdit modeli B6 "payload PII review" satırı açık.

### Sahibin iki telefonla test prosedürü (açık: envanter PSH-06, REL-13)
1. Her iki telefonda izin ver: ilk sohbet girişinde çıkan açıklama kartından ya da uygulamada Ayarlar → Bildirimler → "Enable notifications" satırından. iPhone Ayarları → Bildirimler → Blumi satırı görünmeli. Sunucu günlüklerinde iPhone kaynaklı `POST /v1/devices` 201 görülmeli.
2. İki uygulamayı da tamamen kapat, 60 sn bekle.
3. **Eşleşme testi** (bağlantı kontrolü yok): yeni bir eşleşme oluştur. İki tarafa "It's a match!" gelmeli.
4. **Mesaj testi:** A uygulamayı kapattıktan 60 sn sonra B mesaj göndersin. Gelmezse ama eşleşme geliyorsa sorun mesaj yolundadır (bkz. P-03).
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

**Durum (RT-01/02/03):** Uygulandı ve test edildi. `mini_room.scene_enter/scene_exit/move` ve `mini_room.motion_snapshot/avatar_moved` sözleşmeleri; sunucu `[0,1]` sınırını ve `packages/domain/src/roomWorld/roomWorldGeometry.ts` zemin poligonunu doğrular; hareketin ayrı hız bütçesi var; presence sahne/soket yaşam döngüsünden gelir (PROGRESS "Oda hareketi"; envanter ROOM-07). Native kabul ve çoklu replika doğrulaması açık.

### Oda senkronu mimarisi: modelin önerisine açık
İlk paket tek süreçli bellek cache'i ve zemin poligonu doğrulamasıyla çalışıyor. Bundan sonrası modelin kendi tasarımına açık: geometrinin nerede yaşadığı, sunucu otoritesinin kapsamı (mobilya, koltuk, engel), çoklu replika için ortak geçici state ve presence sahipliği, yeni render ve etkileşim yaklaşımları. Bilinen boşluklar: envanter MR-03 (hotspot hareketleri zemin kontrolünü atlıyor; sunucuda koltuk manifesti yok) ve envanterin realtime bölümü.

### RT-04 (Yüksek, en ucuz iş): Konuşma balonu kuyruğu her mesajı 4 sn serileştiriyor
- `miniRoomSpeechQueue.ts:1,25-33`, `miniRoomSceneStore.ts:589-603`: aktif balon varken sıradaki bekletiliyor. Art arda 3 mesajda 3. balon ~8 sn geç çıkıyor. Geçmiş paneli anında güncelleniyor, yalnızca balon geç.

**Durum:** Uygulandı. En yeni balon hemen görünür (PROGRESS RT04; envanter PSH-03).

### RT-05 (Yüksek): Arka plandaki ya da ölü soketli partner mesajı geç görüyor
- Bkz. P-03. Çözüm yolu push'un çalışması (bölüm 1) ve partner bağlı değilse arayüzde "çevrimdışı" gösterme (RT-03). Her ikisi uygulandı; iki telefon doğrulaması açık.

### Mesaj yolu (oda içi chat), ölçülmüş değil, koddan
İstemci `sendRoomMessage` (`useInRoomChat.ts:331-366`) `chat.send_message` gönderir; optimistic balon anında, 15 sn ack zaman aşımı (`:60`). Sunucu sırası: hız sınırı → `authorizeConnection` (2 sn TTL önbellek, `realtimeAuthorizationCache.ts:14`) → `findThread`, `hasBlockBetween` (2 paralel), `sendMessageIdempotently` içinde tekrar `findThread`, `createMessage` (tek CTE: mesaj + önizleme + outbox, `postgresChatRepository.ts:180`) → gönderene ack hemen → partner teslimi ayrı (`dispatchPostPersistEffects`: `claimDeliveries`, `findThread`, `hasBlockBetween`, `sendToUsersDurably`, `pg_notify` bekleniyor, `completeDelivery`). Yaklaşık 7 ardışık sorgu dalgası; önbellek bayatsa +1.
- Tahmin (ölçülmedi): ~3 ms DB gidiş-dönüşte ~30–60 ms; ~95 ms bölgeler arası gidiş-dönüşte ~0,7–0,9 sn.
- Railway tek kopya; `Pool` `max` belirtilmemiş (varsayılan 10), LISTEN bunun 1 bağlantısını kalıcı tutuyor (`config.ts:440`, `postgresRealtimeFanout.ts:234`). Railway ve Supabase bölgeleri repoda yok: **DOĞRULANMADI**.
- Bir günlük-yoklama (polling) yolu var: `chatDeliveryWorker` her 1 sn `dispatchDue()`; yalnızca kurtarma yolu, yeniden deneme geri çekilmesi `1000·2^n` ms, en fazla 60 sn (`chatMessageDeliveryService.ts:143`).
- **RT-06 (Orta):** Mesaj başına tekrarlı sorgular: `findThread` 3×, `hasBlockBetween` 2× (`chatMessageDeliveryService.ts:69,79,123,129`, `chatService.ts:239`). **Durum:** Uygulandı; gönderim tek ifade (`ChatRepository.sendMessageChecked`; envanter BE-42).
- **RT-07 (Orta):** Railway/Supabase bölgesi ve havuz boyutu sahibin kararı (maliyet, Railway değişkenleri, olası veri taşıma). RT-10 ölçümü ve [`REALTIME_CAPACITY_2026-10-01.md`](REALTIME_CAPACITY_2026-10-01.md) karara girdi olur. **Durum:** açık (envanter PSH-05).
- **RT-09 (Düşük):** Gelen mesajda `sentAt >= baseline-250ms` filtresi sunucu ile istemci saatini karşılaştırıyor (`inRoomChatThread.ts: shouldRenderIncomingRoomChatMessage`); saat kayması balonu düşürebilir. Sahada görülüp görülmediği DOĞRULANMADI. `seenRef` ve tekrar oynatma kapısıyla yetinip saat filtresi gevşetilebilir. **Durum:** açık (envanter CH-11).
- **RT-10 (Orta): Gecikme ölçümü yok.** Gönderim, `createMessage`, teslim ve istemci alış zaman damgaları PII'siz (mesaj içeriği hariç) yalnızca staging'de ya da yerelde günlüğe yazılsın; iki test hesabıyla uçtan uca ölçülsün. `pg_stat_statements` yalnızca staging'de. **Durum:** kısmi. `NODE_ENV=development/test` ve `BLUMI_CHAT_LATENCY_DIAGNOSTICS=1` ile persist/fanout/push_enqueue süreleri ve yerel harness var; iki telefon/bölge ölçümü açık (envanter PSH-04).

---

## 3. Sohbet: tek tik / çift tik / "görüldü" ve gecikme

### 9982882'deki durum
- **Tek tik var** (`ChatTimelineRow.tsx:148`, sabit kodlu `#C4537C`, `sending` için saat ikonu `:142`). **Çift tik ve "görüldü" yok.**
- Sözleşme ve şema hazır: `ChatMessage.deliveredAt/readAt` (`ChatThread.ts:9-18`) ve migration `042` sütunları (`delivered_at`, `read_at`). **Bu iki sütuna hiçbir yerde yazılmıyor** (yalnızca SELECT ve eşleme).
- Okundu bilgisi okuyanın kendi imleci `last_read_at`'ten geliyor ve **karşıya gitmiyor**: `chat.thread_read` yalnızca okuyana gönderiliyor (`threadRoutes.ts:849-851`); fanout doğrulayıcısı hedefin okuyanın kendisi olmasını zorunlu kılıyor (`realtimeFanout.ts:101-103`, test `realtimeFanout.test.ts:273-278`); istemci başkasının `thread_read` olayını yok sayıyor (`globalRealtimeEventHandler.ts:75-80`).
- Teslim onayı yok: `ClientEvents.ts:16-55` yalnızca list/send.
- Yetenek anahtarı `chat_read_receipts` tanımlı (`capabilityService.ts:83-85`, `Capabilities.ts:18-20`) ama mobilde kullanılmıyor.
- Gönderim üretimde HTTP: `POST /v1/threads/:id/messages` (`threadRoutes.ts:780-829`); WS `chat.send_message` yalnızca oda içi sohbette ve demo modda.

### CHAT-RT-04 (Orta, küçük hata; migration yok): Sohbet açıkken gelen mesajlar sunucuda "okundu" olmuyor
- `useChatThreadSync.ts:30-34` yalnızca `resolvedThreadId` değişince okundu çağırıyor. Sohbet açıkken gelen mesaj yerel olarak okunmuş sayılıyor (`chatStore.ts:392-398`) ama sunucu imleci güncellenmiyor. Sonuç: gelen kutusuna dönünce yine okunmamış görünüyor.

**Durum:** Uygulandı. Odakta ve ön plandaki sohbet 500 ms debounce ile okundu eşitler, odak kaybında bekleyen gönderilir (PROGRESS CHAT-RT04; envanter CHT-06 bitti, BE-38 kısmi).

### Çift tik / görüldü
**Durum:** Uygulandı ve test edildi, `develop`'a birleşti (`07a5c84`). `chat.ack_delivered` (istemci → sunucu, WebSocket) ve `chat.receipt_updated` (sunucu → partner) sözleşmeleri var; HTTP geçmiş yüklemesi de teslim sayılır; imleç sırası `(sent_at, message_id)`.

Migration `070_chat_delivery_receipts.sql` **yazıldı, uygulanmadı**: `blumi_chat_thread_participants`'a nullable teslim/okundu imleç sütunları ve `blumi_chat_privacy_preferences.read_receipts_enabled BOOLEAN NOT NULL DEFAULT false` (okundu varsayılan kapalı, karşılıklı). Binary 070 olmadan çalışır; alındı bilgisi kapalı kalır. Uygulama yalnızca sahibin açık onayı, yedek ve geri yükleme kanıtıyla yapılır; adımlar [`MIGRATION_070_RUNBOOK.md`](../release/MIGRATION_070_RUNBOOK.md).

Açık: native ve iki telefon doğrulaması; 070'in uygulanması (envanter CH-08); gizlilik metni (CH-09): teslim bilgisi (✓✓) alıcının çevrimiçi olduğunu ele veren bir sinyaldir, gizlilik metninde açıkça yazılmalı; kapalıyken yapılan okumaların sonradan görünmesi kararı (CH-02, [`RECEIPTS_PRIVACY_DESIGN_2026-10-01.md`](RECEIPTS_PRIVACY_DESIGN_2026-10-01.md)).

### Sohbet gecikmesinin nedenleri (9982882, etki sırasıyla, ölçülmedi)
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

**Durum:** 1–3 P-01/P-03/P-04 ile ele alındı; 8 RT-06 ile. 5–7 ve 9 için güncel kalemler `SESSION_INVENTORY_2026-10-01.md` realtime bölümünde (oradaki ayrı RT-xx serisi).

---

## 4. Durum tablosu (2026-10-01)

| İş | Durum | Kanıt |
|---|---|---|
| P-01 izin kartı, ön planda yeniden eşitleme, kayıtta yeniden deneme | Uygulandı, test edildi | envanter PSH-02 |
| P-02 EAS APNs anahtarı | Açık, sahip işi | PSH-01 |
| P-03 soketten bağımsız push kuyruğu | Uygulandı, test edildi | PSH-02 |
| P-04 sohbet push'u saatlik sınırdan muaf | Uygulandı, test edildi | PSH-02 |
| P-05 PII'siz sağlayıcı hata günlüğü | Uygulandı, test edildi | PSH-02 |
| İki telefon push testi | Açık (native) | PSH-06, REL-13 |
| RT-01/02/03 hareket senkronu ve partner varlığı | Uygulandı, test edildi; native açık | ROOM-07 (`1a8f273`, `9490eca`) |
| RT-04 konuşma balonu kuyruğu | Uygulandı, test edildi | PSH-03 (`911e075`) |
| RT-06 tekrarlı sorgular | Uygulandı | BE-42 |
| RT-07 bölge ve havuz | Sahip kararı | PSH-05 |
| RT-09 saat kayması filtresi | Açık | CH-11 |
| RT-10 gecikme ölçümü | Kısmi | PSH-04 |
| CHAT-RT-04 sohbet açıkken okundu | Uygulandı (sunucu tarafı kısmi) | CHT-06, BE-38 |
| Çift tik / görüldü | Uygulandı, test edildi; 070 uygulanmadı | `07a5c84`; CH-08 |

Commit ve push `AGENTS.md` git kurallarına göre; `main`'e birleştirme ve Railway deploy yalnızca sahibin açık izniyle.

## 5. 2026-10-01 itibarıyla ürün kararları

Bunlar sahibin güncel kararlarıdır. Daha iyi bir yol görülürse gerekçesiyle değişiklik önerilebilir.

1. **Okundu bilgisi** varsayılan kapalı ve karşılıklı (kapatan karşı tarafınkini de görmez); teslim bilgisi açık.
2. **Sohbet push'u** saatlik toplam sınırdan muaf ve bu sınırı tüketmez; sessiz saatler, bildirim tercihi ve tekrar engelleme korunur.
3. **Oda hareketi** anlık senkron; sunucu ortak yürünebilir geometriyle doğrular.
4. **İzin istemi:** açıklama kartı, izin henüz seçilmemişse ilk sohbet girişinde hesap başına bir kez; sistem istemi kullanıcı düğmeye basınca açılır.

**Sahip onayı gereken yalnızca iki konu:**
- `070` migration'ının uygulanması (yedek ve geri yükleme kanıtıyla; `MIGRATION_070_RUNBOOK.md`).
- Railway/Supabase bölgesi, `Pool` `max` ya da başka bir Railway değişkeni değişikliği (maliyet, olası veri taşıma).

Mühendislik seçimleri modelindir ve gerekçesiyle yapılır: geometrinin nerede yaşadığı, teslim onayının taşıma yolu (şu an WebSocket artı HTTP geçmiş yüklemesi), imleç biçimi (şu an `(sent_at, message_id)`), oda senkronu mimarisi.

## 6. Bu dosyanın kapsamadığı ve açık kalanlar

- **DOĞRULANMADI:** canlı `BLUMI_PUSH_PROVIDER` ve `EXPO_PUSH_ACCESS_TOKEN` değerleri (yalnızca değişken **adlarının** var olduğu ve `config.ts:325,328`'in üretimde bunları zorunlu kıldığı görüldü); Expo hesabındaki APNs anahtarı; `blumi_push_devices` satır sayısı; `Notification worker failed ServiceError` satırının kök nedeni; iOS'ta gerçek teslim; Railway ve Supabase bölgeleri; saat kayması etkisi.
- Bu bulguların hiçbiri telefonda ya da Simulator'da doğrulanmadı. Titreşim ve push yalnızca gerçek iPhone'da doğrulanabilir.
- Örtüşmeler ve güncel durum `SESSION_INVENTORY_2026-10-01.md`'de: ROOM-07 = RT-01/RT-03; CHT-06 = CHAT-RT-04; CHT-01 (açık sohbette toast) `cd74344` ile kapandı. Eski listeler: `UX_DELIGHT_AUDIT_2026-09-30.md`, `OPEN_WORK_2026-09-30.md`.
