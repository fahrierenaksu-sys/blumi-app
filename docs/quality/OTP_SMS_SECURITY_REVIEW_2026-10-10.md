# Blumi OTP ve Firebase SMS güvenlik incelemesi — 10 Ekim 2026

## Sonuç ve sınır

SMS doğrudan mobil Firebase SDK'sı üzerinden gönderiliyor. Blumi sunucusunun `send-code` veya başka bir API'sine konan limit, Firebase'e doğrudan yapılan isteği durdurmaz. Telefona göre limit de farklı numara seçen saldırganı durdurmaz. Korumanın SMS sağlayıcısında, mesaj gönderilmeden önce çalışması gerekiyor.

İki canlı koruma sahibinin açık onayıyla değiştirildi ve Chrome'da kayıtlı değerleri tekrar okundu: Fraud Defense **ENFORCE**, eşik **0,5**; Identity Toolkit **Send Verification Code per day = 1.500**. Bu ikinci değer proje genelinde API kotasıdır; kullanıcı limiti veya para cinsinden harcama tavanı değildir. Önceki 4.000.000 değeri API kota ayarıydı; gerçekte o kadar SMS gönderilebildiğine dair kanıt değildir.

Son karar: **Firebase'de kalınacak.** Sahip kurulum izni mimarisini, **6 USD/gün ve 20 USD/ay SMS** ve 1.500 adet/gün tavanını seçti. **Identity Platform yükseltmesi, iki koruma function'ı, restore-testli migration 072, kısıtlı kimlik/secret/TLS ve App Check sağlayıcı kayıtları canlıya alındı.** Telefon sağlayıcısı kapatılmadı; ENFORCE korunur. Yeni native build ve gerçek cihazda geçerli App Attest/Play Integrity + SMS provası Open'dır. Eski binary cihaz izni üretemediği için OTP isteği reddedilir; sahip betada yeni build'i daha sonra almayı seçti. Sıfır açık kaldığı iddia edilmez.

| Durum | Kanıt |
| --- | --- |
| Implemented | OTP kısa yolu/taze phone-provider düzeltmeleri; App Check; iOS App Attest/Android Play Integrity kanıtı; ortak üç kurulum izni; sağlayıcıda tek kullanımlık izin ve parasal/ülke bütçesi. |
| Tested | Odaklı API/mobil testleri, izole PostgreSQL yarış/yetki testleri, SDK adaptör testleri ve typecheck geçti. Ayrıntılar aşağıda. |
| External verified | Identity Platform, iki ACTIVE function, beforeSendSms URI, Phone enabled, ENFORCE, 72 ülke allowlist; ayrı runtime kimlikleri/secret erişimi; gerçek pooler üzerinden doğrulanmış TLS ve kısıtlı DB rolleri. Kanıtsız callable 401, imzasız provider çağrısı 400; gerçek SMS gönderilmedi. |
| User approved | Firebase ve izin/bütçe mimarisi; geri alınamayan Identity Platform yükseltmesi ayrıca onaylandı; backend deploy, bütün değişiklikleri commit/main push; beta yeni native build daha sonra. |
| Native verified | Open; bu çalışmada cihazdan gerçek OTP giriş/kurtarma/silme/export/numara değiştirme yapılmadı. |
| Production ready | Open; fiziksel cihazda geçerli attestation, yeni binary ve gerçek SMS kanıtı; Android Play lisansı/bağlantı ve gerçek signing certificate doğrulaması; saldırı altında servis maliyeti/erişilebilirlik kanıtı. |

### Canlı kurulum kanıtı — bu oturum

- PostgreSQL 17 owner-only public-schema yedeği: `public-pre-sms-072-2026-10-10T00-03-15.942Z.dump`; SHA-256 `7e54bb6444b110517a84e7fdfbec912d7670a8e14ee9c050f49e7aca16436995`, 517.249 bayt. Ayrı restore kümesinde 24 hesap/22 envanter, değişiklik provası ve ikinci çalıştırmada sıfır uygulama, sıfır integrity bulgusu. Canlıya yalnız 072 uygulandı; 070/071 beklemeye devam ediyor. 072 checksum `7ce728adc69e7b285d5631440a1da71b807a038a483ce2ce597706906b80c18e` applied manifest'e kilitlendi.
- İki function: europe-west1, Node 22, ayrı kimlik, 0 minimum/2 maksimum instance, concurrency 1, 0,1666 CPU, 6/15 saniye. Artifact görüntülerine 7 günlük temizlik kuruldu. İki kısıtlı DB kimliğinde uygulama hesaplarını okuma yetkisi yok. Gate için App Check token verifier/service usage ve kendi DB/ortak HMAC secret erişimi verildi; runtime'a Owner/Editor verilmedi.
- GCP gönderilen SMS metriği 1 Ekim'den itibaren TR için 21 SMS gösterdi; numara/token okunmadı. Geçmiş SMS'ler, ücretsiz gönderim indirimi uygulanmadan, kendi zamanlarında açılış ledger'ına dahil edilir; bu hem kayan günlük hem takvim ayı bütçesini korur. Metric verisi fatura belgesi değildir. Son aktif politika readback'i ayrıca kaydedilir.
- Yeni raw-fetch ihlali ortak `requestJson` deadline/body-read/cancellation yoluna taşındı; mimari allowlist büyütülmedi. Chat E2E eşit-ms history sırasını doğrular; canlı sıralı teslim kanıtı korunur. PostgreSQL yarış testi sabit uyku yerine gerçek transaction lock bekler. Başarılı fixture DB'leri her dosyadan sonra kaldırılır; yalnız o invocation'ın disposable verileri kapsamdır.
- Braces için resmî düzeltilmiş sürüm yok. İncelenen yamalı 3.0.3 kopyalarının tamamında recursion/AST/Metro davranış kanıtı zorunlu; yalnız bu düzeltmeye, 16 Ekim'e kadar dar audit istisnası eklendi. Test/patch düşerse gate fail olur. Resmî düzeltmede yama/istisna kaldırılmalı; kalıcı muafiyet değildir.

### Aktif politika readback — 10 Ekim 00:32 UTC

