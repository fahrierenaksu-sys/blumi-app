# MiniRoom mesajlaşma düzeltmeleri — uygulama ve kanıt

Tarih: 2026-10-03. Checkout: `/Users/evrenevren/blumison`.

Bu rapor önceki `MINIROOM_CHAT_PERFORMANCE_AUDIT_2026-10-03.md` taramasının uygulama takibidir. Kullanıcı yönetici ajan ve ayrı uygulama/doğrulama ajanları istedi. Yönetici yalnızca orkestrasyon yaptı; sahne/composer, balon/store, geçmiş, mesaj yaşam döngüsü, bağımsız entegrasyon incelemesi ve native QA ayrı ajanlara ayrıldı. Önceden mevcut Shop, Wardrobe, Discovery, Inbox ve RoomEditor değişiklikleri korunuyor; bu çalışmanın kanıtı sayılmaz.

## Davranış sözleşmesi

- Aynı kişinin en fazla üç balonu eski → yeni sırasıyla çizilir; yenisi alttadır.
- Gösterilen her balonun kendi dört saniyelik süresi vardır. Sonraki mesaj eskisinin süresini uzatmaz; dördüncü mesaj yalnız aynı kişinin en eski balonunu erkenden düşürür.
- İki kişinin balonları birbirini silmez; aynı metnin ayrı gönderimleri ayrı mesajlardır. Tek balona basmak yalnız onu kapatır.
- Balon hareketi, boyutu, gölgesi, metin çizimi ve Reduce Motion yolu değiştirilmedi. Mevcut layout hareketinin maliyeti ayrı native ölçüm gerektirir.
- Durable mesaj kaydı ve sunucu otoritesi korunur. ACK kimliği yalnız uzlaştırma metadatasıdır; kalıcı mesaj nesnesine eklenmez.
- Başarısız gönderim aynı metinle tekrar denenirken kesin gönderim kimliği taşınır. Geç ACK sonrası eski retry kimliğiyle ikinci kayıt oluşturulmaz. Kullanıcı metni düzenlerse yeni gönderimdir.

## Bulguların kapanış kanıtı

| Bulgu | Uygulama | Davranış kanıtı | Native/performance durumu |
|---|---|---|---|
| F01 — her harfte sahne işi | Draft composer içinde; sahneye yalnız içerik yüksekliği/satır değişimi çıkar. Sabit panel/sahne sınırları. | Local draft ve gerçek submit testleri; değişmeyen panel props kontrolü. | Native öncesi/sonrası ölçüm bekleniyor. |
| F02 — geçmiş nesne/callback yenileme | Önceki görünür satırları seçicide yeniden kullan; ölçüm callback'leri committed ref üzerinden güncel satırları okur. | Yeni satır/teslim değişimi, önceki satırların kimliği, stable ölçüm callback'i ve geç ölçüm testleri. | FPS kazanımı test süresinden çıkarılmaz. |
| F03 — gizli geçmişin çalışması | Mounted transcript son görünür snapshot'ı tutar; durable store ve son mesaj şeridi güncellenir. Klavye kapanış render'ı doğrudan en yeni snapshot'ı alır. | Saklama/açılma testi ve satır ölçüm kimliği testi. | Native klavye geçişi/scroll/a11y matrisi bekleniyor. |
| F04 — balonun başka kişiye/figüre yayılması | Değişmeyen konuşmacı dizileri ve balon nesneleri korunur; body/depth/furniture memo sınırı. Zaten speaking durumunda nesne değişmez; timer yenilenir. | Konuşmacı grubu kimliği, body/overlay props, timer cleanup, yürüyüş/oturma önceliği ve ayrı expiry testleri. | Render sınırları FPS ölçümü değildir. |
| F05 — ACK satırını yeniden kurması | MiniRoom mevcut ortak sabit render anahtarını kullanır. Global ACK client kimliği store'a kalıcı nesneden ayrı taşınır; aynı metinli hızlı gönderimler kesin eşleşir. | RED→GREEN identical-send ACK regression; unknown ACK fail-closed, duplicate ACK ve önceden görünür canonical key testleri. Üretim hook'u, gerçek store ve global handler sırayla çalıştırılan regression PASS. | Native ACK görünümü/scroll kontrolü Open. |
| F06 — geçmiş hatası canlı balonu kilitlemesi | Başarısız giriş buffer'ı bir kez boşaltır; canlı akış açılır. İlk sonraki başarılı sayfa eski balonları diriltmeden server cutoff kurar. | Failed entry, buffered/live mesajlar, late ready ve sonraki reconnect testi. | Gerçek bağlantı/HTTP hatası native akışı Open. |
| F07 — çoklu failure retry kimliği | Mesaj bazlı failed map; immutable failure occurrence, composer recovery identity ve explicit retry. | Çoklu hata, ayrı aynı-metne kimlik, eski/edited retry red, late ACK, hata occurrence kimliği. | Native bağlantı kopması/tekrar deneyimi Open. |
| F08 — cihaz saati yeni balonu elemesi | Socket canlı olayını cihaz entry saatiyle reddetmez; geçmiş/reconnect eşiği canonical sunucu zamanıdır. | Saat farkı, buffered live exclusion, seen ledger ve reconnect cutoff testleri. | İki gerçek cihaz/saat farkı Open. |

