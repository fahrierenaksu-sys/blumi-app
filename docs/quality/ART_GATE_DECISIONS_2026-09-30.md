# Art QA gate decisions — 2026-09-30

Status: **Decided — all four gates removed by the owner on 2026-09-30.** The
test files were deleted (recoverable from git history). The shipped art and
its measured failures below are unchanged: nothing now checks walking-frame
motion, sneaker/trouser overlap or tee outlines for these assets, so a
regression there is only visible on a device. The analysis is kept as the
record of what the gates found.

## How this was measured

- The gates were run from the repository root, where they resolve their
  paths: `node --test apps/mobile/scripts/<gate>.test.mjs`. Together they
  run 20 tests: **3 pass, 17 fail**.
- Every gate stops at the first failing item. To report every item, a
  scratch script re-ran the gates' own metric functions, copied verbatim, over
  all items. The script is outside the repository and changes nothing.
- **Same failure at the introducing commit:** the gate files, the assets
  they read, `avatarRoomProjection.ts` and the promotion gate helper were
  extracted from `922fe89` with `git archive`, and both measurements were
  repeated there.
  - The original gate files give the identical result: 20 tests, 3 pass,
    17 fail.
  - Every measured value in this document is identical at `922fe89` and at
    `4ed9b40`.
  - None of the measured files changed after `922fe89`. Later asset commits
    (`4702c52` Cream Tee v17, `263cd8a` Coral Wave) added new files; they did
    not modify these.
- "Shipped" below means that the file's SHA-256 is among the 1,223 asset
  files of the production iOS export (`EAS_BUILD_PROFILE=production`). Metro
  de-duplicates identical files, so a path check alone undercounts.
- Contact sheets are scratch-only and not committed. They were made with PIL
  in the agent's scratch directory, and each gate section describes its sheet.

---

## 1. `female-walk-rig-contract` (3 tests, 3 fail)

What it measures:

1. **Tops are pose-specific.** Walking F02/F03/F04 of each promoted non-dress
   female top must *not* be an exact copy of the static layer shifted by
   (−1,0), (0,+1) and (+1,0).
2. **Shoe F04 follows its own body anchor.** F04 must not be byte-identical
   to F02. The F04 alpha-bounds centre must be within **2 px** of the centre
   of the female base walking F04 body (x = 128.5).
3. **Known-problem bottoms are clean.** Four bottoms × F01–F04 must have:
   - no alpha island of ≤ 10 px (after the two largest components);
   - no pixel with alpha > 0 and green > red + 48 and green > blue + 48
     (green chroma fringe).

Results:

| Test | Item | Measured | Threshold | Shipped |
|---|---|---|---|---|
| 1 | blush_lace_cardigan, sage_ribbon_knit_jacket, cherry_heart_milkmaid_blouse, powder_blue_ribbon_corset_top, noir_rose_heart_cardigan | F02, F03, F04 are **exact translations** of the static layer (all 3 frames, all 5 tops) | must be false | yes (static and all frames) |
| 1 | cream_basic_tee | the legacy files the gate reads are exact translations | must be false | **no**: runtime uses `*_art_v17` since `4702c52`; the v17 F02–F04 are *not* translations (checked with the same function) |
| 2 | milk_tea_court_sneakers, cherry_satin_ballets, onyx_heart_mary_janes, rosewood_platform_loafers, pearl_slingback_sandals | F04 **byte-identical** to F02; F04 centre **4 px** from the base F04 centre | not identical; ≤ 2 px | yes |
| 3 | tiny islands, all 16 frames | 0 | 0 | yes |
| 3 | black_palm_embellished_pants | green fringe px F01 0, F02 0, **F03 1**, F04 0 | 0 | yes |
| 3 | smoky_floral_mesh_pants | F01 0, **F02 1, F03 7, F04 1** | 0 | yes |
| 3 | layered_lace_ruffle_mini_skirt | **F01 36, F02 41, F03 35, F04 41** | 0 | yes |
| 3 | yellow_bow_lace_ruffle_skirt | **F01 15, F02 21, F03 21, F04 21** | 0 | yes |

