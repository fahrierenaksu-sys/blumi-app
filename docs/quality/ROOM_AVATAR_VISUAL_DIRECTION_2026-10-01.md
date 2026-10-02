# Room + Avatar Visual Direction — Decision Document (2026-10-01)

Status: **DECISION PROPOSAL / OPEN**. Research synthesis of three lenses (current stack, 2.5D Skia/Spine, true 3D). Nothing in this document is implemented; no production code or assets were changed. Checkout: `/home/user/blumi-app` @ `develop` (`0a8795d`, clean). Stack verified in `apps/mobile/package.json`: Expo `~57.0.26`, React Native `0.86.3`, React `19.2.3`, Reanimated `4.5.1`, `react-native-worklets 0.10.1`; no Skia, Spine, GL, Rive or 3D dependency installed.

Evidence base (disposable, outside the repo): `/tmp/claude-0/-home-user-blumi-app/edf6dc29-7eab-5d52-9037-d6f5d6ef66d4/scratchpad/visual-direction/` — Lens 1 `probe/`, `measure-frames.py`, `frame-metrics.json`, `sheets/base_frames_grounding.png`, `sit-transition-curve.mjs`; Lens 2 `bench.mjs`, `light.mjs`, `out/sit_tween_mesh_vs_discrete.png`, `out/flat_vs_rimlit.png`; Lens 3 `lens3/impostor.mjs`, `parity.mjs`, `billboard.mjs`, `skeletal.mjs`, `impostor_contact_sheet.png`, `expo-export/`.

Limit that applies to every claim below: this research ran in a Linux container with **no iOS Simulator or device**. Every visual and performance statement is code-derived, pixel-measured or CPU-benchmarked, **not native verified**. The first step of the plan is a Simulator check.

---

## Bölüm A — Yönetici Özeti (Türkçe, sahip için)

### Kısa cevap

"Yapay görünüm" bir **motor (2D/2.5D/3D) sorunu değil**; ölçülebilen altı mekanik hatanın toplamı. Bunların hepsi mevcut uygulama altyapısında, **aynı çizimlerle, aynı karakterlerle, sıfır lisans parasıyla ve yeni native build gerektirmeden** büyük ölçüde düzeltilebilir. Gerçek 3D'ye geçmek karakterleri yeniden yapmayı gerektirir (çizimler mesh olarak kullanılamaz), çok pahalıdır ve istenen şeyi (doğal oturma/kalkma, mobilyaya hizalanma) zaten çözmez. Önerilen yol: **önce mevcut sistemi düzelt (0 ₺, ~3–4 hafta), sonra ölçülmüş küçük bir Skia dilimi ile 2.5D derinlik kat (0 ₺), Spine iskelet rig'ini yalnızca sen istersen ve lisansı onaylarsan ekle ($379–449 tek seferlik, isim başına).**

### Bugün neden yapay görünüyor? (ölçüldü)