Toplu reconnect mesajı sahne store'una tek `sayPhrases` çağrısı ve hook'ta tek `consumeMany` ile geçer. Her mesaj sıra/kimlik/expiry sözleşmesini korur; toplu ekleme sonucu en fazla üçer balon görünür. UI thread animasyonları üzerinde JS frame döngüsü eklenmedi.

## Bağımsız incelemede çözülen ek kenarlar

1. İki aynı metinli pending mesajda global event reducer ACK'i önce canonical ekliyordu; room hook kesin ACK'i sonra bulduğunda yerel render anahtarı kayboluyordu. Başarısız regression testi bunu doğruladı. ACK client kimliği global handler üzerinden metadata olarak store'a taşındı; insert öncesi kesin eşleşme yapılıyor. Önceden görünmüş canonical satırın kendi anahtarı korunur.
2. Bilinmeyen ACK kimliği, aynı metinli başka pending satırı otomatik onaylayamaz. Canonical mesaj kayda alınır; diğer gönderim pending kalır.
3. Failure listesi yayımlanırken her kayıt nesnesini yeniden oluşturmak composer'ın failure occurrence takibini bozuyordu. Mesaj ajanı aynı occurrence nesnesini korudu; sahne ajanı her occurrence'ı bir kez sunar. Düzenlenmiş recovery yeni gönderimdir ve eski failure beklenmedik şekilde geri konmaz.
4. Failed entry sonrası late history success, bir sonraki reconnect'te eski geçmiş balonlarını yeniden oynatmamalı. Server cutoff/seen ledger kurulumu replay guard'dan önceye alındı ve regression eklendi.
5. Aynı MiniRoom ekranı yeni conversation parametresiyle tekrar kullanılabiliyor. Başarısız gönderim state'i artık thread etiketi taşır; render'da yalnız mevcut konuşmanın occurrence'ları seçilir. Eski konuşmanın kesin client/thread/body/sender eşleşen geç ACK'i eski failure'ı temizler; yeni konuşmaya draft/balon taşımaz. Yanlış body taşıyan ACK timer'ı iptal edemez veya failure'ı silemez. Her iki hata RED→GREEN regression ile doğrulandı.
6. Hook state'i filtrelense bile composer içinde geri konmuş draft ve retry kimliği eski sahnede kalabiliyordu. Gerçek Screen/Composer testinde yeni odaya eski draft taşınması önce FAIL oldu. Scene yaşam döngüsü artık authoritative account/room/source-thread sınırına bağlıdır: yeni oda veya conversation sahneyi yeniler; aynı oda reconnect'inde draft korunur. Kesin retry kimliği başka odaya taşınmaz. Bu key yalnız React içindedir; log/analitik çıktısına eklenmedi.

