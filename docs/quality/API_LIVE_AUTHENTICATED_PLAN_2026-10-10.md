# Kimlik doğrulamalı canlı API kontrolü — 10 Ekim 2026

Durum: belge, `tools/security/live-authenticated-audit.mjs` yürütücüsünün kapsamına uyar; canlı test sonucu değildir. Bu planın yazılması ve gözden geçirilmesi sırasında canlı çağrı yapılmadı. Hedef yalnızca `https://blumi-app-production.up.railway.app`.

## Kilitli kapsam

- Sahibinin açıkça seçtiği, mevcut ve farklı iki TEST hesabı A/B kullanılır. Hesap seçimi veritabanından tahmin edilmez. Oturumlar geçerli; hesaplar aktif ve ürün kullanımına uygun olmalıdır.
- Normal akış iki capture kontrolü dahil 14 kendi-hesap GET'i yapar. Varsayılan olarak yabancı mesaj kontrolü kapalıdır; root bilinçli olarak `--foreign-message-checks` açarsa mevcut uygun kaynaklarla en fazla 2 ek GET yapılır: toplam en fazla 16. Capture tekrarları ve hatalı denemeler de aynı 20 istek bütçesinden düşer; clear sayacı sıfırlamaz. Başlangıçlar arasında en az 1,2 saniye vardır.
- Paralel çağrı, yönlendirme, otomatik tekrar, cursor taraması veya yük testi yoktur. Bu yürütücü hesap oluşturmaz; SMS, giriş/refresh, mesaj, beğeni, davet oluşturma, satın alma, ödül, coin/envanter değişimi, silme, yönetici işlemi ve doğrudan SQL yapmaz. Sahibinin yeni TEST hesapları oluşturulmasına ilişkin isteği ayrı hazırlık işidir; capture anında hesapların zaten mevcut, aktif ve kurulumu tamamlanmış olması gerekir.
- Gerçek Authorization değerleri yalnızca yürütücünün belleğinde bulunur; komut argümanlarına, geçici dosyalara, çıktılara, belgelere veya sohbete yazılmaz. curl gerekirse gizli başlık stdin üzerinden iletilir; TLS doğrulaması kapatılmaz.
- Profil, katılımcı, sohbet, mesaj, davet, oda kimlikleri; telefonlar; gövde metinleri; cursor ve tokenlar sadece bellekte değerlendirilir. Kaydedilen sonuçlarda yalnızca A/B etiketi, rota şablonu, HTTP durumu, sayılar ve anlam kontrolü boolean'ları bulunur.
- A/B'nin ortak sohbeti ikisine de açıktır; bu kaynak yabancı özel kaynak testi yerine kullanılamaz. Üçüncü kişinin hesabına giriş yapılmaz; yalnızca sahibinin test kaynağı olarak onayladığı mevcut A/B sohbetleri kullanılabilir.

## GET yan etkileri ve kapsam dışı yüzeyler

GET yöntemi tek başına salt okuma garantisi değildir. Mevcut kaynakta şu davranışlar görülüyor:

| Yüzey | Mevcut davranış | Bu planın kararı |
|---|---|---|
| `/v1/economy/balance` | `economyService.getInventory` eksik envanteri/başlangıç bakiyesini oluşturabilir ve sahiplikleri tamamlayabilir. | Varsayılan olarak **Blocked**; para veya envanter değişimi riski nedeniyle çalıştırılmaz. Ayrı GET inventory/avatar rotası yok; avatar kendi profilinden okunur. |
| Sohbet mesajlarının en yeni sayfası | `noteHistoryLoaded` teslim alındı bilgisini yazabilir ve partnerine olay gönderebilir. | Kendi mesaj sayfası, eski sayfa pozitif kontrolü dahil, bu yürütücüde okunmaz. Opsiyonel yabancı istek kendi sohbet listesinden alınan mevcut `lastMessage.messageId` ile `before` kullanır; en yeni sayfayı istemez. |
| Kendi/yabancı sohbetin room-invites okuması | PostgreSQL okuyucusu geçmiş bekleyen davetleri `expired` yapabilir; persona dalı yeni davet oluşturabilir. | Bu yürütücü hiçbir room-invites GET'i yapmaz. Davet/oda nesnesi yetki testi **Blocked** kalır. |
| Oturum çözümleme | Süresi bitmiş askıya almayı temizleyebilir. | Önceden aktif olduğu doğrulanan test hesapları gerekir; askıya alınmış hesapla devam edilmez. |
| Kimlik doğrulamalı bütün API çağrıları | Ortak HTTP istek bütçesi sayacını günceller. | Normal koruma muhasebesidir. “Ürün verisini değiştiren işlem yok” denebilir; “veritabanına hiçbir yazım olmadı” denemez. |
| Room showcase / notification portrait | Bilerek halka açık, anahtar/token ile erişilen görsel yüzeylerdir. | Public görselin 200 dönmesi BOLA değildir. Önceden onaylı özel test varlığı ve görünürlük kanıtı bulunmadan denenmez. |

