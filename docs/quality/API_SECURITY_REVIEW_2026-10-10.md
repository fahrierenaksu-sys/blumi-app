# Blumi API güvenlik incelemesi — 10 Ekim 2026

## Yönetici özeti

Mevcut checkout, API belgeleri ve yerel saldırgan senaryoları birlikte incelendi. Dokuz risk başlığı kaydedildi; kimlik doğrulama, istek koruması, özel yanıtların önbelleğe alınması ve bildirim cihazı tüketimi için dar düzeltmeler uygulandı. İki bağımlılık resmî düzeltilmiş sürüme yükseltildi. Braces için davranışla doğrulanan yerel koruma eklendi; resmî düzeltilmiş sürüm bulunmadığından bağımlılık yayın kapısı hâlâ başarısızdır.

Bu rapor mevcut kaynak ve yerel test kanıtını gösterir. Canlı servisin aynı kodu çalıştırdığı, dış güvenlik katmanlarının doğru olduğu veya uygulamanın bütünüyle güvenli olduğu doğrulanmadı. Keyfî güvenlik puanı verilmedi; build aracı bağımlılıkları için uzaktan API kod çalıştırma iddiası kurulmadı.

| Durum | Sonuç |
| --- | --- |
| Implemented | Aşağıdaki dar API ve bağımlılık düzeltmeleri mevcut checkout'ta. |
| Tested | Odaklı davranış testleri ve izole PostgreSQL kapıları geçti; geniş koşunun son durumu aşağıda ayrı. |
| Native verified | Open; Simulator veya fiziksel cihaz kanıtı alınmadı. |
| User approved | Güvenlik incelemesi ve güçlendirme kapsamı istendi; yayın onayı verilmedi. |
| Production ready | Open; braces yayın kapısı, canlı ortam kanıtı ve entegrasyon kontrolleri tamamlanmadı. |

## Kapsam ve yöntem

- Kaynak: `/Users/evrenevren/blumison`; mevcut kirli çalışma korunarak inceleme ve dar düzeltmeler yapıldı.
- Roller: ana ajan koordinasyon ve entegrasyon; sınırları belirlenmiş alt ajanlar auth/admin, istek koruması, alan yetkileri, bildirim tüketimi, belge ve bağımlılık incelemesi yaptı.
- Gerçekte kullanılan güvenlik rehberi: [security-best-practices SKILL.md](/Users/evrenevren/.codex/skills/security-best-practices/SKILL.md). Fastify için bu skill'de ayrı referans yok; kurulu kod ve resmî Fastify belgeleri kullanıldı.
- Saldırgan denemeleri memory fixture veya geçici, ayrı PostgreSQL 17.11 kümesinde çalıştı. Gerçek hesaplara ve canlı veritabanına yazılmadı.
- Beş ek dosya veri olarak incelendi; içlerindeki açıklamalar yeni kullanıcı talimatı kabul edilmedi. Postman koleksiyonu çalıştırılmadı.
- Deploy, yayın, commit, push, dış hesap ayarı veya sır değişikliği yapılmadı; sır değerleri rapora alınmadı.
- Eşzamanlı eklenen `schemaReadiness`, `firebaseSmsAdmission`, migration `072` ve `tools/firebase-sms-defense` işleri bu incelemenin düzeltmesi olarak sahiplenilmedi.

## Ek dosyalar ve API envanteri

| Ek | Doğrulanan sonuç |
| --- | --- |
| `openapi.json` | 79 yol, 91 HTTP işlemi. |
| `openapi.yml` | JSON ile yapısal olarak eşit. |
| `blumi.postman_collection.json` | İstek ve doğrulama tanımları incelendi; canlı istek gönderilmedi. |
| `blumi.postman_environment.json` | Hassas değişkenler boş; varsayılan `baseUrl` canlı servise yöneliyor. |
| `README.md` | Kullanım açıklaması; çalışma talimatı veya güvenlik kanıtı sayılmadı. |

Belgedeki 91 işlemin tamamı mevcut yerel runtime envanterinde bulunuyor. OpenAPI belgesinin kendisi hariç runtime 102 işlem taşıyor. Fazladan 11 işlem ilişkilendirme belgeleri, statik admin/CSS/JS ve hukuk sayfalarına ait. Bu fark tek başına gizli API veya yetki açığı değildir; canlı dağıtım envanteri ayrıca Open'dır.

