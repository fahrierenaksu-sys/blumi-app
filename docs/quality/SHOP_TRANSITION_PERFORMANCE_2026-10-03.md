# Mağaza ve oda geçişi performansı — 3 Ekim 2026

## Sonuç ve kapsam

Çalışma /Users/evrenevren/blumison checkout'ında, mevcut kirli sohbet/Discovery/MiniRoom/navigation çalışması korunarak yapıldı. Öncelik Avatar–Ev tıklama gecikmesi ve Odam→Mağaza kaymasıdır. Görsel çizimler, kamera, oda kabuğu, texture çözünürlükleri, ürün kimlikleri ve sahiplik sınırı değiştirilmedi.

**Implemented / Tested:** aşağıdaki düzeltmeler mevcut ve odaklı kontroller geçti. **Native verified:** gerçek Shop görüntüsü, seçim ve sekme etkileşimleri sınırlı kapsamda incelendi. Kesintisiz swipe kare süreleri, fiziksel cihaz/release performansı ve uzun oturum belleği **Open**. **Production ready: Open**. Uygulamanın her yerinde kusursuz akıcılık sonucu çıkarılmıyor.

## Asıl gecikme nedenleri ve düzeltmeler

| Neden | Düzeltme | Sınır |
| --- | --- | --- |
| Avatar/Ev koşullu ağacı çizimi her mod değişiminde kaldırıp yeniden kuruyordu. React memo kaldırılmış bir ağacı korumaz. Default→seçili ürün yolu da avatarı yeniden kuruyordu. | Default/seçili ürün için aynı parent yolu; yalnız ziyaret edilen iki çizim yuvası korunuyor. Gizli çizim dokunma/accessibility almıyor. | İlk ziyaretin kurulumu sürer; iki kalıcı çizim bellekte kalabilir. |
| Ev'e dönüşte aynı oda yeniden çözümlenip yeni renderItems kimliği alıyordu. | Hook içinde tek, kesin dekor/katalog/seçili mobilya girdilerine bağlı geometri sonucu saklanıyor. Gizli mod hesaplama yapmıyor; dönüşte güncel girdiler önce doğrulanıyor. | Gerçek geometri değişiminde çözümleme ve bir kendi-state render tekrarı gerekir. |
| Pembe sekme göstergesi ağır üst ekran commit'inden sonraki effect'i bekliyordu. | Aynı snappy hareket onPress içinde içerik çağrısından önce kuyruğa gönderiliyor; aynı hedef tekrar başlatılmıyor. Rota ve Reduce Motion effect ile uzlaştırılıyor. | Busy JS onPress teslimini hâlâ geciktirebilir; native ilk kare gecikmesi ölçülmedi. |
| Hiç seçilmemiş raf kartları görünmeyen halka/rozet shared value, animated style ve hareket aboneliklerini kuruyordu. | Dekorasyon animasyonu ilk seçimde kuruluyor. İlk seçim 0'dan, başlangıçta seçili kart 1'den başlar; ziyaret edilmiş çocuk fade-out ve tekrar seçim için korunur. | Basma hareketi ve gerçekten kullanılan seçim animasyonları sürer. |
| İlk cold Odam kayması iki komşuyu, Shop ve Inbox'ı birlikte yükletiyordu. | UI thread gerçek yönden yalnız gösterilen komşuyu bir kez ister. Yön değişimi gerekli diğer komşuyu destekler; pending mask tekrarları engeller. | İlk yön örneğine kadar cold hedef kurulmaz; mevcut fade korunur. Senkron module/render işi kesilebilir hale gelmez. |
| Bırakış konumu son onUpdate örneğinden eski kalabiliyordu. | Normal ve Reduce Motion bırakışında final translation ile hedef ve spring başlangıcı hesaplanır. | Hareket eşikleri, spring karakteri ve erişilebilirlik yönü korunmuştur. |
| Idle/focus işi yeni kayma başlarken JS hareket bildirimi henüz ulaşmadan kabul edilebiliyordu. | Kabul anında gerçek dragging/animating kontrolü, iptal ve retry. Spring callback kaybolmasına karşı generation/epoch kontrollü fallback. | Daha önce kabul edilmiş React işi sonraki hareket sırasında render edebilir; başlamış senkron iş durdurulamaz. |
| Katalog ve kombinasyon türetimleri bakiye/kopyalanmış envanter değişiminde gereksiz yenileniyordu. | Avatar/oda kurucuları ayrı bağımlılıklara bağlandı; sahiplik içerik anahtarı ekran içinde sabit, kombinasyon ve raf memoize. | Gerçek sahiplik, fiyat, dekor ve ekipman değişimi güncel sonucu üretir. |
| Background görsel hazırlığı yeni kaymayla yarışabiliyordu. | Foreground ve hareket kontrolü ilk planlama, her URI ve native admission öncesinde; URI'ler arasında idle aralığı. | Başlamış native decode iptal edilmez. Seçili ürün önceliği hazırlığı beklemez. |

