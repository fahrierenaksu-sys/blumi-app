# MiniRoom mesajlaşma ve performans taraması

Tarih: 2026-10-03. İncelenen checkout: `/Users/evrenevren/blumison`.

Bu çalışma kod incelemesi, mevcut davranış testleri ve sentetik yerel denemelerden oluşur. Uygulama kodu değiştirilmedi. Native FPS profili, Simulator üzerinden mesajlaşma ve fiziksel cihaz ölçümü yapılmadı. Bulguların FPS düşüşündeki payı henüz ölçülmedi.

## Korunacak davranış

- Her kişinin en fazla üç balonu kendi sütununda kalır; yenisi altta belirir.
- Her mesaj gösterildiği andan itibaren kendi dört saniyelik ömrünü korur; başka bir mesaj eski mesajın süresini uzatmaz.
- İki kişinin balonları birbirini silmez. Bir balona basmak yalnızca onu kapatır.
- Balonlar büyüyüp küçülmez; yumuşak belirme, küçük yükseliş ve kaybolma korunur.
- Reduce Motion davranışı, durable mesaj kaydı, sunucu onayı ve başarısız gönderim durumu korunur.

## Doğrulanmış gereksiz işler

### F01 — Her harf odanın ana bileşenini tekrar çalıştırıyor

`MiniRoomScene.tsx:190,265` yazı alanının değerini sahnenin kendisinde tutuyor. `AvatarLayer`, `MiniRoomChatPanel`, `MiniRoomChatHistory` ve `MiniRoomContext` doğrudan bu render ağacında; ilgili sınırların tamamı memo ile ayrılmış değil. Bu, her değişimde tüm native görsellerin yeniden çizildiği anlamına gelmez, ancak React tarafındaki bileşen işi yayılır.

Mevcut sahne test düzeneğini kullanan deneme: üç ardışık draft değişikliği, üç ek sahne render'ı üretti. Bu bir FPS ölçümü değildir.

Öneri: draft'ı composer sınırında tutmak veya sabit sahne/panel sınırları kurmak. Satır sayısı gibi gerçekten sahne geometrisini etkileyen bilgiyi üst bileşene göndermek.

### F02 — Değişmeyen geçmiş satırlarının nesneleri ve ölçüm callback'leri yenileniyor

`roomChatHistoryModel.ts:29` her seçmede bütün görünür satırlar için yeni nesne oluşturuyor. `MiniRoomChatHistory.tsx:40-74` ayrıca `items` değişince `reportRecentHeight`, `measureRow` ve `renderItem` callback'lerini yeniliyor. Dolayısıyla yalnızca satır nesnelerini düzeltmek yeterli olmaz: `HistoryRow`'un `onMeasure` prop'u da sabit olmalı.

Sentetik deneme: 15 satırlık geçmişe bir mesaj eklendiğinde değişmeden kalan 14 satırın hiçbirinin nesnesi yeniden kullanılmadı. React'in varsayılan memo karşılaştırması bunu değişiklik olarak görür.

Öneri: değişmeyen satırları korumak, ölçüm callback'lerini güncel son satırları ref üzerinden okuyacak şekilde sabitlemek; yalnızca değişen içeriğin, teslim durumunun ve gerekli yüksekliğin güncellenmesi.

### F03 — Klavye açıkken görünmeyen geçmiş hâlâ güncelleniyor

`MiniRoomChatPanel.tsx:172-181` geçmişi sürekli mounted tutuyor; typing sırasında opacity ve dokunma/erişilebilirlik ayarlarıyla gizliyor. Bunlar React güncellemelerini durdurmaz. Mesaj ve onay geldiğinde gizli liste, satır ölçümleri ve bunların sahneye gönderdiği yükseklik bilgisi çalışmaya devam edebilir.

Öneri: durable store'u hemen güncellemeye devam edip gizli geçmişin sunum güncellemelerini ertelemek. Klavye kapanırken güncel geçmişi mevcut geçişin zamanlaması içinde göstermek; scroll konumunu ve Reduce Motion'ı korumak. Listeyi her klavye açılışında söküp kurmak varsayılan çözüm olmamalı.

### F04 — Balon değişikliği ilgisiz kişiye ve karakter durumuna yayılıyor

`AvatarLayer.tsx:78` ve `miniRoomSpeechStack.ts` içindeki `groupMiniRoomSpeechBySpeaker` her yeni balon listesinde bütün konuşmacı dizilerini yeniden oluşturuyor. Bir kişinin mesaj eklemesi, diğer kişinin mevcut balonlarını taşıyan dizinin kimliğini de değiştiriyor. Eski balon nesneleri korunuyor; dizi korunmuyor.

`miniRoomSceneStore.ts:724-728` karakter zaten `speaking` olsa bile yeni avatar nesnesi oluşturuyor. Bunun sonucu avatar bileşeninin memo sınırı da yeniden açılır; bu, bütün animasyonların yeniden başladığı iddiası değildir.

Öneri: değişmeyen konuşmacı dizilerini korumak, balon sunumunu sahne durumundan ayırmak ve zaten uygulanmış motion durumunu yeniden yazmamak. Süre yenileme gerekiyorsa bunu görsel durum değişikliği üretmeden yapmak.