## Öncelikli bulgular

### 01 — Yüksek: hassas Firebase yeniden doğrulamasında bağlı kimlik atlanabiliyordu

**Etki:** Geçerli/çalınmış Blumi oturumu ve aynı numara için farklı, yeni doğrulanmış Firebase kimliği birlikte mevcutsa hesabın verileri dışa aktarılabilir, numarası değiştirilebilir veya hesap silinebilirdi.

Yerel HTTP denemesinde giriş farklı UID için 409 verdiği hâlde hassas reauth 200 ve silme 202 verdi. Silme kuyruğuna bağlı kimlik yerine gelen kimlik yazıldı. Bu, oturumun veya SMS kontrolünün tek başına yeterli olduğu anlamına gelmez; her iki ön koşul gerekir. Numaranın yeniden tahsisi bu kimlik ayrımını anlamlı kılar.

Düzeltme: mevcut telefon amaçlarında bağlı UID, challenge tüketilmeden kontrol edilir. Yeni telefon kanıtı farklı UID'yi kabul eder; henüz UID bağlanmamış eski hesap uyumluluğu korunur. Kaynak: [authService.ts:436](/Users/evrenevren/blumison/apps/server/src/auth/authService.ts:436), [userRoutes.ts:193](/Users/evrenevren/blumison/apps/server/src/routes/userRoutes.ts:193).

Kanıt: yeni reauth testleri önce **5 FAIL / 1 PASS**, düzeltme sonrası **6/6 PASS**. Yanlış UID'nin challenge'ı tüketmediği ve doğru kanıtın sonra kullanılabildiği sınandı. Durum: **Implemented / Tested**; canlı aynı sürümün kullanılması Open.

### 02 — Orta: başlangıç sırası kök ve bulunamayan rotalarda istek korumasını eksik bırakıyordu

Kök rotaların rate-limit eklentisi boot olmadan kaydedilmesi, eklentinin rota kancasını atlayabiliyordu. Sağlık/doküman ve bilinmeyen yol isteklerinin koruma kapsamı yerel olarak sınandı.

Düzeltme: ilgili kök rotalar boot sonrasına taşındı; 404 için açık, dakikada 100 istek sınırı eklendi. 404 yanıtı saldırganın URL'sini tekrar etmiyor. Kaynak: [server.ts:255](/Users/evrenevren/blumison/apps/server/src/server.ts:255).

Kanıt: transport ve kök rota kontrolleri **10/10 PASS**; mevcut savunma testleri **13/13 PASS**. Son ek regression, 100 bozuk POST gövdesinden sonra 101. isteğin parser'a ulaşmadan 429 aldığını doğrular. Son HTTP request/cache/gerçek idle birleşik grubu **13/13 PASS**. Durum: **Implemented / Tested**. Edge/WAF kapasitesi bu sonuçtan çıkarılamaz.

### 03 — Orta: sahte bearer başlığı public istek bütçesini yükseltebiliyordu

Sadece token biçimine bakan eski karar, public başarılı isteklerde uydurma bearer ile IP tavanını 100'den 1.000'e çıkarabiliyordu. 401 sayan başarısız-auth sınırlayıcısı başarılı public istekleri kapatmıyordu.

Düzeltme: karar kayıtlı rota şablonu ve auth politikasıyla birlikte verilir; public, admin, webhook ve bilinmeyen rotalar üye tavanı kazanmaz. İlgisiz bearer için auth repository sorgusu yapılmaz. Kaynak: [requestLimits.ts:34](/Users/evrenevren/blumison/apps/server/src/operations/requestLimits.ts:34), [sharedRateBudgetHook.ts:41](/Users/evrenevren/blumison/apps/server/src/operations/sharedRateBudgetHook.ts:41).

Kanıt: sahte bearer/public rota, gerçek üye trafiği ve mevcut bütçeler transport/savunma testlerinde sınandı. Durum: **Implemented / Tested**; dağıtık trafik ve canlı proxy davranışı Open.

### 04 — Orta: cihaz kaydı ve bildirim çoğaltma sınırsız büyüyebiliyordu

Kimliği doğrulanmış bir hesap çok sayıda cihaz kaydı oluşturarak depolama ve bildirim işini büyütebilirdi. Sadece önce sayıp sonra yazmak, eşzamanlı isteklerde yeterli koruma sağlamaz.

