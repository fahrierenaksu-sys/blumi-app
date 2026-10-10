# OTP güvenlik ek incelemesi — 10 Ekim 2026

Bu belge yan konuşmada yapılan **yerel** değişiklikleri ve kanıtlarını kaydeder. Canlı ayarlar, üretim veritabanı, Git uzak dalları ve native build bu çalışmada değiştirilmedi. Bütün uygulama için güvenlik sertifikası veya 10/10 değerlendirmesi değildir.

**Sonraki yayın onayı ve 10 Ekim güncellemesi:** Kullanıcı bu yan konuşmada backend, Firebase fonksiyonları, OTP veritabanı geçişi ve bütün değişikliklerin commit/develop/main push işlemlerini ayrıca onayladı. Yedek/restore kanıtından sonra yalnız 073 canlıya uygulandı; 24 hesap/22 envanter korunur. Ayrıntılar veritabanı ve Firebase runbook'larında. Önceki “yalnız yerel / dış ayarlar değişmedi” ifadeleri uygulama aşamasının tarihçesidir. Son canlı yayın sonucu aşağıda ayrıca kaydedilir. Yeni native build ve gerçek SMS testi yapılmadı.

## Kabul edilen kural

Doğrulanmış uygulama kurulumunun **son 24 saatte bütün hedef numaralar için toplam en fazla üç SMS izni** vardır. Dördüncü izin reddedilir. Bir dakikalık bekleme ayrıca uygulanır. IP, hedef numara, ekran, oturum veya uygulama saati değişikliği sunucunun sayacını yenilemez. Pencere gece yarısında sıfırlanmaz; her deneme 24 saatini doldurduğunda kapasite açılır.

İzin alındıktan sonra gönderim yarıda bırakılsa da izin sayılır. Aynı hedef numara için de farklı kurulumlar arasında üç izin / son 24 saat ve bir dakikalık bekleme uygulanır. Firebase öncesi SMS kabul katmanındaki telefon, IP, ülke, proje ve maliyet rezervasyonları ayrıca devam eder. Veritabanı saati ve işlem kilidi yetkilidir.

**Kurulum, fiziksel cihaz veya kişi değildir.** Yeni kurulum/anahtar oluşturma ve çok sayıda gerçek cihaz kullanma kalan saldırı yollarıdır. İmzalı Android kurulum kimliği de bu ayrımı değiştirmez.

## Bulunan ve uygulanan düzeltmeler

| Bulgu | Sonuç | Durum |
| --- | --- | --- |
| Mobil biçimlendirici harfleri ve diğer karakterleri silerek geçerli numara üretebiliyordu. | Ham girdide yalnız rakam, baştaki artı ve izin verilen görünür biçim ayraçları kabul edilir. Harf, uzantı, emoji, kontrol karakteri, sıfır genişlikli karakter ve Unicode rakam benzerleri reddedilir. Hatalı girdi kullanıcı düzeltene kadar korunur. | Implemented, Tested |
| Mobil ve SMS sunucusu farklı doğrulama gücü kullanıyordu. | Mobilde ve SMS sınırında tam numara planı verisi, katı ayrıştırma, `isValid` ve mobil / sabit-mobil ayrımı kullanılır. Bilinen sabit hat, ücretli servis ve ücretsiz servis türleri SMS izni alamaz. | Implemented, Tested |
| Kurtarma ve doğrudan Firebase çağrısı formdan farklı kurallarla numara kabul edebiliyordu. | Kurtarma ve Firebase istemci sınırı aynı mobil numara doğrulamasını kullanır. Firebase çağrısına yalnız kanonik uluslararası numara verilir. Genel API normalizasyonu da kontrol karakterlerini silerek kabul etmez. | Implemented, Tested |
| Bekleme süresi ve hedef numara izinleri ancak daha geç kontrol ediliyordu. | Kurulum ve telefon izinleri challenge öncesinde, dış kanıt kontrolü öncesinde ve kontrol sonrasında yeniden değerlendirilir. Bilinen retler dış kanıt servisini çağırmaz. | Implemented, Tested |
| Kanıt doğrulanırken ülke politikası değişebiliyordu. | Son veritabanı işleminde ülke açıklığı ve fiyat geçerliliği tekrar kontrol edilir. | Implemented, Tested |
| Android challenge isteği, geçerli cihaz kanıtından önce kalıcı kurulum satırı oluşturuyordu. | Yeni aday kimlik sunucu tarafından 128 bit rastgele değer ve proje/kullanım amacına bağlı 128 bit HMAC etiketiyle üretilir. Kalıcı kurulum satırı yalnız doğrulanan kanıttan sonra oluşur. Aday aynı kimlikle tekrar kullanılabilir; süresi dolmuş challenge kaydı veya istemci saati kimliği sıfırlamaz. Önceden kayıtlı kimlikler uyumludur. | Implemented, Tested |
| Mobil yeniden gönderme süresi sunucudan kısaydı. | Kayıt ve giriş ekranında bekleme 30 saniyeden 60 saniyeye çıkarıldı. Düzeltme ve normal yeniden deneme akışları test edildi. | Implemented, Tested; Native verified Open |

