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

## Bağımsız inceleme ve düzeltmeler — IMPLEMENTED / TESTED

911e075, 1a8f273 ve 08d6a18 ayrı bir oturumda adversarial olarak incelendi.
Bulunan hatalar önce başarısız test, sonra dar düzeltme ile kapatıldı:

- Sunucu (`a981aa2`): yetki kontrolü beklerken gelen hareket adımları sessizce
  düşüyordu (son hedef kaybı); artık soket başına sıralı ve "en yeni kazanır".
  Zemin dışına taşan koltuk hedefleri reddediliyordu; `hotspotId` taşıyan
  hareket artık iletilir. Aynı soketin tekrar girişi partnere "ayrıldı" titremesi
  yaratmıyor. Hareket artık yalnızca sahneye girmiş yerel soketlere gider;
  üretimde adım başına PostgreSQL NOTIFY sorgusu kalktı.
- Mobil (`0c83437`): aynı anda gelen partner adımı ile kendi yankımız tek
  render'da birleşince partner adımı kayboluyordu; durum artık tam kayıt ve
  snap anahtarı taşır. Sahne yeniden kurulunca konum/presence yeniden uygulanır.
  Planlanamayan partner adımı artık yürür ya da hedefe yerleşir. Kayıp
  `scene_enter` yeniden denenir. iOS "inactive" artık sahneden çıkarmaz.
- Bildirim (`cd74344`): ön planda aynı mesaj için toast + push banner çift
  uyarısı kaldırıldı; açık sohbet veya o sohbetin MiniRoom'u ekrandayken toast
  gösterilmez (CHT-01), toast sohbeti açar, bilinmeyen gönderen yerelleştirildi.

PostgreSQL kapısı bu inceleme ortamında root dışı kullanıcıyla çalıştırılamadı;
PostgreSQL kodu değişmedi. Native doğrulama hâlâ **OPEN**.

## Kalan görevler — OPEN

- Kullanıcının native oda hareketi/presence kontrolü ve iki fiziksel telefon
  arasında gerçek ağ gecikmesi. Çoklu replika doğrulaması yapılmadı.
- Çift tik/görüldü: 070 migration dosyası, capability kapısı, atomik tuple
  imleçleri, teslim ACK'i, karşılıklı tercih, API/realtime/store/UI zinciri.
  070 henüz yazılmadı; migration uygulanmadı.
- RT10: yerel/staging ve iki cihaz gecikme ölçümü. RT06 sorgu optimizasyonu
  ancak bu ölçümden sonra değerlendirilmelidir.
- P03 oda daveti kararı, native kart/erişilebilirlik doğrulaması ve fiziksel
  cihaz push testi.
- Sunucuda koltuk sahipliği yok: iki kullanıcı aynı koltuğu aynı anda seçerse
  iki telefon da ikisini aynı koltukta gösterir (tutarlı ama üst üste).
- Başlangıç yatağının (`room_v2_cozy_bed`) koltuk noktası Room V2 render
  boyutuyla (1.42) zemin dışına düşüyor; MiniRoom'da yatağa oturma planı
  kurulamıyor. Senkron hatası değil, geometri işi; native kontrol gerekir.
- Aynı hesabın iki cihazı aynı odadaysa ikinci cihaz kendi avatarının diğer
  cihazdan gelen adımlarını uygulamaz (yalnızca katılım snapshot'ında).

Bu kayıt ilk paketin **IMPLEMENTED / TESTED** durumudur. Görev dosyasının
tamamı bitmiş, **NATIVE_VERIFIED** veya **PRODUCTION_READY** değildir.

## Bildirim sistemi denetimi (sohbet push çekirdeği dışı) — IMPLEMENTED / TESTED

`develop` @ `08d6a18` üzerine ayrı bir worktree dalında; sohbet push çekirdeği
(`911e075`) yeniden yazılmadı. Migration yok, deploy yok, gerçek push yok.

- Oda daveti (P03 açık maddesi kapandı) ve eski realtime push yolları soket
  açık görünse de kuyruğa alınır; telefon ilgili sohbet/oda ekrandayken banner
  göstermez. Davet push'u davetle birlikte sona erer (Expo `expiration`), geç
  yeniden deneme düşer.
- Sunucu her tür için TR/EN metni kendisi seçer (dil: kayıttaki şartları kabul
  dili; bilinmiyorsa İngilizce). Cihaza yalnızca yönlendirme kimlikleri ve
  alıcı kimliği gider; beğenen kişi, eşleşme partneri, Discovery Watch adayı
  sunucuda kalır. Mesaj/davet/eşleşme `high` öncelik, sohbet başına
  collapse/thread-id gruplama, Android `default` kanalı.
- Oda daveti Mesajlar tercihine, sessiz saatlere ve davet başına tekrar
  engellemeye uyar; saatlik bütçeden muaftır (mevcut `message` türü).
- Gönderimden hemen önce yeniden kontrol: ban/askı/silinmiş hesap, iki yönlü
  engel, kaldırılmış sohbet, yanıtlanmış/iptal/süresi dolmuş davet push'u düşürür.
- Kuyruğa giren push worker'ı hemen uyandırır; 1 sn döngü yedek kalır.
- Telefon: her olay tek uyarı (uygulama içi toast, push banner'ı, eşleşme
  ekranı aynı olayı bir kez gösterir); odadaki konuşmanın mesajları banner
  göstermez. Çıkışta cihaz kaydı oturum iptalinden önce silinir; hesap
  değişiminde bildirimler ve rozet temizlenir. Bildirim tercihleri TR/EN.
- OPEN: fiziksel iki telefon testi, APNs anahtarı (P-02), sunucu tarafı rozet
  sayısı, davet kabul push'u (ürün kararı), uygulama içi dil değişiminin
  sunucuya taşınması (migration gerektirir), `MessageRateExceeded` receipt'i
  sonrası yeniden gönderim (receipt tablosu içeriği tutmaz).