## Dosya sınırı ve geri alma

Üretim değişiklikleri yalnız MiniRoom mesaj/sahne/geçmiş sınırları, `MiniRoomScreen.tsx`, `chatStore.ts` ve `globalRealtimeEventHandler.ts` içindedir. Ek geliştirme QA kontrolleri `MiniRoomRigPreviewScreen.tsx` mevcut development route içindedir; prod route kayıt şartı aynı kalır. Yeni testler mevcut `run-match-room-tests.mjs` lifecycle grubuna kaydedildi; `apps/mobile/package.json`, bağımlılıklar, runtime art dosyaları ve yayın makbuzları değişmedi.

Geri alma dar dosya/hunk sınırıyla yapılabilir; daha önce mevcut dirty değişiklikler topluca restore edilmez. Commit, push, deploy, database yazısı veya asset promotion yapılmadı.

## Kontroller ve durum

Bağımsız shared store/global handler focused suite: **72/72 PASS**, sıfır başarısız/atlanan test. Identical-send regression önce **FAIL**, kesin ACK metadata düzeltmesi sonrası **PASS**.

| Çalıştırılan kontrol | Gerçek sonuç |
|---|---|
| `npm --workspace @blumi/mobile run test:match-room` | Model grubu 297/297; QA routing 3/3; lifecycle/iki telefon memory harness grubu 129/129 PASS. Sıfır atlanan. Sonradan eklenen gerçek ACK sıra testi bu çalıştırmanın sayısına eklenmedi. |
| `npm --workspace @blumi/mobile run test:realtime` | Compile grubu 104/104; history hook/model 13/13 PASS. Sıfır atlanan. |
| İlk tam `test:chat` | Compile grubu 331/331 PASS; lifecycle 121/124 PASS. Üç chat-opening testi yeni ACK fallback'in legacy untracked pending satırını uzlaştıramadığını yakaladı. |
| Legacy ACK düzeltmesi sonrası store/adversarial/global handler + `useChatThreadOpening.test.ts` | 93/93 PASS. Yukarıdaki üç başarısız regression aynen korundu ve PASS oldu. Tam chat runner tekrar çalıştırıldığı iddia edilmez. |
| Store/adversarial/global handler + `useInRoomChat.reconnect.test.ts` | 95/95 PASS; gerçek global reducer → store → production hook ACK sırası dahil. Sıfır atlanan. Bu çalışma son thread-scope takip düzeltmesinden önceydi. |
| Son message-flow scope/entry/composer suite | 39/39 PASS; thread değişimi, eski thread kesin ACK, malformed body ACK, failure occurrence ve gerçek reducer/store/hook sırası dahil. Sıfır atlanan. Son kaynak hash'ine bağlı bağımsız tekrar kontrolü. |
| Son `MiniRoomScreen.presentationScope.test.ts` | RED→GREEN 1/1 PASS; gerçek Screen'den canonical scene key, gerçek composer draft/retry reset, aynı oda reconnect koruma ve source-thread değişimi. Mevcut match-room lifecycle grubuna kaydedildi; tam runner tekrar çalıştırılmış sayılmaz. |
| Son tam mobile typecheck | Son thread-scope guard, Screen lifecycle key ve yeni regression dosyaları dahil `tsc --noEmit`: exit 0 PASS. Native ölçüm beklerken tek serialized final job çalıştırıldı; ardından CPU işleri durdu. İlk typecheck preview `delivery` literal tipi hatasını yakalamıştı; owner ajan düzeltti. |
| Tam mobile lint | exit 0; 0 error, 2 mevcut duplicate-import warning (`miniRoomSceneStore.ts:23,29`). |
| Son shared ACK source/test scoped lint | exit 0; 0 error, 0 warning. |
| Son message-flow scoped lint | Hook/model/test dosyaları; exit 0, 0 error, 0 warning. |
| `test:theme` | 25/25 PASS; import boundary, engineering/motion ve worklet closure guards. |
| `test:release-config` | 30/30 PASS; development entry/release configuration guard dahil. |
| `test:shop-preview-assets` | Asset/catalog/hash grubu 85/85 + ShopScreen guard 2/2 PASS; yayın makbuzları/runtime bytes değişmedi. |
| Son `git diff --check` | PASS; source freeze sonrası tekrar kontrol edilir. |

