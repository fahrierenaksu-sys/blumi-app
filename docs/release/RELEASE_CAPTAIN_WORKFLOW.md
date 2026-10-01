# Blumi ürün ve yayın kaptanı çalışma akışı

Bu belge, Blumi'nin yayın hazırlığını farklı Codex oturumlarında ve ürün/operasyon çalışmalarında aynı güvenlik ve kanıt standardıyla yürütmek içindir. **Güncel durumun tek kurucu özeti** [`LAUNCH_CONTROL.md`](./LAUNCH_CONTROL.md); bu belge durum tablosu tutmaz. Altyapı uygulama adımları [`railway-supabase-launch.md`](./railway-supabase-launch.md) içindedir.

## Her oturumda

1. Aktif checkout'u kullan (`pwd`, `git status --short` ve dalı doğrula; dizin adına güvenme); mevcut değişiklikleri kullanıcı işi kabul et, koru ve hiçbir şeyi topluca temizleme.
2. `.nvmrc` ile aynı Node sürümünü seç (`nvm use`, bugün 22.23.3), sonra `node -v` ile doğrula. İlgisiz veya değişmemiş alanlarda geniş doğrulamaları tekrarlama.
3. `LAUNCH_CONTROL.md` ve yalnızca üzerinde çalışılan alanın kanıtını oku. Apple, sağlayıcı, veritabanı, harcama, yasal onay ve cihaz durumu gibi değişebilir bilgileri eski metinden güncel gerçekmiş gibi aktarma; yeniden doğrula ya da tarihli ve doğrulanmamış olarak bırak.
4. En kritik mevcut engeli seç. Kodla güvenle çözülebilen açık işi uygula; kullanıcı hesabı, gizli bilgi, dış servis, üretim verisi veya geri alınması zor karar gerektiren yerde kapsamı daralt ya da kullanıcıyı adım adım yönlendir.

## Öncelik ve yayın kapıları

Launch control tablosu alanlar arası sırayı belirler. Genel sıra:

1. **Kullanıcı işini ve ortamları koru:** belirsiz veritabanını değiştirme; staging/production kimliğini kanıtla, yedek ve geri-yükleme kanıtı olmadan canlı şemaya dokunma.
2. **Yayın kapsamını sabitle:** gerçek dalı ve dosya listesini gözden geçir; aday avatar/görseller için gereken kaynak, görsel, native ve kullanıcı onaylarını ayrı ayrı doğrula. Büyük ve kirli worktree'yi olduğu gibi release adayı sayma.
3. **Kod kanıtı al:** Node sürümünü kaydet; ilgili testleri, `npm run verify` ve değişiklik kapsamındaki güvenlik/bağımlılık kontrollerini çalıştır. Başarısız kontrolü gizleme veya yalnız dokümandaki eski yeşil duruma güvenme.
4. **Staging'i ispatla:** ayrı servis ve veritabanı, migration ve idempotent tekrar, `/health` ile `/ready`, kimlik doğrulama ve geri dönüş kimliğini doğrula. IaC planını incelemeden uygulama.
5. **Gerçek iOS akışını dene:** EAS önizlemesi/native build'i iPhone veya uygun Simulator'da aç; oturum, keşif, eşleşme, kalıcı metin sohbeti, isteğe bağlı ve kapalı başlayan ses, push ve gerekiyorsa satın alma/geri yüklemeyi kontrol et.
6. **Dış ve insan kapılarını kapat:** Apple/TestFlight, SMS, APNs/FCM, ses, ödeme, yasal metin/mağaza sayfası, gizlilik-güvenlik, maliyet uyarısı, yedek-geri yükleme ve olay/rollback tatbikatı için doğrudan kanıt topla.
7. **Go/no-go ver:** aşağıdaki kapıların hiçbiri açıkken “yayına hazır” deme. TestFlight dağıtımı ve App Store herkese açık yayını ayrı karar ve kanıttır.

