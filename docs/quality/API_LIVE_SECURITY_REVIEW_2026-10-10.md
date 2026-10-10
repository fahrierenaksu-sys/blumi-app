# Blumi canlı API güvenlik incelemesi — 10 Ekim 2026

Hedef, kullanıcının sağladığı Postman ortamındaki Blumi Railway API'sidir. Kullanıcı canlı açık arama testine açıkça izin verdi. İlk aşama, düşük trafikli ve ürün verisi değiştirmeyen girişsiz denemelerle tamamlandı. Gerçek hesap, mesaj, telefon, token veya cevap gövdeleri kanıt dosyalarına alınmadı.

## Tamamlanan ilk aşama

Toplam 37 bağlantı denemesinden 36 HTTP yanıtı alındı; bir Node bağlantısı yanıt alınmadan başarısız oldu, TLS doğrulayan curl ile devam edildi. Üç alt ajan auth/girdi, alan erişimi ve transport kontrollerini yürüttü; ana ajan hazırlık, kimlik başlığı taklidi ve hata yansıtmasını kontrol etti. İstekler her akışta en az bir saniye arayla gönderildi; flood veya DoS uygulanmadı.

| Kontrol | Sonuç ve sınır |
| --- | --- |
| TLS ve servis readiness | Sertifika doğrulandı; TLS 1.3 gözlendi; `/ready` 200. Dağıtılan commit ayrıca doğrulanmadı. |
| Girişsiz özel API erişimi | Profil, bakiye, sohbet, engeller, tercihler ve oda düzeni 401. |
| Sahte oturum ve yönetici kimliği | Denenen kimlikler 401; özel veri kabulü gözlenmedi. |
| Bozuk JSON ve prototype girdisi | Geçersiz Firebase girdileri reddedildi; `__proto__` 400; sunucu 5xx görülmedi. |
| Eski SMS yolları | Boş/geçersiz telefonla denenen yollar 410. SMS gönderilmedi. |
| WebSocket bileti | İki geçersiz bilet denemesi 401; bağlantı yükseltme kabul edilmedi. |
| Yabancı Origin/CORS | Denenen yabancı origin için erişim izni verilmedi. OPTIONS 204 veya Allow-Headers tek başına CORS aşması sayılmadı. |
| Kimlik/proxy başlığı taklidi | Başlıkla özel profile erişim 401. Güvenilen proxy/IP politikasının tamamı bundan kanıtlanamaz. |

Bu aşamada doğrulanmış giriş atlatma veya özel veri sızıntısı bulunmadı. Gerçek oturumla hesaplar arası erişim bu sonuçtan çıkarılamaz.

## Canlıda görülen iki düşük öncelikli güçlendirme ihtiyacı

1. Test edilen hata yanıtlarında ve ikinci aşamadaki 14 başarılı kimlikli özel yanıtta `Cache-Control: no-store` bulunmuyor. Gerçek önbellek sızıntısı gösterilmedi. Yerel kod incelemesinde eklenen korumanın canlıda bulunduğu kabul edilmedi.
2. Bilinmeyen yolun 404 cevabı test yolunu/sorgu işaretini yansıtıyor. Bu, URL içinde hassas veri bulunduğunda hata gövdesine taşınabileceğini gösterir. HTML/JS çalıştırma veya gerçek özel veri sızıntısı kanıtı değildir. Yerelde eklenen sade 404 cevabının canlıda olduğu kabul edilmedi.

## Kanıt

- [Auth ve girdi](API_LIVE_AUTH_EVIDENCE_2026-10-10.json): 13 yanıt — 5×400, 6×401, 2×410.
- [Alan erişimi](API_LIVE_DOMAIN_EVIDENCE_2026-10-10.json): 9 deneme, 8×401, bir bağlantı hatası.
- [Transport](API_LIVE_TRANSPORT_EVIDENCE_2026-10-10.json): 11 kontrollü istek.
- [Ana ajan](API_LIVE_CORE_EVIDENCE_2026-10-10.json): hazırlık readiness kontrolü ve üç ek kontrol.