Bu gruplar birbirleriyle örtüşür. Sayılar tek bir eşsiz test toplamı olarak toplanmaz. Test süreleri, memo prop kimlikleri veya Node benchmark'ları native FPS kazanımı sayılmaz. Yerel memory/socket harness canlı kullanıcı verisine veya gerçek database'e yazmadı.

Legacy uyumluluk düzeltmesi kesin ACK metadata varsa yalnız eşleşen tracked client kimliğini uzlaştırır. Önceden var olan ve delivery tracking'e katılmamış tek optimistic satırın benzersiz metin eşleşmesi korunur; bilinmeyen ACK kimliği tracked bir metin ikizini tüketemez.

**Implemented:** F01–F08 dar düzeltmeleri mevcut. **Tested:** yukarıdaki davranış/entegrasyon sonuçları PASS; ilk tam chat run içindeki regression'lar da dar tekrar kontrolde PASS. **Native verified:** Open. **User approved:** kullanıcı uygulama kapsamını onayladı; görsel/native sonuç onayı verilmedi. **Production ready:** Open. Henüz her performans sorununun native olarak kapandığı iddia edilmez.

## Native kanıt — sınırlı development preview

Kalıcı ayrıntılar: [native raporu](/Users/evrenevren/BlumiArtWorkbench/miniroom-chat-performance-2026-10-03/native-report.md), [ölçüm kaydı](/Users/evrenevren/BlumiArtWorkbench/miniroom-chat-performance-2026-10-03/native-metrics.json), [source lock](/Users/evrenevren/BlumiArtWorkbench/miniroom-chat-performance-2026-10-03/final-source-lock.json). Native ajan gerçek iOS Debug devclient içinde iPhone 17 / iOS 26.5 / 1206×2622 development MiniRoomRigPreview rotasını kullandı. Bu rota gerçek Scene, composer ve balon renderer'ını çalıştırır; canlı room/socket/ACK veya database akışı değildir.

| Aynı sentetik 3+3 burst fixture | React commits | Toplam actualDuration ms | En yüksek ms |
|---|---:|---:|---:|
| Önce, örnek 1 | 32 | 229.01 | 22.30 |
| Önce, örnek 2 | 34 | 204.37 | 19.66 |
| Sonra, örnek 1 | 15 | 88.04 | 11.21 |
| Sonra, örnek 2 | 15 | 81.60 | 16.79 |

Bu tablo **FPS ölçümü değildir**. Önce/sonra host yükü eşit değildi; Profiler tüm Scene ve QA parent işlerini kapsadı; warmup geçmişi ve summary kontrolleri de maliyete dahildir. Bu yüzden yüzdelik hızlanma, UI FPS, JS FPS veya frame-drop iyileşmesi çıkarılmadı. Kullanıcının izin verdiği sonraki sakin baseline tekrarı tamamlandı: **31 commit / 348.67 ms toplam / 39.18 ms en yüksek**, host load **5.40/5.60/11.15**. Klavye kapalı ve geçmiş nüfusu farklıydı; after örneklerindeki açık klavye koşuluyla eşleşmedi. Bu tekrar ayrı keşif gözlemidir ve tablodaki karşılaştırmayı kontrollü hale getirmez. Yanlış panel hedefiyle alınan 4 commit/26.45 ms denemesi geçerli burst olmadığı için dışlandı.