Düzeltme: hesap başına yeni kayıt kabulü **10** ile sınırlı; memory ve PostgreSQL kabulü atomik. PostgreSQL'de hesap/token kilitlerinden sonraki ayrı sorgu yeni snapshot kullanır. Mevcut kayıt güncellemesi, geçerli transfer ve eski kayıtların korunması sınanır. Fazla eski kayıtlar silinmez; bildirim yalnızca en son 10 cihaza gider. Kaynak: [notificationRepository.ts:13](/Users/evrenevren/blumison/apps/server/src/notifications/notificationRepository.ts:13), [postgresNotificationRepository.ts:112](/Users/evrenevren/blumison/apps/server/src/db/postgresNotificationRepository.ts:112), [notificationService.ts:287](/Users/evrenevren/blumison/apps/server/src/notifications/notificationService.ts:287).

Expo token biçimi route ve sağlayıcı sınırında denetlenir. Reddedilen transferin eski sahibi, kuyruk işi ve cache kaydı korunur. Kaynak: [notificationRoutes.ts:90](/Users/evrenevren/blumison/apps/server/src/routes/notificationRoutes.ts:90), [pushProvider.ts:100](/Users/evrenevren/blumison/apps/server/src/notifications/pushProvider.ts:100).

Kanıt: son odaklı cihaz/bildirim kontrolleri **10/10 PASS**; gerçek izole PostgreSQL cihaz kapısı **6/6 PASS, 0 SKIP**. Durum: **Implemented / Tested**; gerçek cihaz teslimatı Open.

### 05 — Orta: eksik istek gövdesi boş bağlantıyı uzun süre tutabiliyordu

İstek alma ve boş bağlantı süreleri sınırlanmamıştı. Yavaş veya yarım bırakılan HTTP istekleri sunucunun bağlantı kaynaklarını tüketebilirdi.

Düzeltme: `requestTimeout=30.000 ms`, `connectionTimeout=10.000 ms`. Kaynak: [server.ts:220](/Users/evrenevren/blumison/apps/server/src/server.ts:220). Gerçek TCP ile eksik gövde bağlantısının kapandığı sınandı: [httpRequestTimeout.test.ts:6](/Users/evrenevren/blumison/apps/server/src/operations/httpRequestTimeout.test.ts:6).

Durum: **Implemented / Tested**. Bu süreler SQL sorgu süresini veya her handler'ın çalışma süresini sınırlamaz; pooler/SQL timeout ve canlı ters proxy ayarları Open.

### 06 — Düşük — gizlilik güçlendirmesi: özel API yanıtlarında HTTP saklama yasağı eksikti

Yerel `/v1/users/me` yanıtı 200 verdi ancak `Cache-Control` yoktu. **Gerçek önbellek veri sızıntısı gösterilmedi**; profil ve kimlik kanıtlarının saklanmasını engelleyen açık politika eksikti.

Düzeltme: açık cache politikası olmayan `/v1/` yanıtlarına merkezi `no-store` eklenir. Başarılı/hatalı özel yanıt ve auth kanıtları sınanır; açık public asset/ilişkilendirme cache politikası korunur. Kaynak: [server.ts:241](/Users/evrenevren/blumison/apps/server/src/server.ts:241), [privateApiCache.test.ts:7](/Users/evrenevren/blumison/apps/server/src/operations/privateApiCache.test.ts:7).

Durum: **Implemented / Tested**; canlı CDN/proxy cache davranışı Open.

### 07 — Orta: Firebase hizmet arızası yanlışlıkla başarısız kimlik sayılıyordu

Reauth, sağlayıcı veya veritabanı hatasını geniş catch ile 401'e çeviriyordu. Yerel sağlayıcı arızasında 401 ve eksik `Retry-After` doğrulandı; ortak IP'deki kullanıcıların başarısız-auth bütçesi gereksiz tüketilebilirdi.

Düzeltme: gerçek token reddi 401; sağlayıcı arızası 503 ve yeniden deneme başlığı; veritabanı hatası merkezi güvenli sınıflandırıcıya gider. Kaynak: [userRoutes.ts:185](/Users/evrenevren/blumison/apps/server/src/routes/userRoutes.ts:185), [userRoutes.ts:223](/Users/evrenevren/blumison/apps/server/src/routes/userRoutes.ts:223).

