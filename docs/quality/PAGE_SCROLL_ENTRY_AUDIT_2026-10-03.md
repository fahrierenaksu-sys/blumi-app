# Sayfa açılışı ve kaydırma yükü — 3 Ekim 2026

## Kapsam

Checkout: `/Users/evrenevren/blumison`, HEAD `5acf7d55`. İstek, mevcut animasyonları koruyarak sayfa açılışı ve kaydırma sırasında gereksiz işi azaltmaktı. Bu rapor bu turdaki ek düzeltmeleri kapsar. Başlangıçta bulunan sohbet, mağaza, pager ve oda performans değişiklikleri bu turun üretimi olarak sayılmadı. Çalışma sırasında başka kaynak/test dosyalarında eşzamanlı değişiklikler de görüldü; bunlar korunmuştur.

Bu tur animasyon tasarımını, eğrileri, süreleri, çizimleri, runtime asset dosyalarını, sahiplik kararlarını ve kayıt şemalarını değiştirmedi. Yeni dependency veya package.json script değişikliği yok. Commit, push, yayın veya deploy yapılmadı.

## Uygulanan ek düzeltmeler

| Gerçek sorun | Düzeltme | Davranış kanıtı |
| --- | --- | --- |
| Ayarlar, aynı hesabın profil nesnesi yenilendiğinde bildirim/gizli kişi verilerini tekrar istiyordu. | Bağımlılıklar hesap, oturum ve moda daraltıldı. | Aynı oturumdaki profil yenilemesi tercihleri koruyor ve yeniden GET başlatmıyor. |
| Eski bildirim GET/PUT sonuçları veya bırakılan güvenlik işlemleri yeni ekranı/oturumu güncelleyebiliyordu. | İptal sinyali, oturum ve işlem kuşağı kontrolleri; eski onay ve hata bildirimi engelleri. | Gecikmiş sonuç, tekrar deneme, iyimser kayıt, geri alma, unmount ve hesap değiştirme testleri. |
| Keşfet’in hazır kayıtlı/atlanmış kişi önbelleği mount sırasında boşaltılıyordu. | Hesap başına sabit snapshot ve `useSyncExternalStore`. | Hazır listeler ilk render boyunca korunuyor; başka hesabın geç yüklemesi mevcut hesabı değiştirmiyor. |
| Güvenlik store’u bütün hesapların abonelerini her bildirimde yeniden çizdiriyordu; aynı sunucu cevabı da yeni profil haritası üretiyordu. | Hesaba özel abonelik ve gözlenen alanlara göre sabit snapshot; aynı profil alanları için harita kimliği korunuyor. | Aynı güvenlik cevabı ve başka hesap değişikliği sıfır ek hook render; gerçek profil ve block değişikliği görünür. |
| Sunucu önce bitince gecikmiş local hydration profil haritasını silebiliyordu. | Sunucu hazırsa local kaynak sunucunun profil haritasını koruyor. | Geciktirilmiş local storage testi sunucu profillerini ve ID listesini koruyor; hazır sunucu görünümünü yeniden çizdirmiyor. |
| Keşfet’te kota yanıtı, aynı profilleri yeniden flatten ediyor ve deck türetimini geçersiz kılıyordu. | Yalnız değişen profil kaynaklarında flatten yapan, hook’a özel selector. | Gerçek quota callback’i sayacı güncelliyor, profil dizisini koruyor; profil değişimi, sıra, sayfa kaldırma ve hesap değişiminde yeni doğru sonuç. |
| RootNavigator kullanmadığı güvenlik görünümüne aboneydi. | Kullanılmayan abonelik kaldırıldı. | Server hydration global realtime yaşam döngüsünde; local hydration Keşfet ve Ayarlar tüketicilerinde kalıyor. Root render isolation ve güvenlik yaşam döngüsü testleri geçti. |

Selector yalnız son kaynak dizilerini ve tek türetilmiş profil listesini tutar; ayrı bir tüm-oturum cache’i oluşturmaz. TanStack verisinin immutable güncelleme sözleşmesine dayanır. Gerçek sunucu profil değişikliklerini saklamaz. Güvenlik ve envanter kararı sunucudadır.

## Sayfa bazlı kod taraması