Native preview'da üç sentetik mesaj gerçek composer'dan ayrı ayrı gönderildi: input temizlendi, klavye açık kaldı, kapanınca üçü geçmişte göründü. Aynı akışın dört saniyeden kısa gerçek-input burst ölçümü henüz yok. İki kişinin üçer balonu önce ve sonra canlı native CUA karelerinde görüldü; en yeni balon altta ve mevcut oda/balon stili korundu. Üstteki bir partner balonunu QA rozeti/devtools kapattığından engelsiz görsel kabul Open. Baseline video'su altı balon ve kaybolma halini destekliyor; kalıcı after video trigger penceresini kaçırdı, bu video tam after overlap/lifetime kanıtı sayılmıyor.

**Native verified:** yalnız yukarıda gerçekten gözlenen development preview durumları için sınırlı kanıt. Tam gerçek MiniRoom rotası, canlı gönderim/ACK/failure/reconnect, persistence, uzun/büyük metin, Reduce Motion, geçmiş scroll, engelsiz after overlap ve tam lifetime: **Open**. JS/UI FPS, dropped frames, CPU profile, release/physical-device performans ve native build optimizasyon bayrakları: **Open**. Hermes profiler desteği bounded denemede alınamadı; CPU profile uydurulmadı. Son Screen lifecycle key preview'da kullanılmadı; regression kanıtı vardır, native adapter akışı Open.

İzin verilen son native pencere tamamlandı; Simulator işlemleri durdu. Test dışı mevcut draft korunarak bırakıldı ve içeriği rapora/çıktıya alınmadı. Cihaz baseline sentetik preview'da, klavye kapalı. Workbench'e ait Metro 8084/8085 mevcut preview'ı kesmemek için açık bırakıldı; önceden mevcut 8081/8082 süreçlerine dokunulmadı. Reproducible kaynak kopyaları ve JSON kanıtlar Workbench'te duruyor. **Tüm performans problemlerinin native olarak kapandığı veya uygulamanın Production ready olduğu iddia edilmiyor.**

## Bağlı yeni görsel hata — klavyede avatar keskinliği

Önceki performans işi sonrasında kullanıcı ayrı bir renderer hatası bildirdi: klavye açıkken karakterler bulanık, klavye kapalıyken keskin; oda/furniture keskin kalıyor. Kullanıcının `IMG_2217.PNG` ve `IMG_2218.PNG` referansları yeni scope'un başlangıcıdır. Bu bulgu önceki F01–F08 kapanışını veya önceki native FPS Open durumunu değiştirmez. Şu an **Open**; renderer ajanı source fix/behavior test, bağımsız entegrasyon ajanı root-cause/memory/compatibility incelemesi, native ajanı exact open/closed görüntü doğrulaması yapar.

Kurulu Expo Image source'u `allowDownscaling` varsayılanının true olduğunu ve iOS `ImageView.swift` içinde UIImage'ın layout view boyutuna küçültüldüğünü doğrular. Room avatar image layout'u 74×108; klavye camera scale, depth scale ve breathe/rotation üst katmanlarda transform ile uygulanır. İlk açıklama küçük layout boyutuna indirilen bitmap'in parent transform'da tekrar örneklenmesidir. Ancak açık-klavye camera çoğu boyutta küçülür; tek başına büyütme açıklaması kesin değildir. Atlas `contentFit="fill"` kolu aynı downscale yolundan muaftır. [Expo Image resmî prop belgesi](https://docs.expo.dev/versions/latest/sdk/image/#allowdownscaling) bu davranışı ve kapatmanın performance trade-off'unu açıklar. Bu kaynak-temelli aday açıklamadır; native önce/sonra doğrulaması gelmeden kesin root cause veya görsel PASS denmez.

Canonical asset bytes, character görünüşü/proporsiyon, fit profile, semantic ID, katman sırası, frame/stride clock ve room camera geometrisi korunur. `shouldRasterizeIOS` eklemek, büyütülecek avatarı eski çözünürlükte texture'a bağlayabilir ve animated frame değişiminde reraster maliyeti yaratabilir; bu props uygulanmadı. Mevcut source'da avatar renderer'da explicit iOS rasterization yok. Native boyuta indirgemeyi kaldırmak daha yüksek decoded-memory maliyeti doğurabilir; exact asset dimension/memory kanıtı ve önceki FPS iyileştirmelerini koruma gate'i ayrı açık tutulur.

