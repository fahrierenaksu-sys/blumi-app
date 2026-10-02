# Asset Fit Audit — Avatar V2 runtime cosmetics (2026-10-01)

Historical record — not an instruction; see AGENTS.md.

Status: **AUDIT / OPEN**. This is evidence for the owner, not approval. A code
test or a composite cannot approve visual quality; native Simulator evidence
is not part of this audit.
Base commit: `772846a` (`integration/interaction-wave`). No art, fit data or
resolver code was changed.

---

## Özet (Türkçe, sahip için)

**Soru: "Asset'lerim karaktere tam oturuyor mu?"**

**Kısa cevap: Çoğunlukla evet, ama "kusursuz" değil.** Bütün katmanlar aynı
256x384 tuvalde, aynı merkez çizgisi ve ayak tabanıyla çiziliyor; uygulama
hiçbir katmana ofset/ölçek uygulamıyor (`RoomAvatarRenderer2D.tsx:203-213`).
Bu yüzden *kayma / yanlış hizalama* sorunu yok denecek kadar az: kafa–boyun
bağlantısı her yürüme karesinde en fazla 1–2 px oynuyor. Görünür sorunlar
hizalamadan değil; **katman sırası (z-order)**, **kesik/sert alfa kenarları**,
**yürüme karelerindeki ince yatay boşluk çizgileri** ve **varsayılan şortun
oturma pozunda başka bir ürüne dönüşmesi** kaynaklı.

| Slot | Tam oturuyor mu? | Not |
|---|---|---|
| Saç (kadın, 13) | **Evet, küçük rötuşla** | Yürüme kareleri kafayla birlikte hareket ediyor (0 px kayma). Bazı saç kenarlarında açık renkli hale (beyaz kontur), Pale Golden Bow Bob ve Copper Bow Waves'te 8–9 başıboş piksel. |
| Saç (erkek, 8) | **Evet (statik)** | Yürürken ve otururken tek görsel kullanılıyor; gövde kafası hareket etmediği için şimdilik hizalı (≤1 px). Ama saç "canlı" değil. |
| Üst (kadın 15 / erkek 17) | **Evet, birkaç not** | Bel boşluğu yok (idle/walk). Moonlit Velvet Ballet Dress koyu zeminde belirgin beyaz hale. Erkek tişörtlerde boyunda gri "dikiş" lekeleri ve omuzda açık hale. |
| Alt (kadın 10 / erkek 15) | **Kısmen** | Erkek şortlarında ve bol kot/kargo pantolonlarda yürüme karelerinde bacak üzerinde **ince yatay beyaz çizgi** (kesik). Parachute Cargo ve Colorblock Track Pants'ta çok sert (tırtıklı) alfa kenarı. **Varsayılan kadın "Denim Skort Shorts" ayakta uzun kot pantolon gibi, otururken etek gibi görünüyor (ürün kimliği kayıyor).** |
| Ayakkabı (kadın 10 / erkek 8) | **Evet, kenar kalitesi zayıf** | Ölçek doğru (ayak genişliğinin 1.05–1.25 katı), yere basıyor. Kadın Milk Tea / Cherry Ballets / Onyx Mary Janes yürüme karelerinde sert, kutu şeklinde kırpılmış kenarlar. Erkek oturma pozunda paça–ayakkabı sınırı merdiven gibi tırtıklı. |
| Aksesuar (kadın 12 / erkek 5) | **Bir kritik hata dışında evet** | **Erkek Soft Patch Beanie, saçın ALTINDA çiziliyor** — bere başa değil, alnın üstünde bir şerit gibi görünüyor (P0). Diğer gözlük/kolye/çanta hizalı. |

**En önemli 5 sorun**
1. **P0 — Erkek bere saçın altında** (`avatar_v2_accessory_male_soft_patch_beanie`, yayında). Katman sırası `hairFront - 1`.
2. **P1 — Varsayılan kadın alt** idle/walk'ta uzun kot, sitting'de etek: aynı ID iki farklı ürün gibi okunuyor.
3. **P1 — Erkek şort ve bol pantolonların yürüme karelerinde** yatay açık çizgiler (sage cuffed, relaxed tailored, technical sport, washed baggy denim).
4. **P1 — Sert/tırtıklı alfa kenarları**: parachute cargo, colorblock track pants, coral wave pants, kadın sneaker/ballet/mary jane yürüme kareleri, erkek oturma paçaları.
5. **P2 — Depoda kullanılmayan dosyalar**: 14 yetim PNG + hiçbir ekranın çizmediği 97 adet 512x768 profil katmanı (3,7 MB, uygulama paketine giriyor).