| Sayfa | Açılış / kaydırma bulgusu | Native kanıt sınırı |
| --- | --- | --- |
| Lobby / Keşfet | Deck üç kartla sınırlı; sürükleme UI thread’de. Hazır connections cache ve kota kaynaklı liste yeniden üretimi düzeltildi. | Boş/tükenmiş normal ekran açıldı. Dolu deck, uzun oturum ve gerçek swipe FPS Open. |
| Inbox | Virtualized liste; mevcut dirty çalışmada thread odaklı abonelik ve sınırlı idle warmup var. | Normal liste açıldı; uzun liste/sert kaydırma Open. |
| ChatThread | Mevcut dirty çalışmada giriş tarihçesi ve render penceresi sınırlı. | Bu turda thread girişine ilişkin yeni native kanıt yok. |
| MyRoom | Sayfa düzeyinde büyük liste bulunmadı; sahne/texture yükü ayrı ölçüm gerektirir. | Normal oda ekranı açıldı; hareket FPS ve bellek Open. |
| CosmeticShop | Mevcut dirty çalışmada memoize katalog/önizleme, sınırlı shelf ve idle görsel hazırlığı var. | Mağaza görünümü görüldü; sürekli shelf/pager kaydırması ve FPS Open. |
| You | Scroll callback yalnız shared value güncelliyor; React setter yok. Sınırlı profil bölümleri. | Normal profil açıldı. Kesintisiz scroll, büyük yazı ve Reduce Motion Open. |
| ProfilePreview / LinkedProfile | UI-thread scroll; prompt sayısı sınırlı. Cache’den çizim ve push sonrası refresh mevcut. | Bu turda bağımsız profil preview native kanıtı yok. |
| ProfileEdit | Sınırlı form/seçenekler; scroll karesinde React state işi bulunmadı. | Klavye, scroll ve büyük yazı Open. |
| ProfileSetup | Sınırlı form; scroll karesinde React state işi bulunmadı. | Onboarding native Open. |
| Settings | Push-settle refresh mevcut; gereksiz refetch ve store güncellemeleri düzeltildi. Hidden people bölümü hâlâ ScrollView içinde tüm satırları map ediyor. | Normal ayarlar açıldı, sunucu tercihleri göründü; uzun hidden-list/scroll/erişilebilirlik Open. |
| MyRoomEditor | Envanter Reanimated.FlatList, sınırlı render/window ve memo kartlar. React sayfa indeksi değişiminde bilgilendiriliyor. | Editor sürükleme/scroll native Open. |
| WardrobeV2 | Katalog, sahiplik ve renderer yolu ayrı avatar kapsamı; bu turda asset/renderer değişikliği yok. | Wardrobe native performans Open. |
| AvatarSetup | Sınırlı setup akışı; karakter renderer’ı bu turdaki değişiklik kapsamı dışında. | Onboarding native Open. |
| RoomSetup | Sayfa düzeyinde büyük liste bulunmadı; sahne ayrı inceleme gerektirir. | Onboarding native Open. |
| AuthEntry | Sınırlı giriş sayfaları; scroll karesinde ağır React callback bulgusu yok. | Yeni oturum akışı native Open. |
| Register | Ülke seçimi büyük liste için FlatList kullanıyor. | Klavye/ülke-listesi native Open. |
| PreAuthSetupFlow | Keyboard reaction’ları ilgili durum değişiminde JS’e geçiyor. | Onboarding ve klavye native Open. |
| MatchResult | Sınırlı içerik; scroll karesinde ağır JS callback bulgusu yok. | Native Open. |
| RoomDebrief | Büyük liste yok; realtime callback ilgili olayları filtreliyor. | Native Open. |
| AccountRestriction | Sınırlı içerik. | Native Open. |
| Legal | Statik metin; scroll-frame JS işi bulunmadı. | Native Open. |
| MiniRoom | Mevcut giriş/history çalışması ve eşzamanlı başka değişiklikler var; bu tur renderer/animasyon değiştirmedi. | Oda davetiyle gerçek giriş, klavye, FPS, bellek ve reconnect Open. |
| HomeStudio | QA ekranı; statik katalog seçenekleri ScrollView’de. | Üretim doğrulaması sayılmadı. |
| MiniRoomRigPreview | QA ekranı; renderer doğrulaması bu tur kapsamında yapılmadı. | Üretim doğrulaması sayılmadı. |