## Daha geniş saldırı incelemesi

| Saldırı / hata | İncelenen güvenlik sınırı ve kanıt |
| --- | --- |
| Numaranın farklı yazımlarıyla yeni kota açma | Kabul edilen biçimler tek uluslararası değere dönüşür; harfli/gizli karakterli girdiler temizlenmez. Mobil, kurtarma, API ve SMS sınır testleri. |
| IP ve hedef numara döndürme | Kurulum izin sayacı numaradan ve IP'den bağımsızdır. Ayrı bağlantılarla PostgreSQL testi dördüncü iznin reddini doğrular. |
| Aynı anda çok sayıda gönderim | Veritabanı proje kilidi ve atomik rezervasyon. Aynı telefona paralel isteklerde yalnız bir kabul; farklı numara/IP'lerle toplam maliyet aşılamaz. |
| Firebase'e doğrudan gitme | İmzalı sağlayıcı tetikleyicisi hedefe bağlı, süresi dolmamış izni tüketir. İzinsiz/farklı hedefli/tekrar kullanılan izin reddedilir. SDK imza doğrulaması yerel sarmalayıcı testinde mock; canlı doğrulama bu yan çalışmada yapılmadı. |
| Sahte cihaz kanıtı / eski assertion | iOS gerçek test anahtarı imzası, uygulama/payload bağlama ve artan sayaç testleri; Android uygulama/lisans/sertifika/hash/zaman verdict testleri. Gerçek donanım testi yerine geçmez. |
| Sahte veya başka proje için üretilmiş Android kurulum kimliği | HMAC ve proje kapsamı; kalıcı kayıt oluşturmadan ret. Süresi dolan challenge sonrasında aynı geçerli aday kimliğiyle tekrar deneme testi. |
| Başarısız kanıttan yeni izin kazanma | Kanıt kontrolüne alınmış challenge tek kullanımlıktır; başarısız kanıt izin veya kalıcı kurulum üretmez. Verilmiş izinler başarısız gönderim bahanesiyle iade edilmez. |
| Eski Firebase oturumunu yeni OTP gibi kullanma | `auth_time` tazeliği, telefon sağlayıcısı ve iptal kontrolü; token yenilemesi telefon doğrulama zamanını yenilemez. Odaklı API testleri. |
| Numara değiştirme / kurtarma üzerinden başka hesaba erişme | Mevcut hesap kimliği, amaç ve hedefe bağlı tek kullanımlık hassas işlem challenge'ları. Yeni numarayı doğrulamak eski hesabın sahipliği değildir. Kurtarma yanıtı hesap varlığını açıklamaz. |
| Eski OTP API'leriyle bütçeden kaçma | Firebase modunda eski gönderim/doğrulama yolları yan etkisiz 410; korumalı yollar önce oturum kontrolü yapar. |
| Veritabanı/sağlayıcı kesintisi veya eksik politika | Kontrol başarısızsa SMS izni verilmez. Sağlayıcının risk kararını aşan `ALLOW` yanıtı yoktur. |
| Fiyat/ay değişimiyle bütçe sıfırlama | Rezervasyon anındaki ücret saklanır; geçmiş maliyetler yeni tarifeyle yeniden hesaplanmaz. Son 24 saat ve UTC takvim ayı ayrı değerlendirilir. |
| Function kimliği ele geçirilirse veritabanı etkisi | Sınırlı roller politika değiştiremez, taze bütçe kayıtlarını silemez, uygulama hesaplarını okuyamaz. Mevcut rol testleri yeniden çalıştırıldı. |

## Kapanmamış sınırlar ve sonraki tasarım