### F05 — Sunucu onayı aynı geçmiş satırını yeniden kuruyor

`MiniRoomChatHistory.tsx:122` liste anahtarı olarak doğrudan mesajın `id` alanını kullanıyor. Gönderimdeki yerel mesaj sunucu mesajına dönüşünce bu anahtar değişiyor. Ortak chat store'da `chatMessageRenderKeys.ts` ile sabit sunum anahtarı mekanizması mevcut, ancak MiniRoom geçmişi bunu kullanmıyor.

Gerçek store koduyla yerel deneme: onaydan sonra geçmişte hâlâ tek ve aynı metinli mesaj var, fakat liste anahtarı değişiyor. Bu nedenle satır yeniden mount olur; ölçüm ve ilgili hook kurulumları tekrar yapılır. Native scroll sıçraması veya görünür titreme bu turda doğrulanmadı.

Öneri: mesajın kalıcı kimliğini değiştirmeden sabit sunum anahtarını kullanmak; ölçüm önbelleği ve ilk görünüm bookkeeping'ini aynı anahtarla tutarlı hale getirmek.

## Yerel denemeyle doğrulanmış davranış sorunları

### F06 — İlk geçmiş isteği başarısızsa canlı balonlar beklemede kalıyor

`useInRoomChat.ts:226` giriş replay'ini ancak geçmiş hazırsa tamamlıyor. `:324-326` bu replay tamamlanmadan gelen canlı mesajları buffer'a koyuyor. İlk istek başarısız olunca bağlantı açık kalsa da bu buffer'ı canlı sunuma açan bir başarısızlık yolu yok. `requestedRef` aynı girişte otomatik yeni istek yapılmasını da engelliyor.

Mevcut hook test fixture'ı ile deneme: geçmiş isteği reddedildi, ardından üç canlı partner mesajı geldi. Sonuç: sıfır görünür balon olayı, bir geçmiş isteği; gönderim hâlâ kabul ediliyor. Buffer büyümeye devam edebilir. Bu bulgu mesajın sunucudan silindiğini göstermez; balon sunumu engellenir.

Öncelik: yüksek. Öneri: geçmiş yükleme hatasını canlı mesaj sunumundan ayırmak; giriş replay'i başarısızlığında buffer'ı bir kez güvenli şekilde boşaltmak ve tekrar gösterim korumasını korumak.

### F07 — Birden fazla başarısız gönderimin tekrar kimliği kaybolabiliyor

`useInRoomChat.ts:126-138` birden fazla in-flight mesajı izlese de yalnızca tek `failedRef` ve tek `failedRoomMessage` tutuyor. `roomComposerModel.ts` dolu yazı alanını değiştirmiyor. `useInRoomChat.ts:362-365` tekrar gönderme kimliğini yalnızca bu son başarısız kaydın metni eşleşirse kullanıyor.

İki deneme:

- Üç onaysız gönderim sonrası bağlantı kopması: üç mesaj failed oldu, hook yalnızca bir başarısız draft sundu.
- İki farklı metin ayrı zamanlarda başarısız oldu: ilk mesaj yazı alanına geri kondu; ikinci hata son başarısız kaydı değiştirdi ama yazı alanını değiştirmedi. İlk draft yeniden gönderildiğinde eski client kimliği korunmadı; yeni optimistic satır oluşturuldu.

Öncelik: yüksek. İlk gönderim sunucuda kaydedilmiş fakat onayı kaybolmuşsa yeni kimlikle tekrar gönderim çift mesaj riski taşır; gerçek sunucuda çift kayıt bu turda üretilmedi.

Öneri: başarısız gönderimleri mesaj bazında korumak ve tekrar eylemini metin benzerliğine değil tam gönderim kimliğine bağlamak. Kullanıcının yeni draft'ını ezmemek.

### F08 — Cihaz saati ileri olduğunda oda girişindeki canlı balonlar elenebiliyor

`inRoomChatThread.ts:58-69` canlı olayın sunucu tarihini oda girişinde cihazdan alınan zamana karşı 250 ms toleransla kontrol ediyor. `useInRoomChat.ts:306-313` gösterim kararı öncesinde mesajı seen olarak da işaretliyor.

Saf fonksiyon denemesi: cihazın giriş saati sunucunun yeni mesaj zamanından iki saniye ilerideyse canlı mesaj balonu reddediliyor. Bu, ilk saniyelerin sunucu saati giriş eşiğine yetişene kadar etkilenebileceğini gösterir; her mesajın kalıcı olarak kaybolduğu anlamına gelmez. Sonradan replay de seen kaydı nedeniyle bu mesajı atlayabilir.

Öncelik: orta. Öneri: canlı mesajları cihaz/sunucu saat karşılaştırmasıyla eski saymamak; giriş geçmişi ile canlı akışı ayrı işlemek, tekrar kontrolünü mesaj kimliği ve oturum sınırıyla yapmak.

## Native ölçümle açık kalan noktalar