Kaynak dayanakları: `apps/server/src/economy/economyService.ts` → `getInventory`; `apps/server/src/routes/threadRoutes.ts` → mesaj GET'inde `before` kontrolü, room-invites persona dalı; `apps/server/src/db/postgresThreadRoomInviteRead.ts` → yetki kontrollü `expired` UPDATE; `apps/server/src/auth/authService.ts` → `getSessionByTokenHash`; `apps/server/src/operations/sharedRateBudgetHook.ts` → `consumeUser`.

Bu korumalar mevcut checkout'tan türetilmiştir. Canlı sürümle eşleşmeleri henüz kanıtlanmamışsa yan etkiye duyarlı isteklere geçilmez. Yöntem seçimini veya bu bilinçli davranışları güvenlik açığı diye sunma.

## Sabit istek matrisi

`THREAD` ve `CURSOR` gerçek değerleri bellekte saklanan yer tutuculardır. Sonuçlarda aşağıdaki şablonlar kullanılır; çözülmüş URL saklanmaz.

| Slot | Çağıran | GET rota şablonu | Beklenen sonuç / anlam kontrolü |
|---|---|---|---|
| 1–2 | A, B | `/v1/users/me` | Capture sırasında birer GET: 200; `selfIdentityMatches`, `activeAccount`, `onboardingComplete` doğru, hesaplar farklı; avatar kendi profilinden okunur. Run bu GET'i yeniden yapmaz. |
| 3–4 | A, B | `/v1/threads?limit=10` | 200; yalnızca ilk sayfa, en fazla 10 sohbet. `allThreadsIncludeCaller` doğru; nextCursor izlenmez. |
| 5–6 | A, B | `/v1/users/me/room-decor` | 200; null meşru boş durumdur. Veri varsa `roomOwnerMatchesCaller` doğru. |
| 7–8 | A, B | `/v1/safety/reports` | 200; yalnızca çağıranın rapor özetleri. İki hesaba ait bilinen özel raporlar karışmamalı. Boş listeler sahiplik korumasını tek başına kanıtlamaz. |
| 9–10 | A, B | `/v1/safety/blocks` | 200; dönen engelleme kayıtlarında varsa `actorMatchesCaller` doğru. Başka hesabın verisi görünmemeli. |
| 11–12 | A, B | `/v1/notification-preferences` | 200; geçerli tercih nesnesi. Ayarların aynı olması tek başına sızıntı değildir. |
| 13–14 | A, B | `/v1/chat-preferences` | 200; geçerli tercih/availability nesnesi; herhangi bir ayar yazılmaz. |
| 15–16 | A → B'nin özel sohbeti; B → A'nın özel sohbeti | `/v1/threads/:threadId/messages?before=:messageCursor&limit=1` | Yalnızca operator flag açık ve mevcut özel sohbet/cursor varsa. Kaynak sahibi katılımcı, çağıran diğer test hesabı katılımcı değil. Beklenen 404/403; her 2xx anında güvenli durdurma nedenidir. Özel yanıt gövdesi okunmaz; doğrulanmış veri sızıntısı iddiası üretilmez. |

Varsayılan akış 1–14 slotlarıyla sınırlıdır. Eksik veya operator flag'i kapalı yabancı kontrol slotları atlanır; yeni veri oluşturularak tamamlanmaz. Her yönde özel sohbet bulunması ayrı ayrı kontrol edilir. Yalnızca A/B ortak sohbeti veya boş sohbet listesi varsa yabancı-sohbet testi **Blocked** kalır. Pozitif kendi-mesaj okuması, kendi/yabancı davet okuması, davet cursor'ı üretme veya eksik cursor tahmin etme yoktur.