`enabled=true`; proje 1.500/kayan 24 saat ve 50/15 dakika; 6.000.000 / 20.000.000 micro-USD; 72 etkin ülke. Ay başındaki 21 SMS kendi zamanlarında ledger'a aktarıldı: ihtiyatlı aylık 210.000 micro-USD (0,21 USD), kayan 24 saatte 140.000 micro-USD (0,14 USD). Ayrı açılış kolonunun sıfır olması bu ledger debit'lerinin silindiği anlamına gelmez. İlk ücretsiz gönderim indirimi uygulanmadı. Sıfır cihaz kaydı/izin: henüz gerçek cihaz provası yapılmadı. Fiyat geçerliliği **17 Ekim 00:00 UTC**; güncellenmezse SMS fail-closed durur. Phone enabled, ENFORCE, hook ve 72 ülke sağlayıcı allowlist tekrar okundu.

### Saldırgan değerlendirmesi

**Pratik mimari notu: 7/10; Native verified Open.** Para/kabul kararı sağlayıcı önünde, atomik ve kısıtlı role bağlıdır; UI/numara/IP değiştirmek tek başına bu ortak bütçeyi sıfırlamaz. Kurulum kimliği başına üç hak vardır; tek insan veya tek fiziksel telefon için değişmez üç hak kanıtı yoktur. Yeni iOS attestation anahtarı veya yeni Android kayıt kimliği (yalnız yeniden kurulum değil), enstrümante gerçek uygulama ve gerçek cihaz çiftliği yeni kurulum bütçeleri yaratabilir. Apple DeviceCheck/risk ve Android device recall ek katmanları uygulanmadı.

Saldırgan hâlâ izinli haklarla istenmeyen SMS üretebilir veya proje/ülke/para kotasını tüketip gerçek kullanıcıları engelleyebilir. Firebase telefon izni nonce'u taşımaz: aynı numaranın kısa izin penceresine yarışan başka çağrı o tek izni tüketebilir. Bu yarış başka hedef/ek SMS hakkı üretmez. Reddedilen çağrılar da function/App Check/risk assessment/ağ/log maliyeti doğurabilir; **20 USD bütün Google faturası için sert tavan değildir**. Değişen tarife/vergiler ve fiziksel cihazda henüz kanıtlanmamış entegrasyon nedeniyle 10/10 veya sıfır açık iddia edilmez.

Son kontroller: mobil 41 grup **3.104/3.104 PASS**, PostgreSQL 61 dosya **416/416 PASS, sıfır skip**, function **8/8 PASS**; tüm workspace typecheck, lint (0 hata, 2 mevcut uyarı), npm lock dry-run ve üretim audit kapısı geçti. Expo sürüm/hoist uyuşmazlığı npm 11 ile giderildi; **Expo Doctor 21/21 PASS**. Eski toplu verify çıktısındaki failure'lar bu son kontrollerin yerine kullanılmaz; CI'nin birleşik komutu ayrıca çalışır. Gerçek SMS/native/Android Play dağıtımı kanıtı Open.

## Aynı kişi farklı numaralara giderse

Giriş öncesinde doğrulanmış Blumi hesabı bulunmaz. Telefon numarası, IP, rastgele kurulum kimliği veya App Check tek başına bir kişinin değiştirilemez kimliği değildir. İstemcinin gönderdiği `userId`/`deviceId` değerine güvenip “kişi başına kesin 3” demek yanlış olur. App Check uygulama/cihaz güven sinyalidir; tekil insan kimliği değildir.

Hazırlanan başlangıç politikası bütün kayıt/giriş/kurtarma ve hesap işlemlerindeki Firebase SMS isteklerini aynı bütçeye bağlar:

| Boyut | Sınır | Ne engeller? |
| --- | --- | --- |
| Aynı telefon | Son 24 saatte 3 kabul; kabul arası 60 saniye | Aynı numarayı farklı IP/ekran üzerinden tekrar tekrar hedeflemek. |
| Doğrulanmış uygulama kurulumu | Son 24 saatte bütün numaralar için toplam 3 izin; izinler arası 60 saniye | Aynı kurulumdan hedef numara/IP/hesap değiştirerek yeni bütçe açmak. Fiziksel cihazın değişmez kimliği olarak sunulmaz. |
| Aynı IPv4 veya IPv6 /64 | 15 dakikada 10, son 24 saatte 50 kabul | Aynı adres üzerinden farklı hedef numaralar seçmek. IPv6 adresinin son kısmını değiştirmek yeni bütçe oluşturmaz. |
| Proje | Son 24 saatte 1.500 kabul | Telefon ve IP birlikte değiştirilse de toplam gönderim iznini sınırlamak. |
| Proje kısa pencere | 15 dakikada 50 kabul | Dağıtılmış ani gönderim artışını sınırlamak. |
| SMS tarife bütçesi | Kayan 24 saatte 6 USD, UTC takvim ayında 20 USD | Ülke değiştirilse de ortak parasal rezervasyonu korumak. Açılış ayının önceki harcaması ayrıca düşülür. |
| Ülke | Onaylı politika + geçerli fiyat + ülke adet/para tavanı | Bilinmeyen, kapalı veya eski tarifeli ülkeye gönderimi reddetmek. |
| Firebase risk değerlendirmesi | ENFORCE, 0,5 | Sağlayıcının riskli bulduğu SMS istekleri. Yerel bütçe izni bu kararı geçersiz kılamaz. |
| GCP günlük API kotası | 1.500 | Sağlayıcı API'sinde ikinci proje tavanı. Özel bütçenin kayan 24 saat penceresinden farklı bir kota penceresidir. |

Bu sayılar **SMS kabul bütçesidir**, teslim edilen mesaj sayısı değildir. Başarısız teslimatta rezervasyon geri verilmez; tekrar fırtınası bütçeyi yeniden açamaz. Aynı telefonun farklı özelliklerde kullanımı ortak üç hakkı tüketir. Bu nedenle kayıt + export + silme gibi işlemler aynı gün meşru kullanıcıyı da sınıra getirebilir.

IP limitleri ortak operatör/okul/ofis adresindeki bağımsız kullanıcıları etkileyebilir. Başlangıç değerleri güvenlik odaklıdır; anonim toplu kabul/ret oranları ölçülerek değiştirilmeli. Limit değişikliği hem kısa hem uzun pencereyi birlikte korumalı. Çok sayıda geçerli cihaz/IP kullanan saldırgan yine toplam kotayı tüketip giriş hizmetini aksatabilir. App Check ve dar ülke politikası bu riski azaltır; toplam kota tek başına kullanılabilirlik garantisi değildir.

## Canlı ayar incelemesi

