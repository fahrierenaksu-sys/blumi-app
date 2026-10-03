# Blumi — API, sunucu ve veritabanı yük incelemesi

Tarih: 2026-10-03. İncelenen checkout: `/Users/evrenevren/blumison`.

Bu rapor mevcut kod ve yerel davranış testlerine dayanır. Railway/Supabase
metrikleri, canlı sorgu planları ve cihaz trafiği ölçülmedi. Canlı veritabanına
bağlanılmadı, migration uygulanmadı, yayın veya commit yapılmadı. Başlangıçtaki
ve çalışma sırasında başka işlerden gelen değişiklikler korundu.

## Bulunan ve giderilen yük kaynakları

| Alan | Önceki davranış | Uygulanan düzeltme | Sınır ve kanıt |
| --- | --- | --- | --- |
| Mobil Keşfet | Sonraki sayfa hatası sonrasında fetching durumu kapanınca efekt tekrar istek başlatıyordu. Tek isteğin sınırlı retry politikası toplam tekrar sayısını sınırlamıyordu. | `isFetchNextPageError` otomatik ön yüklemeyi durduruyor. `isFetching` liste yenilemesi sürerken sonraki sayfanın onu iptal etmesini önlüyor. Kullanıcı yenilemesi ve başarılı normal sayfalama korunuyor. | Mounted hook regresyonu eski kodda başarısız, düzeltmeyle başarılı; son Discovery çalıştırıcısı 223/223. |
| Backend HTTP kotası | Kota dolduktan sonraki her ret bile PostgreSQL ortak kota satırına UPSERT yapıyordu. | Yalnız ortak otoritenin ret kararı kullanıcı/kapsam bazında, bildirilen bekleme süresi boyunca yerel tutuluyor. İzin verilen her istek atomik ortak kotayı tüketmeye devam ediyor. | En fazla 10.000 hash anahtarı, en fazla 60 sn; monoton saat. Silinme/süre aşımı/depo hatası yerel erişim izni vermez. Auth ve moderasyon kontrolü her istekte korunur. |
| Gerçek zamanlı istemci | Sunucunun 4403 erişim reddi kapanışı yeniden bağlantı döngüsüne giriyordu. | 4403, 401/403 bilet reddi ve mevcut terminal kapanışlar gibi otomatik tekrarları durduruyor. Açık `connect()` yeniden deneyebilir. | İstemci lifecycle testi; normal ağ kesintisinden kurtarma korunur. |
| Gerçek zamanlı bağlantılar | Upgrade hızı sınırlıydı, fakat bir hesabın aynı sunucu örneğinde açık tutabildiği socket sayısı sınırsızdı. | Hesap başına açık ve açılışı süren bağlantılar birlikte en fazla 5. Slot DB lease kaydından önce alınır, hata/kapanış sonrası boşalır; kapanmakta olan socket yeni bağlantıyı engellemez. | Paralel upgrade, hesap izolasyonu, başarısız DB kaydı ve kapanıştan sonra yeniden bağlantı testleri. Çok sunuculu toplam sınır değildir. |
| Gerçek zamanlı frame yükü | Motion/typing/receipt fazlası düşürülse de sınırsız frame JSON ayrıştırma ve kabul kontrolü CPU yükü üretebilirdi. | JSON ayrıştırmadan önce ortak hesap frame/byte bütçesi; aşımda 4429 kapanışı. | Hesap başına 10 sn içinde 1.000 frame veya 2 MiB. Reconnect pencereyi sıfırlamaz; izlenen hesap tablosu en fazla 20.000, dolduğunda yeni anahtar fail closed. Normal olay sınıflarının ayrı kotaları korunur. |
| Gerçek zamanlı bakım | Lease/presence temizliği yavaş DB'de önceki tur bitmeden yeniden başlıyordu. | Her bakım işi ayrı single-flight; önceki işlem sürerken yeni tur başlatılmaz. Kapanışta yeni iş alınmaz. | Yavaş/askıda bakım regresyonları. Birbirinden bağımsız iki iş birlikte ilerleyebilir. |
| DB doğrulama akışları | Giriş, kurtarma, hesap silme ve hesap işlemi kodu talebi bütün kullanıcıların eski challenge/kota kayıtlarını temizliyordu. Bir kişinin eski kilitli satırı başka kişinin isteğini bekletebiliyordu. | Mevcut kimlik kilidi önce alınır; istek temizliği yalnız ilgili telefon/hesap/amaç için yapılır. Genel temizlik mevcut sınırlı retention işine taşınır. | Gerçek PostgreSQL 17'de ilgisiz kilitli satıra rağmen ilerleme, cooldown/kota/expiry, geç aktivasyon reddi ve tek kullanımlık doğrulama. Her istek iki temizlik sorgusunu korur ama her biri en fazla bir kimlik satırını etkiler. |
| DB eski doğrulama kayıtları | Sıcak yoldan genel silme kaldırılınca soğuk kayıtların ayrıca temizlenmesi gerekir. | Dört challenge tablosu yalnız süre aşımından sonra; dört kota tablosu pencere ve son istek 30 günden eskiyse retention kapsamında temizlenir. | Mevcut expiry/window indeksleri kullanılır; tablo başına turda en fazla 2.000 × 10 satır, `SKIP LOCKED`, her batch ayrı kısa işlem. Aktif challenge ve güncel sayaç korunur. Yeni migration yok. |
| Bildirim backend'i | Sürekli yeni iş eklenen dolu kuyruk `for (;;)` içinde süresiz boşaltılabiliyor; provider receipt kontrolü bu işin sonunu bekliyordu. | Tur başına en fazla 10 teslimat partisi ve 5 sn monoton yeni parti kabul bütçesi. Alınmış parti tamamlanır; alınmamış işler kalıcı kuyrukta kalır; receipt işi sıraya erişir. | En fazla 300 teslimat/tur. 5 sn kesin kapanma sınırı değildir; başlatılmış partinin mevcut DB/provider sınırları geçerlidir. Kuyruk adaleti, kalan işlerin sonraki turda teslimi ve geçersiz sınır testleri. |