- `roomSpeechBubbleMotion.ts:38-42` eski balonları `originX/originY` üzerinden layout transition ile hareket ettiriyor. UI tarafında çalışması layout maliyetini yok etmez. FPS payı Open; önce F01-F05 giderilmeli, sonra layout yaklaşımı transform/opacity ile A/B ölçülmeli.
- Balon gölgeleri ve metin katmanları UI/GPU maliyetine katkı yapabilir. JS FPS düşüşünün doğrudan nedeni olarak doğrulanmadı; profilde ayrı ölçülmeli.
- Yakın duran iki kişinin iki/üç uzun balonunun çakışmaması, ekran kenarlarında ve büyük yazıda sığması native olarak doğrulanmalı. Mevcut yükseltme sabit; çakışma kararı canlı shared konum yerine avatarın React konumundan hesaplanıyor. Bu turda görünür kusur kabulü yapılmadı.
- Reconnect birden çok mesaj getirirse `MiniRoomScene.tsx:223-229` her mesajı tek tek ekleyip tüketiyor. Her `consume` diziyi yeniden filtreliyor; uzun toplu replay'de gereksiz iş oluşabilir. Normal üç mesajlık düşüşün ana nedeni olarak ölçülmedi. Toplu işleme, her mesajın kendi ömrünü ve sırasını korumalı.

## Korunması gereken çalışan parçalar

- Balon ömrü kişi ve mesaj bazında; oda başına tek expiry timer var. Ayrı konuşma hareketi timer'ları unmount'ta temizleniyor.
- Görünür geçmiş 15 satırla sınırlı; ortak durable geçmiş silinmiyor.
- İlgisiz sohbet güncellemeleri thread snapshot sınırından geçip MiniRoom'u gereksiz invalidate etmiyor.
- Typing sinyali her harfte gönderilmiyor; en fazla üç saniyede bir yenileniyor ve gönderimde/blur/background durumlarında duruyor.
- Sunucu aynı tekrar kimliğiyle gönderimi dedup ediyor; hızlı gönderimlerin sırasını koruyor. Push gecikmesi gönderim onayını bekletmiyor.

## Çalıştırılan doğrulamalar

- Mobil: 17 test dosyasında 104 test geçti; sıfır başarısız, sıfır atlanan test. Mesajlaşma, geçmiş, gönderim, giriş/reconnect, balon ömrü, composer, klavye, camera, typing ve scene lifecycle kapsandı.
- Sunucu: `chatMessageDeliveryService.test.ts` ve `realtimeServer.transport.test.ts` içinde 27 test geçti; sıfır başarısız, sıfır atlanan test. In-memory servisler ve yerel socket harness'ı; canlı veri tabanına yazılmadı.
- Ek denemeler mevcut üretim fonksiyonlarını/hook'larını test fixture'larıyla çalıştırdı; repository'ye yeni regression testi eklenmedi. F06-F08 ve F07'nin çoklu hata yolu mevcut yeşil testlerde eksik.
- Gerçek native JS/UI FPS, render süreleri, dropped frame, bellek ve fiziksel cihaz ölçümü: Open. Node test süreleri mobil performans kanıtı değildir.

## Uygulama sırası ve kabul

1. F06-F08 için davranış regression testleri ve dar düzeltmeler.
2. F01-F05 için yazma, balon ve geçmiş güncelleme sınırları; sabit nesneler/callback'ler/sunum anahtarları.
3. Aynı native senaryoda önce/sonra profil: bir mesaj, tek kişinin üç hızlı mesajı, iki kişinin üçer mesajı; klavye açık/kapalı, yeni/15 satırlık geçmiş, uzun metin, büyük yazı ve Reduce Motion.
4. Sonuç gerekliyse balon layout hareketini transform ile değiştirmek; görünümü native olarak karşılaştırmak. Yeni bağımlılık ya da renderer değişimi için şu an ölçüm gerekçesi yok.
5. Bağlantı kopması, geç onay, çoklu hata, yeniden gönderim, geçmiş isteği başarısızlığı ve saat farkı senaryolarında mesaj kaydı/sıra/tekrar korumasını doğrulamak.

Durum: araştırma ve yerel doğrulamalar tamamlandı. Düzeltmeler Implemented değil; Native verified ve Production ready Open. Yalnızca bu araştırma raporu oluşturuldu; commit/push/deploy yapılmadı.

## Resmî kaynaklar

Uygulama başladıktan sonraki düzeltme ve doğrulama durumları ayrı raporda tutulur: [MiniRoom uygulama ve kanıt](./MINIROOM_CHAT_PERFORMANCE_IMPLEMENTATION_2026-10-03.md). Yukarıdaki sonuçlar ilk taramanın tarihsel snapshot'ıdır; native performans PASS anlamına gelmez.

- React memo: https://react.dev/reference/react/memo — nesne/callback kimliği, local state ve render sınırları.
- Reanimated performansı: https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/ — transform/opacity tercihi ve native layout yükü.
- React Native DevTools: https://reactnative.dev/docs/0.86/react-native-devtools — React ve JS performansının ölçülmesi.