Background slot bekleme döngüsü 5 saniye içinde güvenli aralık bulamazsa best effort iş bırakılır. İlk requestIdleCallback'in teslimi için ayrı bir süre garantisi yoktur. Normal image loader bu hazırlığı beklemez; dedupe, generation, rescue ve session bütçeleri korunmuştur.

Saklanan veriler yalnız çizim/geometri girdisidir. Fiyat, işlem callback'i, satın alma, equip ve sahiplik kararı güncel inventory store/sunucudadır. Gizli avatarın canlı satın alma uçuş hedefleri kaldırılır. Güncel katalogda idle/front çizimler statiktir; gelecekte animasyonlu idle veya avatar taşıyan Shop oda sahnesi eklenirse gizli renderer korunmaz.

## React ve davranış kanıtı

Gerçek React 19.2.3 reconciliation/effect harness'inde başlangıç, ilk ürün seçimi, seçim temizleme, ilk mod gidiş dönüşü ve 20 ek gidiş dönüşü uygulandı:

| Ölçüm | Önce | Sonra |
| --- | --- | --- |
| Avatar çizimi kurulum sayısı | 24 | 1 |
| Oda çizimi kurulum sayısı | 21 | 1 |
| Çizimlerin mod değişiminde kaldırılması | Her değişimde | 0 |
| Aynı default oda için 20 gidiş dönüşü | Tekrar çözümleme | 1 ilk çözümleme, aynı scene kimliği |

Son veriyle reactivation, güncel işlem callback'i, home-first lazy avatar, gizli dokunma/accessibility ve flight target kaldırma doğrulandı. Kart dekorasyonunun ilk gizli durumda animasyon kurmaması, ilk seçim başlangıcı ve fade-out/reselection boyunca aynı çocuğu tutması ayrı gerçek React harness'inde geçti.

Bu araçlar gerçek React yaşam döngüsünü çalıştırır; native host/renderer/animasyon sürücülerini taklit eder. Geometri paritesi repository testlerinde gerçek resolver ile kontrol edilir. Bu kanıtlar native FPS veya spring kare zamanlaması değildir.

## Native geliştirme profili

iPhone 17 QA / iOS 26.5, güncel checkout'tan Metro 127.0.0.1:8081 ve native Reload kullanıldı. Inspector Origin ayarıyla normal tracing bağlantısı kuruldu; güvenlik ayarı değiştirilmedi. Aynı 10 Avatar–Ev değişimi, kart dekorasyon düzeltmesinden hemen önce ve sonra uygulandı. İki profilde de CosmeticShopScreen için 10 React TimeStamp ölçümü ve ShopProductCard için 65 ölçüm var.

| Inclusive React ölçümü | Kart düzeltmesinden önce | Sonra |
| --- | --- | --- |
| CosmeticShopScreen ortanca | 44,485 ms | 33,844 ms |
| CosmeticShopScreen aralık | 40,095–50,629 ms | 30,999–35,220 ms |
| ShopProductCard ortanca | 3,657 ms | 2,232 ms |
| Hiç seçilmemiş rozet ortanca | 0,877 ms | 0,073 ms |
| Hiç seçilmemiş halka ortanca | 0,594 ms | 0,009 ms |

Bu iki development örneğinde ekran ortancası yaklaşık %24 düşük. Ölçümler child işini içerir; süreler birbirine eklenemez. Kontrollü release benchmark'ı veya UI/JS FPS, tıklamadan ilk kareye süre, cold swipe kazancı değildir. Son 31–35 ms değeri de kusursuz performans kapısı sayılmaz. Dev stack toplama/profiling maliyeti vardır.

Tracing X/B/E uzun-task parser'ı bu runtime'ın b/e/P verilerini ölçmedi; uzun görev sayısı **unavailable**, sıfır değil. React TimeStamp süreleri ayrı çözümlendi. Birden çok Simulator süreci olduğundan inspector ile OS process eşleştirmesi yapılmadan RSS raporlanmadı. Önceki karma pencere/yenileme profili karşılaştırma tabanına alınmadı.

Araçlar ve kimlik/mesaj/network/screenshot içermeyen aggregate sonuçlar: /Users/evrenevren/BlumiArtWorkbench/2026-10-03-shop-performance/. before-lazy-card ve son native-profile-summary.json ayrı korunmuştur. Profil araçları/dependencies app runtime'ına eklenmedi.

## Native görüntü ve etkileşim kontrolü

Son kaynaklar Reload sonrası incelendi: varsayılan avatar, Azure Garden Halter canlı denemesi ve kaldırma, Coral Wave Polo'ya seçim geçişi ve halka/rozet, Ev boş sahne, Blush Lounge Chair seçimi, Avatar→Ev dönüşünde önceki mobilya seçiminin temizlenmesi. Önizleme merkezleme, crop, katman sırası ve eylem yerleşiminde bu örneklerde yeni sorun gözlenmedi. Daha önce raf ikinci sayfası/sayacı, Odam ve alt düğmeyle mağazaya dönüş de kontrol edildi. Satın alma, equip/save veya canlı veritabanı yazımı yapılmadı.

