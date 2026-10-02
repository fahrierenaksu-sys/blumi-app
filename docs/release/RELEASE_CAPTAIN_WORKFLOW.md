# Blumi ürün ve yayın kaptanı çalışma akışı

Bu belge, Blumi'nin yayın hazırlığını farklı ajan oturumlarında ve ürün/operasyon çalışmalarında aynı güvenlik ve kanıt standardıyla yürütmek içindir. **Güncel durumun tek kurucu özeti** [`LAUNCH_CONTROL.md`](./LAUNCH_CONTROL.md); bu belge durum tablosu tutmaz. Altyapı uygulama adımları [`railway-supabase-launch.md`](./railway-supabase-launch.md) içindedir.

## Her oturumda

1. Aktif checkout'u kullan (`pwd`, `git status --short` ve dalı doğrula; dizin adına güvenme). Mevcut değişiklikleri kullanıcı işi kabul et ve koru; hiçbir şeyi topluca temizleme, commit silme veya iş kaybettirme.
2. `.nvmrc` ile aynı Node sürümünü seç (`nvm use`, bugün 22.23.3) ve `node -v` ile doğrula.
3. Güncel durum `LAUNCH_CONTROL.md` içindedir. Apple, sağlayıcı, veritabanı, harcama, yasal onay ve cihaz durumu gibi değişebilir bilgileri eski metinden güncel gerçekmiş gibi aktarma; yeniden doğrula ya da tarihli ve doğrulanmamış olarak işaretle. Bu belgelerdeki bayat satırlar tekrar tekrar yanlış karara yol açtı.
4. En kritik mevcut engeli seç ve çöz. Sahibin hesabı, gizli bilgi veya `AGENTS.md`'deki onay listesinden bir adım gerektiğinde sahibe neyi neden istediğini açıkça söyle.

## Öncelik ve yayın kapıları

Launch control tablosu alanlar arası sırayı belirler. Genel sıra:

1. **Kullanıcı işini ve verisini koru:** canlı şemaya yalnızca yeni ve geri yükleme testi yapılmış yedekten ve sahibin onayından sonra dokun; hedef ortamın kimliğini kanıtla (bugün tek canlı ortam Railway `production`, ayrı staging yok).
2. **Yayın kapsamını sabitle:** gözden geçirilmiş dal ve dosya listesi yayın kapsamıdır. Aday yollardaki görseller release yapılandırma koruması tarafından engellenir. TestFlight'a veya Store'a ne gideceğini sahip onaylar. Kirli worktree'yi olduğu gibi release adayı sayma.
3. **Kod kanıtı al:** Node sürümünü kaydet; ilgili testleri, `npm run verify` ve güvenlik/bağımlılık kontrollerini çalıştır. Başarısız kontrolü gizleme; dokümandaki eski yeşil duruma güvenme.
4. **Ortamı ispatla:** ayrı servis ve veritabanı (staging henüz yok), migration ve idempotent tekrar, `/health` ile `/ready`, kimlik doğrulama ve geri dönüş kimliği. IaC planını incelemeden uygulama.
5. **Gerçek iOS akışını dene:** TestFlight veya development build'i iPhone ya da Simulator'da aç; oturum, keşif, eşleşme, kalıcı metin sohbeti, davetle oda ve push'u kontrol et. İlk sürümde canlı ses ve ücretli jetonların gerçekten kapalı olduğunu doğrula.
6. **Dış ve insan kapılarını kapat:** Apple/TestFlight, SMS, APNs/FCM, yasal metin/mağaza sayfası, gizlilik-güvenlik, maliyet uyarısı, yedek-geri yükleme ve olay/rollback tatbikatı için doğrudan kanıt topla.
7. **Go/no-go ver:** aşağıdaki kapıların hiçbiri açıkken “yayına hazır” deme. TestFlight dağıtımı ve App Store herkese açık yayını ayrı karar ve kanıttır.