1. **Fiziksel cihaz başına yeniden kurulumdan bağımsız üç deneme: Open.** iOS DeviceCheck/App Attest risk ölçümü ve Android Device Recall entegrasyonu, gerekli platform yetkileri ve fiziksel cihaz deneyi gerekir. DeviceCheck/Recall bitleri tek başına güvenilir bir kayan 24 saat sayacı değildir. Yeniden kayıt tespitinde mevcut kurulum bütçesini kanıtlı biçimde geri bağlamak veya ek hesap kurtarma kanıtı istemek gerekir. Rastgele istemci cihaz kimliği, IP veya yalnız Keychain bu garantiyi vermez. Google Device Recall beta erişimi ve Play gereksinimleri nedeniyle bütün cihazlarda varsayılamaz.
2. **Bütçe tüketerek hizmeti engelleme: Open; adaptif kontrol yerelde uygulandı.** Kullanıcının son isteğiyle saatlik 1 USD tavanı kaldırıldı. Yerine aşağıdaki yoğunluk/puan/hız kontrolü eklendi. Günlük/aylık ve diğer mevcut sınırlar korunur. Çok sayıda gerçek cihaz ve yüksek bot puanıyla izin verilen bütçe yine tüketilebilir. Güvenilir girişlere ayrı bütçe ancak önceki doğrulanmış cihaz/oturum/passkey kanıtıyla verilmeli; mevcut telefon numarasını yazmak yeterli olmamalı. Ayrı güvenilir hesap bütçesi bu yamada uygulanmadı.
3. **SMS dışı giriş/kurtarma: kapsam dışında.** Kullanıcı passkey çalışmasını iptal etti; paket, ekran veya passkey kaydı eklenmedi. SMS bütçesi tükendiğinde SMS gerektiren girişlerin durması kalan risktir.
4. **Toplam fatura: Open.** SMS rezervasyon limiti, Google Cloud'un tamamı için para tavanı değildir. App Check/risk değerlendirmesi, function, ağ, depolama ve vergiler ayrı olabilir. Function örnek sayısı da toplam para tavanı değildir. SMS tarifesi süreli olduğundan fiyat yenileme ve toplu maliyet/ret izleme operasyonu gerekir; bu yan çalışmada dış ayarlar değiştirilmedi.
5. **Numaranın gerçekten tahsis edilmiş/erişilebilir olması: garanti edilemez.** Numara planı doğrulaması yalnız aralığın geçerliliğini gösterir. Aktif hat, SMS teslimi ve sahiplik başka iddialardır. Tüm ülkelerde ücretsiz ve kesin bir ön kontrol varsayılmaz.
6. **Native verified / Production ready: Open.** Yeni binary ile gerçek iOS App Attest ve Play lisanslı Android, normal giriş, hatalı girdi düzeltme, dördüncü ret, 24 saat sınırı, yeniden kurulum, ağ kesintisi ve hesap işlemleri denenmeli. Bu kontrollerin hiçbirine yerel test sonucundan native PASS verilmedi.

DeviceCheck: https://developer.apple.com/videos/play/wwdc2021/10244/

Device Recall koşulları: https://developer.android.com/google/play/integrity/device-recall

Numara doğrulama sınırı: https://github.com/google/libphonenumber/blob/master/FAQ.md#what-does-it-mean-for-a-phone-number-to-be-valid

### Fiziksel cihaz çalışmasının sonucu

Kullanıcı yeniden kurulum politikasını mühendislik kararına bıraktı. Önerilen politika: işaretli cihazın yeni kurulumu eski bütçeye kriptografik olarak bağlanamıyorsa yeni ücretsiz SMS hakkı verilmez; hesap kurtarma gerekir. Bu politika **henüz uygulanmadı**. Mevcut kurulum kayıtları otomatik olarak fiziksel cihaz kaydı veya güvenilir hesap sayılmaz.

İncelenen mevcut native paket App Attest anahtar/kanıt API'leri sağlıyor; `DCDevice` token üretimi için bir köprü sağlamıyor. Backend'de DeviceCheck/Device Recall ya da passkey kurtarma entegrasyonu yok. Yeni cihaz kanıtı ile eski kayıt arasında güvenli bağlantı kurulmadan yalnız bir cihaz işareti okumak, kayan 24 saat sayacını geri getirmez.

Google belgesine göre Device Recall beta onayı gerektirir; standard token'daki değer warmup sırasında yenilenir ve yazma yayılımı 30 saniyeye çıkabilir. Üç bit ve ay/yıl hassasiyetindeki tarihler bir atomik sayaç değildir. Eski/önceden hazırlanmış verdict veya paralel yeniden kayıt ile ikinci hak açılmadığı ayrıca kanıtlanmalıdır. Bu çalışmada platform hesabının beta erişimi veya Apple DeviceCheck kimlik bilgileri doğrulanmadı; erişimin bulunmadığı iddia edilmiyor.