## Yerel yük deneyi

Aynı kotası dolmuş kapsam için art arda 500 istekte ortak kota otoritesine
çağrı sayısı önce 500, yeni ret korumasıyla 1; izin verilen istek 0.
Bu kontrollü bağımlılık deneyidir, canlı DB CPU veya gecikme ölçümü değildir.
Eşzamanlı ilk dalga ve farklı sunucu örnekleri ayrı ortak kontroller yapabilir.
Retler auth kontrolünü atlamaz; bütün ret isteklerinin DB maliyeti sıfırlanmış
sayılmaz.

## Zaten bulunan ve korunan sınırlar

- Mobil `requestJson`: transport ve response body dahil 15 sn deadline, abort;
  kendiliğinden retry yok. Feature düzeyindeki tekrarlar ayrıca incelendi.
- Oturum yenilemesi, envanter yüklemesi ve profil ön yüklemesinde mevcut
  eşzamanlı çağrı birleştirme/hesap izolasyonu korunuyor.
- Push kaydı token olayları için debounce/tekrar koruması ve üç deneme sınırı
  taşıyor. Satın alma uzlaştırması efekt başına üç denemeyle sınırlı.
- Sohbet sayfalama tekrar eden cursor döngüsünü reddediyor. Tam geçmiş/listenin
  sayfalarla alınması tek başına sonsuz istek kanıtı değildir.
- HTTP genel hesap kotası 100/dk, chat gönderme 180/dk, oda bırakma 20/dk,
  cihaz kaydı ve silme ayrı ayrı 30/dk. Ortak IP'deki kişiler ayrı hesap
  bütçeleriyle korunur; mevcut IP ve başarısız auth sınırları korunuyor.
- Gerçek zamanlı olay sınıflarında mevcut ayrı kotalar, hareket birleştirme,
  delivery ack kuyruğu, upgrade/setup sınırları ve backpressure korunuyor.
- Gerçek ağ kesintisi için foreground yeniden bağlanma devam eder: 10 hızlı
  denemeden sonra jitter ile yaklaşık 15–30 sn aralık. Offline/background
  lifecycle durdurması mevcut. Bu kurtarma davranışı kaldırılmadı; erişim
  reddi tekrar döngüsü ayrı olarak kapatıldı.
- DB havuzu varsayılan en fazla 10 bağlantı, bağlantı edinme beklemesi 10 sn;
  deadlock/serialization için tek autocommit tekrar. Chat sayfalı, katılımcı
  profilleri toplu okunuyor; normal envanter okumaları gereksiz UPSERT yapmıyor.
- Readiness eşzamanlı kontrolleri birleştiriyor ve 2 sn yanıt sınırı var.

## Açık kalan operasyonel konular

1. **Boş bildirim kuyruğu:** Provider receipt desteği açıkken her sunucu örneği
   yaklaşık 2 claim SQL/sn, yani gün boyunca boş kalırsa yaklaşık 172.800
   SQL/gün üretir. Provider HTTP çağrısı yapılmaz. Mevcut 1 sn fallback başka
   örneğin eklediği işleri ve zamanı gelen retry'ları da bulur. Sonraki iyileştirme,
   kalıcı kuyruğu koruyan örnekler arası uyandırma ve retry zamanını dikkate alan
   adaptif tarama olmalı; aralığı uzatmadan önce teslimat gecikmesi ölçülmeli.