Bir kapının kanıtı diğer kapının yerine geçmez. Kod testi cihaz testi değildir; başarılı native build kullanıcı akışının çalıştığını göstermez; Railway yapılandırması deployment kanıtı değildir; yasal metnin repoda bulunması insan/hukuk onayı değildir.

## Durum ve kanıt kaydı

Her launch-control satırı şu yedi alanı taşır: kategori, konu, kısa durum, ne anlama geldiği, tek sorumlu (`Ajan`, `Sahip` veya `Birlikte`), sıradaki tek eylem ve tarihli kanıt.

Etiketler `AGENTS.md` ile aynıdır:

- **Implemented:** kod/ekran checkout'ta var.
- **Tested:** gerçek komut ve sonuç kaydedildi.
- **Native verified:** tam aday gerçek Simulator/cihaz akışında incelendi.
- **User approved:** kullanıcı tam ve belirli adayı onayladı.
- **External verified:** ilgili Apple/sağlayıcı/deployment hesabı veya hizmeti doğrudan kontrol edildi.
- **Production ready:** o sürüm için bütün ilgili kod, görsel, native, kullanıcı, dış servis, güvenlik, yedekleme, mağaza ve rollback kapıları kapalı.
- **Open / Blocked / Waiting on user:** sırasıyla kanıt eksik, güvensiz/başarısız önkoşul, ya da kullanıcının hesabı/kararı gerekiyor.

Kaynakta doğrulanmayan dış durumu yeşil gösterme. Kişisel veri, API anahtarı, parola, OTP veya signing secret'ı panele, loglara ya da sohbete koyma. Panelin yerel Git sayacı istek sırasında güncellenir; tablo ve dış servis kanıtları kendiliğinden canlıya dönüşmez.

## Sahip kapıları ve operatör erişimi

- Sahibin açık onayını isteyen işlerin tam listesi `AGENTS.md` içindeki "Strict: production, money and data" bölümündedir (ör. `main`'e birleştirme, Railway deploy ve değişken değişikliği, EAS build/submit, TestFlight, OTA yayını, migration ve SQL yazma, satın alma ve üçüncü taraf hesap değişikliği, çizili görünümde görünür değişiklik). Git kuralları da oradadır. İlgisiz değişiklikleri koru.
- Operasyon Merkezi durum gösterir; üretim admin konsolu değildir. Rapor ve hesap kurtarma API'si olması kullanıcı/Discover limitlerini değiştirecek web ekranı olduğu anlamına gelmez. Her operatör aracı normal kullanıcı hesabından ayrı kimlik, en az yetki, kısa ömürlü erişim ve denetim kaydı ister. Üretim verisini salt okunur destek ihtiyacından önce yazılabilir yapma.
- Railway/Supabase/Apple/SMS/ödeme canlı telemetrisi ancak gerekli sağlayıcı bağlantısı ve açık veri kapsamı kurulduktan sonra eklenir. Paneli anlık alarm sistemi diye tanıtma. Sürekli otomasyon/hatırlatma yalnızca kullanıcı açıkça istediğinde kurulur; kullanıcı iptal ettiğinde kaldırılır.

## Her tur sonu devir

Kısa ve anlaşılır biçimde şunları bildir:

1. Gerçekte değişen dosya/alan ve mevcut gate durumu.
2. Çalıştırılan doğrulamalar ve tam sonuç; yapılmayan native/dış kontrolü açıkça belirt.
3. Kalan en önemli engel ve bunun sahip, ajan ya da sağlayıcı sorumluluğunda olup olmadığı.
4. Kurucunun önündeki **tam olarak bir** sonraki eylem; nerede yapılacağı ve başarı işareti.

İlerleme yoksa planı başarı gibi sunma. Kullanıcıdan gereken yerde güvenli alternatifleri açıkla ve ondan yalnızca o adım için gereken bilgiyi iste. Hiçbir zaman yayın hazır olma durumunu varsayma.
