# API sadeleştirme ve hesaplar arası erişim: takip incelemesi

Tarih: 2026-10-10. Mevcut `/Users/evrenevren/blumison` checkout'u incelendi.
İki alt ajan kullanım bağımlılıklarını ve canlı test hazırlığını salt okunur
inceledi; ana ajan kaynakları kontrol etti ve yerel testleri çalıştırdı.
Bu tur canlı HTTP çağrısı, gerçek hesap oluşturma, SMS, veri değişimi veya
dağıtım yapılmadı. Önceki kirli dosyalar korundu.

## Sonuç

Bu kapsamdaki yerel testlerde yeni doğrulanmış bir API erişim açığı bulunmadı.
Üç adaydan bağlantı kararları yolu uyumluluk için korunmalı; diğer ikisi
kaldırmaya aday olsa da yayınlanmış istemci ve canlı kullanım kanıtı eksik.
Canlı, kimlikli hesaplar arası test **Open**; yerel test sonucu bunu kapatmaz.

## Üç aday yol

| Yol | Karar | Kaynak kanıtı ve sınır |
| --- | --- | --- |
| `POST /v1/connections/decision` | Geçiş uyumluluğu için koru | Yeni karar ekranı kayıtlı değil, fakat aktif mobil kök eski kalıcı kuyruğu boşaltıyor. HTTP yolu silinirse bekleyen işler tamamlanamayabilir. WebSocket üzerinden aynı işlem de var; yalnız HTTP'yi silmek iş yüzeyini tamamen kaldırmaz. |
| `POST /v1/referrals/invite` | Kaldırmaya aday | Mevcut mobil/admin üretim kodunda wrapper dışında çağıran bulunmadı. Sunucu davet kodu/bağlantısı üretiyor. Aktif `claim` ve mevcut davet kayıtları ayrı tutulmalı. Kodda çağıran olmaması eski uygulama veya dış tüketici kullanılmadığını kanıtlamaz. |
| `GET /v1/commerce/coin-packs` | Kaldırmaya aday; uygulama bağımlılığı düşük | Mevcut mobilde HTTP çağıran bulunmadı; domain kataloğu ve native mağaza ürünleri kullanılıyor. Satın alma doğrulaması `reconcile` ve webhook üzerinden korunmalı. Canlı trafik yokluğu ölçülmedi. |

Kaynaklar:

- [Aktif kuyruk boşaltma](../../apps/mobile/src/navigation/RootNavigator.tsx#L529), [HTTP teslimi](../../apps/mobile/src/features/connections/connectionDecisionRuntime.ts#L37), [WebSocket kararı](../../apps/server/src/realtime/realtimeRouter.ts#L395).
- [Davet kodu üretimi](../../apps/server/src/referrals/referralService.ts#L24), [aktif claim](../../apps/mobile/src/features/session/useSessionState.ts#L537).
- [Coin paketleri HTTP kataloğu](../../apps/server/src/routes/commerceRoutes.ts#L45), [mobil mağaza istemcisi](../../apps/mobile/src/features/commerce/revenueCatCoinPackClient.ts#L114).

## Yerel güvenlik doğrulaması — Tested

Node **22.23.3** ile, `DATABASE_URL` boş ve `BLUMI_AUTH_REPOSITORY=memory`
ayarlanarak çalıştırıldı. Gerçek PostgreSQL testi çalıştırılmadı.

| Grup | Sonuç |
| --- | --- |
| Sohbet/oda/davet, hesaplar arası erişim ve blok davranışları; ekonomi/envanter/avatar sahipliği; oda düzeni; thread yetkisi; üç aday yolun davranış testleri | 41/41 geçti |
| Canlı test aracının gizli veri koruması, hedef sınırı, oturum kontrolü, hız/istek sınırı, native metadata ve iki runtime desteği | 15/15 geçti |
| Toplam | 56/56; sıfır hata, atlama veya iptal |

Kapsam: yabancı hesabın mesaj/davet erişiminin reddi; sahte kullanıcı/gönderen
alanlarının oturum kimliğini değiştirmemesi; başka hesabın satın aldığı eşyayı
kullanamama; oda düzenlerinin ayrılması; tekrar/eşzamanlı işlemlerde sahiplik ve
bakiye korunması. Bunlar mevcut yerel bellek uygulamasının kanıtıdır; canlı
dağıtımın, gerçek veri erişim katmanının veya tüm API'lerin güvenli olduğunun
kanıtı değildir. Son test dökümü: `/tmp/blumi-api-followup-node22-final.log`.

## Canlı test hazırlığı — Open

Paylaşılan Postman ortamının oturum alanları boş. İki ayrı geçerli, mevcut TEST
hesabı oturumu doğrulanmış değil; kullanıcıdan ayrı cihaz/Simulator oturumları
hakkında bilgi istendi. Kullanıcı Simulator'ı açmaya izin verdi. Telefon,
şifre, token veya özel kimlik istenmedi.

Bir booted cihaz ve localhost Metro native hedefi görüldü. Metro çalışma
klasörü `blumisonv2/apps/mobile`; mevcut inceleme checkout'u ile aynı olduğu
varsayılmadı. Simulator arayüzü standart Xcode kurulum konumunda ve
`/Applications` altındaki aramada bulunmadı. Salt okunur `simctl` uygulama
konteyneri sorgusu `NSMachErrorDomain -308 / server died` ile başarısız oldu.
Yerel native oturum yakalama `NATIVE_CAPTURE_UNAVAILABLE` ile durdu; gerçek
oturum değerleri çıktı veya dosyaya alınmadı. Bilgisayar kontrol aracı,
Terminal uygulamasını güvenlik gerekçesiyle açmayı reddetti. Bu aşamada
arayüzün açıldığı veya canlı hesabın doğrulandığı iddia edilmez; canlı HTTP
isteği sayısı sıfır.

Test aracına gerçek Metro Bridgeless metadata biçimi için pakete bağlı sıkı
eşleştirme ve `--inspector-url-a` / `--inspector-url-b` ile iki runtime desteği
eklendi. Önceki ortak `--inspector-url` desteği korundu. Yerel hedef, native
modül, token, yönlendirme ve gizli çıktı korumaları korundu. Yabancı sohbet
kontrolleri varsayılan kapalı kaldı. Bu hazırlık **Implemented / Tested**;
gerçek native oturum yakalama **Open**.

[Mevcut yürütücü](../../tools/security/live-authenticated-audit.mjs) oturumu yerel
Hermes/SecureStore üzerinden yalnız belleğe alır. Gerçek tokenların çıktıya
ve dosyaya taşınmasını engelleyen testleri geçti. Bununla birlikte, kimlikli
hesaplar arası teste başlamadan önce şu hazırlık farkları giderilmeli:

1. [Sohbet seçimi](../../tools/security/live-authenticated-audit.mjs#L182) ilk uygun
   özel sohbeti otomatik seçiyor. Test için açıkça seçilmiş mevcut sohbetle
   bağlanmalı. A/B ortak sohbeti yabancı kaynak testi değildir.
2. Mevcut araç, seçilen mesaj/cursor için sahibinin başarılı erişimini ayrıca
   doğrulamıyor. Yalnız 404 görmek, geçerli özel kaynağın yetkiyle reddedildiğini
   bağımsız kanıtlamaz. Salt okuma pozitif kontrolü gerekir.
3. İki inspector desteği eklendi; yine de iki eşzamanlı geçerli oturum gerekiyor.
   Tek uygulamada çıkış/giriş yaparak iki oturum toplanmamalı:
   [çıkış](../../apps/mobile/src/features/session/useSessionState.ts#L772) önceki
   oturumu iptal edebilir.

Bunlar test hazırlığı sınırlarıdır; doğrulanmış canlı API açığı değildir.
Yabancı kaynağa beklenmeyen 2xx yanıtında araç gövdeyi okumadan durur; bu olay
özel veri sızıntısı kanıtı olarak adlandırılmaz. Ekonomi okuması başlangıç/onarım
yazımı, en yeni mesaj okuması teslim bilgisi, davet okuması süre sonu güncellemesi
yapabildiğinden [kilitli planın](API_LIVE_AUTHENTICATED_PLAN_2026-10-10.md)
sınırları korunur.

## Durum

**Tested:** Yukarıdaki 56 yerel test ve kaynak incelemesi tamamlandı.
**Open:** Üç aday için gerçek kullanım/eskiden yayınlanmış istemci kanıtı;
iki gerçek oturum ve onaylı özel kaynakla canlı erişim testi; canlı dağıtım
eşleşmesi. **Production ready: Open.** Bu turda API veya mobil üretim kodu
değiştirilmedi; takip raporu, rehber bağlantısı ve iki yerel test aracı dosyası
güncellendi. Canlı dağıtım veya gerçek hesap değişikliği yapılmadı.
