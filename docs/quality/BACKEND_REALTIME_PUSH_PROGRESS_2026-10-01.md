# Blumi backend, realtime ve push — 2026-10-01

Bu kayıt `/Users/evrenevren/blumison`, `develop` dalındaki yerel değişiklikleri
anlatır. Başlangıç commit'i `10c5e38`; uzak develop'ın doküman/güvenlik
commit'leri `ed5b484` noktasına kadar fast-forward ile korundu. Kullanıcı
2026-10-01 tarihinde bu değişikliklerin develop'a commit/push edilmesini
onayladı. Canlı ortam durumu bu çalışmada sorgulanmadı; canlı migration,
deploy veya fiziksel cihaz push denemesi yapılmadı.

## Kilitlenen kararlar

- Bildirim açıklama kartı, izin henüz seçilmemişse ilk sohbet ekranı girişinde
  hesap başına bir kez gösterilir. Sistem izin istemi kullanıcı düğmeye basınca açılır.
- Her sohbet mesajının push'u soket bağlantısından bağımsız kuyruğa alınır.
  Yalnızca ilgili sohbet odakta ve uygulama ön plandayken banner gizlenir.
- Sohbet push'u toplam saatlik sınırdan muaftır ve bu sınırı tüketmez.
  Sessiz saatler, bildirim tercihi ve tekrar engelleme korunur.
- Okundu varsayılan kapalı ve karşılıklı; teslim bilgisi açık olacaktır.
- Teslim onayı WebSocket üzerinden; HTTP geçmiş yüklemesi de teslim sayılacaktır.
  İmleç sırası sunucunun `(sent_at, message_id)` sırasıdır.
- Oda hareketi anlık senkron olacak; ortak yürünebilir geometriyle sunucu
  doğrulaması tercih edilmiştir. Hareket hedefleri artık anlık WebSocket ile aktarılır.

## Uygulanan ve test edilen yerel paket

| İş | Durum ve sınır |
|---|---|
| P01 | İlk sohbet girişinde açıklama kartı, ön plana dönüşte izin/kayıt eşitleme, kayıt isteğinde en fazla 3 deneme ve 1/2 saniye bekleme. Kalıcı 4xx hataları tekrar edilmez; hesap değişimi beklemeyi iptal eder. |
| P03, sohbet | Açık/hayalet soket push kuyruğunu artık atlatmaz. İlgili aktif sohbette foreground banner/list gizlenir; başka sohbet veya arka planda gizlenmez. Oda davetinin sokete bağlı atlama davranışı bu pakette değişmedi. |
| P04 | Bellek ve PostgreSQL politikasında sohbet saatlik toplamdan muaf; sessiz saatler/opt-out/dedupe korunur. |
| P05 | Ticket/receipt hata kayıtları izinli hata kodu, bildirim türü ve sayaçlarla sınırlı. Token, kullanıcı/mesaj/sohbet/ticket kimliği veya metin kaydedilmez. Receipt türü mevcut metadata nedeniyle `unknown`. |
| RT04 | Konuşma balonu FIFO beklemez; en yeni mesaj hemen görünür. Önceki konuşmacı ve eski zamanlayıcı temizlenir. |
| CHAT-RT04 | Odaktaki ve ön plandaki sohbet yeni gelen mesajları 500 ms debounce ile okundu eşitler. Odak kaybında bekleyen güncelleme gönderilir; hesap değişiminde eski hesaba gönderilmez. Bu, karşı tarafa görüldü sunan yeni özellik değildir. |
| RT10, kısmi | `NODE_ENV=development/test` ve `BLUMI_CHAT_LATENCY_DIAGNOSTICS=1` birlikteyken persist/fanout/push_enqueue süreleri ölçülebilir. Üretimde veya ortam belirtilmemişse kapalı. Uçtan uca telefon/region ölçümü yapılmadı. |

## Doğrulama

- Sunucu tam test komutu: 796 geçti, 119 atlandı; ayrı legal testleri 18 geçti.
  Atlanan PostgreSQL testleri tam PostgreSQL doğrulaması olarak sayılmadı.
- Bildirim mobil testleri: 46 geçti; sohbet testleri: 199 geçti;
  match/room testleri: 384 geçti; tema/mühendislik kontrolleri: 27 geçti.
- `npm run verify:postgres -- apps/server/src/db/notificationPolicy.contract.test.ts`:
  bellek ve geçici, izole PostgreSQL veritabanında 2/2 geçti. Canlı DB kullanılmadı.
- Workspace typecheck ve mobil lint geçti.
- Native doğrulama **OPEN**: çalışan Metro farklı/eski checkout'tan hizmet veriyordu.
  Bu checkout'un yeni kartı Simulator'da incelenmedi. Gerçek cihaz/APNs teslimi
  ve iki telefon arasındaki sohbet davranışı doğrulanmadı.