Bu tablo sayfanın tamamının performans PASS aldığı anlamına gelmez. Özellikle Wardrobe/setup/room renderer maliyeti için ölçüm olmadan sonuç verilmedi.

## Doğrulama

Node 22.23.3 kullanıldı. Mevcut test runner dosyalarına davranış testleri eklendi; native fingerprint kapsamındaki package.json scripts değiştirilmedi.

- Settings worker: odaklı 14/14 ve session runner 486/486 PASS; hedefli ESLint PASS.
- Connections worker: runner 56/56 PASS; yeni 5 hook testi ve strict focused TypeScript PASS.
- Final Safety runner: 28 model/API + 12 hook/wiring, toplam 40/40 PASS. Son local-hydration düzeltmesinden sonra 17/17 focused block model/hook PASS.
- Navigation runner: 174 + 95 PASS. Root abonelik kaldırma sonrasında lifecycle/isolation/settings/connections focused grup 39/39 PASS.
- Discovery final runner: 150 + 5 + 68, toplam 223/223 PASS. Son fixture tip düzeltmeleri sonrası selector/query/deck focused grup 15/15 PASS.
- Final theme/import/engineering/compiled-worklet guard grubu 25/25 PASS.
- Değişen kaynak/testlerde hedefli ESLint ve diff whitespace kontrolleri PASS.
- Tam mobile TypeScript: final kontrol PASS, exit 0 (`/tmp/blumi-pages-typecheck-review-20261003.log`). Eşzamanlı MiniRoom test düzenlemeleri önceki kontrolleri durdurmuştu; final başarılı sonuç bunları takip eder.

Read-only ikinci inceleme, gecikmiş local hydration yarışını üretim hook’u üzerinden doğruladı; conductor düzeltip regresyon testi ekledi. Conductor kaynak, entegrasyon, selector, güvenlik store’u, final inceleme ve sınırlı Simulator kontrolünü yürüttü. İki bounded agent Settings ve connections alanlarını uyguladı; model değişimi yapılmadı. Avatar üretim skill’i veya görsel üretim aracı kullanılmadı.

## Native ve performans sınırları

Metro process cwd’si bu checkout’ın `apps/mobile` klasörü olarak doğrulandı. Booted iPhone 17 QA’da Keşfet, Sohbetler, Odam, Profil ve Ayarlar açılışları incelendi; mağaza görünümü de görüldü. Bu, kaydırma frame-time/FPS ölçümü değildir. Device Hub hedefi/aktif pencere tekrar değişti ve otomasyon `The user changed ... Re-query the latest state` hatası verdi; kesintisiz, tek-hedef bir native performans oturumu elde edilemedi.

Dev build FPS’i, release FPS’inin kanıtı değildir. React Native [performans rehberi](https://reactnative.dev/docs/performance) geliştirme modundaki JS ek yükünü açıklar. [FlatList rehberi](https://reactnative.dev/docs/optimizing-flatlist-configuration) batch/window küçültmenin bellek ve tepki süresine karşı boş satır riski taşıdığını anlatır. Bu tur liste ayarları körlemesine küçültülmedi.

Open: release/device FPS ve frame-time; cold/warm entry süreleri; uzun oturum bellek/texture residency; büyük hidden-list virtualization; offscreen Discovery query/prefetch maliyeti; shelf kaydırması sırasında native decode maliyeti; tüm ilgili loading/error/offline/disabled, büyük yazı ve Reduce Motion native durumları.

## Durum ve geri dönüş

- Implemented: yukarıdaki ek düzeltmeler current checkout’ta.
- Tested: belirtilen davranış testleri ve dar kontroller PASS.
- Tam mobile TypeScript: PASS; son çalıştırma exit 0.
- Native verified: akıcılık/performans için Open; yalnız listelenen normal ekran girişleri gözlendi.
- User approved: yeni ölçülmüş akıcılık onayı çıkarılmadı.
- Production ready: Open.

Geri dönüş yalnız bu turdaki kaynak/test hunks’larının tersidir; checkout’ın önceki dirty işi korunmalıdır. Persisted hesap, inventory, loadout, oda, semantic ID, asset ve release receipt değişikliği yok.