2. **SQL çalışma süresi:** Havuzdan bağlantı edinme sınırlı, fakat varsayılan
   SQL statement/query deadline kapalı. Client timeout sunucu SQL'ini otomatik
   durdurmaz. Gerçek Supavisor session/transaction pooler uyumluluğu ve uzun
   sorgu ölçümü alınmadan bu ayar veya canlı ortam değiştirilmedi.
3. **Global indeksler:** Lease temizliği `expires_at` ile global tarar; mevcut
   `(user_id, expires_at)` indeksi global expiry taramasının leading indeksi
   değildir. Bazı eski retention zaman taramaları da ek indeks adayıdır.
   Canlı satır sayısı/EXPLAIN kanıtı ve DB release runbook'u olmadan migration
   eklenmedi/uygulanmadı.
4. **Readiness ve fanout temel maliyeti:** Tamamlanan her `/ready` kontrolünde
   iki SQL; fanout peer hello yaklaşık 10 sn'de bir, payload temizliği dakikada
   bir. Bunlar sınırsız hızlı döngü değildir; dağıtık kapasite hesabına katılmalı.
5. **Çok sunuculu socket/frame sınırı:** Yeni 5 socket ve frame kotası sunucu
   örneği içinde geçerlidir. Global kota için ortak lease deposunda atomik
   kapasite kabulü ayrıca gerekir. Ortak HTTP kotası zaten DB'de atomiktir.
6. **Canlı ve native kanıt:** CPU, bellek, pool waiting count, p95/p99,
   `pg_stat_statements`, cihaz foreground/background trafik izi ve ölçekli yük
   testi bu çalışma kapsamında ölçülmedi. Yayınlanmış sunucu davranışı değişmedi.

## Doğrulama ve durum

Araç zinciri: Node 22.23.3; PostgreSQL testi yalnız gate'in oluşturduğu geçici
PostgreSQL 17 cluster ve disposable veritabanlarında çalıştı.

- Discovery: son çalıştırmada 223/223 başarılı, 0 skip.
- Gerçek zamanlı istemci: 50/50 başarılı, 0 skip.
- Gerçek zamanlı server test grubu: 187 başarılı, 3 PostgreSQL testi normal
  DB'siz çalışmada atlandı, 0 başarısız.
- Bildirim test grubu: 86/86 başarılı.
- HTTP kota/IP/ret odaklı grup: 20/20 başarılı.
- DB OTP/retention/contract: PostgreSQL 17 gate 31/31 başarılı, 0 skip.
- Ortak kota atomiklik testi: PostgreSQL 17 gate 1/1 başarılı, 0 skip.
- İzole yerel sosyal yük testi: 100 sentetik hesap / 50 ortak oda, 1/1
  başarılı. Yaklaşık 750 frame eşzamanlı burst'te hareket teslim p95 33,6 ms;
  100 istemcinin saniyede 5 adım gönderdiği steady bölümde p95 0,5 ms.
  Bu loopback/in-memory sonucu Supabase veya Railway kapasitesini kanıtlamaz.
- Tüm workspace typecheck: başarılı. Diff whitespace kontrolü: başarılı.
- Geniş server test grubu: 1.088 başarılı, 247 PostgreSQL testi DB'siz normal
  koşuda atlandı, **1 başarısız**. `coreApiSchemaDrift.test.ts` yeni
  `listChatRoomInvitesQuery` şemasının mevcut `PAIRS` kontrolüne eklenmediğini
  bildiriyor. İlgili schema/thread değişiklikleri bu işten önce kirliydi; bu
  kontrol zayıflatılmadı ve tam gate başarılı sayılmadı.

**Implemented:** Yukarıdaki düzeltmeler mevcut checkout'ta.
**Tested:** Odaklı davranışlar, DB izolasyon testleri ve tip kontrolü başarılı.
**Native verified:** Open.
**User approved:** Bu istek inceleme ve düzeltmeyi yetkilendirir; yayın onayı yok.
**Production ready:** Open; geniş testteki ayrı şema kontrolü ve canlı kanıtlar eksik.

Koordinatör son diff ve kanıtları inceledi; dört alt ajan yalnız mobil istek,
DB sorgu, realtime ve bildirim dilimlerinde çalıştı. Bu görevde sanat/asset
üretimi veya ilgili beceriler kullanılmadı. Ücret, sahiplik, kararlı kimlikler,
envanter ve mesajların kalıcılığı için mevcut backend otoritesi korundu.