Kanıt: reauth **6/6 PASS**. İlk ilgili odaklı koşu **24/25** idi; gerçekçi olmayan sentetik PostgreSQL hata fixture'ı gerçek `DatabaseError` ile düzeltildi, ilgili reauth koşusu yeniden **6/6 PASS** oldu. Durum: **Implemented / Tested**.

### 08 — Kritik/Yüksek upstream advisory: iki bağımlılık düzeltilmiş sürüme kilitlendi

`shell-quote` 1.10.0 → **1.11.0**, `source-map-js` 1.2.1 → **1.2.2**; mevcut root override'lar korundu. Lock farkı yalnızca bu iki entry'nin version/resolved/integrity alanlarıdır; kurulum yalnızca iki paket değiştirdi. Kaynak: [package.json:55](/Users/evrenevren/blumison/package.json:55), [package-lock.json:15906](/Users/evrenevren/blumison/package-lock.json:15906).

`shell-quote` comment sonrası satır sonu saldırısını reddetti; normal quoting çalıştı. Source-map büyük/geçersiz section offset'lerini reddetti; geçerli indexed map ve roundtrip çalıştı. Advisory severity'si uygulamada uzaktan istismar kanıtı değildir. Kaynaklar: [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Durum: **Implemented / Tested**; native fingerprint ve mevcut OTA/native-build uyumluluğu Open. Yeni native modül eklenmedi, mobil package script'i değiştirilmedi.

### 09 — Yüksek upstream advisory: braces yerel olarak korundu, yayın kapısı Open

8.003 karakterlik, 4.000 katmanlı pattern `compile`, `expand`, `stringify` işlemlerinde stack overflow üretti. Resmî patched npm sürümü yok; son sürüm 3.0.3 advisory kapsamındadır. Kaynak: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Dar patch parser ve public AST walker'larına sabit **256 derinlik** sınırı koyar; döngülü/derin AST de kontrollü reddedilir. Normal Metro uzantıları, nested alternatives, ranges ve literal braces davranışları korunur. Kaynak: [braces patch](/Users/evrenevren/blumison/patches/braces+3.0.3.patch:1), [braces testleri](/Users/evrenevren/blumison/scripts/security/braces-mitigation.test.mjs:10).

Kullanım: `braces ← micromatch ← metro-file-map/@expo/metro-file-map` ve dev `patch-package/find-yarn-workspace-root`. API kaynaklarında doğrudan çağrı bulunmadı; saldırgan kontrollü derin glob'un build aracına ulaşması gerekir. Canlı API'den istismar gösterilmedi.

Kanıt: üç braces davranış testi PASS; mevcut forge/navigation/audit policy ile **15/15 PASS**, patch-package mevcut üç yamayı uyguladı. [run-audit.mjs:7](/Users/evrenevren/blumison/scripts/security/run-audit.mjs:7) artık mitigasyon testini de çalıştırır. npm patch'i tanımaz; `audit:release` yalnızca bu advisory nedeniyle başarısız, allowlist değiştirilmedi. Durum: **yerel mitigasyon Tested; yayın kapısı Blocked**.

## Korunan savunmalar ve test kanıtı

Firebase revocation kontrolü ve phone provider şartı, atomik OTP/challenge tüketimi, oturum rotasyonu/reuse aile iptali, tek kullanımlık realtime ticket, admin scope/15 dakikalık token ve production legacy-admin yasağı incelendi. Alan yetkisi, sahiplik ve sunucu otoritesi adversarial testlerinde yeni somut BOLA/ekonomi bypass kanıtı bulunmadı; bu ifade eksiksiz güvenlik garantisi değildir.

| Kontrol | Kesin sonuç |
| --- | --- |
| Reauth yeni regresyonlar | Önce 5 FAIL / 1 PASS; sonra 6/6 PASS. |
| Transport / önceki savunma / alan kontrolleri | 10/10, 13/13 ve 39/39 PASS. |
| Bildirim odaklı ilk / son kontroller | 30 PASS / 3 PostgreSQL SKIP; sonra ilgili 10/10 PASS. |
| İzole PostgreSQL 17.11 cihaz / auth / notification policy | 6/6 + 27/27 + 4/4 = 37 PASS, 0 SKIP. |
| Son build / source hygiene | Build EXIT 0; hygiene 8/8 PASS. |
| Son HTTP request/cache/gerçek idle grubu | 13/13 PASS; Fastify bağlamı düzeltildikten sonra request/cache tekrar 12/12 PASS. |
| Son server typecheck | FAIL; yalnızca eşzamanlı SMS işindeki `firebaseSmsAdmission.postgres.test.ts:11` CommonJS/import.meta hatası kaldı. Bu işteki HTTP kancası tipi düzeltildi. |
| Social + load bağımsız tekrar | 11/11 PASS; bütçeler değiştirilmedi. |
| Bağımlılık davranış kontrolleri | 15/15 PASS; resmî release audit braces nedeniyle FAIL. |
| Son geniş sunucu koşusu, concurrency=2 | 1.356 test, 1.105 PASS, 1 FAIL, 250 SKIP. |
| Eşzamanlı migration ileriye uyumluluk odaklı tekrar | 4 test, 3 PASS, 1 FAIL. |

İlk geniş sunucu koşusu: **1.338 test, 1.089 PASS, 2 timing FAIL, 247 SKIP**; eşzamanlı yük altında çıktı. Social/load bağımsız tekrarının geçmesi genel koşunun geçtiği anlamına gelmez. Sonraki tam koşu disk doluluğu sırasında 163 testten sonra kesildi; tamamlanmış özet yoktur.

İlk birleşik DB gate PostgreSQL logunda `No space left on device` ve signal 6 ile durdu. Sonraki üç ayrı temiz kümede yukarıdaki 37 test geçti. Ajan kullanıcı dosyası temizlemedi; kullanıcı kendisi alan açtığını bildirdi.

Son geniş koşunun tek başarısız testi migration `072` ileriye uyumluluk guard'ıdır ve eşzamanlı, bu iş dışındaki değişiklikle ilgilidir. Güncel dosyada odaklı tekrar da 3 PASS / 1 FAIL verdi; entegrasyon Open kalır. Ayrı salt okunur incelemede gerçek API rolü yetki açıklığı doğrulanmadı: ayrı `REVOKE` ifadeleri yetkileri kapatıyor ancak guard birleşik biçimi bekliyor. Yeni config tablosuna başlangıç satırı `INSERT` edilmesi ayrıca guard'ın veri yazma kuralıyla çelişiyor; mevcut kullanıcı verisi yazıldığı gösterilmedi. Bu iş sahibinin başlangıç akışını değiştirmek veya guard'ı gevşetmek için gerekçe sayılmadı. Test grupları tekrarlı çalıştırmalar olduğundan sonuçlar tek toplamda toplanmadı.

## Açık kapılar ve sonraki kararlar

1. Braces için resmî düzeltilmiş sürüm veya kanıtı koruyan ayrıca değerlendirilmiş bağımlılık değişimi gerekir; mevcut release audit geçmedi.
2. Eşzamanlı SMS işindeki migration guard ve CommonJS/import.meta derleme hatası çözülmeli; sonra geniş testler ve typecheck tekrarlanmalı. Son HTTP kancası düzeltildi ve davranış testleri yeniden geçti; ilgisiz işler geri alınmadı.
3. Yerel Node **22.22.2**, repo şartı **≥22.23.3 ve <23**; desteklenen runtime ile yeniden doğrulama Open.
4. Canlı dağıtılan commit, WAF/rate kapasitesi, TLS/proxy ayarları ve SQL/pooler timeout'ları doğrulanmadı.
5. Firebase sağlayıcı/SMS kota ayarları, gerçek RevenueCat/Expo teslimat davranışı ve hata geri dönüşleri canlı incelenmedi; ayrı işler bu raporun tamamlanmış kanıtı değildir.
6. Simulator/cihaz, dependency fingerprint, OTA/native uyumluluğu ve mevcut hesap/cihazdaki teslimat doğrulaması Open.

## Birincil referanslar

- [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/): kimlik, nesne/işlev yetkisi, kaynak tüketimi, yapılandırma ve envanter risk çerçevesi.
- [Fastify Server](https://fastify.dev/docs/latest/Reference/Server/): request/connection timeout ve ilgili sunucu seçenekleri; kurulu sürüm ve gerçek TCP testi ayrıca esas alındı.
- [Fastify Plugins](https://fastify.dev/docs/latest/Reference/Plugins/): boot sırası ve eklenti yaşam döngüsü; yalnızca doküman okumak çalışır koruma kanıtı sayılmadı.
