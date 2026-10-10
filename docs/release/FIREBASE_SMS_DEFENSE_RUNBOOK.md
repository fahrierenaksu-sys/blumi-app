# Firebase SMS koruması — canlı kurulum planı

Durum: **Implemented / Tested; Firebase function/migration kurulumu External verified, fiziksel cihaz/native kanıtı Open.** Sonraki açık onaylarla Identity Platform, restore-testli 072, iki kısıtlı DB/runtime kimliği, üç secret, App Check kayıtları ve iki function deploy tamamlandı. Telefon sağlayıcısı enabled kalır. Sahip **6 USD/gün + 20 USD/ay SMS**, 1.500 adet/gün ve kurulum izin mimarisini seçti. Yeni native build başlatılmadı; sahibi daha sonra alacak. Aşağıdaki şablonlar tekrar çalıştırılmaz; mevcut ledger/kimlik/secret sıfırlanmaz.

## İncelenecek paket

### Follow-up rollout, 2026-10-10

Owner authorized backend/function deployment plus commit and push to develop
and main in the current conversation. Migration 073 is applied and locked;
070/071 remain pending. Fresh dump and restore proof are recorded in
`DATABASE_RELEASE_RUNBOOK.md`. Backend `BLUMI_SMS_DEFENSE_HMAC_KEY` was copied
from the existing provider secret using stdin, without rotating it or
triggering a deployment. Observer-role SET permission was verified; membership
does not automatically inherit its grants. Firebase readback confirms Phone
enabled, ENFORCE, fraud threshold 0.5 and `useSmsBotScore=true`; the field-only
update preserved SMS fraud protection. Function redeployment and branch/server
deployment are verified below when complete. Native/real SMS proof remains Open.

New admission builds require the 073 checksum. Outcome recording is bounded
background backend work driven by fresh, server-verified phone tokens; there
is no added login blocking function. `verification_outcomes_enabled=false`
until observation health is verified on real clients. API shared budgets and
callable pre-database work ceilings apply independently of that switch.

- `tools/firebase-sms-defense`: ayrı codebase; Node 22; yalnız iki koruma function'ı.
- `blumiSmsDeviceGate`: App Check enforced + consume-token callable; platform/Firebase app ID eşleştirmesi, iOS üretim App Attest veya Android Play Integrity kanıtı, challenge/izin.
- `blumiBeforeSmsSent`: sağlayıcının imzalı olayı; numara izni ve SMS bütçesini aynı transaction'da tüketir; yalnız {} veya BLOCK, asla ALLOW.
- `072_firebase_sms_admission.sql`: altı güvenlik tablosu, iki NOLOGIN rolü ve sınırlı temizlik. 10 Ekim'de yedek/restore sonrası yalnız bu migration canlıya uygulandı; 24 hesap/22 envanter korunur. Applied checksum kilitlendi; dosya artık değiştirilemez.
- `policy-proposal.json`: 10 Ekim'de uygulanmış 72 ülke/tarife ve 6/20 USD sınırlarının kaynak snapshot'ı. Canlı readback yerine geçmez. Başlangıçtaki 21 SMS, kendi zamanlarında 0,21 USD ihtiyatlı ledger rezervasyonuyla içeri alındı; ücretsiz SMS indirimi uygulanmadı.
- Mobil App Check, AppIntegrity 57.0.2 ve expo-crypto yeni native bağımlılıklardır; mevcut binary'ye OTA ile eklenemez. AppIntegrity alpha'dır; sürüm ve API kilidi korunur.
- `build.mjs`: üç modülü paketler ve güncel migration SHA-256'sını üretir. Generated lib/schema-lock Git'e yazılmaz.

## Koruma sözleşmesi