Alan erişimi JSON'una sonradan eklenen `additionalRecheck` bölümünün yürütücüsü doğrulanamadı. İlk alan erişimi ajanı yalnızca 9 deneme/8 yanıtı doğruladı; ek bölüm bu raporun toplamına dahil edilmedi. Mevcut dosya korunmuştur.

## İkinci aşama: kayıt ve kendi hesabına ait okumalar tamamlandı

Kullanıcı önce iki mevcut TEST hesabının kullanılmasına, ardından test hesabı oluşturmaya, iki geçici kurgu Firebase test telefonu tanımlamaya ve test boyunca bu ayarı yalnız bu sohbetin değiştirmesine izin verdi. İki ayrı yeni TEST hesabı normal Firebase telefon doğrulaması ve Blumi kayıt API'siyle oluşturuldu. Her iki hesabın normal profil, mevcut başlangıç avatarı ve boş başlangıç odası kurulumu tamamlandı. Yeni kayıtların varlığı, önceki yokluk kontrolü ve oluşturulan kimliğin yeni veritabanı kaydıyla eşleşmesiyle doğrulandı; mevcut hesapta kurulum yazımı yapılmadı.

Google tarayıcı girişi tamamlandı. İzole `blumi-live-audit` gcloud yapılandırması kullanıldı; varsayılan yapılandırma değiştirilmedi. Firebase config okuması, doğru `x-goog-user-project` başlığıyla HTTP 200 verdi. İlk 403 servis/kota projesi bağlamından kaynaklanıyordu; IAM yetkisizliği kanıtı değildir. İki geçici test telefonu test sonunda kaldırıldı. Yürütücü temizliği doğruladı; kök ajanın ayrı son okuması da HTTP 200, sıfır test telefonu ve telefon sağlayıcısının açık kaldığını doğruladı. İki TEST hesabı korunmuştur.

Simulator pencere uygulaması bulunamadı. CoreSimulator çalışıyor; mevcut hesabı korumak için ayrı bir boş QA cihazı oluşturuldu. Kurulumda boş disk 295 MiB'ye düştü; kurulum durduruldu ve yalnızca bu çalışmanın oluşturduğu boş cihaz kaldırıldı. Sonrasında 2,0 GiB boş alan gözlendi. Mevcut cihaz ve hesap korunmuştur. Bu, görsel/etkileşimli Native verified kanıtı değildir.

Kimlikli GET yürütücüsü ve kayıt/temizlik aracı birlikte kök ajan tarafından **32/32** yerel testle doğrulandı. Üç alt ajan uygulama, bağımsız kapsam/veritabanı incelemesi ve transport/temizlik incelemesinde çalıştı; canlı yürütmeyi kök ajan yaptı. Hata sonrası oturum temizliği, 2xx/veri sızıntısı ayrımı, havuzun yok saydığı salt-okunur başlangıç ayarı ve eşzamanlı config güncellemesinde yanlış güvence verilmesi incelemelerde giderildi. Gerçek native oturum yakalama ve görsel Simulator doğrulaması yapılmadı.