| Kontrol | Okunan durum | Bu çalışmada yapılan |
| --- | --- | --- |
| Fraud Defense | Başlangıçta AUDIT; mevcut eşik 0,5 | Açık onayla ENFORCE yapıldı; yeniden yükleme sonrası ENFORCE/0,5 okundu. |
| Günlük Send Verification Code API kotası | Başlangıç 4.000.000 | Açık onayla 1.500 kaydedildi; konsol güncellemeyi onayladı; sonraki okuma da 1.500. |
| Sign-in providers | Yalnız Phone etkin | Okundu; değiştirilmedi. |
| SMS MFA | Identity Platform yükseltmesi isteyen ekran | Kullanılabilir olarak kabul edilmedi; aday tetikleyici MFA türlerini engeller. |
| App Check | Get started ekranı | Kurulu/enforced sayılmadı; değiştirilmedi. |
| Blocking functions | Identity Platform yükseltmesi isteniyor | Özel beforeSmsSent kurulmadı. |
| User activity logging | Identity Platform yükseltmesi isteniyor | Etkinleştirilmedi. |
| SMS region policy | Türkiye dahil geniş çok ülke allowlist'i | Daraltılmadı; hedef pazar kararı gerekiyor. |
| API anahtar kısıtları | iOS/Android/Browser otomatik anahtarlarında 25 API; Identity Toolkit dahil; uygulama kısıtı None | Okundu; değer gösterilmedi veya ayar değiştirilmedi. Kullanılan binary/anahtar eşleşmesi ve en dar uyumlu liste Open. |
| Bütçe/uyarı ve geçmiş SMS fatura ayrıntısı | Doğrulanmadı | Open; aşırı fatura olayının zaman/ülke/mesaj bazında kanıtı alınmadı. |

Sign-in ekranı yeni faturalı projeler için ayrı 1.000 SMS/gün kotası hakkında genel uyarı da gösteriyor. Bu banner tek başına projenin etkin gerçek gönderim limitini kanıtlamaz; 1.500 API kotasının sağlayıcının diğer limitlerini yükselttiği söylenemez. Identity Platform yükseltmesinden sonra diğer limitler yeniden kontrol edilmelidir.

## API ve akış bazında inceleme

| Nokta | SMS gönderimi / yetki sınırı | Bulgular ve mevcut davranış |
| --- | --- | --- |
| Mobil `requestFirebasePhoneCode` / Firebase `accounts:sendVerificationCode` | Ücretli SMS'in gerçek giriş noktası; Blumi API'si atlanabilir | Öncesinde özel bütçe yoktu. ENFORCE ve kota şimdi canlı; `beforeSmsSent` aday koruması dağıtılınca doğrudan SDK/REST istekleri de aynı bütçeye girer. |
| Firebase `accounts:signInWithPhoneNumber` | Gelen kodu doğrular; yeni SMS göndermekle aynı işlem değildir | Mobil wrapper altı rakam ister ve gerçek `confirmation.confirm` çağırır. Yanlış/boş kod artık eski Firebase oturumuyla atlanamaz. Sağlayıcı kod deneme kontrolleri için canlı saldırı yapılmadı. |
| `POST /v1/auth/firebase/complete` | İmzalı Firebase kanıtını Blumi oturumuna çevirir | Admin SDK revocation kontrolü var. Phone provider şartı ve son 5 dakikada `auth_time` eklendi. İleri saat sapması 30 saniyeyi aşarsa reddedilir. İstemci telefonu yerine doğrulanan token telefonu kullanılır; bilinmeyen sign-in hesap oluşturmaz. |
| `POST /v1/auth/send-code` | Eski sunucu OTP yolu | Firebase verifier mevcutsa 410; gerçek SMS yolu değildir. Yerel geliştirici SMS sağlayıcısı mesaj göndermez. |
| `POST /v1/auth/verify` | Eski OTP doğrulama | Firebase modunda 410. Yerel OTP deneme/tüketme kontrolleri ayrıca test edildi; Firebase gönderim faturası koruması olarak sayılmadı. |
| `POST /v1/accounts/register` | Eski kayıt OTP yolu | Firebase modunda 410; geçerli Firebase kanıtı olmadan yeni yolun yerine kullanılamaz. |
| `POST /v1/account/firebase/challenge` | Oturum ve amaç bağlı taze doğrulama challenge'ı | SMS göndermez. Amaç/hedef/session bağlama mevcut kaynakta incelendi. Bir API challenge'ı tek başına Firebase'in doğrudan SMS API'sini engellemez. |
| `POST /v1/account/firebase/reauth` | Silme/export/mevcut-yeni telefon için taze kanıt | Amaç, oturum, hedef ve `auth_time` bağlı tek kullanımlık challenge mevcut. Eşzamanlı ayrı güvenlik çalışmasındaki bağlı Firebase UID kontrolü korunarak test edildi; o düzeltme bu çalışmaya ait sayılmadı. |
| `POST /v1/account/deletion/challenge` ve `/confirm` | Eski silme OTP yolu | Firebase modunda 410. Mobil mevcut Firebase numarasına SMS ister; yeni sağlayıcı bütçesi aynı numara hakkını kullanır. |
| `DELETE /v1/account` | Hesap silme | SMS göndermez; uygun tek kullanımlık silme onayı gerekir. Firebase silme kuyruğu/revocation senaryoları mevcut testlerle doğrulandı. |
| `POST /v1/account/export/challenge` ve `/confirm` | Eski export OTP yolu | Firebase modunda 410. Mobil Firebase onayı ayrı amaç challenge'ına bağlanır; sağlayıcı bütçesi ortak. |
| `POST /v1/account/export` | Özel veri dışa aktarımı | SMS göndermez; uygun export onayı gerekir. Export onayı diğer amaçta kullanılamaz; özel yanıt önbellek kontrolü ayrı mevcut API çalışmasına aittir. |
| `POST /v1/account/phone-change/current/challenge` ve `/confirm` | Mevcut numara kanıtı | Eski yol Firebase modunda 410. Firebase reauth mevcut numarayı ve bağlı kimliği doğrular. |
| `POST /v1/account/phone-change/new/challenge` ve `/confirm` | Yeni numara kanıtı | Eski yol Firebase modunda 410. Yeni telefon kanıtı ayrı amaç/hedefe bağlıdır; numara değiştirmek IP/proje SMS hakkını sıfırlamaz. |
| `POST /v1/account/phone-change/confirm` | Telefon değişikliğini kaydeder | SMS göndermez. Mevcut ve yeni numaranın iki uygun onayı gerekir; değişiklik oturumları geçersiz kılar. |
| `POST /v1/account/recovery/challenge` | Eski kurtarma OTP yolu | Firebase modunda 410; doğrulanmamış bir numara için gerçek SMS göndermez. |
| `POST /v1/account/recovery/requests` | Yeni numara kanıtıyla manuel inceleme isteği | SMS göndermez. Eski `auth_time` artık kuyruğa yazamaz; dış yanıt 202 kalır. Yeni numarayı doğrulamak eski hesabın sahipliği değildir; otomatik hesap devri yapılmaz. |
| `POST /v1/auth/refresh` | Blumi oturum yenileme | SMS göndermez. Normal oturum yenilemesine 5 dakikalık telefon kanıtı zorunluluğu eklenmedi; her yenilemede yeniden SMS gerekmez. |
| Firebase MFA start endpoints | Etkinleştirilirse ek ücretli SMS yolu olabilir | Canlı MFA mevcut görünmüyor. Aday bütün bilinmeyen/MFA SMS türlerini reddeder; MFA açılacaksa aynı bütçenin kontrollü genişletilmesi ve test gerekir. |