## Oda hareketi — IMPLEMENTED / TESTED

- `mini_room.scene_enter/scene_exit/move`, `motion_snapshot/avatar_moved`
  ortak sözleşmeleri ve runtime şema doğrulaması eklendi. Gönderen kimliği
  soketten alınır; yalnızca aktif odanın iki katılımcısı hareket alır.
- İlk hedef hemen iletilir; hızlı yeniden hedeflemede son hedef en fazla
  200 ms aralıkla birleştirilir. Animasyon karesi ağ üzerinden gönderilmez.
- Sunucu `[0,1]` sınırına ek olarak mobilin de kullandığı domain zemin
  poligonunu kontrol eder. Mobilya engelleri ve oturma yolları mevcut mobil
  RoomWorld planlayıcısında korunur; tam mobilya/koltuk geometrisinin sunucu
  doğrulaması bu paketin parçası değildir.
- Hareketin sunucuda ayrı hız ve bekleyen işlem kotası vardır. Hareket
  yoğunluğu sohbetin kotasını tüketmez veya sohbet soketini kapatmaz.
- İki avatarın hareket sürücüleri ayrıdır. Karşı tarafın hareketi yerel
  yürüyüşü iptal etmez; yeniden hedefleme canlı UI-thread konumundan başlar.
- İlk snapshot aynı katılımcıyı iki telefonda aynı konuma yerleştirir.
  Eski sıra/revision numarası konumu geri alamaz. Oda erişimi 10 saniyelik
  cache ile kontrol edilir; oda kapanması ve çift ayrılması cache'i iptal eder.
  Bekleyen kontrol iptal edilen odayı yeniden oluşturamaz.
- Presence oda ekranı/soket yaşam döngüsünden gelir. Arka plan/odak kaybı
  scene exit gönderir; bağlantı kopunca partner sönükleşir. Son soket
  kapanmadan çoklu cihazdaki katılımcı offline sayılmaz. Her iki soketin
  kısa kopuşunda hedefler bir dakika korunur; boş cache en fazla 128 odadır.
- Konum/presence cache'i tek sunucu sürecine aittir. Çoklu replika için ortak
  geçici state ve presence sahipliği gerekir; bu dağıtım doğrulanmadı.
- Güncel otomatik kontroller: sunucu tam paketi 800 geçti/119 atlandı,
  legal 18 geçti; bağımlılık güncellemesi sonrası sunucu odaklı paket 67 geçti;
  mobil hareket/lifecycle paketi 9 geçti; oda paketi 387 geçti;
  contracts 82, domain 24, realtime-client 43, tema/mühendislik 27 geçti.
  Typecheck ve lint geçti.
- İlk pre-push tam kontrolü, iki eski kaynak kodu beklentisinde durdu.
  Memo kontrolleri ortak `const` bildirimini; reset kontrolü iki avatarın
  ayrı hareket sürücülerini artık tanır. İlgili kontroller 12/12 ve iki
  yürüyüşün reset sırasında iptalini de kapsayan lifecycle testleri 8/8 geçti.
- Native kontrolü kullanıcı üstlendi. Ayrı `Blumi Motion QA` Simulator'ı ve
  bu checkout'tan 8083 Metro başlatıldı; bundle yüklendi, fakat gerçek oda
  akışında hareket/presence native kabulü yapılmadı. Bu nedenle
  **NATIVE_VERIFIED / PRODUCTION_READY** iddiası yok. Sanat dosyası veya
  avatar asset'i değiştirilmedi; mevcut Reanimated sürücüleri kullanıldı.

## Kalan görevler — OPEN

- Kullanıcının native oda hareketi/presence kontrolü ve iki fiziksel telefon
  arasında gerçek ağ gecikmesi. Çoklu replika doğrulaması yapılmadı.
- Çift tik/görüldü: **IMPLEMENTED / TESTED** (worktree dalı, birleştirilmedi).
  070 **yazıldı, uygulanmadı**; binary 070 olmadan çalışır ve alındı bilgisi
  kapalı kalır. Adımlar ve uyumluluk matrisi:
  [`MIGRATION_070_RUNBOOK.md`](../release/MIGRATION_070_RUNBOOK.md). Native ve
  iki telefon doğrulaması, gizlilik metni güncellemesi OPEN.
- RT10: yerel/staging ve iki cihaz gecikme ölçümü. RT06 sorgu optimizasyonu
  ancak bu ölçümden sonra değerlendirilmelidir.
- P03 oda daveti kararı, native kart/erişilebilirlik doğrulaması ve fiziksel
  cihaz push testi.

Bu kayıt ilk paketin **IMPLEMENTED / TESTED** durumudur. Görev dosyasının
tamamı bitmiş, **NATIVE_VERIFIED** veya **PRODUCTION_READY** değildir.