Kurulum bütün numaralarda **3 izin/kayan 24 saat** paylaşır; izinler arasında 60 saniye. Challenge 120 saniye, hedef-numara izni 60 saniyedir; challenge tekrar/başka kurulum/başka hedef için tüketilemez. iOS imza sayacı transaction'da artar. Android kurulum değeri sunucuda verilir; her istekte lisans/paket/sertifika/cihaz/request-hash/zaman kanıtı doğrulanır. İstemcinin serbest deviceId iddiası kabul edilmez.

Numara 3/gün + 60 saniye; IP 10/15 dakika + 50/gün; proje 1.500/gün + 50/15 dakika. IPv4-mapped adres ve IPv6 /64 ortak bütçe kullanır. Geçerli ülke/fiyat/adet/para, günlük 6 USD ve UTC takvim ayında 20 USD **SMS öncesi** atomik ayrılır. Sabit noktalı micro-USD kullanılır; yeni tarife geçmiş SMS'i yeniden fiyatlandırmaz. İlk ücretsiz SMS'ler tahmine indirim olarak uygulanmaz; başarısız teslimatta hak iade edilmez.

Ayın koruma öncesi SMS harcaması zorunlu açılış bakiyesidir. Bilinmeyen/gelecekteki açılış ayı, eski/bilinmeyen ülke tarifesi, eksik/disabled politika, schema checksum, DB/TLS/kilit/timeout hatası: BLOCK. MFA ve tenant yolları bu sürümde engellenir.

**Sınırlar:** Firebase olayı cihaz nonce'unu taşımaz; izin telefon üzerinden eşleştirilir. Aynı hedef iznine başka çağrının yarışıp onu tüketmesi tamamen engellenmiş sayılmaz; farklı hedef veya ek ücretli SMS hakkı vermez. Yeniden kurulum/veri temizleme yeni kurulum bütçesi yaratabilir. DeviceCheck/risk ve Android device recall ek fiziksel cihaz katmanı uygulanmadı. Çok sayıda gerçek kurulum kalan bütçeyi tüketebilir. Vergi/kur/assessment/function/ağ ve fiyat değişimi nedeniyle 20 USD bütün Google faturası için garanti değildir.

## 1. Yerel kapılar

Desteklenen Node 22 kullan; şu adımlar sırayla geçmelidir. Hiçbiri canlı/native kanıtı değildir.

```sh
npm ci --ignore-scripts --prefix tools/firebase-sms-defense/functions
```

```sh
node tools/firebase-sms-defense/build.mjs
```

```sh
npm test --prefix tools/firebase-sms-defense/functions
```

```sh
node scripts/security/postgres-gate.mjs apps/server/src/auth/firebaseSmsAdmission.postgres.test.ts apps/server/src/auth/firebaseSmsDeviceGate.postgres.test.ts
```

```sh
npm audit --omit=dev --prefix tools/firebase-sms-defense/functions
```

Server/mobile typecheck, migration guard, platform proof testleri ve session runner da geçmelidir. Root release gate/remote CI ayrıca değerlendirilir; ilgisiz dirty çalışma korunur.

## 2. Açık canlı işlem onayı ve ücret

Yerel mimari ve 6/20 USD seçimi onaylıdır. [AGENTS.md](../../AGENTS.md), “Strict: production, money and data”, gerçek DB yazısı, üçüncü taraf hesap durumu, deploy ve EAS/TestFlight işlemleri için açık evet ister. Canlı kapsam: Identity Platform; PostgreSQL 17 dump/restore testi sonrası yalnız onaylı migration'lar; iki ayrı DB login/Google hizmet kimliği ve üç secret; iki koruma function'ı; App Check/Play Integrity kayıtları; yeni native build ve kontrollü fiziksel cihaz testleri. Başka bekleyen migration veya yıkıcı hesap işlemi otomatik kapsam değildir. Yayın/push/submit ayrıca kapsamı açık bir onay gerektirir.