Firebase Auth anahtarı mobil uygulamada görünür; onu saklamak ana koruma değildir. Giriş formunun düğmesini kapatmak, CORS, Blumi API IP limiti veya istemciye yazılan günlük sayaç doğrudan Firebase çağrısını tek başına durdurmaz. API anahtarının diğer Google API'lerine erişimi ayrıca daraltılmalı; iOS reCAPTCHA geri dönüşü doğrulanmadan kör kısıtlama uygulanmamalı.

Okunan Browser anahtarı listesi Identity Toolkit/Token Service yanında Firebase AI Logic, Phone Number Verification, ML/ML Kit, Firestore/Datastore, Cloud SQL Admin, Logging, Hosting, Storage, Remote Config ve başka Firebase yönetim API'lerini de içeriyor. Whitelist'te yer almak bu API'nin etkin/ücretli kullanılıyor olması veya anahtarın IAM/user-data yetkisi vermesi demek değildir. Blumi'nin fiilen kullandığı Auth/FCM/Installations ve kurulacak App Check yolları native testle eşleştirildikten sonra gereksiz servisler listeden çıkarılmalı. Bu incelemede o API'lerde yetkisiz veri erişimi veya ek faturalanabilir çağrı kanıtı elde edilmedi.

## Düzeltilen somut açıklar

### Eski Firebase oturumu girilen kodu atlıyordu

`useSessionState` önce aynı numara için önbellekteki Firebase token'ını alıyor, bulursa `confirmation.confirm(code)` çağırmıyordu. Kayıt ekranında da zaten doğrulanmış telefon için SMS/kod adımı atlanabiliyordu. Aynı cihazdaki eski doğrulama yeni girilen kodun doğruluğu gibi kullanılıyordu.

Bu yollar kaldırıldı. Kayıt/giriş için bekleyen numara bağlı confirmation gerekir; yanlış numara, eksik challenge, başarısız kod gönderimi ve yanlış kod sunucuya hesap tamamlama çağrısı üretmez. Token refresh hâlâ Firebase SDK'da vardır; taze OTP'nin yerine geçirilmez.

### Telefona bağlı başka sağlayıcı token'ı telefon kanıtı sayılabiliyordu

Admin verifier daha önce yalnızca `phone_number` alanını arıyordu. Artık `firebase.sign_in_provider === "phone"` ve pozitif tam sayı `auth_time` gerekir. Phone-linked password/Google/custom/anonymous token'ları reddedilir. Geçerli imza, doğru proje ve revocation kontrolünü Firebase Admin SDK yapar.

### Taze ID token eski telefon doğrulamasını yeniliyordu

Giriş/kayıt tamamlama ve kurtarma isteği artık son 5 dakika içindeki telefon doğrulamasını ister. Token'ın yeniden basılması bu zamanı değiştirmez. Bu pencere tek kullanımlık giriş nonce'u değildir; geçerli kanıt pencere içinde tekrar kullanılabilir. Hassas hesap işlemlerinde mevcut tek kullanımlık amaç challenge'ı ayrıca uygulanır. Bu ayrım saklanmaz.

### Fatura koruması yanlış sınırda kalıyordu

Yeni `beforeSmsSent` paketi, Google'ın doğruladığı sağlayıcı çağrısından gelen telefonu/IP'yi kullanır. İstemcinin `userAgent`, hesap veya cihaz iddiasını bütçe anahtarı yapmaz. Her izin tek bir PostgreSQL transaction ve ortak advisory lock altında ayrılır. Bağımsız function örnekleri ve farklı numaralar aynı tabloyu kullanır; bellek sayacı veya yeniden başlatmada sıfırlanan sayaç yoktur.

Şema checksum'u, politika, saat, veri tabanı veya kilit/bağlantı yanıtı bulunamazsa SMS engellenir. Politika satırı yoksa veya disabled ise engellenir. Aynı sağlayıcı olayının tekrar gelişi yeni izin alamaz. Kabul yanıtı `{}` olur; **ALLOW dönmez**, Google'ın ENFORCE kararını geçersiz kılmaz.

## Veri, yetki ve işletim sınırları

- Numara/IP/olay için ayrı alan etiketleriyle HMAC-SHA256 kullanılır. Veritabanına ham telefon, IP, OTP veya Firebase user ID yazılmaz. HMAC verileri yine takma kimlikli güvenlik verisidir; kamuya açık/anonim veri sayılmaz.
- Yeni tablolar RLS ve PUBLIC/anon/authenticated REVOKE ile kapalıdır. Ayrı `blumi_sms_defense` rolü sadece politika/checksum okur, rezervasyon okur/ekler. Politikayı değiştiremez, yeni bütçe kayıtlarını silemez.
- Sınırlı SECURITY DEFINER temizleme fonksiyonu SMS harcama kayıtlarını **62 gün**, kurulum izin/challenge kayıtlarını **48 saat** korur; her tablodan en fazla 100 eski kayıt temizler. Aylık harcama geçmişi günlük sayaç gibi silinmez. PUBLIC erişimi yoktur. Trafik durunca temizlik de durur; sürekli silme zorunluluğu varsa ayrı onaylı bakım işi gerekir.
- Function için ayrı aynı-proje hizmet hesabı parametresi zorunludur; geniş yetkili varsayılan hizmet hesabı kabul edilmez. Gerçek IAM yetkilerinin dağıtımdan önce okunması hâlâ gerekir.
- Veri tabanı TLS sertifikası doğrulanır. Bağlantı 2 saniye, sorgu 3 saniye; transaction statement/lock/idle sınırları vardır. Function 6 saniye ile sınırlıdır; hata/timeout gönderimi açmaz.
- Function örneği üst sınırı 2, örnek başına eşzamanlılık 1. Bu fatura veya DoS garantisi değildir. Başka Firebase ürünleri, function/assessment/network faturaları bu SMS kotasından bağımsızdır.
- Üretim fonksiyonu emulator/debug doğrulama modunu reddeder. Gerçek sağlayıcı JWT kontrolünü kurulu Firebase Functions/Admin SDK yapar. Birim testte bu kriptografik doğrulama mock'tur; canlı imza/çağrı kanıtı ayrı kapıdır.
- Ham sağlayıcı olayları veya hata nesneleri kendi handler'ımızda loglanmaz. Sağlayıcının kendi logging davranışı ve operatörlerin erişimi ayrıca canlı denetlenmelidir. İzleme yalnız toplu sayılar ve sabit ret nedenleri kullanmalıdır.