Dar candidate uygulandı: ortak `RoomAvatarRenderer2D` optional `allowDownscaling` alır, varsayılan **true** kalır; MiniRoom `AvatarFigure` yalnız kendi body renderer'ına **false** verir. Prop image'a taşınır ve layer memo karşılaştırması kalite değişimini geçirir. Shop/Wardrobe/MyRoom çağrıları önceki default politikayı kullanır. Kaynak/fit/transition/retained frame/atlas crop davranışları değiştirilmedi; image layout veya yeni JS frame döngüsü eklenmedi. Atlas fill zaten downscale muaf olduğundan yeni memory maliyeti bu atlas yolundan çıkarılmaz.

Gerçek mounted renderer davranış testi **3/3 PASS**; renderer/layer model/speech boundary bağımsız suite **18/18 PASS**; son tam mobil typecheck **PASS**, dar renderer lint **0 error/0 warning**, diff check **PASS**. Yeni renderer testleri mevcut avatar runner TSX grubuna kaydedildi; başka Wardrobe ajanının önceki test kaydı korundu. Aday doğrudan native keskinlik A/B kabulüne bağlıdır: props testinin geçmesi bulanıklığın giderildiğini kanıtlamaz.

Worker boyut sayımı: default iki avatarın 16 unique 256×384 RGBA PNG'si için teorik tam backing **6 MiB**, yaklaşık küçük layout backing **4.27 MiB**, fark **+1.73 MiB**. Room corpus'ta 1131 standalone PNG 256×384; 14 atlasın en büyüğü 1024×808. Bu sayım native process memory ölçümü değildir; visited-frame pool/cache davranışı aynı kaldı. Gerçek custom loadout memory, texture upload ve FPS maliyeti **Open**.

Roller/skills: renderer worker implementasyonu; entegrasyon ajanı bağımsız source/API/memo/invariant incelemesi; native ajanı exact device visual evidence; root conductor final görsel kabul. `ai-game-art-pipeline` runtime QA kaynağı okundu. Current checkout'ta repository `blumi-character-asset-production/SKILL.md` bulunamadı; yüklenmiş gibi gösterilmedi. Image generation, artbytes veya publication receipt değişimi yapılmadı. Seçilen yöntem mevcut canonical pixels'i koruyan decode-policy düzeltmesidir; candidate asset üretilmedi.

**Implemented/Tested:** bu dar candidate. **Internal review:** native görüntü gelene kadar Open. **Native verified:** Open. **User approved:** exact sonuç Open. **Production ready:** Open. Kalan kanıt: aynı karakter/frame open/closed native full-screen+yakın crop; konuşma/yürüme/oturma ve Reduce Motion uyumu; decoded texture maliyeti. Runtime art veya publication receipt değişimi planlanmıyor.

## Dondurulmuş kaynak dosyaları

SHA-256 manifesti: ilk performans kapanışındaki 19 source/runner dosyasına yeni shared renderer ve avatar runner eklenerek **21** kayıt oldu. QA preview kaydı ayrıca işaretlidir; hash tek başına native doğrulama kanıtı değildir. Match-room runner iki önceden mevcut RoomEditor test kaydını, avatar runner önceki Wardrobe kaydını korur. Runtime art, canonical base veya asset promotion bu işin kapsamı değildir; asset hash/approval iddiası yapılmaz.