**Ne yapmalı**
- Bereyi **sadece veriyle** düzelt: `accessoryLayerParts` occlusion slotunu `front` yap (ya da baş üstü ön/arka parça ayır). Çizim gerekmez; Simulator'da 8 erkek saçla doğrula.
- Varsayılan alt, şort çizgileri ve sert kenarlar için **Workbench'te yeniden export** (anti-aliased alfa, kesik çizgi onarımı) — yeni çizim değil, lokal rötuş.
- Denim skort için ürün kararı ver: ya oturma karesini şort olarak yeniden çiz, ya ayakta kareleri skort silüetine getir (**yeniden çizim**).
- Aşağıdaki otomatik korumaları (çözünürlük bütünlüğü, tuval tutarlılığı, alfa kenar/hale, katman sırası) test olarak ekle.

**Sınırlar:** Workbench (`/Users/evrenevren/BlumiArtWorkbench/`) bu bulut
ortamında yok; kaynak master'lar, brief'ler ve önceki onay kanıtları
incelenemedi. Simulator/cihaz doğrulaması yapılmadı. Bu rapor görsel onay
değildir.

---

## 1. Scope and method

- **Runtime truth.** All user-facing avatar surfaces render the *room-scale*
  layered rig through one component, `RoomAvatarRenderer2D`
  (`apps/mobile/src/features/avatarV2/room/components/RoomAvatarRenderer2D.tsx`):
  Shop (`features/shop/ShopPreviewPanel.tsx:377`), Wardrobe and setup studio
  (`AvatarPreview2D.tsx:79` via `WardrobePreviewStage.tsx:87`,
  `AvatarSetupStudioStage.tsx:224`), My Room (`roomV2/components/RoomRenderer2D.tsx:640`),
  MiniRoom (`miniRoom/scene/AvatarLayer.tsx:443`), Discover/match card
  (`components/DiscoverCard.tsx:266`, `ui/myAvatar.tsx:73`) and chat
  participants (`ui/participantAvatar.tsx:94`).
- **Compositing rule reproduced.** Each layer is an absolute-fill `expo-image`
  with `contentFit="contain"` in the same box, sorted by `layerOrder`
  (stable), and `ROOM_AVATAR_LAYER_FIT` is empty for both fit profiles
  (`RoomAvatarRenderer2D.tsx:203-213`), so there are **no per-layer anchors,
  offsets or scales** — fit is entirely baked into the 256x384 canvases
  (`room/avatarRoomAssets.ts:10-11`).
- **Real ID flow, not hand-written mappings.** A read-only esbuild bundle ran
  the actual `equipAvatarV2Item` → `resolveAvatarV2` →
  `projectAvatarV2ToRoomAvatarAppearance` → `getRoomAvatarRenderLayers` for
  every catalog cosmetic in idle, walking (4 frames) and sitting, with PNG
  `require`s mapped to file paths. Python/Pillow/numpy/scipy composited the
  resolved stacks and computed the metrics.
- 112 visible (non-retired, wardrobe-visible) cosmetics × 6 poses were
  rendered; 751 distinct runtime PNGs were measured.
- Scratch evidence (not committed): see §7.

## 2. Inventory

### 2.1 Files

| Directory (`apps/mobile/src/features/avatarV2/assets/`) | Count | Canvas | Bytes |
|---|---|---|---|
| `room/` (idle layers) | 211 | 256x384 | 2.69 MB |
| `room/motion/` (walk f01–f04, sit f01) | 920 | 256x384 | 11.28 MB |
| `layers/` (profile-scale AvatarV2 layers) | 97 | 512x768 | 3.71 MB |
| `shop-thumbnails/` | 93 | 220x220 (53), 224x224 (29), 512x768 (11) | 5.15 MB |

All 1,321 files are RGBA. Every room/motion layer is exactly 256x384, so
there is **no canvas or scale mismatch between items of the same slot**.
174 groups (393 files) are byte-identical duplicates — expected, because
rigid layers reuse one image for several motion keys.