## Test kanıtı

Desteklenen **Node 22.23.3** izole npm paketinden kullanıldı; Mac'in küresel Node kurulumu değiştirilmedi. Canlı Firebase'e yük testi veya ücretli SMS fırtınası yapılmadı. Yerel küme gerçek PostgreSQL'dir; üretim `DATABASE_URL` kullanılmadı.

| Kontrol | Sonuç |
| --- | --- |
| Son odaklı API/mobil/OTP/migration grubu | 135 PASS, 0 FAIL, 0 SKIP. |
| Son mobil session runner | 289 + 214 PASS, 0 FAIL, 0 SKIP; eşzamanlı ayrı API refactor'u sonrası güncel gruplar; toplamlar diğer gruplarla çakışabilir. |
| SMS PostgreSQL kabul/yetki/yarış testleri | 7 PASS, 0 FAIL, 0 SKIP; 72 migration sıfırdan ve rerun geçti. |
| Function adaptörü ve gerçek SDK olay biçimi | 6 PASS, 0 FAIL, 0 SKIP; fake imza kararı sonrasında SDK dönüşümü, reddedilen çağrının admission'a ulaşmaması, ayrı sınırlı runtime manifest'i ve debug yasağı sınandı. |
| Sunucu ve mobil typecheck | EXIT 0. |
| Ayrı function kilitli dependency install/audit | 258 paket denetlendi; 0 advisory. |
| Sunucu build | EXIT 0. |
| Geniş sunucu testi, concurrency=2 | 1.376 test: 1.118 PASS, 1 FAIL, 257 SKIP. Chat mesaj sırası testi başarısız; OTP/migration testleri geçti. |
| Ayrı social + load tekrar | 11 test: 10 PASS, 1 FAIL; aynı chat mesaj sırası hatası tekrarlandı. Genel yayın kapısı geçti denmez. |
| Simulator / fiziksel cihaz / canlı beforeSmsSent | Open. |

Son cihaz/para katmanı eklemesinden sonraki yeni kanıt: SMS admission PostgreSQL **13 PASS**, cihaz gate PostgreSQL **6 PASS** (ayrı iki havuz/kısıtlı rol); cihaz sayaç testinin zamana dayalı yarış yerine deterministik bariyerle tekrarı **6 PASS**; odaklı API/crypto/migration/readiness **45 PASS**; mobil session runner **289 + 224 PASS**; standalone function **7 PASS**. Bu gruplarda **0 FAIL / 0 SKIP**; toplamlar birbiriyle çakışabildiği için tek toplam olarak sunulmaz. Son server/mobile typecheck **EXIT 0**, standalone production dependency audit **0 advisory**, diff whitespace kapısı geçti. App Check middleware kriptografisi yerel testte mock, Google decode/verdict birim testinde stub, ilk gerçek Apple attestation sertifikası fiziksel cihazdan henüz alınmadı. iOS sonraki assertion için gerçek üretilmiş P-256 imzası, hedef/payload değişimi ve eski sayaç reddi çalıştırıldı. Bu kanıtlar gerçek cihaz/live IAM/TLS/root release PASS değildir.

Root dependency audit mevcut Expo zincirinden gelen bulgularla hâlâ Open'dır (32 bulgu; yeni App Check paketi aynı zinciri devralır). Ayrı function paketi 268 paketle 0 advisory verdi. Root'a kör audit-fix/downgrade uygulanmadı; diğer güvenlik çalışmasının dirty dependency düzeltmeleri korundu. Önceki geniş chat sırası hatası bu cihaz katmanı çalışmasında çözülmüş sayılmaz.

PostgreSQL senaryoları: aynı numaraya 20 eşzamanlı istekten tek kabul; farklı örnek/IP ile aynı numarada üç kabulden sonra ret; farklı numaralara aynı IP'den 20 istekten 10 kabul; hem numara hem IP değişirken küçük test proje tavanında tam beş kabul; tekrar/eski/ileri tarihli olay reddi; kısıtlı gerçek DB rolüyle başarılı kabul ve politika/silme yasağı. Küçük proje tavanı yalnız test fixture'ındadır; aday varsayılanı 1.500'dür.

CI'ye ayrı function install/build/test/audit adımı eklendi. CI uzak çalışması yapılmadı. Bütün root release kapılarının geçtiği iddia edilmez; eşzamanlı API çalışmasının bağımlılık/release durumu kendi raporunda değerlendirilmelidir.

Canlı şema durumunu SSL doğrulaması ve READ ONLY transaction ile okuma denemesi tamamlanamadı; hata/bağlantı ayrıntıları veya credential gösterilmedi. Gerçek migration sırası ve login/ağ/TLS yetkisi bu yüzden ayrıca Open. Herhangi bir gerçek DB yazısı yapılmadı.

## Kalan kararlar ve canlıya alma

1. **Identity Platform + özel beforeSmsSent:** İncelenebilir paket ve kurulum sırası [runbook](../release/FIREBASE_SMS_DEFENSE_RUNBOOK.md) içindedir. Yükseltme, gerçek DB değişikliği, yeni ayrı kimlik/secrets ve function deploy için açık onay gerekir. Önce taze PostgreSQL 17 dump ve restore kanıtı, sonra migration/roller, sonra tetikleyici ve kontrollü test. Bunlar henüz yapılmadı.
2. **App Check:** Doğrulanmış uygulama/cihaz katmanı kurulmalı. Mevcut dağıtılan mobil binary bu entegrasyonu destekliyor diye varsayılmadı. Önce native SDK/provider kurulumu ve fiziksel cihaz testi, sonra trafik ölçümü, sonra Authentication enforcement. Hazırlıksız canlı enforcement meşru girişleri kesebilir.
3. **SMS ülkeleri:** Türkiye dışındaki gerekli hedef ülkeler belirlenmeli; geri kalanı allowlist'ten çıkarılmalı. Bu çalışmada pazar kararı olmadığı için değiştirilmedi.
4. **Fatura/izleme:** Gerçek SMS gönderimleri, risk retleri, ülke maliyeti ve doğrulama tamamlama oranları toplu izlenmeli. Auth SMS için bütçe uyarısı otomatik sert para tavanı sayılmamalı. Ayrı kill switch SMS'i kapatır; uygulamadaki giriş hizmetini de durdurur.
5. **Yayın:** Mobil/sunucu kaynak düzeltmeleri checkout'tadır; canlı API/mobil sürümün bu patch'i taşıdığı doğrulanmadı. Commit/push/Railway deploy/native build/OTA yapılmadı.