Kapatma için zorunlu kanıtlar:

- Üretim uygulamasına bağlı platform erişimi ve en az yetkili sunucu entegrasyonu; eksik/belirsiz platform yanıtında izin vermeme.
- Yeni kaydı, var olan kaydın devamını ve hesap kurtarmayı ayıran protokol. Kurtarma sayacı sıfırlamamalı; silme/yeniden kurma/anahtar döndürme yeni bütçe üretmemeli.
- Platformun gecikmeli/cached cihaz işaretini atomik kimlik gibi kullanmayan yeniden kayıt kontrolü; replay, eşzamanlı kayıt, yarıda kalan yazma ve ağ kesintisi testleri.
- Gerçek iPhone ve Play lisanslı Android'de yeni build ile yeniden kurulum deneyi. Simulator ve sunucu mock testleri bu kanıtın yerine geçmez.
- Ortak bütçenin tükenmesine karşı mevcut kullanıcının SMS olmadan ispatlayabildiği giriş/kurtarma yolu ve ayrı korunan kaynak bütçesi. Yeni hesap veya mevcut telefon yazımı tek başına bu erişimi vermemeli.

Bu başlığın tamamlandı sayılması için gereken entegrasyon ve cihaz kanıtı bulunmadığından durum **Open** kalır; adaptif hız kontrolü fiziksel cihaz kontrolü olarak sunulmaz.

### Son istek: normal akış ve şüpheli yoğunluk

- Normal trafik: doğrulanmış kurulum ve hedef numara için üç izin / kayan 24 saat, en az 60 saniye bekleme. Saatlik para tavanı yoktur; günlük/aylık maliyet sınırları ve mevcut IP/proje/ülke adet sınırları devam eder.
- Şüpheli yoğunluk: proje genelinde son beş dakikada en az 20 kabul edilmiş SMS veya aynı kanonik IP'den en az beş kabul edilmiş SMS. Yalnız reddedilen istekler bu korumayı tetikleyemez. Yoğun trafik kesin saldırı teşhisi değildir; ortak NAT kullanan gerçek kişiler de ek kontrole girebilir.
- Ek kontrol: imzalı Firebase `beforeSmsSent` olayının `additionalUserInfo.recaptchaScore` bot güven puanı en az 0,7 olmalı. Puan daha yüksek olduğunda bot olma ihtimali düşer; ayrı SMS toll-fraud puanının yönü terstir ve onunla karıştırılmaz. Üst düzey istemci alanı, user-agent veya kullanıcı beyanı kabul edilmez. Eksik, sayısal olmayan, sonlu olmayan, aralık dışı veya düşük puan yoğunlukta gönderim izni vermez.
- Hız azaltma: proje yoğunluğunda son bir dakikada en fazla altı kabul; yalnız IP yoğunluğunda ilgili IP için son bir dakikada en fazla bir kabul. Bunlar proje işlem kilidinde son kez kontrol edilir. Beş dakikalık yoğunluk azaldığında normal politika kendiliğinden geri gelir; manuel açma gerektirmez.
- Bu ek kontrol etkileşimli CAPTCHA veya ikinci kimlik faktörü değildir: mevcut sağlayıcının bot değerlendirmesini daha sıkı kontrol eder. Google'ın kendi ret kararını aşacak `ALLOW` yanıtı hiçbir zaman üretilmez. Düşük risk bile bütçeyi, cooldown'u veya üç izin kuralını geçersiz kılmaz.
- Reddedilen SMS kabulü yeni ücret rezervasyonu veya izin tüketimi oluşturmaz; daha önce alınmış kurulum izni yine üç deneme sayacında kalır. Tekrar tekrar otomatik SMS gönderme yoktur.
- **Canlı yayın önkoşulu:** Firebase'de bot puanı üretilmesi (`useSmsBotScore`) ve imzalı SMS olayında gerçek puanın bulunması hem iOS hem Android için doğrulanmalı. Mevcut toll-fraud koruması kapatılmamalı veya `AUDIT` moduna düşürülmemeli. Bu yan konuşmada dış ayarlar değiştirilmedi ve bot puanının canlıda mevcut olduğu doğrulanmadı. Eksik puan yoğunlukta fail-closed olacağı için bu kontrol tamamlanmadan Production ready denemez.