Affected shipped assets (`apps/mobile/src/features/avatarV2/assets/room/`):

- `avatar_room_top_female_{5 tops}_v2.png` and
  `motion/room_avatar_top_female_{5 tops}_v2_walking_front_f0{2,3,4}.png`
- `motion/room_avatar_shoes_female_{5 shoes}_v2_walking_front_f0{2,4}.png`
- `motion/room_avatar_bottom_female_{4 bottoms}_v2_walking_front_f0{1-4}.png`

Contact sheets:

- `female-walk-tops-translation.png`: for each top, the static layer and
  F02–F04 side by side (2×). They are visibly the same drawing nudged by one
  pixel. The ImageChops difference between static and F02 shifted back 1 px
  is empty (`getbbox() = None`) for all five tops.
- `female-walk-shoes-f04.png`: base F02 + shoe F02 next to base F04 + shoe F04
  (3× crop of the feet). The F04 shoes sit where the F02 feet were, not under
  the F04 feet.
- `female-walk-bottoms-green-fringe.png`: 6× crops with each offending pixel
  boxed in magenta.
  - The lace mini skirt and the yellow bow skirt show a scatter of green
    pixels along the lace hem edges.
  - The pants show 1–7 isolated edge pixels.

Options:

- **A — fix the art in the Workbench.** Per
  `.agents/skills/blumi-character-asset-production/SKILL.md`:
  - redraw the pose-specific walking silhouettes for the 5 tops;
  - author a real F04 for the 5 shoes on the F04 body anchor;
  - de-fringe the 4 bottoms.

  Promote them as new runtime files, keeping the item IDs. Then wire the gate
  unchanged (into `run-avatar-v2-tests.mjs`).
- **B — owner accepts the current art.** Then:
  - test 1 is changed to read the shipped files from
    `avatarRoomMotionAssets.ts` (this fixes the stale Cream Tee path) and to
    record the 5 accepted translated tops as an explicit, dated exception
    list that may only shrink;
  - test 2 does the same for the 5 shoes (accepted F02 = F04 reuse);
  - test 3 records each frame's accepted green-pixel count as a per-frame
    maximum that may only go down, or lowers the fringe to a tolerance the
    owner names.

  The gate is then wired. New items get the strict check.
- **C — mixed.** For example, accept the tops and shoes (motion is subtle at
  room scale) but fix the lace skirts, whose 35–41 green pixels per frame are
  the most visible defect.

Decision (owner, 2026-09-30): **remove the gate.** The test file was deleted; the shipped art is unchanged and no longer checked by this gate.

---

## 2. `female-legacy-milk-tea-repair` (2 tests, 1 fails)

What it measures: for the two new trousers (midnight_ribbon_wide_leg_pants,
buttercream_pearl_tailored_pants) over the female base, in static and walking
W1, `measureBottomShoeSeam` scans the pant-hem/shoe-upper zone
(x 94–161, y 312–351). It counts base-body pixels exposed between the pant
hem and the shoe upper. Limit: **exposed ≤ 2 px in total and ≤ 1 px in any
column**.

Results:

| Shoe | Bottom | State | Exposed px | Max band | Limit | Pass |
|---|---|---|---:|---:|---|---|
| milk_tea_court_sneakers | midnight_ribbon_wide_leg_pants | static | 2 | **2** | ≤2 / ≤1 | no |
| milk_tea_court_sneakers | buttercream_pearl_tailored_pants | static | 2 | **2** | ≤2 / ≤1 | no |
| milk_tea_court_sneakers | midnight_ribbon_wide_leg_pants | W1 | **3** | **3** | ≤2 / ≤1 | no |
| milk_tea_court_sneakers | buttercream_pearl_tailored_pants | W1 | **3** | **3** | ≤2 / ≤1 | no |
| rose_satin_bow_heels | both trousers | static, W1 | 1 | 1 | | yes |
| ivory_pearl_slingback_heels | both trousers | static, W1 | 1 | 1 | | yes |