| # | Sorun | Kanıt |
|---|---|---|
| 1 | Oturma/kalkma **anlık kare değişimi**, 0 ms geçiş | `RoomRenderer2D.tsx:636`; otur karesi tek PNG |
| 2 | Oturan avatar **yanlış yükseklikte** olabilir: formül kompakt telefonda avatarı 77,6 pt (boyunun %81'i) aşağı itiyor; sanat 10–20 pt istiyor | `roomV2AvatarMotion.ts:15-39`; Simulator onayı gerekli |
| 3 | **Kayarak yürüme (moonwalk)**: adım saati sabit 120 ms, hız yola göre değişiyor; bir adım döngüsünde avatar 1,56 boy kayıyor; baş zıplaması 0 px | `roomWorldRuntime.ts:34-44`; `frame-metrics.json` |
| 4 | **Ortak odada (MiniRoom) avatarlar her zaman mobilyanın üstünde** çiziliyor; derinlik sıralaması yok → "mobilyanın üstünden yürüme" | `MiniRoomScene.tsx:417-423` |
| 5 | **Yatak koltuğu** sola bakıyor, sola bakan sanat yok → My Room reddediyor, MiniRoom yatağın üstünde ayakta duruyor | `roomV2Catalog.ts:278-306`; katalog 579 kayıt, %100 ön görünüm |
| 6 | **Çarpışma payı** avatar genişliğinin ~1/16'sı (7 pt) → silüet mobilyanın içinden geçiyor | `roomWorldRuntime.ts:14` |

Ek: iki yüzeyde iki farklı animasyon sistemi ve sabitler (MiniRoom avatarı %16 daha büyük), üretimde mobilya temas gölgeleri kapalı (yatak için çizilmiş 4 gölge PNG hiç gösterilmiyor).

### Seçenekler

| | A — Mevcut sistemi mükemmelleştir | B — A + ölçülü Skia 2.5D dilimi | C — B + Spine iskelet rig (V3) | (Red) Gerçek 3D |
|---|---|---|---|---|
| Ne değişir görsel olarak | Yumuşak otur/kalk (squash → iniş → yaylanma), adıma kilitli yürüme + hafif zıplama + gölge, mobilya arasından doğru derinlikle geçme, yatağa oturma, mobilyanın içinden geçmeme, temas gölgeleri, iki telefonda aynı ölçek | A + tek çizim yüzeyinde kesin z-sıra, idle↔otur arası mesh ara-kareleri (eğilme/yerleşme), silüet ışığı (rim light) ile derinlik hissi, statik oda tek seferde kaydedilip tekrar oynatılır | B + yeniden kullanılabilir animasyonlar (yaklaş-dön-otur, kilo kaydırma idle, saç/kumaş fiziği), yan görünüş imkânı, tüm kıyafetlerde ortak rig | Karakter yeniden modellenir; kimlik gate'i her ürün için yeniden açılır |
| Aynı asset/karakter | Evet, %100 | Evet | Evet; ama taban gövde ve giysiler Workbench'te parçalara (gövde, kol, bacak…) kesilir | Hayır — 1.229 PNG kullanılamaz |
| Maliyet | 0 ₺ | 0 ₺ (Skia MIT) | **Spine Professional $379 (liste $449), kişi başı, tek seferlik — senin onayın gerekli** | 0 ₺ lisans, ama aylarca modelleme |
| Süre (tahmini) | 3–4 hafta | +3–4 hafta | +6–10 hafta (çoğu Workbench sanat işi) | Gerçekçi değil |
| Yeni native build | Hayır (OTA ile gider) | **Evet** (Skia native modül → fingerprint değişir → yeni TestFlight) | Evet (B ile aynı) | Evet |
| Risk | Düşük | Orta (Android bellek issue'ları cihazda doğrulanmalı) | Orta-yüksek (resmî RN runtime yok, kendi 300 satırlık renderer) | Yüksek |
| Geri alınabilirlik | Kolay | Kolay (bayrak arkasında) | Orta | Zor |

### Önerilen yol

**A'yı şimdi başlat (koşulsuz). B'yi A bitince, ölçerek. C'yi yalnızca B'nin ara-kareleri sana yeterince "canlı" gelmezse ve lisansı onaylarsan.** Gerçek 3D reddedildi (gerekçe Bölüm F).

İlk küçük kanıt dilimi (1 hafta): oturma yüksekliği kalibrasyonu + yumuşak otur/kalk geçişi + yatağa öne dönük oturma — Simulator'da yan yana önce/sonra videosu ile sana sunulur.

### Senin vermen gereken kararlar

1. **Yol:** A → B → (C) sırası onaylanıyor mu? (Öneri: evet.)
2. **Spine lisansı:** $379–449 tek seferlik, isim başına. Şimdi karar gerekmiyor; B tamamlanıp sonucunu görünce karar ver. Onay olmadan satın alınmaz, runtime entegre edilmez.
3. **Yatak oturma yönü:** Yatakta şimdilik **öne dönük kenar oturuşu** kabul mü? (Yan/uzanma pozu için sanat yok; C olmadan üretilemez.)
4. **Yürüme hızı:** "Uzun yol = daha hızlı kayma" yerine sabit adım hızı (uzun yürüyüş daha uzun sürer, ~1,8 s yerine 3 s'ye kadar). Kabul mü?
5. **Yeni build zamanlaması (B için):** Skia native modül ekleyince yeni TestFlight build gerekir; sana uygun bir release penceresi.

---

## Part B — Goals and measurable success criteria

Goal: the existing chibi avatar and furniture must read as **one grounded scene**: natural sit-down/stand-up, correct contact with furniture, exact placement, and clean pass-by with correct depth — on both My Room and the shared MiniRoom, with identical behaviour on two phones.

| ID | Criterion | Target | How measured | Today (code-derived) |
|---|---|---|---|---|
| S1 | Sit-down transition duration | 360–480 ms (anticipation 80–100 ms, drop 150–180 ms, settle ≤ 180 ms); stand-up 300–400 ms; Reduce Motion: ≤ 120 ms crossfade, no squash | Shared-value timeline constants + Simulator recording | 0 ms (frame swap) |
| S2 | Seated contact error | Hip row of the sitting art within ±3 pt of the seat's cushion contact band; soles never below the furniture floor contact | Test on `RoomSeatPoint` + Simulator screenshot overlay | ≈ 51 pt below chair floor contact on compact (unverified) |
| S3 | Foot slide while walking | ≤ 0.15 avatar heights per stride cycle | Stride-locked frame index: frame advances by distance; Simulator video | 1.56 avatar heights per cycle |
| S4 | Frame rate | 60 fps sustained on iPhone 12-class with 2 walking avatars + 20 furniture items; 120 fps (ProMotion) with no dropped frame on sit/stand transitions; no JS-thread work per frame | Xcode Instruments / `expo-dev-client` perf monitor on device | Not measured (open) |
| S5 | Placement alignment error | Footprint pivot within 1 snap step (0.01 unit ≈ 5.6 pt at compact stage) of the grid/lane; zero overlap between furniture footprints; wall-lane items magnet to lane y | Unit tests on placement model + Simulator | Snap exists (0.01), no lane magnet, AABB for legacy items |
| S6 | Depth order | 0 wrong-order frames when an avatar walks around an item (front/back) on both surfaces | Simulator video, depth index tests | MiniRoom: avatars always on top |
| S7 | Clearance | Avatar silhouette never intersects a blocker polygon while walking (clearance ≥ half avatar width ≈ 0.05–0.06 unit) | Geometry test + Simulator | 0.012 unit (≈ 7 pt) |
| S8 | Memory | ≤ 45 MiB decoded avatar textures with 2 fully-accessorised avatars; no growth across 10 room entries | Xcode memory gauge | ≈ 24–42 MiB arithmetic (walking), not measured |
| S9 | Sync determinism | Both phones reach identical final (x, y, hotspotId, facing, motion) for the same server record; identical walk duration ±1 frame | Existing pure plan tests + two-Simulator run | Plan is pure; receiver re-plans locally (known P1) |
| S10 | Cost | 0 new licence spend unless owner approves in writing | Dependency/licence review | Compliant |

### User stories

- As a user, when I tap a chair, my avatar walks to it, turns, sits down smoothly and lands exactly on the cushion; tapping the floor makes it stand up and step off naturally.
- As a user, I can sit on my bed and my sofa, not just the chair, and the result looks the same on my phone and my match's phone.
- As a user, when I place furniture it snaps into a sensible position, never floats, never overlaps, and avatars can still reach it.
- As a user, when my avatar walks behind a table it is partly hidden by it, and when it walks in front it covers it; it never walks through it.
- As a user with Reduce Motion on, the avatar still sits and stands without squash/bounce, with a short crossfade.
- As a match in a shared room, I see my partner's avatar do exactly what they see, with no desync in position or seat.

### In scope

- Avatar V2 layered-PNG runtime kept as the production renderer; all upgrades additive.
- Seat rig data (`RoomSeatPoint`/`RoomSeatSpec`), occlusion, contact shadows, depth sorting, clearance, placement validation, motion constants, Reanimated UI-thread transitions.
- A measured, flag-gated Skia slice (Option B) after Option A ships.
- Spine Professional evaluation (Option C) only after an explicit owner decision on cost.

### Out of scope

- True 3D (meshes, GL/Metal scene, Filament, Babylon, Unity, etc.) — rejected (Part F).
- Rive, Lottie, or any other new primary runtime (AGENTS.md prohibition).
- Non-front sitting/walking art (side/back/lying) produced as PNG frames (≈ 2,900 PNGs; not feasible).
- Rotating room camera (would reopen the 3D impostor discussion; parked).
- Photos, video, GIFs, voice messages (product scope unchanged).

---

## Part C — Comparison table

| Criterion | A: Current stack, perfected | B: A + measured Skia slice | C: B + Spine Pro skeletal (Avatar V3) | 3D impostor (expo-gl + three) | Full 3D |
|---|---|---|---|---|---|
| Visual quality | Good: smooth motion, grounded, correct depth; still 2 poses + crossfade | Better: mesh in-betweens (bend/settle), rim light depth cue, exact single-surface ordering | Best: reusable animations, secondary motion (hair/cloth physics 4.2+), weight-shift idle, side views possible | Perspective + GPU depth; sitting still wrong without split (measured) | Different character; identity gate reopens |
| Reuse of existing assets / base characters | 100 % | 100 % (frames are mesh keys) | Base + garments cut into parts in Workbench (once per sex; ~112 garments or generated from base cuts); same drawings | 100 % as impostors; soft edges degrade (alpha-test) | 0 % (1,229 PNGs unusable) |
| Sit/interaction realism | Approach → turn → squash/drop/settle; data-driven seat rigs incl. bed | A + bend in-betweens; still keyed on existing sitting art (mesh cannot invent foreshortening — `out/sit_tween_mesh_vs_discrete.png`) | Full articulation; still keyed on sitting attachments for the pose | Same as A (PNG swap) | Full, after re-authoring |
| iPhone performance | Reanimated shared values, UI thread; 40–72 mounted image views per walking avatar (ceiling of PNG model) | ~50 sprites per scene, two orders below budget-Android Atlas ceiling (~300); CPU bench: Picture replay saves static room; per-pixel shader only over avatar bounds | Same surface as B; ~15k tris trivial on GPU (CPU bench 3.7× A, expected to converge on device) | 10–11 draw calls/avatar; Simulator GL unreliable (R3F docs) | Unknown |
| Dev effort | 3–4 weeks (U2…U14) | +3–4 weeks | +6–10 weeks, mostly Workbench part-cut art; self-maintained ~300-line `drawVertices` renderer | +4–6 weeks for a new render surface; no sit gain | Months |
| Memory | 24–42 MiB decoded (2 walking avatars), prefetch hygiene | Skia Android memory issues #3999/#3664/#4079 must be re-verified on ≥2.11.1 | Atlas textures replace per-frame PNGs (likely lower) | 2.75 MB RGBA/avatar | n/a |
| New native dependency / fingerprint / new build | **None** (OTA-able) | **Yes**: Skia 2.14 (pin ≥2.11.1; SDK 57 bundles 2.6.2 broken on RN 0.86 Android) → fingerprint change → new EAS build + TestFlight | Same as B (spine-core is pure TS) | Yes (expo-gl) → new build | Yes |
| Reversibility | High (data + constants) | High (flag-gated canvas; fall back to expo-image path) | Medium (new asset format, part-cut art) | Medium | Low |
| Zero-spend compliance | Yes | Yes (MIT) | **No**: Spine Professional $379 shown / $449 list per named user, perpetual; Enterprise if ≥ $500k revenue/investment; editor licence required to integrate runtimes | Yes (MIT) | Yes in licences, no in labour |
| Sync determinism | Unchanged; protocol `{x, y, hotspotId?, sequence}` untouched; animation client-local | Unchanged | Unchanged | Unchanged (0/10,000 mismatches measured) | Unchanged |
| AGENTS.md gate | Allowed (maintain V2 for live fixes) | Allowed ("Skia only in measured, incremental slices") | Allowed as the planned V3 direction; licence = owner decision | Not allowed without verified blocker (none) | Not allowed |

---

## Part D — Furniture alignment and pass-by design (applies to A, B and C)

This design is runtime-independent: it is data + pure geometry in `packages/domain/src/roomWorld/` and `roomV2` catalog, consumed by every renderer.

### D1. Footprint, grid and snap

- Keep the normalized floor space and the 0.01 snap step. Add **lane magnets**: wall lane (y ≈ 0.54) and existing placement lanes snap within their radius; add edge-alignment guides (left/right/front edge of neighbouring footprints) with a visible guide line while dragging.
- Every item gets a **polygon footprint** at its floor pivot (migrate the legacy chair/table AABB → polygon). Footprint pad is drawn at the pivot in the editor so the owner sees where the item stands.
- Placement validation: footprint overlap = reject; floor-polygon clamp; reachability check (existing `roomWorldDiagnostics`) with the new clearance (D3). Server stores placement as today; validation stays client-side for the editor and server-side for persistence of My Room state.

### D2. Depth sorting (both surfaces)

- One rule: `layer → depth → stableId`, where furniture `depth = placed.depth ?? pivot.y` and avatar `depth = y` (or `seat.renderDepth + ε` while seated).
- **MiniRoom change:** avatars become entries in the same sorted list as furniture (the My Room path), or decor is split into behind/in-front slices chosen on the UI thread from live `y`, re-rendering only when the order index flips (`getMyRoomAvatarDepthIndex` pattern). Hotspot and bubble layers stay above.
- Furniture gets the same gentle perspective scale as avatars (0.96–1.04) or avatars lose theirs; MiniRoom avatar box becomes 0.30 of room height like My Room.
- In Option B the Skia canvas draws the same sorted list in one surface, which removes order-flip re-renders entirely.

### D3. Navmesh, blockers and clearance

- Path clearance = half avatar width (0.05–0.06 unit) instead of 0.012; approach candidates computed with the same inflation.
- Keep the current corner-candidate search for today's rooms (0.2–1.9 ms/tap measured); when Room V3 furniture counts (45 items) arrive, replace with a cached visibility graph + Dijkstra over inflated polygons (U14). Must remain pure and deterministic.
- Fix the receiver-side re-planning P1 (`INTERACTION_WAVE_STATUS_2026-10-01.md`) so both phones execute the identical plan from the server record before walk timing changes.

### D4. Occlusion

- Generalise the chair's crop-occlusion band to every seat as data: `occlusion: crop | asset | none`, with `cushionContactY` and `hipOffset` in `RoomSeatPoint`.
- VNext seat items ship a front-slice asset (bed: 4 front-slice PNGs, Workbench export, no redraw). The `starter-pink-cloud-bed` back/front/contact-shadow pattern becomes the standard for sofas and beds.
- Flip the production gate so authored contact shadows are drawn; the seated avatar keeps a ground shadow.

### D5. Seat rigs

- Data-driven `RoomSeatSpec` per item: seat/approach/exit points, facing, `seatHeight`, `hipOffset`, occlusion, entry turn. Bed gets a **front-facing edge seat** now; `left_edge` stays reserved for future side art.
- My Room and MiniRoom use one decision function (today: refuse vs stand-on-bed).

### D6. Server validation

- Protocol unchanged. Server continues to validate floor polygon, sequence and seat claims (`miniRoomMotionService.ts:198-247`). Add server-side validation that a claimed `hotspotId` is a seat whose facing has runtime art support (shared from `packages/domain`), so no client can commit an unsupported pose. Walk timing constants live in `packages/domain` so both phones and the server reason about the same durations.

---

## Part E — Phased plan

### Phase 0 — Native baseline (2 days, before any code)

Simulator screenshots/videos on compact and wide phones of: chair sit on My Room and MiniRoom, bed tap on both, a walk around a table in MiniRoom, placement drag. This converts the code-derived findings (seat offset §2.3, MiniRoom z-order) into confirmed bugs or closes them. Output: `docs/quality/NATIVE_BASELINE_ROOM_<date>.md`.

### Phase 1 — Quick wins on the current stack (Option A, weeks 1–4, $0, no new build)

**First proof slice (week 1):** U2 seat-offset calibration → U1 procedural sit/stand transition → U5 bed front-facing seat rig. Deliverable: side-by-side before/after Simulator video for the owner; tests on seat contact band and transition constants; Reduce Motion variant.

Then: U4 approach→turn→settle; fix receiver re-planning P1; U3 stride-locked walk + bob + shadow coupling + pace cap; U7 MiniRoom interleaved depth; U8 body-width clearance; U9 occlusion data + bed front slices; U10 placement magnets/guides + contact shadows in production; U11 one motion clock with shared constants; U12 consistent scale; U13 prefetch/memory hygiene. Each slice: failing test first, focused typecheck/lint/test, Simulator evidence, `mobile-engineering-rules` ratchets unchanged.

Exit gate: S1–S3, S5–S7, S9 met in Simulator; S4/S8 measured on at least one physical iPhone (open until then).

### Phase 2 — Mid-term: measured Skia slice (Option B, weeks 5–8, $0, new build)

- `npx expo install @shopify/react-native-skia`, pin ≥ 2.11.1 (target 2.14.0), document the `expo install --check` exception (or wait for SDK 58).
- Behind a flag on the My Room stage only: images-as-layers parity with today; `Picture` for the static room; mesh in-between (idle ↔ sitting attachments) via `Vertices`; avatar-bounds SkSL rim light; UI-thread values from Reanimated shared values.
- Gates before MiniRoom: iOS Simulator parity screenshots, one physical iPhone (fps, memory), one budget Android (Skia memory issues #3999/#3664/#4079), bundle delta, fingerprint/EAS build, OTA plan.
- Reversible: flag off → expo-image path.

### Phase 3 — Big transition: Avatar V3 skeletal (Option C, only on owner decision)

- Precondition: owner approves the Spine Professional licence ($379–449 per named user; verify live price) and Phase 2 showed mesh in-betweens are not enough.
- Author in Spine Pro → export JSON/atlas → `@esotericsoftware/spine-core` (pure TS) + ~300-line RN-Skia `drawVertices` renderer (port of spine-canvaskit) inside the same Canvas. No native code beyond Skia; editor↔runtime `major.minor` lock; licence + copyright notice shipped in the app.
- Workbench: base cut into parts per sex; one mesh per slot category via skins + linked meshes; asymmetric items reviewed for mirror safety; canonical cosmetic IDs map 1:1 to skin placeholders.
- V2 stays until V3 passes native, compatibility, persistence, migration and performance gates (AGENTS.md).

---

## Part F — Why true 3D is rejected

- The 97 wardrobe + 212 room + 920 motion PNGs cannot become geometry; every cosmetic (~97 SKUs × 2 bodies) would be re-modelled, rigged and weighted, and the locked chibi identity gate would reopen per item.
- Measured impostor prototype (`lens3/impostor_contact_sheet.png`): depth buffer fixes pass-by ordering, but a flat impostor **still sits in front of the armrest**; the fix is the same hip split / furniture front-back split needed in 2D. Soft alpha edges degrade with alpha-test. Sit/stand smoothness does not come from 3D at all.
- Sync parity: 0/10,000 mismatches, round-trip error 3.4e-15; with a straight-on camera 2D y-sort equals depth order (0 disagreements). 3D offers no sync benefit; a yawed camera (800/10,000 disagreements) is the only case where it would matter, and no such product decision exists.
- Native cost: expo-gl / Filament / Babylon are native modules → fingerprint change → new build; expo-gl rides OpenGL ES (deprecated by Apple); R3F docs say the iOS Simulator is unreliable for GL; Filament needs `react-native-worklets-core` (second worklet runtime beside Reanimated 4); Babylon RN does not support Expo.
- AGENTS.md: no new primary runtime without a verified blocker and migration evidence. None exists. **Decision: reject full 3D; park impostor-in-3D unless a rotating camera becomes a product decision.**

---

## Part G — Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Seat-offset finding is wrong (px/pt mix-up not real) | Medium | Low | Phase 0 Simulator check before coding |
| Stride-locked walking makes long walks feel slow | Medium | Medium | Pace cap tuned in Simulator; owner decision 4 |
| Walk timing change desyncs two phones | Medium | High | Fix receiver re-planning P1 first; shared constants in `packages/domain`; two-Simulator test |
| MiniRoom depth interleave breaks touch/bubble layering | Medium | Medium | Keep hotspot/bubble layers above; order-flip tests |
| More "blocked" placements with wider clearance | Medium | Low | Tune `CONSTRAINED_REACHABLE_RATIO`; editor guides |
| Skia Android memory regressions (#3999/#3664/#4079) | Medium | High | Pin ≥ 2.11.1; budget-Android gate; flag off path |
| Skia version pin conflicts with `expo install --check` / SDK 57 bundled 2.6.2 | High | Low | Documented exception or wait for SDK 58 |
| Spine: no official RN runtime, self-maintained renderer, version lock | Medium | Medium | Thin port of spine-canvaskit; pin editor version; keep V2 |
| Spine licence scope (second seat for integrator) | Medium | Low ($) | Clarify with Esoteric before purchase; owner approval |
| Workbench part-cut art changes the read of the chibi | Medium | High | Identity gate per SKILL.md; prototype on 2 garments first |
| Physical-device performance unknown | High | Medium | S4/S8 measured on device before each phase exit |
| Mesh in-between looks "rubbery" on the sweet chibi | Medium | Medium | Visual review on 2 items before rollout; keep crossfade fallback |

---

## Part H — AGENTS.md runtime gate (binding)

- Avatar V2 layered PNG stays the production runtime; all Phase 1 work is "maintain for live fixes" without expanding frame-by-frame PNG as the long-term architecture (no new per-cosmetic frame sets).
- React Native Skia enters only as a **measured, incremental slice** behind a flag with native evidence (Phase 2).
- Avatar V3 = Spine Professional skeletal direction, additive, preserving the chibi design and canonical cosmetic IDs; licence purchase requires an explicit owner decision (cost flag: $379–449 per named user, one-time; Enterprise if ≥ $500k).
- Rive, Unity, Unreal, Cocos, Defold, Filament, Babylon, expo-gl/three as a primary runtime: **not introduced** (no verified blocker, no migration evidence).
- V2 is not removed until the replacement passes native, compatibility, persistence, migration and performance gates.
- Ownership, economy, seat claims and floor validation stay server-authoritative; the wire protocol is unchanged.
- Production sources, experiments and prototypes stay in `BlumiArtWorkbench` / scratchpad; only approved runtime assets and consumed metadata enter the repo.

---

## Part I — Status labels

- **Implemented:** nothing (research and decision only).
- **Tested:** nothing in the repo; disposable prototypes measured (CanvasKit CPU raster, PIL pixel metrics, WebGL impostor, parity script).
- **Native verified:** none — no Simulator/device in the research container.
- **User approved:** pending owner decisions 1–5 (Part A).
- **Open:** Phase 0 native baseline; physical-device fps/memory; Spine licence decision; receiver re-planning P1.

## Sources (official, accessed 2026-10-01)

- Reanimated `useFrameCallback`, `withSequence`, `withSpring`, getting started: https://docs.swmansion.com/react-native-reanimated/docs/advanced/useFrameCallback/ · https://docs.swmansion.com/react-native-reanimated/docs/animations/withSequence/ · https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/ · https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/
- Expo SDK 57 changelog (2026-06-30): https://expo.dev/changelog/sdk-57 · React Native 0.86 (2026-06-11): https://reactnative.dev/blog/2026/06/11/react-native-0.86 · expo-image: https://docs.expo.dev/versions/latest/sdk/image/ · Expo Skia page: https://docs.expo.dev/versions/v57.0.0/sdk/skia/ · EAS runtime versions / fingerprint: https://docs.expo.dev/eas-update/runtime-versions/ · expo-gl: https://docs.expo.dev/versions/latest/sdk/gl-view/
- React Native Skia: installation https://shopify.github.io/react-native-skia/docs/getting-started/installation/ · canvas https://shopify.github.io/react-native-skia/docs/canvas/overview/ · animations https://shopify.github.io/react-native-skia/docs/animations/animations/ · atlas https://shopify.github.io/react-native-skia/docs/shapes/atlas/ · vertices https://shopify.github.io/react-native-skia/docs/shapes/vertices/ · shaders https://shopify.github.io/react-native-skia/docs/shaders/overview/ · pictures https://shopify.github.io/react-native-skia/docs/shapes/pictures/ · v2.13.0 release https://github.com/Shopify/react-native-skia/releases/tag/v2.13.0 · issues #2521, #3999, #3664, #4079 · Expo issue #50701 (Skia 2.6.2 on RN 0.86 Android): https://github.com/expo/expo/issues/50701
- Spine: purchase https://esotericsoftware.com/spine-purchase · editor licence https://esotericsoftware.com/spine-editor-license · runtimes licence https://esotericsoftware.com/spine-runtimes-license · runtimes https://esotericsoftware.com/spine-runtimes · spine-canvaskit https://en.esotericsoftware.com/spine-canvaskit · skins https://esotericsoftware.com/spine-skins · spine-ios https://esotericsoftware.com/spine-ios · RN issue https://github.com/EsotericSoftware/spine-runtimes/issues/2360 · community: https://github.com/koreanmate/spine-skia (0 stars, not on npm), https://github.com/Hau-Hau/react-native-spine-player (archived 2025-06-02)
- Rive pricing (for the record only; runtime prohibited): https://rive.app/pricing
- 3D: R3F install https://r3f.docs.pmnd.rs/getting-started/installation · Filament RN https://github.com/margelo/react-native-filament · Babylon RN https://github.com/BabylonJS/BabylonReactNative · Laigter (normal maps, GPL-3.0 tool) https://github.com/azagaya/laigter
- Apple WWDC18-416 iOS Memory Deep Dive: https://developer.apple.com/videos/play/wwdc2018/416/
- Field benchmarks: https://grzegorzotto.dev/blog/skia-atlas-2000-sprites-react-native · https://dev.to/grzott/the-react-native-game-engine-gap-in-2026-rnge-skia-phaser-in-webview-expo-gl-55hp

Repository evidence: `docs/quality/ASSET_FIT_AUDIT_2026-10-01.md`, `docs/avatar-motion-pipeline/female-fit-zones.json`, `docs/quality/OPEN_UX_WORK_2026-09-30.md` (ROOM-04/05/06/10/11/15/16), `docs/quality/INTERACTION_WAVE_STATUS_2026-10-01.md` (receiver re-planning P1), `.agents/skills/blumi-character-asset-production/SKILL.md`, `AGENTS.md`.