Simulator engeli nedeniyle standart Firebase kurgu telefon doğrulamasının REST istemcisi kullanıldı ve canlı kabulü doğrulandı. Resmî SDK test modu, yalnızca tanımlı kurgu telefonlar için sahte reCAPTCHA test girdisi üretir; normal `sendVerificationCode` ve `signInWithPhoneNumber` telefon sağlayıcısı akışı kullanılır. Gerçek numarada denenmedi; özel/admin token üretilmedi, küresel doğrulama koruması kapatılmadı. Kaynak: [Firebase test modu](https://firebase.google.com/docs/auth/web/phone-auth), [SDK test doğrulayıcısı](https://github.com/firebase/firebase-js-sdk/blob/main/packages/auth/src/platform_browser/recaptcha/recaptcha_mock.ts).

Supabase panelinden resmi kök sertifika indirildi; yalnız denetleyicinin PostgreSQL bağlantısında kullanıldı. Sertifika zinciri ve hostname doğrulaması açık kaldı. Paneldeki proje ile bağlantının proje kimliği eşleşti. Havuz başlangıç ayarını yok saydığı için açık `READ COMMITTED READ ONLY` işlemi açıldı ve sunucudaki işlem modu doğrulandı. Doğrudan SQL veri yazımı veya DDL yapılmadı. Sertifika SHA256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. Bu, canlı uygulama sunucusunun kendi DB TLS ayarlarının doğrulandığı anlamına gelmez.

| İkinci aşama | Gerçek sonuç |
| --- | --- |
| Firebase yapılandırma ve telefon doğrulaması | 10 istek; tamamı 200. Gerçek SMS istenmedi. |
| Normal Blumi kayıt/kurulum | 14 istek; tamamı 200. İki yeni hesap ve iki tamamlanmış kurulum doğrulandı. |
| Kimlikli kendi-hesap okumaları | 14 GET; tamamı 200. İki oturum ayrı, aktif ve tamamlanmış; profil/oda sahibinin çağıranla eşleşmesi doğrulandı. |
| Sohbet, rapor ve engel verisi | Her iki TEST hesabında listeler boş. Bu, hesaplar arası özel veri erişiminin engellendiğini kanıtlamaz. |
| Özel yanıtların cache başlığı | 14/14 yanıtta `no-store` yok; canlı güçlendirme ihtiyacı doğrulandı. |
| Geçici test tanımlarının temizliği | Doğrulandı; ayrıca kök ajanın bağımsız config okumasında sıfır tanım görüldü. |

[Kayıt ve kimlikli kontrol kanıtı](API_LIVE_TEST_ACCOUNT_EVIDENCE_2026-10-10.json) 0600 dosya izinleriyle tutuldu. Telefon, kullanıcı/oda/sohbet kimliği, mesaj veya token içermiyor. [İlk hazırlık denemesi](API_LIVE_TEST_ACCOUNT_PREPARATION_2026-10-10.json), sıfır Google/Blumi isteği ve sıfır config mutasyonu ile duran denemenin kaydını korur. Ardından özel yapılandırma ve salt-okunur hazırlık kontrolleri ayrı ayrı doğrulanarak tekrar çalıştırıldı.

Yürütülen kayıt aracı SHA256: `c07c19b660cb4f230df87837f34e620b32fed765d2c969c39e1a32c13eebe770`; kimlikli GET aracı: `e09880280f869dcaff4dc9f66db1666a1a7ca72683e1e6956f5ac7d20dacbfcb`. Firebase map güncellemesinde belgelenmiş ETag/CAS yoktur; operatörün tek düzenleyici penceresi onayına dayanıldı. Eşzamanlı bilinmeyen değişikliklerin atomik korunması **kanıtlanmadı**; rapor bunun için yanlış PASS üretmez.

Oturumlar yalnızca yerel süreç belleğinde tutulmalı; kimlikler, telefonlar ve mesajlar kaydedilmemeli. İki ayrı test hesabının varlığı tek başına BOLA kaynağı sağlamaz: başka hesabın katılmadığı mevcut özel test sohbeti de gerekir. Kaynak yoksa oluşturulduğu veya test edildiği iddia edilmeyecek.

[Dondurulan kimlikli test planı](API_LIVE_AUTHENTICATED_PLAN_2026-10-10.md) GET yan etkilerini de kapsar. Bakiye/envanter okuması başlangıç/onarım yazımı yapabildiğinden, kendi yeni mesaj/davet okuması teslim/sona erme durumunu değiştirebildiğinden varsayılan kapsamdan çıkarılmıştır. HTTP bütçesi gibi operasyonel kayıtlar ürün verisi mutasyonundan ayrı değerlendirilir.

Yoğunluk/rate-limit eşiği, yavaş bağlantı saldırısı, gerçek satın alma, gerçek hesap silme, yabancı özel sohbet/davet erişimi ve canlı deploy doğrulaması **Open**. Yeni iki TEST hesabının özel sohbeti olmadığı için BOLA testi yapılmadı; ortak sohbet de yabancı özel kaynak sayılmaz. Canlı uygulama kodu yayımlanmadı. Firebase'de yalnız onaylı geçici test tanımları eklenip kaldırıldı; yalnız yeni TEST hesaplarının normal kurulumu yapıldı. Bu rapor eksiksiz sızma testi veya Production ready sertifikası değildir.