All files involved ship. Affected assets:

- `avatar_room_shoes_female_milk_tea_court_sneakers_v2.png`
- `motion/room_avatar_shoes_female_milk_tea_court_sneakers_v2_walking_front_f01.png`
- the two trousers' static and W1 layers

The defect is in the sneaker: its medial collar sits too low under these two
hems.

Contact sheet `female-milk-tea-hem-seam.png` shows 6× crops of the hem zone,
with exposed base pixels boxed in red:

- Milk Tea: a 2-px (static) or 3-px (W1) vertical sliver of skin between the
  inner hem and the sneaker collar, at the inner hem between the feet.
- Heels: a single pixel.

Options:

- **A — fix the art:** raise the Milk Tea sneaker's medial collar by 2 px in
  static and W1 (Workbench, same item ID). Then wire the gate unchanged.
- **B — accept:** set the Milk Tea row's limit to the measured
  3 px / 3 px band as a documented exception for these two trousers only.
  The heel limits stay. Then wire the gate.

Decision (owner, 2026-09-30): **remove the gate.** The test file was deleted; the shipped art is unchanged and no longer checked by this gate.

---

## 3. `male-basic-tshirt-static-contract` (2 tests, 1 fails)

What it measures, for the four shipped male basic tees
(`avatar_room_top_male_{powder_blue_crew,cream_basic,sage_basic,dusty_navy}_tee_v1.png`):

- canvas 256×384;
- alpha bounds (alpha > 0) exactly **[88, 216, 168, 294]** (x0, y0, x1, y1
  exclusive);
- neck open at (128, 218), with alpha ≤ 48;
- neck closed at (128, 219), with alpha ≥ 224;
- torso-core coverage (x 104–152, y 232–286, alpha ≥ 64) ≥ 0.96;
- no transparent-RGB residue;
- and, as the second test, distinct torso-centre colours.

Results:

| Tee | Alpha bounds | α(128,218) | α(128,219) | Torso coverage | Residue |
|---|---|---:|---:|---:|---:|
| powder_blue_crew_tee | **[86, 214, 169, 296]** | 0 | **66** | 0.967 | 0 |
| cream_basic_tee | **[87, 215, 169, 296]** | 0 | **0** | 0.966 | 0 |
| sage_basic_tee | **[87, 215, 168, 296]** | 0 | **0** | 0.963 | 0 |
| dusty_navy_tee | **[86, 214, 170, 296]** | 0 | **6** | 0.969 | 0 |
| expected | [88, 216, 168, 294] | ≤ 48 | ≥ 224 | ≥ 0.96 | 0 |

Test 2 passes: the four centre colours are distinct. All four files ship.

The failures come from:

- faint anti-aliased pixels 1–2 px outside the approved envelope;
- a neckline that closes 1–4 rows lower than the rig contract (row 220–223
  instead of 219).

Contact sheet `male-basic-tees-neckline-and-silhouette.png`:

- 6× neckline crops with rows y218 (red) and y219 (blue) and column x128
  (green). The collar of each tee is still open at y219.
- Red difference masks of each tee's alpha against the Powder Blue tee.
  The silhouettes differ along the whole outline and most strongly at the
  collar.

Options:

- **A — fix the art:** re-export the four tees on one shared approved rig
  silhouette:
  - bounds [88, 216, 168, 294];
  - the collar closing at y219;
  - no faint edge pixels.

  This is Workbench work under the character skill. The same item IDs are
  kept. Then wire the gate unchanged.
- **B — accept:** replace the exact bounds with the measured
  per-tee bounds or a ±2 px tolerance, and the y219 check with each tee's
  measured closing row (220–223). Keep the torso-coverage, residue and
  palette checks as they are. Then wire the gate.