Identity Platform sabit aylık abonelik listesi değildir: çoğu auth yöntemi MAU, telefon gönderilen SMS bazında ücretlenir. Standart MAU tablosunda ilk 50.000 ücretsizdir; bu SMS'i ücretsiz yapmaz. Function, assessment, Secret Manager, build/image/network/logging ayrıca değerlendirilir. [Google fiyatları](https://cloud.google.com/identity-platform/pricing?hl=en), [Cloud Run](https://cloud.google.com/run/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing)

## 3. DB ve açılış harcaması

Gerçek yazıdan önce [DATABASE_RELEASE_RUNBOOK.md](DATABASE_RELEASE_RUNBOOK.md): taze PostgreSQL 17 dump, özel saklama/hash, ayrı kümede restore, mevcut hesap/entitlement sayımları; bekleyen migration sırası/checksum/idempotence/yetki rehearsal. Migrate'ın yalnız 072'yi çalıştırdığı varsayılmaz. Başka bekleyen migration ayrı onay ister.

Politika hazırlanırken aynı advisory lock kullanılır. Aşağıdaki **yürütülmemiş şablon** kapalı başlangıçtır:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('blumi:sms-admission:v1', 0));
INSERT INTO blumi_sms_admission_config
(singleton, enabled, project_limit_24_hours, project_limit_15_minutes,
 cost_limit_24_hours_microusd, cost_limit_month_microusd, opening_month_utc)