Sağlayıcı bot puanı / blocking function referansı: https://docs.cloud.google.com/identity-platform/docs/recaptcha-enterprise

SMS fraud ve bot korumasının birlikte kullanımı: https://docs.cloud.google.com/identity-platform/docs/recaptcha-tfp

## Test kanıtları

Son üç korumanın doğrulaması: mobil Firebase, doğrulanmış kimlik/başarı gözlemi ve config gruplarında **46 PASS**; migration hazırlık grubunda güncellenen 073 beklentisiyle **5 PASS**. Giriş/kurtarma/yeniden doğrulama ve ortak bütçe API grubunda **30 PASS**. Function paketi **9 PASS**; build, server typecheck ve son diff kontrolü geçti. Son izole PostgreSQL 17 çalışmasında kabul/başarı/risk grubu **19 PASS**, ortak atomik bütçe **1 PASS**; 73 migration sıfırdan ve tekrar uygulandı. Gerçek SMS gönderilmedi. İlk birleşik çalışmadaki eski migration listesi beklentisi düzeltildi; son PostgreSQL çalışması son observer rolü ve migration checksum'unu içerir.

### Son eklenen üç koruma

- Başarı takibi yalnız Firebase Admin tarafından imzası, sağlayıcısı ve iptali kontrol edilmiş, son beş dakikada telefon doğrulaması yapılmış token'dan üretilir. İstemcinin “doğruladım” bildirimi kabul edilmez. `auth_time` ve HMAC ile tekrarlar tekilleştirilir; token yenilemesi yeni başarı veya bütçe iadesi oluşturmaz. Aynı telefondaki yalnız en son uygun SMS işaretlenir. Bu, teslim raporu değil, gözlemlenen başarılı telefon doğrulamasıdır.
- Takip giriş yanıtını bekletmez; süreç başına en fazla iki arka plan işi vardır. Veritabanı hatası girişi engellemez. Kısıtlı `blumi_sms_observer` rolü sadece başarı sütunlarını günceller. Atlanan işler veya servise ulaşmayan başarılı Firebase girişleri eksik ölçüme yol açabilir; eksik gözlem kesin saldırı sayılmaz.
- Son bir saatte aynı kanonik IP'den en az on gönderim, her biri için en az on dakika bekleme ve en az %80 doğrulama gözlenmemesi ek sağlayıcı puanı/hız kontrolünü tetikler. Tek teslimat hatası yeterli değildir. `verification_outcomes_enabled` varsayılan kapalıdır; canlı gözlemin sağlığı doğrulanmadan açılmamalı, gözlem arızasında kapatılmalıdır. NAT kullanan gerçek kullanıcılar etkilenebilir.
- SMS öncesi callable, mevcut App Check ve ortak veritabanı challenge sınırlarına ek olarak süreç/IP başına 20 ve süreç toplamında 120 iş/dakika sınırını dış doğrulama/veritabanı çağrılarından önce uygular. Ret yağmuru diğer IP'lerin toplam hakkını tüketmez. Dakikada en fazla bir toplu kabul/ret ölçümü, takip eden istekte yazılır; son sessiz pencere veya kapanan süreç kaybolabilir. Kimlik, numara, IP veya kanıt loglanmaz. Soğuk başlangıç ve birden fazla instance nedeniyle bu ek katman ortak kota veya kesin fatura tavanı değildir; App Check ve invocation giderlerini tamamen önlemez.
- Backend giriş tamamlama için kaynak başına 10/dakika, kurtarma için kaynak başına 3/dakika ve oturum açılmış hassas hesap işlemleri için hesap başına 6/dakika ortak PostgreSQL bütçesi kullanır. Sahte bearer ve farklı sunucu kopyası bütçeyi yenilemez; IPv4-mapped ve IPv6 /64 adresleri kanonik sayılır. IP değişimi kaynak bütçesini değiştirebilir; bunu fiziksel cihaz sınırı olarak sunmuyoruz. Veritabanı erişilemezse doğrulama/kurtarma işi başlatılmaz.
- Mobil aynı confirmation için paralel girişleri ve beşten fazla native kod denemesini durdurur. Başarılı confirmation tekrar kullanılamaz. **Bu yalnız istemci korumasıdır.** Doğrudan Firebase yanlış-kod doğrulamasının sunucu sınırını Firebase uygular; bu yamada özel beş-deneme kuralının doğrudan Firebase çağrıları için sunucuda zorlandığı iddia edilmez. Mevcut taze kanıt, hesap eşleşmesi, tek kullanımlık işlem challenge'ı ve manuel kurtarma kontrolleri korunur.