Decision (owner, 2026-09-30): **remove the gate.** The test file was deleted; the shipped art is unchanged and no longer checked by this gate.

---

## 4. `male-basic-tshirt-rig-fit-qa` (13 tests, 12 fail)

What it measures, for the same four tees against the male light base and the
navy straight pants:

- (a) alpha > 16 bounds exactly **[88, 216, 167, 293]** and no residue;
- (b) the first closed centre row is **219**, opaque runs at y218 are
  **[[109,124],[132,146]]** and at y219 **[[106,149]]**;
- (c) body coverage:
  - shoulders (96–160 × 219–242) **= 1.0**;
  - torso ≥ 0.98;
  - overlap with the pants waistband ≥ 160 px;
  - one continuous silhouette run at y 232, 250, 278 and 286;
- (d) all four tees share **one identical alpha mask**, with distinct centre
  colours.

Results:

| Tee | Bounds (α>16) | 1st closed row | Runs y218 | Runs y219 | Shoulder cov. | Torso cov. | Pants overlap | Runs 232/250/278/286 |
|---|---|---:|---|---|---:|---:|---:|---|
| powder_blue_crew_tee | **[88,214,167,295]** | **220** | **[109,120],[134,146]** | **[106,124],[128,149]** | 1.000 | 0.986 | 247 | 1/1/1/1 |
| cream_basic_tee | **[88,215,167,295]** | **223** | **[110,118],[137,145]** | **[107,119],[136,148]** | **0.968** | 0.986 | 241 | 1/1/1/1 |
| sage_basic_tee | **[88,215,167,295]** | **222** | **[111,118],[136,145]** | **[107,120],[135,148]** | **0.982** | 0.984 | 261 | 1/1/1/1 |
| dusty_navy_tee | **[88,215,167,295]** | **220** | **[110,120],[136,145]** | **[107,123],[132,149]** | **0.997** | 0.986 | 258 | 1/1/1/1 |
| expected | [88,216,167,293] | 219 | [109,124],[132,146] | [106,149] | 1.0 | ≥ 0.98 | ≥ 160 | 1 each |

Test (d): there are **4 distinct alpha masks** where 1 is expected. The
centre colours are distinct (passes).

Only "Powder Blue Crew Tee: shoulder, torso, and waistband stay in body
contact" passes. The other three tees fail (c) only on shoulder coverage
0.968–0.997, which leaves a few uncovered body pixels at the shoulder or
collar.

Affected assets: the same four shipped tee files. The base and pants are
references only.

Contact sheet: the same sheet as gate 3. The difference masks show why (d)
fails.

Options:

- **A — fix the art:** the same re-export as gate 3. One shared mask would
  satisfy (a), (b) and (d) together. Covering the shoulder pixels fixes (c).
  Then wire both gates unchanged.
- **B — accept:** (a) and (b) take the measured per-tee values or a
  tolerance; (c) shoulder coverage ≥ 0.96; (d) is dropped, or reduced to
  "same canvas and bounds within tolerance". The torso, pants-overlap,
  continuity and palette checks stay. Then wire the gate.
  - B removes the "one approved rig silhouette" guarantee that gate 4 was
    written to enforce. Choosing B is an explicit art decision.

Decision (owner, 2026-09-30): **remove the gate.** The test file was deleted; the shipped art is unchanged and no longer checked by this gate.

---

## After a decision

- Art fix (A): produce and approve in the Workbench, promote runtime files
  with the same item IDs, and wire the unchanged gate into
  `apps/mobile/scripts/run-avatar-v2-tests.mjs`. Native check on the iPhone:
  Wardrobe, Room and MiniRoom walking.
- Accept (B): one commit per gate that changes only the named thresholds or
  exception lists, quotes the owner's decision, and wires the gate. Record
  the change in the audit.