Güncel fiyat tablosunda Türkiye SMS'i 0,01 USD, Azerbaycan 0,29 USD olarak listeleniyor; ülkeler arasında ciddi fark var. Yalnız örnek olarak, günün ilk 10 ücretsiz SMS'i sonrası 1.500 Türkiye SMS'i yaklaşık 14,90 USD; 1.500 Azerbaycan SMS'i yaklaşık 432,10 USD olabilir. Vergi, kur, diğer servisler ve API kotasının SMS'e birebir karşılık gelmemesi bu hesaba dahil değildir. Bu bir fatura garantisi değildir. [Identity Platform fiyatları](https://cloud.google.com/identity-platform/pricing)

## Tamamlanan Firebase cihaz izni ve para bütçesi

`firebaseSmsDeviceGate` iki aşamalıdır. App Check korumalı callable, 120 saniyelik challenge'ı kurulum/telefon için üretir. iOS ilk kanıtında Apple köküne bağlı üretim App Attest sertifikası, uygulama kimliği, nonce ve anahtar; sonraki kanıtlarda imza ve artan sayaç doğrulanır. Sertifika geçerlilik tarihleri/CA rolleri ayrıca kontrol edilir. Android'de Google'a sunucudan decode yaptırılır; uygulama paket/sertifikası, lisans, cihaz bütünlüğü, request hash ve zaman kontrol edilir. Kimlik değerleri istemcinin serbest bir `deviceId` iddiası gibi kabul edilmez. Android kurulum değeri sunucudan verilir ve her gönderimde gerçek Play Integrity kanıtının kapsamına girer.

Challenge ağ doğrulamasından önce atomik tüketilir; Google çağrısı SMS kilidini tutmaz. Geçerli kanıttan sonra 60 saniyelik hedef-numara izni ayrılır. Aynı kurulum tüm telefonlarda üç izin/kayan 24 saat paylaşır; çıkış, farklı hesap, IP veya numara değişimi sayacı sıfırlamaz. İzin verilmiş ancak SMS'in başka bir kontrolle engellenmiş olması kurulum hakkını iade etmez. iOS sayaç/public-key güncellemesi transaction'dadır; yarış, eski imza veya farklı challenge/kurulum/hedef reddedilir.

`beforeSmsSent` geçerli telefon iznini ve SMS rezervasyonunu **aynı transaction** içinde tüketir. Firebase olayında bizim cihaz anahtarı/nonce alanımız yoktur. Bu nedenle aynı hedef numaranın kısa iznine başka çağrının yarışıp onu tüketmesi kesin engellenmiş sayılmaz; bu, yeni numaraya veya ilave ücretli SMS'e izin vermez, kullanılabilirliği etkileyebilir. Bu sınır saklanmaz; sağlayıcı çağrısının birebir cihaz imzasına bağlı olduğu iddia edilmez.

App Check için Android Play Integrity, iOS App Attest kullanılır; üretim debug veya doğrulanmamış fallback seçmez. App Check initialization/token hatası SDK SMS çağrısına geçmez. Callable ayrıca App Check token'ını consume eder ve `alreadyConsumed` sonucunu reddeder; platformun Firebase app ID'si eşleşmelidir. Mobil kurulum kimliği SecureStore'da cihazla sınırlı saklanır, çıkışta silinmez. Yalnız iOS native `INVALID_KEY` sonucu kaybolmuş anahtarı temizler; ağ/ret/bütçe hatasında otomatik kimlik yenilenmez.

Para hesabı integer micro-USD'dir; her SMS'in o anda geçerli tarife bedeli kalıcı kayda yazılır. Sonradan tarife değişmesi geçmiş harcamayı yeniden fiyatlandırmaz. Kayan 24 saat 6 USD, UTC takvim ayı 20 USD, ayın koruma öncesi harcaması için zorunlu açılış ayı/bedeli, ülke adet/para tavanı ve 1.500 adet/gün birlikte kontrol edilir. İlk ücretsiz SMS'ler tahmine indirim olarak uygulanmaz; rezervasyon ihtiyatlıdır. Tarife süresi dolarsa, ülke politikası yoksa veya açılış bakiyesi bilinmiyorsa gönderim engellenir. Vergi/kur/assessment/function/ağ ücretleri ve tarife değişimlerinin gecikmesi nedeniyle bu **tüm Google faturası için kesin 20 USD tavanı değildir**.

İncelenebilir başlangıç ülke/tarife/bütçe önerisi: `tools/firebase-sms-defense/policy-proposal.json`. Kamuya açık fiyat tablosu 10 Ekim'de yeniden okundu; 7 gün geçerlilik ve ülke başına 200 adet/2 USD günlük öneri canlıya uygulanmadı. İstenen pazarlarda teslimat/erişim kanıtı olmadan o ülkenin çalıştığı söylenmez. Özellikle Android lisanslı Play ortamı olmayan cihazlar bu sıkı politikayı geçemez; Çin ana karası desteği Open.

Sınır **doğrulanmış uygulama kurulumu** içindir. Uygulamanın verisini temizlemek/yeniden kurmak yeni kurulum yaratabilir; değişmez fiziksel cihaz/kişi sınırı değildir. Apple DeviceCheck/risk ve Android device recall tekrar kurulum katmanı uygulanmadı. Çok sayıda gerçek kurulumla saldırı kalan toplam SMS bütçesini tüketebilir; para ve proje sınırı bu yüzden bağımsızdır.

## Geçmiş sağlayıcı alternatifleri — seçilmedi

Bu bölüm, Türkiye/yurt dışı kapsamı ve son Firebase kararından **önceki** alternatif araştırmasının kaydıdır; aktif uygulama planı değildir. Sağlayıcı değiştirilmedi, yeni hesap/paket alınmadı. Güncel uygulama ve açık kapılar yukarıdadır.