CUA sürükleme denemeleri sürekli displacement üretmedi. Geçici sayısal probe, activation ve release arasında translation=0 olup uç velocity geldiğini gösterdi; probe tamamen kaldırıldı. Bu otomasyon gerçek sürekli swipe/FPS kanıtı olarak kullanılmadı ve eşikler otomasyona göre değiştirilmedi. Gerçek parmakla cold/warm Odam→Shop, hızlı ardışık kayma ve 60/120 Hz kare ölçümü **Open**.

Loading/empty/error/offline/disabled mantığı odak testlerde korunuyor. Tüm bu durumlar, büyük yazı ve OS Reduce Motion gerçek native akışta bu tur tamamlanmadı. Wardrobe/MiniRoom/remote participant native kontrolü bu tur kapsamına alınmadı.

## Testler ve bağımsız inceleme

Node 22.23.3 kullanıldı. Son kart düzeltmesinden sonra inventory 53 derlenmiş + 61 hook/behavior = **114/114**, Shop odak **23/23** dahil; theme/import/engineering/worklet **25/25** geçti. Navigation son pager kaynaklarında 174 + 116 = **290/290**; bağımsız pager **28/28** geçti. Fail/skip/cancel yok.

Önceki ilgili Shop preview/catalog/receipt **85+2=87/87**, warmup **36/36** geçti. Asset/receipt ve mobile package/dependency/fingerprint için diff yok. Mobile typecheck ve scoped lint geçti. Tam mobile lint 0 hata, kapsam dışı MiniRoom dosyalarında 3 uyarı verdi. Final whitespace diff kontrolü temiz.

Mevcut callback fixture'ları güncel reset/paging coordinator bağımlılıklarına uyarlandı; navigation test runner library tanımı ES2023/DOM, output target ES2022 kaldı. Yeni testler mevcut inventory runner'a eklendi; mobile package scripts değiştirilmedi. Test veya assertion kaldırılmadı.

Conductor kapsam, entegrasyon, gerçek React/native kontrol ve sonuç kararını üstlendi. Shop, navigation, warmup ve render maliyeti görevleri dört alt ajana verildi; beşinci ajan bağımsız adversarial review yaptı. Belirli modele geçiş iddiası yoktur. İncelemenin yakaladığı gizli flight target ve çizim merkezleme sorunları düzeltildi; son consumer/pager delta'sında açık somut doğruluk bulgusu kalmadı.

React eager-state yolunda tekrar çalışacağı yanlış varsayılan yeni updater guard'ı uygulanmışken kaldırıldı; yalnız o yeni deneme geri alındı. Mevcut kirli navigation/focus çalışması korundu. Bu nedenle tüm concurrent mount yarışları çözüldü denmiyor.

## Açık kapılar ve geri dönüş

İlk cold renderer/module kurulumu, native decode/cache residency, uzun oturum bellek bütçesi, fiziksel cihaz ve release JS/UI kare süreleri Open. İki kalıcı önizleme çizimi bellek trade-off'udur; mevcut finite try-on outgoing katmanı sırasında oda dahil geçici üçüncü çizim olabilir. Texture byte tahmini native RAM ölçümü değildir. İlk karede ağır renderer setup için daha geniş değişiklik, bu consumer yamalarının kanıtından çıkarılmamalıdır.

Proje avatar-production skill'i bu checkout, eski sdk54 ve Workbench konumlarında bulunamadı; renderer/rig/çizim/asset üretimine girilmedi. ai-game-art-pipeline okundu. Yeni asset/candidate, canonical pose/base değişimi, runtime byte değişimi, receipt, approval veya promotion yoktur.

Bu turun kaynakları: CosmeticShopScreen.tsx; features/shop altında ShopNavigationControls.tsx, ShopPreviewPanel.tsx, shopCatalog.ts, screen/ClosetBrowser.tsx, ShopCardSelection.tsx, useShopCatalogProducts.ts, useShopPreviewModel.ts; yeni useShopOwnedAvatarItemIds.ts, shopRetainedPreviewModel.ts, shopDerivedModels.test.ts; performance/CurrentSceneAssetWarmup.tsx, sceneAssetWarmupModel.ts ve testleri; MainTabPager.tsx ve interactivity testi; iki mevcut test runner'ı, rootNavigatorConcerns fixture'ı ve bu rapor. ShopProductCard/RemoveButton ve diğer sohbet/oda dosyalarındaki önceden var olan ayrı çalışma bu turun değişikliği olarak sayılmaz.

Yama dar ve geri alınabilir; geri dönüş yalnız bu turun hunks'larını hedeflemeli, kullanıcı/diğer ajan işini silmemelidir. Şema, inventory, loadout, oda verisi ve canonical ID değişmedi. Commit, push, merge, PR, deploy, native build veya OTA yapılmadı. Uygulama genelinde ve release koşullarında akıcılık onayı **Open**.
