# Blumi API kataloğu

Güncel API sözleşmesi, çalışan sunucunun kayıtlı yollarından üretilir:
`GET /v1/docs/openapi.json`. Paylaşılan Postman/OpenAPI dosyaları birer anlık
görüntüdür; değişen sunucu için ikinci bir kaynak olarak tutulmaz.

| Belge | İçerik |
| --- | --- |
| `/v1/docs/openapi.json` veya `?scope=active` | Eski OTP yolları dışında aktif katalog |
| `?scope=mobile` | Aktif uygulama API'leri |
| `?scope=admin` | Yönetim API'leri ve yönetim konsolu dosyaları |
| `?scope=infrastructure` | Sağlık, hazırlık, yasal sayfalar, uygulama bağlantıları ve webhook |
| `?scope=legacy` | Kullanımdan kaldırılan OTP uyumluluk yolları |
| `?scope=all` | Aktif ve eski yolların tamamı |

Her işlemde `x-api-audience` bulunur. Yönetim API'sinin `adminAuth` şeması,
uygulama oturumundan ayrı, kısa ömürlü ve yetkileri sınırlı operatör kimliğini
tanımlar. Bu ayırma belge düzenidir; sunucunun erişim kontrollerini değiştirmez.

## Sayılar nasıl okunmalı?

Endpoint sayımı HTTP yöntemi + yol üzerinden yapılır. Aynı yolun GET ve POST
işlemleri ayrıdır. HEAD ve belgenin kendi yolu katalog sayımına girmez.
Yasal sayfalar ve uygulama bağlantıları gibi seçenekler toplamı değiştirebilir.

2026-10-10 yerel bellek deposu kontrolünde, yasal sayfalar ve uygulama bağlantıları
açıkken: mobil 61, yönetim 18, altyapı 12, eski OTP 12 işlem; toplam 103,
aktif katalog 91 işlem. Yönetimdeki 18 işlemin 13'ü API, 5'i konsol/dosya yoludur.
Bu rakamlar canlı sunucunun ölçümü değildir; sonraki değişikliklerde çalışan
sunucunun belgesi esas alınır. Mobil görünümü her yolun mobilde çağrıldığını
kanıtlamaz; bu, tüketiciye göre bir sözleşme ayrımıdır.

## İlk sadeleştirme

12 eski OTP yolu aktif katalogdan ayrıldı. `legacy` ve `all` görünümlerinde
`deprecated: true`, Firebase geçişinde verilen 410 yanıtı ve `x-replaced-by`
bilgisi korunur. Sunucu yolları silinmedi. Firebase açıkken eski akış güncelleme
yanıtı verir; oturum gerektiren yollar önce kimlik kontrolü yapar. SMS gönderme
ve eski doğrulama yan etkilerinin oluşmadığı yerel testlerle doğrulandı.

Mobil `sessionApi.ts` içindeki kullanılmayan 11 eski kayıt/OTP fonksiyonu ve
yardımcıları kaldırıldı. Aktif Firebase kayıt, yeniden doğrulama, hesap silme,
veri dışa aktarma ve telefon değiştirme akışları korundu. Güvenlik testleri aktif
akışların davranışına taşındı.

## Sonraki inceleme adayları

`POST /v1/connections/decision`, `POST /v1/referrals/invite` ve
`GET /v1/commerce/coin-packs` bu aşamada korunur. Kaldırmadan önce eski istemci,
kuyruk ve ürün bağımlılıkları ile gerçek kullanım değerlendirilmelidir.
Sohbet oluşturma/senkronizasyon/okundu ve oda çıkış yolları farklı aktif
davranışlara hizmet ettiğinden birleştirilmedi.

[Takip incelemesi](../quality/API_SIMPLIFICATION_FOLLOWUP_2026-10-10.md):
Bağlantı kararı eski kalıcı kuyruk için korunmalı. Davet kodu üretme ve coin
paketi listeleme yolları kaldırmaya aday; canlı kullanım yokluğu henüz
kanıtlanmadı. Ek 56 yerel güvenlik/araç testi geçti; iki gerçek oturumla canlı
hesaplar arası test hâlâ Open.

**Implemented / Tested:** Yerel sadeleştirme ve ilgili kontroller tamamlandı.
Mobil session testleri 503/503, odaklı sunucu testleri 37/37 geçti; mobil ve
sunucu tür kontrolü başarılı. Canlıya dağıtım ve gerçek hesaplarla tam sızma
testi bu sonucu kapsamaz; **Production ready: Open**.