## Kaynak seçimi ve sonuç değerlendirmesi

1. Root, iki test hesabının sahibinin seçiminden geldiğini güvenli yürütücüde doğrular. `users/me` yanıtları yalnızca bu kimliklerin tutarlılığını kontrol eder; rastgele iki hesabı “test hesabı”na dönüştürmez.
2. A/B ilk sohbet sayfaları bellekte ayrıştırılır. Onaylı mevcut özel sohbet seçilir; sahibinin katılımcı olduğu ve diğer test hesabının katılımcı olmadığı doğrulanır. ID/cursor bellekte kalır; seçim çıktısı sadece `foreignResourceAvailable` ve `callerIsParticipant` boolean'larıdır.
3. Diğer test hesabının kendi kaynaklarında başarılı GET meşrudur. Kendi null oda, boş rapor veya boş mesaj cevabı da meşrudur. Ortak veya halka açık kaynak erişimi saldırı başarısı sayılmaz.
4. Gerçek veri sızıntısı kanıtı, yetkisiz çağırana yabancı özel içeriğin gerçekten dönmesidir. Bu yürütücü yabancı 2xx gövdesini okumadan iptal eder; yalnızca `unexpectedForeignAuthorizationSuccessObserved: true` yazar ve tüm sonraki istekleri durdurur. `privateDataDisclosureVerified: false` ve `foreignPrivatePayloadRead: false` kalır. Güvenli durdurma, doğrulanmış özel veri sızıntısıyla eşit değildir.
5. Boş/public 2xx veya sadece çağıranın yolladığı kaynak ID'sinin yansıması özel veri sızıntısı kanıtı değildir. Yürütücü gövdeyi okumadığı için bunları da ayıramaz; sonucu beklenmeyen 2xx / **Open** diye bildirir. Tek tip 404/403 erişimin reddidir; yeni fixture veya ek doğrulama taraması yapılmaz.
6. 401, ürün uygunluğu/restriction 403, 429, 5xx, ağ/TLS hatası veya yönlendirme durumunda ilgili aşama durur; otomatik refresh, retry veya alternatif hedef yoktur. Bunlar tek başına BOLA kanıtı değildir.

## Gerekli kaynaklar ve rapor sınırı

Zorunlu: root'un güvenli yürütücüsü; sahibinin seçtiği iki mevcut aktif TEST hesabının oturumları. Collector, yalnızca loopback native inspector'da `com.blumi.mobile` paketini ve Hermes hedefini doğrulayarak zaten başlatılmış SecureStore modülünden minimal oturum alanlarını belleğe alır; Firebase ID tokenı, ham actor veya telefon çıktısı üretmez. Demo/browser/expired oturumlar kabul edilmez; test hesabı sahipliği yine sahibinin seçimine dayanır.

Opsiyonel yabancı mesaj kontrolü için en az bir onaylı mevcut özel sohbet, erişememesi gereken karşı test hesabı ve aynı sohbetin mevcut son mesaj cursor'ı gerekir. Her iki yönü kontrol etmek için iki farklı özel sohbet gerekir; ortak A/B sohbeti yeterli değildir. Davet/oda nesnesi yetkisi ve ekonomi/envanter kontrolleri bu yürütücüde kapsam dışı **Blocked** kalır.

Hatalı capture, erken run, CLI kontrol hatası, iptal, exit, run sonu veya idle süresi dolduğunda bütün toplanan oturumlar temizlenir. Idle sınırı 20 dakikadır; capture/API işlemlerinin deadline'ı 8 saniyedir. API cevabı en fazla 256 KiB, yerel inspector listesi/CDP paketi en fazla 64 KiB alınır. Kanıt dosyası `wx` ile 0600 modunda oluşturulur; mevcut başka çalışmanın çıktısı üzerine yazılmaz.

Son kayıt: deneme sayısı, rota şablonu, A/B etiketi, HTTP durumu, veri adetleri, semantic boolean'lar, durdurma nedeni ve açık kalan yüzeyler. Kaynak veya gövde değerleri saklanmaz. Canlı deployment kimliği veya yerel güvenlik düzeltmelerinin yayına alındığı bu matristen çıkarılmaz. Kimlik doğrulamalı yetki reddi, doğrulanmamış yabancı 2xx, ekonomi/envanter ve davet kapıları ayrı raporlanır; eksik fixture PASS yerine **Blocked/Open** olarak yazılır.