- Mobil session runner: **293 + 226 PASS, 0 FAIL, 0 SKIP**. Son 60 saniyelik bekleme düzenlemesi sonrasında etkilenen telefon, kurtarma, controller ve cihaz izni grubu ayrıca **49 PASS**.
- Odaklı API/kimlik/kripto: **38 PASS, 0 FAIL, 0 SKIP**.
- Saatlik tavanın kaldırılması ve adaptif kontrol sonrasındaki izole PostgreSQL 17 çalışması: cihaz gate **11 PASS**, sağlayıcı kabul **17 PASS**, toplam **28 PASS, 0 FAIL, 0 SKIP**. 72 migration sıfırdan ve tekrar uygulandı; üretim bağlantısı kullanılmadı. Yeni testler normal akışta bir saatte 1 USD üstünü, eksik/hatalı/düşük sağlayıcı puanını, IP'ye özel etkiyi, paralel hız sınırını, yoğunluk sonrası normale dönüşü ve yüksek puanın mevcut bütçe/cooldown'u aşamamasını kapsar.
- Son adaptif değişiklikten sonra admission ve cihaz kanıtı birim/kripto grubu **6 PASS**, function SDK/adapter/TLS grubu **8 PASS**. Function build, server typecheck ve `git diff --check` geçti. SDK imza doğrulaması testte mock; gerçek sağlayıcı puanı ve native kanıt Open kalır.
- Tam workspace typecheck geçti; son gate değişikliklerinden sonra server typecheck ayrıca geçti.
- Function build ve SDK/adapter/TLS testleri: **8 PASS**; son kaynak için paket yeniden üretildi.
- İlk PostgreSQL çalışmasındaki iki test düzeneği uyumsuzluğu düzeltildi. Sonraki tekrar düşük disk/yoğun sistem sırasında statement timeout aldı; güvenlik süreleri artırılmadı. Aynı sınırlarla daha sonra geçen çalışma yukarıda belirtilmiştir.
- Test grupları örtüşür; tek bir büyük toplam veya kapsam yüzdesi olarak sunulmaz. Testler tüm olası saldırıların yokluğunu kanıtlamaz.

## Yayın ve geri alma

Son başarı-takibi eklemesi **073_sms_verification_outcomes.sql** adlı yeni, eklemeli migration gerektirir; önceki uygulanmış migration'lar değiştirilmedi. Üretimde hiçbir migration uygulanmadı. Yayın öncesi PostgreSQL 17 yedeği ve geri yükleme kanıtı, ardından migration gerekir. Yeni SMS function paketi 073 checksum'u olmadan izin vermeyeceğinden migration tamamlanmadan bu paket deploy edilmemelidir.

Backend'e aynı projenin mevcut `BLUMI_SMS_DEFENSE_HMAC_KEY` değeri güvenli ortam değişkeni olarak sağlanmalı; değer burada veya loglarda yazılmamalı. Backend veritabanı kimliğinin kısıtlı observer rolüne geçiş yetkisi doğrulanmalı. Önce gerçek iOS/Android girişlerinin bir kez sayıldığı, token yenilemesinin sayılmadığı ve ölçüm kesintisinin girişi durdurmadığı doğrulanmalı; ancak sonra sonuçlara bağlı risk bayrağı açılmalıdır. Takip devre dışı veya başarısızken diğer gönderim/bütçe kontrolleri devam eder. Yeni bir Firebase giriş blocking function'ı eklenmedi.

Firebase function paketi yeniden build edilip ayrı deploy edilmeden gate/admission değişiklikleri canlıya geçmez. Backend dağıtımı tek başına yeterli değildir. Mobil değişiklikler yeni build/yayın gerektirir. Üretim yetkilendirmesi ve gerçek cihaz kanıtı bu yan konuşmada alınmadı.

Yeni Android aday kimlikleri eski gate sürümünde kayıtlı satır bulunmadığı için reddedilebilir. Geri almada yeni aday kimliğinin doğrulama ve kanıttan sonra kayıt oluşturma desteği korunmalı veya düzeltme ileriye taşınmalıdır; kayıtlı kullanıcı kimlikleri silinmemelidir. Başarısız gönderimde bütçeyi sıfırlamak geri alma yöntemi değildir.

Durum: **Implemented / Tested** yerel yama. **Native verified / Production ready / canlı yayın: Open.**