VALUES (true, false, 1500, 50, 6000000, 20000000, NULL);
COMMIT;
```

NULL açılış ayı bilinçli engelleyicidir. Aktivasyondan önce daha önceki SMS harcaması, rapor gecikmesi ve sürmekte olan gönderimler ihtiyatlı okunup opening_month_utc/opening_cost_microusd doldurulur. Bilinmiyorsa sıfır kabul edilmez; mevcut ayın 20 USD'si tamamen ayrılarak kapalı tutulur veya veri doğrulanır. Ülke satırları incelenen teklif ve **güncel** fiyat/teslimat ile hazırlanır; teklifin 7 günlük geçerliliği bitmişse yenilenmeden SMS açılmaz.

İki kısıtlı login, API'nin geniş credential'ını kullanmaz: blumi_sms_defense ve blumi_sms_device_gate. Superuser/createdb/createrole/replication/bypassrls veya başka rol üyeliği yoktur. Parola çıktıya/SQL dosyasına/Git'e/komut argümanına yazılmaz. Gate politika/public-key değiştiremez, bütçe silemez, SMS ledger'ını okuyamaz. Hook challenge/kurulum profilini değiştiremez. Tüketim yalnız ayrılmış kolonlarda ve NULL → non-NULL yöndedir. App istemci rolleri tablolara erişemez.

Restore'da gerçek rollerle izin/kabul ve yasak yazıları test et. SMS harcamaları 62 gün, challenge/izin 48 saat saklanır; her tablodan en fazla 100 eski kayıt temizlenir. Kurulum public-key kayıtları kalıcıdır; yaşam döngüsü/seyrek orphan temizlik ayrıca tasarlanmalıdır. Pooler gerçek rol/transaction/advisory-lock/TLS davranışı doğrulanır; sertifika kontrolü kaldırılmaz.

## 4. Firebase, App Check ve IAM

Identity Platform yükseltmesinden sonra ENFORCE/0,5, Phone, API ve SMS kotaları, MFA/tenant durumu yeniden okunur. Otomatik App Check kurulmuş sayılmaz.

İki aynı-proje runtime kimliği: blumi-sms-defense ve blumi-sms-device-gate. Ayrı parametreler bu tam adları gerektirir; default geniş hesabı reddeder. Geniş Editor/Owner veya Firebase user yönetimi verilmez. Gate App Check token tüketimi ve Play Integrity decode için gereken en dar gerçek IAM/API/Play Console erişimiyle doğrulanır.

Üç secret: BLUMI_SMS_DEFENSE_DATABASE_URL, BLUMI_SMS_DEVICE_GATE_DATABASE_URL ve ortak BLUMI_SMS_DEFENSE_HMAC_KEY. Her runtime yalnız kendi DB secret'ını ve ortak anahtarı okur. Anahtar kriptografik rastgele en az 32 bayttır. TLS sertifika/hostname doğrulanır; no-verify/require/disable kabul edilmez.

Parametreler: iki hizmet hesabı; Apple Team ID; Android Play App Signing SHA-256 sertifika hash listesi (base64url); iki Firebase app ID. Gerçek app/proje/sertifika eşleşmeleri okunur; key/token/proof gösterilmez. iOS production App Attest capability ve App Check kaydı; Android Play Integrity API/Play Console bağlantısı ve lisanslı Play dağıtımı gerekir. Android Play ortamı olmayan cihazlar sıkı policy'yi geçemez; özellikle Çin ana karası desteği Open'dır.

HMAC rotasyonu telefon/IP/kurulum/challenge anahtarlarını değiştirir; 24 saat beklemek aylık bütçe ve kalıcı attested-key bağlarını korumaz. **Test edilmiş çift-key/alias ve bütçe taşıma planı olmadan rotasyon yapılmaz.** Ledger veya kurulum kayıtları silinerek limit sıfırlanmaz.

## 5. Deploy ve native sırası

Normal yayın sırası native/gerçek attestation kanıtından sonra enforcement'tır. **Bu beta oturumunda sahip backend korumasının şimdi etkinleşmesini, yeni build'i daha sonra almayı seçti.** Hook ve enabled politika canlı; Authentication App Check ENFORCED. Telefon sağlayıcısı enabled kaldı. Eski binary izin/kanıt üretemez, OTP reddedilir. Yeni build olmadan başarılı OTP veya native verified iddiası yoktur.

Yalnız bu codebase'in iki hedefi deploy edildi; tekil isim filtresi CLI'da eşleşmediğinden doğrulanmış hedef codebase'dir:

```sh
firebase deploy --project blumi-mobile-eren --only functions:blumi-sms-defense
```

Hook: europe-west1, 2 max instance, concurrency 1, 6 saniye; gate: aynı bölge/üst örnek, 15 saniye. Bu ayarlar kesin para tavanı değildir. Gerçek provider JWT ve App Check tüketimi, service IAM/TLS, schema lock ve Auth callback kaydı doğrulanır; deploy-success tek başına yetmez. Politika disabled iken provider bütün gerçek SMS'i reddetmelidir.

Aynı lock altında enabled ancak eksiksiz açılış/fiyat/kimlik/native kanıtlarıyla açılır. Mevcut test hesabı/kontrol edilen numara ile en fazla üç gerçek SMS; başka numaralara saldırı/yük testi yok. Kayıt/giriş, resend/yanlış kod, sign-out, kurtarma/export/silme/mevcut-yeni telefon akışları kontrol edilir. Yıkıcı silme ayrıca onay ister. Gerçek cold/warm p95/p99 hook süresi 7 saniye sağlayıcı sınırının altında ölçülür.

## 6. İzleme, kill switch ve geri dönüş

Açılış bakiyesi, tarife geçerliliği, kabul/ret nedenleri, kalan gün/ay bütçesi, ülke gönderim/doğrulama oranı, function/assessment harcamaları **toplu** izlenir. Ham phone/IP/user/key/proof/OTP loglanmaz. Fiyat 7 günde otomatik sonsuz uzatılmaz. Ücret uyarısı SMS için sert para tavanı sayılmaz.

Acil durumda aynı advisory lock ile enabled=false: izin ve SMS durur. Hook'u kaldırmak, ALLOW veya limitsiz başka yol açmak geri dönüş değildir. Son güvenli kapalı durum korunur. HMAC/schema/ledger kaybında mevcut bütçeler sıfırlanmadan ayrı recovery yapılır. Native rollback eski sürümün gate uyumluluğunu korumalı; korumayı atlayan eski binary'ye dönülmez.