Gönderim kararının Blumi sunucusunda olduğu ve sağlayıcı anahtarının yalnız sunucuda kaldığı, ön ödemeli/paketle sınırlı SMS yolu önerilir. Böylece telefon, doğrulanmış uygulama kurulumu, varsa doğrulanmış hesap ve proje bütçeleri aynı transaction içinde ayrılıp ancak ondan sonra SMS çağrısı yapılabilir. Doğrudan Firebase Phone Auth gönderim yolu geçiş sonunda kapatılmalıdır; onu açık bırakıp yalnız Blumi API'sine cihaz kontrolü eklemek atlanabilir. Bu alternatif Identity Platform yükseltmesini gerektirmez, ancak Firebase'de kalmaya kıyasla daha büyük bir giriş/kurtarma geçişi ve işletim sorumluluğu getirir.

### Önerilen güvenlik sözleşmesi

- İstemcinin rastgele `deviceId` değeri güvenilir cihaz kimliği sayılmaz. iOS'ta App Attest ile doğrulanmış anahtar ve her gönderim için tek kullanımlık sunucu challenge'ına bağlı imza; Android'de Play Integrity ile hedef/amaç/challenge'a bağlı doğrulama gerekir. Play Integrity tek başına değiştirilemez tekil cihaz kimliği vermez; Android kurulum anahtarının güven bağlamı ve yeniden kaydı ayrıca tasarlanıp saldırı testleriyle doğrulanmalıdır.
- Başlangıç hedefi: doğrulanmış kurulum için bütün numaralar ve OTP amaçları toplamında **3 kabul / kayan 24 saat**, numara için ayrıca **3 kabul / kayan 24 saat**, tekrarlar arasında en az **60 saniye**. IP değişikliği doğrulanmış kurulum bütçesini sıfırlamaz. Giriş yapmış hesap varsa hesap bütçesi de eklenir; giriş öncesinde istemcinin hesap iddiasına güvenilmez.
- Uygulamayı yeniden yüklemek iOS App Attest anahtarını değiştirir. Apple DeviceCheck kötüye kullanım işaretleri ve App Attest risk bilgisi ek katmandır; iki bit fiziksel cihaz için yarışsız günlük sayaç değildir. Android device recall hâlen beta, başvuru/onay ve Play lisanslı hesap gerektirir; üç bit tek başına günlük transaction bütçesi değildir. Yeniden kurulum/fabrika ayarıyla aşılmayan evrensel bir insan kimliği vaat edilmez. [Apple açıklaması](https://developer.apple.com/videos/play/wwdc2021/10244/), [Android device recall](https://developer.android.com/google/play/integrity/device-recall)
- Bütçe ve izin SMS'den **önce** kalıcı olarak tüketilir. Yeniden başlayan sunucu, paralel worker ve farklı API ekranları aynı bütçeyi kullanır. Aynı challenge tekrar kullanılamaz; hedef veya amaç değiştirilerek kullanılamaz. Sağlayıcı timeout'unda gönderim belirsizse otomatik yeni SMS denenmez; sağlayıcının idempotency/durum sorgusu sözleşmesi doğrulanmalıdır. Teslimat iadesi güvenlik bütçesini yeniden açmaz.
- Yeni OTP yolu kriptografik rastgele kod, sunucu sırrıyla anahtarlı kod özeti, kısa geçerlilik, en fazla beş doğrulama denemesi, atomik tek kullanımlık tüketim ve oturum/amaç/hedef bağlama gerektirir. Kod yeniden istemek saldırganın doğrulama-deneme bütçesini sıfırlamaz. Eski test/geliştirme SMS arayüzü bu güvencelerin üretimde sağlandığının kanıtı değildir.
- Günlük proje üst sınırı 1.500 olarak korunur; ayrıca satın alınan toplam paket/aylık parasal bütçe belirlenir. Otomatik paket yenileme, otomatik bakiye yükleme, paket dışı ücretli geri dönüş ve ikinci sınırsız sağlayıcı yolu kapalı olmalıdır. Sınır dolunca SMS durur; meşru girişler de etkilenebilir. Sayı sınırı ve paket sınırı yalnız SMS harcamasını sınırlar; API/sunucu/veri tabanı ve diğer servislerin toplam faturası için ayrı işletim limitleri gerekir.
- Ülke listesi hedef pazarla sınırlanır; bilinmeyen ülke ve pahalı servis numarası kapalıdır. Çok sayıda gerçek cihazla dağıtılmış saldırı için kısa proje penceresi, anormal gönderim/doğrulama oranında durdurma ve toplu operatör uyarısı gerekir. İlk değerler normal kullanıcı trafiği bilinmeden kesinleştirilmez.

### Sağlayıcı ve maliyet sınırı

**Son pazar kararı:** Sahip Türkiye ile birlikte ABD, Kanada, İngiltere, Avrupa/Balkanlar, Rusya, Çin ve Arap ülkelerini istedi. Bu bölge tarifi ülke kodları bazında henüz kesinleşmiş bir canlı allowlist değildir. Netgsm'in Türkiye OTP paketi tek sağlayıcı olarak bu ihtiyacı karşılamaz; yukarıdaki ön ödemeli gönderim önerisi küresel sağlayıcı sözleşmesiyle ayrıca doğrulanmalıdır. Hesap veya ülke ayarı değiştirilmedi.

Güncel Google tablosunda SMS başına Türkiye/ABD/Kanada/Çin 0,01 USD; İngiltere 0,04 USD; Fransa 0,07 USD; Almanya 0,10 USD; Sırbistan 0,17 USD; Suudi Arabistan 0,19 USD; Rusya 0,35 USD görülüyor. İlk 10 SMS/gün ücretsiz koşulu ve diğer ücretler ayrı değerlendirilir. Aynı 1.500 adet tavanı farklı ülkelerde aynı faturayı üretmez. Mevcut aday yalnız adet sınırı koyar; parasal veya ülke bazlı bütçe uygulandığı iddia edilmez. [Google fiyatları](https://cloud.google.com/identity-platform/pricing?hl=en)

Firebase FAQ, telefon doğrulamayı küresel olarak sunduğunu ancak her ağın güvenilir teslimat sağlamadığını belirtiyor. İyi teslimat listesinde Rusya var; Çin anakarası CN bu listede görünmüyor (HK/MO/TW ayrı listeleniyor). CN'nin fiyat tablosunda olması teslimat veya uygulamanın tüm Google hizmetlerine erişim garantisi değildir; desteklenmiyor sonucu da yalnız bu yokluktan çıkarılmaz. İstenen pazarlarda gerçek cihaz/ağ teslimatı ve sağlayıcı kayıt/başlık koşulları ayrıca Open. [Firebase teslimat açıklaması](https://firebase.google.com/docs/auth/faq-and-troubleshooting#which_regions_are_supported_for_phone_authentication)

Küresel alternatif Twilio Verify yönetilen OTP ve Fraud Guard sunuyor, ancak resmî başlangıç fiyatı başarılı doğrulama başına 0,05 USD **artı** SMS/kanal ücreti. Dolayısıyla sırf küresel desteği olduğu için Firebase'den daha ucuz sayılmaz; ülke dağılımı, tekrar gönderimi, teslimat ve ek ücretlerle karşılaştırılmalı. Kendi kodunu üretmek bu Verify platform ücretini ortadan kaldırmış sayılmaz; doküman özel kodlarda oluşturulan doğrulama denemesi başına ücret belirtiyor. [Twilio fiyat ve koşulları](https://www.twilio.com/en-us/verify/pricing), [Fraud Guard](https://www.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard)

Son seçim Firebase'de kalmaktır; yeni sağlayıcı satın alımı yapılmaz. Eski alternatif fiyatlarının kesin fatura tavanı veya üretim desteği olarak kullanılmaması gerekir.

Türkiye başlangıcı için Netgsm bir adaydır: 10 Ekim 2026'da resmî OTP tablosunda yeni abone 1.000 SMS **316 TL**, standart 1.000 SMS **400 TL**, standart 5.000 SMS **1.625 TL** görülüyor; %10 ÖİV ve %20 KDV dahil. OTP sadece paketle kullanılıyor, diğer SMS paketleri/krediden kullanılamıyor; bu paketler yurt içi, tek mesaj boyu ve bir yıllık kullanım koşullarına bağlı. Abonelik, gönderen başlık onayı, ek ücretler, otomatik yenileme ve gerçek API gönderim sözleşmesi hesap açmadan doğrulanmış değildir. Bu nedenle uygulamanın toplam aylık maliyeti veya kesintisiz hizmet garantisi olarak sunulmaz. Yurt dışı gerekiyorsa bu Türkiye paketi yeterli değildir. [Resmî fiyat ve koşullar](https://www.netgsm.com.tr/fiyatlar/otp-sms)

Sadece App Check açmak bu hedefi karşılamaz: Google, gerçek uygulamayı kullanıp giriş işlemlerini tamamlamadan SMS üreten kötü niyetli kullanıcıyı App Check'in engellemediğini açıkça belirtiyor. Ek izin/bütçe katmanı bu yüzden yazıldı ve bu oturumda canlıya alındı. Firebase Authentication App Check service enforcement da **ENFORCED** olarak uygulanıp readback ile doğrulandı. [Firebase açıklaması](https://firebase.google.com/docs/auth/faq-and-troubleshooting#enable_and_enforce_app_check)

### Geçişin açık kapıları

Ülke kapsamı ve paket bütçesi; sağlayıcı sözleşmesi; native doğrulama ve gerçek cihaz testi; hesapların mevcut backend kimliklerini/Firebase bağlantılarını koruyan geçiş; kayıt/giriş/export/silme/mevcut-yeni numara/kurtarma için amaç bağlı yeni kanıt yolu; iptal/revocation/oturum uyumu; geri dönüş planı; restore edilmiş DB yedeği; gerçek API/SMS yarış ve replay testleri; doğrudan eski Firebase yolunun gerçekten kapalı olduğunun dış doğrulaması. Eski Firebase `complete` rotasına yeni sağlayıcı kanıtını veya custom token'ı phone-provider token'ı gibi kabul ettirmek güvenli geçiş sayılmaz. Canlı hesap/kimlik/paket/deploy değişikliği ayrıca açık onay gerektirir.

## Değişiklik sahipliği

Bu çalışma tek ana ajanla yapıldı; alt ajan kullanılmadı. Kullanılan rehber: [security-best-practices](/Users/evrenevren/.codex/skills/security-best-practices/SKILL.md). İlgisiz/eşzamanlı API, notification ve dependency değişiklikleri korunmuştur; bunlar bu çalışmanın bulgusu veya düzeltmesi olarak sahiplenilmez. `userRoutes.ts` içindeki yeni recovery freshness hunk'ı bu çalışmaya aittir; diğer hunk'lar korunmuştur.

Kaynaklar: mobile session Firebase wrapper/controller/model ve testleri; sunucu `firebaseAuth`, auth/recovery freshness rotaları/testi; `firebaseSmsAdmission` ve testleri; artık uygulanmış/checksum kilitli `072`; bağımsız fail-closed schema readiness istisnası; `tools/firebase-sms-defense`; CI ve bu belgeler. Eski uygulanmış migration'lar değiştirilmedi. Braces audit istisnası yukarıdaki dar sürüm/yama/davranış kanıtı ve 16 Ekim bitişine bağlıdır; testler veya mimari ratchet gevşetilmedi.

## Birincil kaynaklar

- [Firebase blocking functions](https://firebase.google.com/docs/auth/extend-with-blocking-functions): Identity Platform ön koşulu, gönderim öncesi SMS olayı ve 7 saniyelik sağlayıcı yanıt süresi; ALLOW risk kararını geçersiz kılabileceğinden kullanılmaz.
- [reCAPTCHA SMS defense](https://docs.cloud.google.com/identity-platform/docs/recaptcha-tfp): AUDIT/ENFORCE ayrımı ve risk eşiği.
- [Authentication App Check](https://docs.cloud.google.com/identity-platform/docs/admin/app-check-integration): Phone gönderim/doğrulama isteklerinin app attestation koruması.
- [Firebase Auth limits](https://firebase.google.com/docs/auth/limits): Sağlayıcının ayrıca uyguladığı proje/IP/numara limitleri; özel üç hakkın kanıtı değildir.
- [iOS Phone Auth](https://firebase.google.com/docs/auth/ios/phone-auth): APNs/reCAPTCHA geri dönüşü ve test numaralarının sınırı.
- [Firebase API keys](https://firebase.google.com/docs/projects/api-keys): Mobil anahtarların kimlik/yetki sırrı olmaması ve API erişimini daraltma.
- [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) ve [session yönetimi](https://firebase.google.com/docs/auth/admin/manage-sessions): İmza/proje/revocation ve token yenileme sınırları.