### 2.2 Catalogs and ID flow

- Shop/Wardrobe catalog: `avatarV2Catalog.ts` (180 items, `AVATAR_V2_CATALOG`
  at :936). Room rig catalog: `room/avatarRoomCatalog.ts` (193 items after
  the quarantine filter at :1230-1271). Projection map:
  `room/avatarRoomProjection.ts:75-424` plus the generated female sweet
  capsule (:38-51) and male premium capsule (:53-71) maps. Paid publication:
  `packages/domain/src/release/blumiR1ReleaseCatalog.json` (89 receipts).
- **ID flow result:** all 143 visible cosmetics resolve to their own room
  layer(s) in idle, walking and sitting with `assetResolutionKind = "exact"`
  and no fallback. The 35 that do not add a layer are all retired
  (`packages/domain/src/avatar/retiredAvatarItems.ts`), hidden dress
  companions (resolved through the paired top), or the held/quarantined
  `avatar_v2_top_cherry_heart_milkmaid_blouse`. **No resolver entry points at
  a missing file** (0 unresolved `require`s).
- **Motion coverage:** every visible item has 4 walking frames + 1 sitting
  frame at 120 ms (`femaleWardrobePromotionContract.json`). 12 items
  satisfy walking by repeating one image (rigid reuse): 7 male hairs
  (`room/avatarRoomMotionAssets.ts:29-40` `fixedHeadMotion`, plus the male
  premium capsule), the male beanie, crossbody bag, beaded necklace and both
  sunglasses. The male face is also static. This passes today only because
  the male base keeps its neck at y=215 in every frame (cx drift ≤1 px).
- **Mirroring:** no `scaleX: -1` or mirrored avatar path exists; all states
  are front-only. Mirror safety is not exercised (no finding, no coverage).

### 2.3 Orphans and dead weight

- **14 orphan PNGs** (no `require` anywhere in `apps/mobile/src`), all
  superseded versions: 8 male `avatar_room_hair_front_male_*_v1.png`
  (runtime uses `*_v2.png` under the `_v1` key), and
  `avatar_room_top_female_cream_basic_tee_v2.png` + 5 motion frames
  (runtime uses `*_art_v17.png`). Metro does not bundle them, but they are
  production leftovers in the repo (storage-boundary rule).
- **97 profile layers (`assets/layers/`, 3.7 MB) are bundled but never
  rendered.** They are `require`d by `avatarV2Assets.ts` and referenced from
  `AVATAR_V2_CATALOG[*].assets.idle_front`, but the only consumer,
  `getAvatarV2RenderLayers` (`avatarV2Selectors.ts:139`), has no runtime
  caller. Release receipts still bind some of them (e.g.
  `layers/avatar_hair_golden_waves.png`), so removal needs a receipt update.
- Several catalog bottoms (`avatarV2Catalog.ts:808-931`) point
  `assets.idle_front` at a generic `bottom01`/`top01` placeholder; harmless
  today (unrendered) but misleading.
- Wardrobe thumbnails for the retired `avatar_v2_top_blush_lace_cardigan`
  and `avatar_v2_top_noir_rose_heart_cardigan` point at
  `avatar_v2_top_buttercream_bow_tee.png` (`wardrobe/wardrobePreviewSources.ts:129-138`):
  wrong-product art, unreachable while retired.
- Shop thumbnails use three canvases (220, 224, 512x768); 11 are 512x768.

## 3. Fit analysis (measured)

Metric definitions: *rel. jitter* = phase-correlation shift of the upper
rigid band of an item between walking frames minus the shift of its anchor
(face layer for hair/head items, base torso otherwise). *Waist gap* = base
pixels visible between top hem and bottom waistband in torso columns.
*Soft-edge ratio* = semi-transparent pixels / silhouette perimeter (median
1.21; below ~0.6 reads as aliased). *Light-halo fraction* = share of
low-alpha fringe pixels ≥0.18 brighter than adjacent opaque pixels.