Bir kapının kanıtı diğer kapının yerine geçmez. Kod testi cihaz testi değildir; başarılı native build kullanıcı akışının çalıştığını göstermez; Railway yapılandırması deployment kanıtı değildir; yasal metnin repoda bulunması insan/hukuk onayı değildir.

## Durum ve kanıt kaydı

Her launch-control satırı şu yedi alanı taşır: kategori, konu, kısa durum, ne anlama geldiği, tek sorumlu (`Codex`, `Sen` veya `Birlikte`), sıradaki tek eylem ve tarihli kanıt.

- **IMPLEMENTED:** kod/ekran checkout'ta var.
- **TESTED:** gerçek komut ve sonuç kaydedildi.
- **NATIVE VERIFIED:** tam aday gerçek Simulator/cihaz akışında incelendi.
- **USER APPROVED:** kullanıcı tam ve belirli adayı onayladı.
- **EXTERNAL VERIFIED:** ilgili Apple/sağlayıcı/deployment hesabı veya hizmeti doğrudan kontrol edildi.
- **RELEASE READY:** o sürüm için bütün ilgili kod, görsel, native, kullanıcı, dış servis, güvenlik, yedekleme, mağaza ve rollback kapıları kapalı.
- **OPEN / BLOCKED / WAITING ON USER:** sırasıyla kanıt eksik, güvensiz/başarısız önkoşul, ya da kullanıcının hesabı/kararı gerekiyor.

Kaynakta doğrulanmayan dış durumu yeşil gösterme. Kişisel veri, API anahtarı, parola, OTP veya signing secret'ı panele, loglara ya da sohbete koyma. Panelin yerel Git sayacı istek sırasında güncellenir; tablo ve dış servis kanıtları kendiliğinden canlıya dönüşmez.

## Kod işi ve operatör erişimi

- Değişiklik öncesi gerçek uygulama/sunucu sınırını ve ilgili testleri bul. Dar regresyon testi ekle, kök nedeni düzelt, odaklı kontrolleri çalıştır, diff'i ve `git diff --check` sonucunu incele.
- Kullanıcıya ait ilgisiz diff'leri koru. Açık yetki olmadan stage, commit, push, merge, deploy, migration veya yayın yapma.
- Operasyon Merkezi durum gösterir; üretim admin konsolu değildir. Rapor ve hesap kurtarma API'si olması kullanıcı/Discover limitlerini değiştirecek web ekranı olduğu anlamına gelmez. Her operatör aracı normal kullanıcı hesabından ayrı kimlik, en az yetki, kısa ömürlü erişim ve denetim kaydı ister. Üretim verisini salt okunur destek ihtiyacından önce yazılabilir yapma.
- Railway/Supabase/Apple/SMS/ödeme canlı telemetrisi ancak gerekli sağlayıcı bağlantısı ve açık veri kapsamı kurulduktan sonra eklenir. Şimdilik paneli anlık alarm sistemi diye tanıtma. Sürekli otomasyon/hatırlatma yalnızca kullanıcı açıkça istediğinde kurulur; kullanıcı iptal ettiğinde kaldırılır.

## Her tur sonu devir

Kısa ve anlaşılır biçimde şunları bildir:

1. Gerçekte değişen dosya/alan ve mevcut gate durumu.
2. Çalıştırılan doğrulamalar ve tam sonuç; yapılmayan native/dış kontrolü açıkça belirt.
3. Kalan en önemli engel ve bunun kullanıcı, Codex ya da sağlayıcı sorumlusu olup olmadığı.
4. Kurucunun önündeki **tam olarak bir** sonraki eylem; nerede yapılacağı ve başarı işareti.

İlerleme yoksa planı başarı gibi sunma. Kullanıcıdan gereken yerde güvenli alternatifleri açıkla ve ondan yalnızca o adım için gereken bilgiyi iste. Hiçbir zaman yayın hazır olma durumunu varsayma.