| Dosya | SHA-256 |
|---|---|
| `apps/mobile/src/features/chat/chatStore.ts` | `8dede2b640cdbb06859208ec5eb0fe28afe5cf713301d21ae3dee26ae70ef20f` |
| `apps/mobile/src/features/realtime/globalRealtimeEventHandler.ts` | `04ca0ef161ffabc200b0545d81d3f10d2eb0f9e49a87051a8799be33422ea923` |
| `apps/mobile/src/features/miniRoom/useInRoomChat.ts` | `39319d56f2f4643a5906a80dc2fb3b527a39357d5efe00c83a5cf4e36af3173a` |
| `apps/mobile/src/features/miniRoom/inRoomChatThread.ts` | `11ca6ac5fc2ae7d8e2bcb585a954c9ff2923a8032b041fdfb9c5e0c5b4210260` |
| `apps/mobile/src/features/miniRoom/roomEntryReplayGate.ts` | `edcb9d8bd2a135eb59fcc4e3edb1bf4bec5980b5e299709f125e12abcbfa2d3f` |
| `apps/mobile/src/features/miniRoom/roomChatHistoryModel.ts` | `ecc291399d5b05c924039938c7e59868a5c031a3aba97f08c30ce1702b24856d` |
| `apps/mobile/src/features/miniRoom/useRoomChatHistory.ts` | `c03ebd62826e719a8a21d81df2c8d854e02b4096a44c13914e55446cdb87a95a` |
| `apps/mobile/src/features/miniRoom/scene/MiniRoomScene.tsx` | `1ef9e32e54c29c072bbcc04e21ae87033c90f4b04c1df0fe5ddd2da39eb93f38` |
| `apps/mobile/src/features/miniRoom/scene/RoomChatComposer.tsx` | `35e4cf5d476cbab83f98f03ee1c3ff81ad0ff350ca2890b1e49d134cb772540b` |
| `apps/mobile/src/features/miniRoom/scene/MiniRoomChatPanel.tsx` | `69fc9f8c4cbc22ca8b58b948af997983fb9b3fcdf2784ca0748d2d970621426d` |
| `apps/mobile/src/features/miniRoom/scene/MiniRoomChatHistory.tsx` | `43624d313e8bca161260eae6ef8423121372e2f049c0c3fcb83b6c46ffb1a669` |
| `apps/mobile/src/features/miniRoom/scene/useRetainedMiniRoomTranscript.ts` | `bbfe737a470dfbcf11161bc1ed683cd49456ef54c96b5210a645ab07017e8618` |
| `apps/mobile/src/features/miniRoom/scene/AvatarLayer.tsx` | `820c9714be8fb88d4b4aaaa501e9bcb674f28250f55ba09e660b192302aafeba` |
| `apps/mobile/src/features/miniRoom/scene/miniRoomSceneStore.ts` | `61cb848e12b14629e2e329109ccbc5f0438df3d4e75e659dececf356bcc91a84` |
| `apps/mobile/src/features/miniRoom/scene/miniRoomSceneTypes.ts` | `5f872778e10f457e8a7e31bc8f3b5dc8abefe155548834fa68a15c834c38eb49` |
| `apps/mobile/src/features/miniRoom/scene/miniRoomSpeechStack.ts` | `ca4b1a5b959aa29730802f291815c44f090fa7ef7e28845d0f945796551ec262` |
| `apps/mobile/src/screens/MiniRoomScreen.tsx` | `9f93b2514f8317ce269882b85e24dab2395850ab54840379ae63ea8fb11379a3` |
| `apps/mobile/src/screens/MiniRoomRigPreviewScreen.tsx` | `29ef62b58c4c1cd0579823eb24a543d24f25d1211f86ecea3a7ceb9f9f1a5f47` |
| `apps/mobile/scripts/run-match-room-tests.mjs` | `509cacdc5402e81a6135d30e7e8cd92329db22367341a0a982ea894f4d527151` |
| `apps/mobile/src/features/avatarV2/room/components/RoomAvatarRenderer2D.tsx` | `7e26aedd2ed9d19f88df02130eea12fbc4b69a273bf1df3a9491b27176b0c3a4` |
| `apps/mobile/scripts/run-avatar-v2-tests.mjs` | `45d490d199839f6914526a1d2218b8ad6d789302545066060cff20c57b444837` |