| Check | Result |
|---|---|
| Canvas/scale consistency | 100% 256x384; identical scale on every surface. |
| Head–neck attachment | Female face bottom y 217–219 vs base neck y 215 in all frames; male 222 vs 215, cx drift ≤1 px. No floating heads. |
| Hair vs head jitter | 0 px for all 21 hairs (female hair frames move with the face; male hair and face are both static). |
| Garment jitter (tops) | ≤1 px vertical, ≤3 px horizontal for all tops. |
| Waist gap (idle) | 0–14 px for every top/bottom combination with default partners except designs with intentional cut lines (dresses' companion bottoms, peplum). |
| Shoe scale | Shoe width / foot width at idle: female 1.17–1.25, male 1.05–1.14. Shoe bottom 5–9 px below base sole (consistent grounding, no float). |
| Skin through garment holes | Only where the design has openings: cherry micro bag strap loop (376–614 px), buttercream scarf loop (107), halter wrap dress (222–246), ruched patchwork mini dress (246–293), sage ribbon knit jacket (151–156), ivory pearl slingback heels (51–119). Needs owner judgment on the jacket and ruched dress (see F-10). |
| Overhang | Large only for volume hair (up to ~5,100 px) and maxi/tiered dresses — intentional design volume, not a defect. |
| Stray pixels (≤8 px islands) | Ruched patchwork mini dress 13, copper bow waves front 9, pale golden bow bob front 8, halter wrap dress 8. |

Notable metric outliers that were confirmed visually (contact sheets):

- **Bottom `avatar_v2_bottom_male_creative_utility_bottom`**: rigid band
  jumps 11 px vertically in one walking frame relative to the torso.
- **Aliased edges**: `bottom_male_soft_parachute_cargo_pants` (0.25–0.43),
  `bottom_male_colorblock_nylon_track_pants` (0.26–0.39),
  `bottom_coral_wave_pants` walk frames (0.52–0.57), female
  `shoes_cherry_satin_ballets`, `shoes_onyx_heart_mary_janes`,
  `shoes_milk_tea_court_sneakers` walk frames (0.45–0.64).
- **Light halo**: `top_moonlit_velvet_ballet_dress` all frames (0.49–0.56,
  dark velvet with a white fringe — visible on dark MiniRoom floors),
  `top_embroidered_halter_wrap_dress` (0.33–0.41),
  `top_ruched_patchwork_mini_dress` (0.31–0.40),
  `bottom_male_creative_utility_bottom` sit (0.48).
  The "dark halo" metric mostly reflects the intentional outline style and is
  not reported as a defect.

## 4. Visual observations (contact sheets)

- `01_defaults_base_motion.png`, `02_defaults_zoom2x.png`,
  `02b_defaults_seams_4x.png`: female default **"Denim Skort Shorts"** reads
  as full-length denim pants to the shoe in idle and all walking frames, and
  as a short flared denim skirt in sitting. Male default: two grey dash
  marks on the neck just above the crew collar in every pose, white fringe
  on the tee shoulders, and a stair-stepped navy hem over the shoes in
  sitting and walk f2/f3 (with a few near-black pixels at the hem). Female
  hair has a thin white fringe where it meets the cheek.
- `03_accessory_m_1.png`: **the beanie sits under the quiff** — it reads as a
  knit band across the forehead under the hair, in every pose. Sunglasses,
  necklace and crossbody bag track the body correctly.
- `03_bottom_m_1.png` / `_2.png`: thin light horizontal slits across the legs
  in walking frames (and sitting for sage cuffed shorts) for
  `sage_cuffed_shorts`, `relaxed_tailored_shorts`, `technical_sport_shorts`,
  `washed_baggy_denim`; jagged hems on `navy_straight_pants` walking.
- `03_top_f_*.png`: all female tops and dresses sit correctly on shoulders
  and waist in idle/walk/sit; sitting shows the default bottom's skirt
  silhouette under tops (consequence of F-02).
- `03_hair_*`, `03_shoes_*`, `03_top_m_*`, `03_accessory_f_1`, `03_bottom_f_1`:
  no attachment breaks found at this scale; edge quality issues as listed.

## 5. Surfaces

All surfaces share one renderer and the same 256x384 canvas, so **no
surface renders a cosmetic with a different fit**. Differences are only
scale and framing:

| Surface | Code | Size / framing | Risk |
|---|---|---|---|
| Shop preview | `shop/shopLayoutMetrics.ts:111`, `ShopPreviewPanel.tsx:358-377` | ≤178 pt wide (test bound) → ~534 px @3x from a 256 px source (~2.1x upscale) | Soft/blurry at large phones; aliased edges become more visible when upscaled. |
| Wardrobe stage | `wardrobe/wardrobeStageLayout.ts:35-43`, `WardrobePreviewStage.tsx:83` | Height-driven, offset −0.28 h, `transformOrigin 50% 28%` zoom | Largest upscale; top/bottom of canvas may be cropped by the stage on short screens — verify in Simulator. |
| Setup studio / sign-in | `AvatarPreview2D.tsx:65`, default 220 pt | ~2.6x upscale @3x | Same as Wardrobe. |
| My Room / MiniRoom | `RoomRenderer2D.tsx:640`, `miniRoom/scene/AvatarLayer.tsx:443` | Small in-scene sizes; sitting uses dedicated sit frames (no runtime squash) | Light halos (moonlit dress) on dark floors; sit-pose identity of default bottom. |
| Discover / match / chat | `DiscoverCard.tsx:266`, `ui/myAvatar.tsx`, `ui/participantAvatar.tsx` | Small, idle | Low. |

The profile-scale 512x768 layers that could serve large surfaces exist but
are unused (§2.3). Native verification of cropping, back-wall transparency
and MiniRoom seat placement remains **OPEN**.

## 6. Findings and recommendations

Fix paths follow the skill: *data-only* (resolver/catalog, reversible),
*re-export* (Workbench bounded edit of the approved master: alpha edge,
seam, stray pixels), *re-draw* (new brief, new silhouette). Every art change
needs a frozen brief, internal review, owner approval and Simulator
verification before promotion.

| ID | Item | Slot | Surface | Severity | Evidence | Recommended fix |
|---|---|---|---|---|---|---|
| F-01 | `avatar_v2_accessory_male_soft_patch_beanie` (published) | accessory/headwear | all | **P0** | `03_accessory_m_1.png`; `avatarRoomCatalog.ts:143-154` puts the only part at `behindHairFront` (order 79 < hairFront 80, `avatarRoomSelectors.ts:252-258`) | Data-only first: change the part to `front`, or split into crown-front + back parts. If the knit then hides the fringe badly, re-export a hair-safe beanie in the Workbench. Verify with all 8 male hairs. |
| F-02 | `avatar_v2_bottom_default` → `room_avatar_bottom_female_denim_skort_shorts_v2` | bottom | all, esp. MiniRoom sit | **P1** | `02_defaults_zoom2x.png` (idle/walk long jeans vs sit skirt) | Product decision, then re-draw the inconsistent pose set (idle+walk or sit) against the canonical base. Affects every new female account. |
| F-03 | `bottom_male_sage_cuffed_shorts`, `relaxed_tailored_shorts`, `technical_sport_shorts`, `washed_baggy_denim` | bottom | Room/MiniRoom walk, sit | **P1** | `03_bottom_m_1/2.png` horizontal light slits | Re-export walking/sit frames with the leg splice closed (bounded local paint). |
| F-04 | `bottom_male_soft_parachute_cargo_pants`, `bottom_male_colorblock_nylon_track_pants`, `bottom_coral_wave_pants` | bottom | all, worst when upscaled | **P1** | soft-edge ratio 0.25–0.57 vs median 1.21 | Re-export with anti-aliased alpha from the master (no re-draw). |
| F-05 | `shoes_milk_tea_court_sneakers` (default), `shoes_cherry_satin_ballets`, `shoes_onyx_heart_mary_janes` | shoes | walk | **P1** | soft-edge 0.45–0.64; boxed/clipped shoe edges in `02b_defaults_seams_4x.png` | Re-export walk frames; check the right-shoe vertical clip in idle. |
| F-06 | `bottom_male_navy_straight_pants` (default) and male bottoms in sit | bottom/shoes seam | sit, walk | **P1** | `02b_defaults_seams_4x.png` stair-step hem, near-black pixels | Re-export hems with soft alpha; clean dark stray pixels. |
| F-07 | `bottom_male_creative_utility_bottom` | bottom | walk | P1 | 11 px vertical rigid-band jump; light halo 0.48 in sit | Re-export the outlier frame aligned to the base; fix fringe. |
| F-08 | `top_moonlit_velvet_ballet_dress` (published) | top/dress | MiniRoom dark floor, Shop dark | P1 | light-halo 0.49–0.56 all frames | Re-export with premultiplied/defringed edges. Also halter wrap and ruched patchwork dresses (0.31–0.41) as P2. |
| F-09 | Male face/top neck: `room_avatar_face_male_warm_friendly_v1` / male crew tees | neck | all | P2 | grey dash marks above collar, white tee shoulder fringe (`02b`) | Bounded local paint on the face neck stub; defringe tees. |
| F-10 | `top_sage_ribbon_knit_jacket`, `top_ruched_patchwork_mini_dress`, `top_embroidered_halter_wrap_dress` | top | all | P2 (owner judgment) | base skin visible inside the garment outline: 151–293 px | Confirm whether the openings are intended. If not, re-export with the inner layer closed. |
| F-11 | Stray pixels: `ruched_patchwork_mini_dress` (13), `hair_copper_bow_waves` front (9), `hair_pale_golden_bow_bob` front (8), `halter_wrap_dress` (8) | various | close-up | P2 | dust metric | Remove islands in re-export. |
| F-12 | 12 rigid-reuse items (7 male hairs, beanie, bag, necklace, 2 sunglasses) + male face | hair/accessory | walk | P2 | identical frames; passes only while the male neck stays fixed | Keep, but add the guard G-4. Dedicated head-bob frames belong to a future brief, not a fix. |
| F-13 | Room-scale source upscaled ~2.1–2.6x on Shop/Wardrobe | all | Shop, Wardrobe | P2 | layout math in §5 | Measure in Simulator; if soft, ship @2x room exports rather than reviving the unused profile layers. |
| F-14 | 14 orphan PNGs; 97 unused 512x768 profile layers (3.7 MB bundled) | n/a | bundle | P2 | §2.3 | Archive orphans to the Workbench and delete; drop `assets.idle_front` profile wiring and update receipts in one reviewed change. |
| F-15 | Retired cardigans' thumbnails → buttercream tee art; `bottom01`/`top01` placeholders | catalog | Wardrobe (unreachable) | P2 | `wardrobePreviewSources.ts:129-138`, `avatarV2Catalog.ts:808-931` | Remove dead mappings. |

### Recommended automated guards (specified, not implemented)

- **G-1 Resolver completeness:** for every visible, non-retired
  `AVATAR_V2_CATALOG` cosmetic, the equip → projection → render flow yields
  ≥1 layer owned by that item in idle, walking and sitting, all `exact`, with
  4 walking frames at the contract duration (extends
  `avatarRoomCatalogMotionCoverage.test.ts`).
- **G-2 Canvas consistency:** every file reachable from `ROOM_AVATAR_CATALOG`
  is 256x384 RGBA (PNG header read; no decoder needed).
- **G-3 Occlusion contract:** headwear accessories must have a part at or
  above `hairFront`; the test would have caught F-01.
- **G-4 Rigid-reuse anchor:** if a head layer reuses one image across walking
  frames, the base neck top row and centroid must be equal in all frames
  (±1 px).
- **G-5 Alpha quality (soft gate, report-only first):** soft-edge ratio ≥0.6
  and light-halo fraction ≤0.3 per runtime PNG, with an explicit allowlist
  that may only shrink.
- **G-6 Orphan check:** every PNG under `avatarV2/assets/` is `require`d by
  runtime code, and every runtime-required avatar PNG is either bound by a
  release receipt or is a starter/owned-by-default item.

## 7. Evidence and limits

Scratch directory (not committed):
`/tmp/claude-0/-home-user-blumi-app/edf6dc29-7eab-5d52-9037-d6f5d6ef66d4/scratchpad/asset-audit/`
— `sheets/01_*`–`03_*` contact sheets, `metrics.json`, `summary.txt`,
`inventory.json`, `extract/catalog.json`, `extract/loadouts.json`, and the
scripts that produced them.

Limits:
- The Workbench is not available here: no source masters, briefs, prior
  approvals or provenance were checked, and no art fix was prototyped.
- No iOS Simulator or device run: cropping, MiniRoom seat placement, back-wall
  transparency, Reduce Motion and real display scale remain **OPEN**.
- Metrics are heuristics (seam bands, rigid bands); outliers were confirmed
  visually, but absence of a metric flag is not visual approval.
- Review was performed by the same model that wrote this report (internal
  review only).
