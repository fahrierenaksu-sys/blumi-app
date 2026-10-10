# Avatar 2.5D world: integration plan

Snapshot: 2026-10-10. Branch `feat/avatar-2.5d-world` (worktree `.claude/worktrees/avatar-25d-world`, base `origin/develop` e5bcb2ed). Nothing is committed yet; local working commits on this branch are allowed by the owner (2026-10-10), nothing is pushed without his "push at". Every status in this file is **Open** until a phase reviewer closes it. Owner answers of 2026-10-10 (~16:45 and ~16:50) and the independent review (§11.1) are folded in.

Sources: `~/BlumiArtWorkbench/avatar25-v2/BLUMISON_INTEGRATION_PROMPT.md`, `integration/RESUME_INTEGRATION.md`, the eight Phase 0 audits in `integration/phase0/`, the two system handoffs, and targeted code reads (see §11).

Path short forms: `M/` = `apps/mobile/`, `S/` = `apps/mobile/src/`, `SV/` = `apps/server/src/`, `D/` = `packages/domain/src/`, `C/` = `packages/contracts/src/`, `X/` = `~/blumisonv2/apps/mobile/src/experimental/roomAvatar25d/` (experiment, read-only).

## 1. Summary, fixed decisions, open questions

The new 2.5D avatar (WebGPU rig, girl and boy), the calibrated 2.5D room, layered furniture and the editor become the only system. The old layered-PNG avatar (`avatarV2`), the old room paths, the old clothing and furniture items, their art, their catalog entries and their tests are removed. Lists and small avatars use baked still pictures; a live canvas is reserved for the hero of the focused screen. The server keeps drawing the push picture and the Discover room picture, from a build-time art pack instead of old mobile art. Stored old item IDs are ignored by code, never by a schema change. One exception by the owner's choice (F15): the onboarding, boot and loading character sprites stay as they are and are replaced last, in Phase 6.

### 1.1 Fixed decisions (do not reopen)

| # | Decision | Date | Source |
|---|---|---|---|
| F1 | The new system is THE system. Old avatar, room, clothes, furniture are deleted from code, art and catalog | 2026-10-10 | prompt §3, §4 |
| F2 | Old user avatar, room and item data need not be preserved (beta). Waives "migrate without loss" and "hide, don't delete" for this migration only | 2026-10-10 | prompt §4; CONFIRMED by the owner in the lead chat 2026-10-10 (Q1). Recorded with its date in `AGENTS.md` in the first commit (1.1) |
| F3 | Everyone starts fresh: female → girl starter, male → boy starter outfit + hair, everyone → default 2.5D room | 2026-10-10 | prompt §4 |
| F4 | Full beta reset runs LAST as a reviewed ops script with a dry run (coins to starter amount; chats, messages, matches deleted; accounts, profiles, body kept). Pre-approved | 2026-10-10 | prompt §4 |
| F5 | Old entitlement, loadout and room ROWS stay in the database and are ignored; old IDs are never reused | 2026-10-10 | prompt §4 |
| F6 | OTA is removed; every release is a TestFlight build | 2026-10-10 (first decided 2026-10-08 on the experiment) | RESUME |
| F7 | The six develop commits 3b288243..e5bcb2ed (OTP and abuse defence) stay intact | 2026-10-10 | RESUME |
| F8 | Only the three girl starter wearables `avatar_v2_top_coral_wave_polo`, `avatar_v2_bottom_coral_wave_pants`, `avatar_v2_hair_ink_pageboy_star` become FREE `ownedByDefault`; their receipts are REMOVED in the commit that changes them (a removal, never a new receipt). `room_v2_chair_blush` stays as it is (published, price 0, receipt untouched); see review finding R1 (§11.1): its receipt binds the old flat art, so its art switch needs a decision | 2026-10-10 | lead (delegated by the owner), revised ~16:45 |
| F9 | Every user gets ONE free starter bed with a NEW canonical ID (`room_v3_bed_blumi_starter`), and the default room contains ONLY that bed. The bed gets its own design from the furniture pipeline in Phase 4, shown to the owner; no stand-in bed | 2026-10-10 | lead chat (~15:42, ~16:45) |
| F10 | Economy balance (prices, coin packs, earn rates) is its own workstream (§12); no paid item gets a receipt before the owner approves that proposal | 2026-10-10 | lead chat |
| F11 | Boy: 6 starter outfits (2, 3, 4, 12, 13, 14), each piece its own item, all free; 2 free basic combos; 3 hairs + 9 colour variants; plus the old designs `male_blue_black_short_curls` and `male_short_twists_textured_style` redrawn as NEW items with NEW IDs, in the same production lane (old #4 `male_soft_textured_crop` not picked). Girl: starter + feminine free basics (concepts need approval) + five NEW hairs redrawn from the old #1 `berry_velvet_soft_updo`, #2 `caramel_braided_crown`, #3 `cherry_ribbon_twin_braids`, #11 `rosewood_butterfly_layers`, #13 `mocha_ribbon_blowout`. Old IDs are never reused | 2026-10-10 | prompt §2b; owner picks ~16:25, ~16:45 |
| F12 | Old visuals must be replaced everywhere they exist, including non-source files | 2026-10-10 | lead chat, `NON_SOURCE_SWEEP.md` |
| F13 | The room camera angle, the shell `room_v2_shell_blumi_world_v1` and the characters' drawn look are the owner's; code never draws a character | standing | `AGENTS.md` |
| F14 | All 27 `room_v3_*` Japon and Oyun furniture items are **User approved** (2026-10-10, "hepsi iyi"; small bugs reported later). They are no longer locked for approval; their prices come from the economy proposal (§12); receipts only with the owner | 2026-10-10 | lead chat ~16:45 |
| F15 | Onboarding, boot and loading character sprites (`S/features/session/assets`) are NOT touched now. They move to the very end (Phase 6, after Phase 5's other work), stay out of every deletion commit, and are the one known remaining old visual until done | 2026-10-10 | lead chat ~16:50 |
| F16 | Boy default look: outfit 2 (navy knit polo, cream pleated trousers, tan loafers) + `avatar_v2_hair_male_soft_black_side_part`; the 3 base hairs free, the 9 colour variants held until §12 | 2026-10-10 | lead decision, owner OK ~16:50 |
| F17 | No dance pose: the dance trigger is removed, tap-on-avatar keeps the wave | 2026-10-10 | lead decision, owner OK ~16:50 |
| F18 | No forced-update screen; cutover order is new build available → server deploy → reset, the same day; old builds unsupported | 2026-10-10 | lead decision, owner OK ~16:50 |
| F19 | The economy proposal (§12) is reviewed after Phase 3. The experiment's `AGENTS.md` "Subagent strategy" hunk is not ported. Girl basics and the boy outfit 14 plain-white-tee edit arrive as follow-up ports | 2026-10-10 | lead decisions, owner OK ~16:50 |

Still needs the owner's explicit yes at the time: push (his "push at"), `main`, EAS/TestFlight (every release is a TestFlight build now, F6), the Railway deploy, any schema migration (next number **074**; this plan needs none), any real-database write other than the pre-approved reset, any receipt, any visible change to the drawn look. Local working commits on `feat/avatar-2.5d-world` are allowed (2026-10-10).

### 1.2 Owner questions

All eleven questions of the first draft are decided (2026-10-10). The one question this review opened is R1 (§11.1).

| # | Question | Decision (2026-10-10) | Blocks |
|---|---|---|---|
| Q1 | Confirm the §4 waiver in the lead chat and allow working commits on the branch | **Decided:** waiver CONFIRMED by the owner in the lead chat; local working commits ALLOWED; no push without "push at". `AGENTS.md` records the waiver and its date in commit 1.1 (F2) | — |
| Q2 | Which bed fills the free starter bed slot until the new design exists? | **Decided:** none. No stand-in bed. `room_v3_bed_blumi_starter` gets its own design from the furniture pipeline in Phase 4 (4.7) and is shown to the owner; until then the default room is the empty shell (F9) | Phase 4 bed design |
| Q3 | Default room contents | **Decided:** shell + the free starter bed ONLY. Not the armchair, not the sofa (F9) | Phase 2 `RoomSetup` (empty shell until 4.7) |
| Q4 | Onboarding, boot and loading characters (second chibi art system) | **Decided:** not touched now; done LAST in Phase 6 (F15). The recommended method there stays the re-bake from the approved rigs with the same timings, before/after shown to the owner (§2.6) | Phase 6 only |
| Q5 | Boy default outfit, and are the 3 base hairs free? | **Decided:** outfit 2 + `avatar_v2_hair_male_soft_black_side_part`; the 3 base hairs free; the 9 colour variants held until §12 (F16) | Phase 4 |
| Q6 | Old TestFlight builds after the cutover | **Decided:** no forced-update screen; new build available → server deploy → reset, same day (F18) | Phase 5 |
| Q7 | Furniture approval (26 unapproved items in the draft) | **Superseded:** all 27 `room_v3_*` are User approved (F14). They port with the room; until §12 sets their prices they sit in a `pricing-pending` held scope (§5.2, §5.3) | §12 for visibility |
| Q8 | The 2.5D rig has no dance pose | **Decided:** remove the dance trigger; tap keeps the wave (F17) | — |
| Q9 | Girl basics concepts; boy outfit 14 plain-tee edit | **Decided:** follow-up ports (F19); girl basics concepts still go to the owner first | not blocking |
| Q10 | Economy proposal (§12) | **Decided:** reviewed after Phase 3 (F19) | any paid receipt; furniture visibility |
| Q11 | `AGENTS.md` "Subagent strategy" section from the experiment tree | **Decided:** not ported (F19) | — |

## 2. Target architecture

### 2.1 Module home and port method (H)

| New home | Contents | Comes from |
|---|---|---|
| `S/features/avatar/renderer/` | `Avatar25Canvas.tsx`, `avatar25Gpu.ts`, `avatar25Pose.ts`, `avatar25Motion.ts`, `avatar25Life.ts`, `avatar25Astc.ts`, `avatar25SeatedLegs.ts`, `avatar25Placement.ts`, `avatar25Assets.ts`, `rigTypes.ts`, their tests | `X/` |
| `S/features/avatar/rigs/girl/`, `rigs/boy/` | `rig25.json`, page PNGs, `rigAssets.ts`, `astc/` | `X/rig`, `X/rig_male` (byte for byte, checksummed) |
| `S/features/avatar/stills/` | generated: `layers/**.webp`, `stillAssets.ts` (require table) | new (`tools/avatar25d/bake-stills.mjs`) |
| `S/features/avatar/model/` | `resolveAvatarDraw.ts` (total resolver, from `resolveRoomAvatar25d.ts`), `avatarItemArt.ts` (canonical ID → rig item per body), `avatarLiveBudget.ts`, `avatarRoomContract.ts` (types from `roomAvatar25dContract.ts`) | `X/`, new |
| `S/features/avatar/components/` | `AvatarLive.tsx` (from `RoomAvatar25dBody.tsx`), `AvatarStill.tsx`, `AvatarPortrait.tsx`, `AvatarHero.tsx` | `X/`, new |
| `S/features/avatar/state/`, `wardrobe/` | provider, API, selection, equip/save, wardrobe UI: MOVED from `S/features/avatarV2/` with their logic and tests | old, kept |
| `S/features/roomV2/calibration/`, `roomV2/furniture/` | calibration JSON + maths, layered furniture loader, catalog, asset tables, 28 item folders | `X/calibration`, `X/furniture` |
| `S/features/roomV2/`, `miniRoom/`, `roomWorld/` | keep their names while the experiment diffs are applied; one mechanical `roomV2 → room` rename commit in Phase 5 | old + experiment diffs |
| `D/avatar/` | new catalog, `avatarLoadoutCoercion.ts`, `avatarStills.ts` + `avatarStillManifest.json` | new |
| `D/legacy/legacyItemIds.json` | every old ID, frozen (§5.4) | new |
| `tools/avatar25d/` | `export_rig.py`, `compress_pages.py`, `test_export_rig.py`, `bake-stills.mjs` | `~/blumisonv2/tools/room-avatar-lab/bake25/`, new |
| `apps/server/scripts/build-art-pack.mjs` → `apps/server/dist/art/` | still layers, shell, furniture layers, hash manifest, bundled room draw-list resolver | replaces `build-avatar-portrait-layers.mjs` |

Names carry no version number (`avatar`, `room`); item and shell IDs keep their `avatar_v2_`, `room_v2_`, `room_v3_` prefixes for good (IDs are opaque).

Port method:

1. **Freeze.** After Step A is verified, the lead takes one snapshot of `~/blumisonv2`: `git diff --binary HEAD` to a patch, a tar of the untracked files that are ported (not `tools/room-avatar-lab/native`, not the website concepts), and a sha256 list, all in `~/BlumiArtWorkbench/archive/`. Approved art is compared with `APPROVED_GIRL_*.sha256` (re-issued by Step A) and `APPROVED_BOY_BASE_*.sha256`. Later experiment changes arrive as small follow-up ports from a new snapshot, never from the live tree.
2. **Seam first, collapse after.** The experiment calls shared code through `roomAvatar25d.<hook>` (a Metro-routed module with a stub). The port replaces that indirection with a plain module `S/features/avatar/roomAvatarSeam.ts` that exports the same object with `enabled: true` and direct imports. The experiment's tracked diffs then apply almost verbatim (`git apply --3way --include=<paths>` per group). Later commits delete the dead old branches surface by surface and inline the seam until it disappears. This keeps every commit green and keeps transcription risk low.
3. **Node tests.** `avatar25Gpu.ts` and `Avatar25Canvas.tsx` import `react-native-webgpu`; pure modules (`avatar25Pose`, resolver, calibration, furniture, stills) must never import them, so Node tests load without the Metro alias. The two editor tests that import `@blumi/room-avatar-25d` switch to direct imports.
4. **Dev-only code is dropped at the snapshot boundary** (§3.6), not ported and deleted.

Rejected: keeping `src/experimental/` and the flag (two systems forever); renaming `roomV2` before the port (the experiment diffs would not apply); a new workspace package for the art (Metro bundling of images from another package is an avoidable risk).

### 2.2 Portrait pipeline (A)

**What the rig really is (checked in `X/rigTypes.ts`, `X/rig/rig25.json`, `X/avatar25Pose.ts`).** A view holds one textured triangle mesh (about 5,500 vertices for the girl's body) with positions in sheet pixels at the standing rest pose, UVs into packed texture pages, and named ranges with a fractional painter's `order` (far arm 0, far leg 1, near leg 2, torso 3, head 4, near arm 5). Each item has its own mesh whose parts sit between body parts (top: 0.45 / 3.45 / 5.45; bottom 1.3 / 2.3 / 3.3; shoes 1.15 / 2.15; hair 4.6). Wearing a bottom or shoes replaces the body's leg ranges with a `legVariant` drawing owned by the item (`bottom`, `shoes`, `bottom+shoes`). `avatar25Pose.compileAvatar` is pure TypeScript and already produces the exact painter-ordered draw list for the stand pose.

**So the lead's hypothesis (2) holds, with three corrections:**

- Stand-pose layers are NOT plain placed quads. They are triangle meshes drawn from packed pages, so a still needs a software rasteriser. Once baked they are plain images on one canvas.
- The body is not one layer: an item's parts interleave with five body bands, and the leg band depends on what is worn. A still is "sort by `order`", with up to about 12 images for a full body and about 8 for a bust.
- The baker must reuse `compileAvatar` and the pose code (Node + esbuild + `sharp`), not re-implement ordering in Python, or the still and the live frame will drift.

| Option | Verdict | Why |
|---|---|---|
| (1) On-device WebGPU offscreen render + readback to a cached file | Rejected as the pipeline; kept as a possible later optimisation | Needs GPU start-up before any list shows a face, readback and PNG encoding in JS, a file cache with invalidation, and still gives the server nothing. Unproven in this app |
| **(2) Offline-baked per-item stand layers, composited as images on the client and by the server compositor** | **Chosen** | No GPU, no upload, no IDs, deterministic, same picture on both sides, same architecture as today's `RoomAvatarStill` and `avatarPortrait.ts`. Frame 0 of the live idle equals the still, so still → live swaps are seamless |
| (3) Pre-baked picture per item combination | Rejected | Multiplicative (the boy alone: 8 tops × 8 bottoms × 8 shoes × 12 hairs). Only a flat picture for each default starter loadout is worth baking, as an optional speed-up |
| (4) Client-uploaded portraits | Rejected | A modified client could put any image into other people's notifications (photo sharing is out of scope), needs storage per user, goes stale across devices |

**Baker** (`tools/avatar25d/bake-stills.mjs`, run by hand after any rig export, output committed): for each body, front view, unmirrored, pose `stand` at time 0 (eyes open, breath 0), 2× supersampled, premultiplied alpha.

| Product | Content | Used by |
|---|---|---|
| `full` | one WebP (lossless) per (owner, order) at sheet resolution, tightly cropped, rect in the manifest; leg variants per leg key | hero stills, half-body crops |
| `bust` | the same layers inside a 256 px head-and-shoulders window, only the non-empty ones | tiny/small/medium portraits, the server push picture |
| `thumb` | the item alone, cropped to its pixels, max 256 px | Shop, Wardrobe, checkout cards |
| `sprites` | named pose frames for onboarding (stand, wave, walk cycle), girl and boy in starter outfits (§2.6) | onboarding, boot |
| `D/avatar/avatarStillManifest.json` | per body: canvas, ground line, crop windows (`bust`, `half`, `full`) derived from the joints, layer list `{key, owner, slot, order, seq, rect, legKey}`, `rigSha256`, `bakerVersion` | client and server resolver |

`D/avatar/avatarStills.ts` (pure): `resolveAvatarStillLayers(loadout, product) → ordered layer keys + crop`. It coerces the loadout first (§2.4), so it is total. Mirroring is a flag (client `scaleX: -1`, server `flop`). Back view is never baked (portraits face front).

| Size class | Points | Component | Source |
|---|---|---|---|
| tiny | ≤ 40 | `AvatarPortrait` (circle, person's swatch colour behind) | `bust`, face-tight crop |
| small | 41–60 | `AvatarPortrait` | `bust` |
| medium | 61–130 | `AvatarPortrait` up to 85 pt; `AvatarStill half` above | `bust` / `full` |
| hero | > 130 | `AvatarHero`: `AvatarStill full` first, cross-fades to a live canvas when the live budget grants one | `full` + live |

Cache keys and invalidation: client key `bakerVersion|body|hair|top|bottom|shoes|product|mirror` → memoised layer list (equal looks share it); the layers are bundled assets, so there is no file cache to purge. A loadout change is a new key. Server key: sha256(renderer version, background, layer keys, size), LRU 8 MiB as today. Guard: one test fails when `manifest.rigSha256` differs from the committed rig files (a rig changed without a re-bake).

**Live canvas rule** (`avatarLiveBudget`): at most 1 live canvas for the focused screen, 2 in MiniRoom, 0 anywhere else. Main-tab pager pages that are mounted but not shown release theirs and show the identical still. Allowed live: Discover top card front, ProfilePreview/LinkedProfile hero, You hero, AvatarSetup, Wardrobe stage, Shop preview, My Room, room editor, RoomSetup, MiniRoom (2). Always still: every list, header, chip, modal, flight, card behind the top card, card back, onboarding.

| Budget (measure in Phase 5 on a real phone) | Discover | MiniRoom (2 avatars) |
|---|---|---|
| Live canvases | 1 | 2 |
| Rig textures (ASTC; PNG fallback ×4) | ≤ 4 MB (one rig, front view) | ≤ 7 MB (both rigs, both views) |
| Canvas surfaces incl. MSAA (cap the canvas at 2× pixel ratio above 250 pt) | ≤ 16 MB | ≤ 24 MB |
| Decoded still layers | ≤ 24 MB (3 stacked cards) | ≤ 2 MB (chips) |
| Frame rate | 60 fps while swiping; no React render per frame | 60 fps with both walking and the keyboard up |
| Rig JSON (2.2 MB + 1.4 MB) | parsed lazily, off the boot path | same |

### 2.3 Server pictures (B)

Both pictures stay server-rendered with `sharp` behind the existing routes, tokens, caches and tables: no schema change, no API change, no client change for the picture slots.

| Piece | Design |
|---|---|
| Art pack | `apps/server/scripts/build-art-pack.mjs` runs in the server build: copies every file the resolvers can name (bust still layers, shell, furniture layers of ownable items) into `apps/server/dist/art/` with a sha256 manifest, and bundles the pure room draw-list resolver (Phase 2 starts with a spike proving it bundles without React Native; if not, the pure part is extracted first). **The build fails** if a file is missing or a hash differs. At run time the server reads only `dist/art`, never `apps/mobile` |
| Push `senderImage` / link portrait | `SV/avatar/avatarPortrait.ts` v2: `resolveAvatarStillLayers(loadout, "bust")` from `@blumi/domain` → composite over the swatch colour → 192 px PNG < 64 KB. `AVATAR_PORTRAIT_RENDERER_VERSION = "avatar-portrait-v2"`. Links, sealing, TTL, route, privacy tests unchanged |
| Never silently no picture | (1) build-time check above; (2) at start the server renders both default portraits and the default room and logs one error line without IDs if it cannot; the result is visible in the health detail; (3) fallback chain per request: this loadout → that body's starter → a static per-body bust from the art pack. A valid link never returns 404 for an art or catalog reason; (4) a test sends a push for a sender wearing only legacy IDs and expects a picture |
| Discover room picture | `SV/rooms/roomSnapshotRenderer.ts` v2: the bundled resolver turns saved decor into the same draw list the app renders (shell, rug floor layer, shadow, back, front, calibrated rects, depth order) and `sharp` composites it to 600×342 WebP. `ROOM_SNAPSHOT_RENDERER_VERSION = "room-snapshot-v2"`; rows with another renderer version are hidden by code, so no old room picture survives. Unknown or legacy items are skipped, never thrown |
| Logs | error class and counts only; no user, room, item or loadout values |

Rejected: drawing the room on the viewer's phone from decor JSON (needs migration 074 because `blumi_room_showcase_snapshots.mime_type` is CHECKed to `image/webp` with a NOT NULL body, and makes the card back heavy); headless WebGPU on the server (fragile on Railway); keeping `build-avatar-portrait-layers.mjs` pointed at mobile sources at run time (the silent-loss failure the audit found).

### 2.4 Loadout shape and old IDs (C)

No schema migration and no contract change. The stored JSON keeps its exact V1/V2 key set (migration 041 only checks keys and types, never IDs).

| Topic | Design |
|---|---|
| Face slots | Each body has exactly one drawn face. `faceId`, `eyesId`, `noseId`, `mouthId` stay in the shape as fixed per-body constants (the 8 IDs the defaults use today), free, owned by default, hidden from the Wardrobe |
| Coercion (pure, `D/avatar/avatarLoadoutCoercion.ts`) | `coerceAvatarLoadout(raw, hintBodyId)`: body not one of the two → the hint (stored `avatar_preset_id`) or the girl; every slot whose ID is not in the active catalog, is retired, or does not fit the body → that body's starter ID; face slots → the body's constants; `dressId`, `outerwearId` → null; accessories → only active ones (none at launch). Never throws for an ID |
| Server read | `normalizeStoredAvatarSelection` throws only for a broken envelope (not an object, bad revision); everything else goes through coercion; `presetId` is set to the body. Reads never write back; the user's next save stores the coerced loadout with the normal revision check. Callers (all inherit the change, each gets a test): `postgresAuthRepository.ts` `mapAvatarSelection`, `postgresChatRepository.ts`, `postgresMatchRepository.ts` `mapAccountProfile`, `postgresPresenceRepository.ts`, `presence/presenceService.ts`, `chat/chatParticipantIdentity.ts`, `config.ts:767` (account lookup for portraits), `e2e/socialLoopHarness.ts`, `avatarService.ts:94` (re-reads the row after a save; the save itself was already validated strictly) and `cloneCompleteAvatarSelection`. Legacy preset strings (`dusk`, `sunset` in `authService.ts:68`) coerce to the body the profile's gender implies, else the girl |
| Client | The same domain function coerces other people's snapshots and the local cache; the draw resolver is total (the experiment's "return null and fall back to avatarV2" path is gone) |
| Draw-time fallback (review R3) | From Phase 1 to Phase 4 the OLD items are still active in the catalog, so coercion keeps them, but the rigs have no art for them. The draw resolvers (`resolveAvatarDraw`, `resolveAvatarStillLayers`, server portrait) therefore apply a second, draw-only rule: a slot whose ID has no rig art for that body (`avatarItemArt.ts` / still manifest) is drawn as that body's RIG starter piece (girl: coral polo, coral pants, ink pageboy, mint sneakers; boy: his base until outfit 2 and the side part land). This never changes the stored or validated loadout and never affects ownership |
| Starter source | Coercion reads the starters from `DEFAULT_FEMALE_AVATAR_LOADOUT` / `DEFAULT_MALE_AVATAR_LOADOUT`, never from literals. Today's constants are NOT the new starters (girl today: `hair_mocha_ribbon_blowout`, `top_default`, `bottom_default`, `shoes_milk_tea_court_sneakers`), so until X15 coercion targets those old defaults and the draw-time rule above makes them look right; X15 switches both constants to the new starters (the boy's outfit-2 IDs exist only after their follow-up port) |
| Writes | `validateAvatarLoadout` stays strict: a save with an unknown, legacy or unowned ID is refused |
| Order | Commit the tolerant reader FIRST (Phase 1), with tests that feed made-up and retired IDs through account load, chat, Discover and push. The catalog shrinks only in Phase 4 |
| Starters | Girl: `avatar_v2_body_default` + face constants + `hair_ink_pageboy_star`, `top_coral_wave_polo`, `bottom_coral_wave_pants`, `shoes_mint_ribbon_court_sneakers`. Boy: `avatar_v2_body_male_light` + face constants + `hair_male_soft_black_side_part` + outfit 2 (F16) |
| Column default (migration 016, old girl loadout) | Left alone: application code always supplies the loadout, and the old value now coerces to the starter |
| Inventory and room rows | Read projections drop legacy IDs (§5.4); rows are untouched |
| Release audit | `databaseReleaseAudit` counts legacy IDs as "legacy, ignored" instead of "unknown" |

Rejected: changing the contract to drop the face slots (touches contracts, zod schemas in chat and realtime, migration 041's CHECK, old-client projection); rewriting every `avatar_selection` row (a production write that code makes unnecessary); keeping all 232 old IDs in the active catalog (old items would stay wearable).

### 2.5 Compatibility with old builds

The new build needs a native module, so every tester must install it. After the server deploy, an old build receives item IDs it does not know. This plan adds a capability key `avatar_world_25d` (sent by the new client) so the server can count old clients, and deletes the V1/V2 projection branches that only served pre-2.5D clients once the cutover is done. No forced-update screen (F18).

### 2.6 Onboarding, boot and loading characters (F)

**Owner decision (2026-10-10, ~16:50, F15): not now.** The sprite sets in `S/features/session/assets` (runner, arrival, wave, greeting pair, scan frames, profile reaction atlases, the register world hero scene) stay byte-identical and are kept out of every deletion commit until Phase 6, the very last work item. Until then they are the ONE known remaining old visual; every "nothing old remains" check (L15, §10.3, Phase 5 gate) allows exactly the files these surfaces require and nothing else. Files that mix a sprite set with the old avatar renderer are split: the old-renderer part moves in Phase 3 (S28 `OnboardingDoneMoment` uses `MyAvatar`, S34 `RegisterSignInView` and the preview half of S35 `ProfileCharacterReactionStage` use `AvatarPreview2D`), the sprite part waits for Phase 6. Because OTA is gone, Phase 6 ships in its own TestFlight build (owner's yes).

The analysis below is the method for Phase 6.

| Option | Verdict |
|---|---|
| Keep the old sprites | Accepted only as the interim state until Phase 6 (F15); rejected as the end state, because the first thing a user sees would be the retired chibi (F12) |
| Redraw each frame with the image generator | Rejected: 40+ painted frames drift in face and size; this is the method the new system replaced |
| **Re-bake from the approved rigs** | **Recommended**: the still baker renders named pose frames of the approved girl and boy (stand, wave, a walk cycle) into sprite sets; the components keep their sprite-swap mechanism and their approved timings. No new drawing, no GPU at boot |
| Non-character animation | Fallback if the owner dislikes the re-bake: brand mark, world texture and scan beam only |

Needed from the owner: approval of before/after captures (a visible look change); acceptance that the runners walk instead of run (the rig has no run cycle) or a later run cycle; the boy's starter outfit must be fitted first, otherwise he appears in his base tank and shorts. Scene pictures with painted old characters (`register-world-hero`, used by `RegisterCreateView` and `ChatNotificationPermissionCard`) are rebuilt as the existing world texture plus baked stills. The gender twirl in `ProfileCharacterReactionStage` becomes a wave with a small hop (the rig has two views, no turn).

## 3. Master checklist

One row per item. Phase: P1 foundation, P2 room, P3 surfaces, P4 items and catalog, P5 verify, R reset. Status is Open for every row. Surface numbers match `MOBILE_SURFACES_CHECKLIST.md`.

### 3.1 Surfaces (E)

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| S1 | Discover card front | `S/features/demo/SwipeableDiscoverCard.tsx:471` (`CandidateAvatarPreview`) | `AvatarHero`: live on the top card, `AvatarStill full` on the cards behind | P3 | Open |
| S2 | Discover card back | same file `:570` | `AvatarStill half` | P3 | Open |
| S3 | Discover room picture on the card back | `DiscoveryRoomShowcaseSlot` + `SV/rooms/roomSnapshotRenderer.ts` | same slot; server renderer v2 from the art pack | P2 | Open |
| S4 | Empty Discover deck (self) | `S/features/discovery/EmptyDiscoveryDeck.tsx:70`, `S/components/DiscoverCard.tsx:296` | `AvatarStill full` | P3 | Open |
| S5 | Demo Discover view | `S/screens/DemoLobbyView.tsx:110` | as S4; its `miniRoom/assets/runtime` background replaced by the shell art | P3 | Open |
| S6 | Legacy lobby pending-invite strip (initials) | `S/features/lobby/PendingInviteStrip.tsx` | removed with the lobby split | P4 | Open |
| S7 | Match pop-up, self | `S/components/MatchResultModal.tsx:367` | `AvatarStill half` | P3 | Open |
| S8 | Match pop-up, partner | same `:394/:401` | `AvatarStill half`, mirrored to face the user | P3 | Open |
| S9 | Match flight | `S/features/matches/matchChibiFlight.tsx:34` | carries an `AvatarStill full` | P3 | Open |
| S10 | MatchResult screen | `S/screens/MatchResultScreen.tsx:308` | `AvatarStill half` in `AvatarFrame` | P3 | Open |
| S11 | ProfilePreview and LinkedProfile | `S/screens/ProfilePreviewScreen.tsx:305` | `AvatarHero` (live) | P3 | Open |
| S12 | RoomDebrief (dead screen) | `S/screens/RoomDebriefScreen.tsx`, route name, `miniRoom/roomDebriefCopy.ts` | removed | P2 | Open |
| S13 | Inbox row | `S/features/inbox/InboxConversationRow.tsx:86` (`ParticipantAvatar` 56) | `AvatarPortrait` small | P3 | Open |
| S14 | Inbox actions sheet | `InboxConversationActionsSheet.tsx:83` | `AvatarPortrait` small | P3 | Open |
| S15 | Inbox header / empty state | `S/screens/InboxScreen.tsx:455` (`MyAvatar` 80) | `AvatarPortrait` medium | P3 | Open |
| S16 | Chat header | `S/features/chat/thread/ChatThreadHeader.tsx:59` | `AvatarPortrait` small | P3 | Open |
| S17 | Chat empty state | `ChatThreadEmptyState.tsx:102` | `AvatarPortrait` medium | P3 | Open |
| S18 | Room invite card, sender | `S/features/chat/ChatRoomInviteScene.tsx:28` (`RoomInviteAvatar`) | `AvatarPortrait` small | P3 | Open |
| S19 | Room invite card, recipient | same `:29` | `AvatarPortrait` small | P3 | Open |
| S20 | Chat → room door zoom | `S/features/chat/roomDoorFlight.tsx` | kept; re-verified with the new portraits and room | P3 | Open |
| S21 | Notification permission card | `S/features/notifications/ChatNotificationPermissionCard.tsx:32` (requires `session/assets/register-world-hero-v1-runtime` PNG) | scene rebuilt from the world texture + baked stills | P6 (F15) | Open |
| S22 | Incoming invite callout (initials) | `S/components/IncomingInviteCallout.tsx:27` | kept (no old art); verified | P3 | Open |
| S23 | Blocked users row (initials) | `S/features/settings/BlockedUserRow.tsx` | kept (no old art); verified | P3 | Open |
| S24 | Push notification picture | `NotificationService.swift` + `SV/avatar/avatarPortrait.ts` | Swift unchanged; server portrait v2 | P3 | Open |
| S25 | You tab hero | `S/features/profile/OwnProfileHero.tsx:133` (`ProfileChibi`) | `AvatarHero` (live); tap plays the wave | P3 | Open |
| S26 | ProfileEdit header | `S/screens/ProfileEditScreen.tsx:194` | `AvatarStill half` | P3 | Open |
| S27 | My Room top button | `S/features/profile/MyRoomProfileButton.tsx:27` | `AvatarPortrait` tiny | P3 | Open |
| S28 | Onboarding done moment | `S/features/session/OnboardingDoneMoment.tsx:87` | `AvatarStill full` | P3 | Open |
| S29 | AuthEntry world scene | `OnboardingWorldScene.tsx`, `OnboardingWorldHero.tsx`, `OnboardingArrivalCharacter`, `OnboardingRunner` | re-baked sprite sets | P6 (F15) | Open |
| S30 | Brand prelude | `OnboardingBrandPrelude.tsx`, `OnboardingScanStage`, `OnboardingWelcomeHomeScene`, `OnboardingGreetingPair` | re-baked sprite sets | P6 (F15) | Open |
| S31 | Boot / loading screen | `S/ui/BlumiLoadingScreen.tsx:191/259` (`OnboardingScanStage`, `ONBOARDING_SCAN_FRAMES`) | baked stand stills; no GPU at boot | P6 (F15) | Open |
| S32 | Register hero | `S/screens/RegisterCharacterHero.tsx` (`ONBOARDING_HERO_FRAME`, `ONBOARDING_MALE_HERO_FRAME`) | re-baked frame | P6 (F15) | Open |
| S33 | Register world image | `S/features/session/register/RegisterCreateView.tsx:60` (`RegisterWorldHero` PNG) | world texture + baked stills | P6 (F15) | Open |
| S34 | Register sign-in avatar | `S/features/session/register/RegisterSignInView.tsx:96` (`AvatarPreview2D`) | `AvatarStill half` | P3 | Open |
| S35 | ProfileSetup reaction stage | `S/features/session/ProfileCharacterReactionStage.tsx:240` (`AvatarPreview2D`) + reaction atlases (`profile-character-reaction-v4-runtime`) | split: `AvatarPreview2D` → `AvatarStill` in P3; the twirl/collar atlases stay until P6, then a wave sprite with a small hop (review R6) | P3 + P6 | Open |
| S36 | AvatarSetup | `S/screens/AvatarSetupScreen.tsx`, `AvatarSetupStudioStage.tsx` | `AvatarHero` (live); body choice + starter items | P4 | Open |
| S37 | RoomSetup | `S/screens/RoomSetupScreen.tsx:401`, `roomStarterModel.ts`, `useRoomSetupBedDrag.ts` | new room renderer; the step places the free starter bed (F9) once its art lands in 4.7; until then the empty shell | P2, P4 | Open |
| S38 | Wardrobe stage | `WardrobePreviewStage.tsx`, `AvatarTryOnTransition` | `AvatarHero` (live) + try-on cross-fade | P4 | Open |
| S39 | Wardrobe cards | `WardrobeCatalogCard.tsx:72` (shop-thumbnails) | `thumb` stills | P4 | Open |
| S40 | Shop preview panel | `S/features/shop/ShopPreviewPanel.tsx:380/411` | avatar mode `AvatarHero` (live); home mode the new room renderer | P4 | Open |
| S41 | Shop product cards | `ShopProductCard.tsx:151/226` | `thumb` stills, furniture thumbnails | P4 | Open |
| S42 | Shop combination row | `ShopCombinationRow.tsx:271` | `thumb` stills | P4 | Open |
| S43 | Shop checkout sheet | `ShopCheckoutSheet.tsx:294` | `thumb` stills | P4 | Open |
| S44 | Shop purchase flight | `useShopPurchaseFlight.tsx:88` | `thumb` stills | P4 | Open |
| S45 | My Room | `S/screens/MyRoomScreen.tsx:815` | calibrated room, layered furniture, `AvatarLive` | P2 | Open |
| S46 | Room editor stage | `S/features/roomV2/editor/RoomEditorStage.tsx:151` | experiment editor (diamond cells, undo, wall magnet) | P2 | Open |
| S47 | Editor inventory cards | `InventoryCatalogCard.tsx:91` | furniture thumbnails made from the `r0` layers | P2 | Open |
| S48 | Editor drag ghost | `RoomEditorDragGhost.tsx:96` | experiment version (drawn where the piece lands) | P2 | Open |
| S49 | MiniRoom | `S/screens/MiniRoomScreen.tsx`, `miniRoom/scene/*` | per-seat claims, layered seats, one `AvatarLive` per participant with their own rig | P2 | Open |
| S50 | MiniRoom speech and typing bubbles | `AvatarLayer.tsx:435` | kept; anchored to the calibrated figure height | P2 | Open |
| S51 | MiniRoom context chips | `MiniRoomContext.tsx:25` | `AvatarPortrait` tiny | P3 | Open |
| S52 | MiniRoomRigPreview (dev route) | `S/screens/MiniRoomRigPreviewScreen.tsx`, route, dev entry | removed | P2 | Open |
| S53 | HomeStudio (dev/QA route) | `S/screens/HomeStudioScreen.tsx`, `S/features/roomStudio/**` | removed | P2 | Open |
| S54 | Boot asset warm-up | `S/features/performance/CurrentSceneAssetWarmup.tsx`, `sceneAssetWarmupModel.ts`, `discoveryFirstFrameAssets*.ts` | warms rig pages, still layers and furniture layers per scene | P3 | Open |

### 3.2 Mobile module groups, assets, client state

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| G1 | avatarV2 core (31 files) | `S/features/avatarV2/*.ts`, `state/AvatarV2Provider.tsx` | provider, API, selection, equip/save moved to `S/features/avatar/state`; catalogs, capsule definitions, thumbnail presentation replaced by the new catalog + stills | P4 | Open |
| G2 | avatarV2 room renderer (18 files) | `S/features/avatarV2/room/**` (`RoomAvatarRenderer2D`, `RoomAvatarStill`, catalogs, motion atlas) | `S/features/avatar/renderer`, `components`, `stills` | P4 (unused after P3) | Open |
| G3 | avatarV2 components + wardrobe (30 files) | `S/features/avatarV2/components/**`, `wardrobe/**` | `AvatarHero`; wardrobe UI moved to `S/features/avatar/wardrobe`. The glass kit `WardrobeGlass` + `wardrobeV2Styles` is shared UI (imported by `miniRoom/scene/MiniRoomHud.tsx` and five `roomV2/editor/RoomEditor*` files): it moves to `S/ui/` in X17 with those importers updated (review R8) | P4 | Open |
| G4 | Shared avatar widgets (15 files) | `S/ui/participantAvatar.tsx`, `myAvatar.tsx`, `avatar.tsx`, `AvatarFrame.tsx`, `avatarSwatch.ts`, `S/components/DiscoverCard.tsx`, `S/features/chat/*Invite*`, `chatParticipantAvatar.ts`, `matches/match*Flight*`, `profile/ProfileChibi.tsx`, `session/initialProfileAvatar.ts` | edited to use `AvatarPortrait`/`AvatarStill`/`AvatarHero`; initials fallback and swatch kept | P3 | Open |
| G5 | Onboarding sprite code (41 files) | `S/features/session/Onboarding*.tsx`, `*AssetCatalog.ts`, `*AssetGate.ts`, `ProfileCharacterReactionStage.tsx`, `RegisterWorldHero.tsx`, `S/screens/RegisterCharacterHero.tsx` | untouched until P6 except the old-renderer imports (S28, S34, S35 preview); in P6 components and timings kept, sprite catalogs point at re-baked sets, unused gates and QA flags removed | P6 (F15) | Open |
| G6 | Shop (55 files) | `S/features/shop/**` | purchase, inventory and combination logic kept; `shopCatalog.ts`, `shopAssets.ts`, `shopAvatar*`, preview panel repointed to the new catalog, thumbnails and previews | P4 | Open |
| G7 | roomV2 core (72 files) | `S/features/roomV2/**` | kept + experiment diffs; `roomV3*`, `roomVNext*`, `roomV3UniversalCore*` candidates (≈20 files) deleted; seam inlined | P2 | Open |
| G8 | Room editor (33 files) | `S/features/roomV2/editor/**`, `S/screens/MyRoomEditorScreen.tsx` | experiment editor + 6 new files | P2 | Open |
| G9 | roomWorld (9 files) | `S/features/roomWorld/**` | kept + `roomWorldWallInset.ts`, calibrated walk geometry | P2 | Open |
| G10 | roomStudio (13 files, 16 QA bitmaps, 19.6 MB) | `S/features/roomStudio/**`, `homeStudioQaModuleRouting.*`, Metro alias | deleted | P2 | Open |
| G11 | miniRoom (67 files) | `S/features/miniRoom/**` | kept + experiment diffs, `miniRoomLayeredSeats.ts`; old avatar branch removed | P2 | Open |
| G12 | lobby (11 files) | `S/features/lobby/**` | split: `useLobbyFlow`, `lobbyState`, `interactionState`, `lobbyFeedbackCopy`, `pendingInvitesStore` move to `S/features/discovery/`; `PendingInviteStrip`, `useLegacyLobbyInvites`, `useLegacyMiniRoomNavigation`, `publicLobby`, `lobbyInviteAttempt`, `pendingInviteModel` deleted with their `LobbyScreen` branches | P4 | Open |
| G13 | Host screens (23 files) | `S/screens/*` listed in the audit, plus `S/navigation/LinkedProfileScreen.tsx` (`candidateAvatarSnapshot`), `ProfileSetupScreen.tsx` (`avatarV2Catalog`, `avatarStarterModel`), `PreAuthSetupFlowScreen.tsx` and `RegisterScreen.tsx` (`UserAvatar` type) | edited with their surfaces; the type-only imports move in X17, the catalog imports before X15 (review R8) | P2–P4 | Open |
| G14 | Dance state | `roomV2AvatarMotion.ts`, `roomRendererAvatarMotionStyle.ts`, `useRoomRendererLoops.ts`, `MyRoomScreen.tsx` | removed (F17) | P2 | Open |
| G15 | Old avatar art | `S/features/avatarV2/assets/{layers,room,room/motion,room/motion-atlas,shop-thumbnails}` (1,335 files) + 3 data JSON | deleted after the receipts are removed | P4 | Open |
| G16 | Old room art | `S/features/roomV2/assets/runtime` (all but `room_shell_blumi_world_v1.webp`), `roomV2/assets/shop-thumbnails`, `miniRoom/assets/runtime` | deleted; layered furniture folders + new thumbnails | P2 | Open |
| G17 | Onboarding art | `S/features/session/assets/**` (101 files; 55 unused candidates and sources) | NOT in any deletion commit before P6 (F15), including the 55 unused ones; in P6 the unused ones go first (X2), then the 46 used are replaced by re-baked sets | P6 (F15) | Open |
| G18 | Client storage keys | `@blumi/avatar_v2/user_avatar`, `@blumi/room_v2/user_room_decor`, `@blumi/room_v2/migrated*`, `@blumi/inventory/v2`, `local_inventory_v1`, `@blumi/room_studio/qa*` | one storage-epoch bump clears avatar, room and inventory caches on first launch of the new build; QA keys dropped | P4 | Open |
| G19 | Art production scripts | 245 `M/scripts/*.py` (120 tests), ≈30 `M/scripts/*.mjs` (promote, package, render, repair, normalize, universal-core registry), `build-room-motion-atlases.mjs` | deleted (history stays in git) | P4 | Open |
| G20 | Flights | `S/ui/flight/*` | kept | P3 | Open |

### 3.3 Server, domain, contracts

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| V1 | Stored selection normaliser | `SV/avatar/avatarSelectionPersistence.ts` (throws on unknown IDs) | coercion (§2.4) | P1 | Open |
| V2 | Account row mapping (15 call sites) | `SV/db/postgresAuthRepository.ts:1810`, `SV/auth/authRepository.ts` | same code path through coercion; contract tests for both repositories | P1 | Open |
| V3 | Chat participant avatar | `SV/chat/chatParticipantIdentity.ts` | coercion instead of try/catch → undefined | P1 | Open |
| V4 | Presence avatar copies | `SV/presence/*`, `SV/db/postgresPresenceRepository.ts` | covered by V1; verified | P1 | Open |
| V5 | Avatar save | `SV/avatar/avatarService.ts` | unchanged logic; new catalog behind `validateAvatarLoadout` | P4 | Open |
| V6 | Read projection for old clients | `SV/avatar/avatarReadProjection.ts`, `SV/capabilities/capabilityService.ts` | V1 projection removed after the cutover; capability `avatar_world_25d` added | P3 add, P5 remove | Open |
| V7 | Push portrait renderer + build | `SV/avatar/avatarPortrait.ts`, `apps/server/scripts/build-avatar-portrait-layers.mjs` | portrait v2 + `build-art-pack.mjs` (§2.3) | P3 | Open |
| V8 | Portrait links, service, route, push policy, sender resolver | `SV/notifications/notificationPortrait*.ts`, `pushMessagePolicy.ts`, `notificationDeliveryContext.ts`, `SV/routes/notificationPortraitRoutes.ts` | unchanged; fallback chain added in the service | P3 | Open |
| V9 | Default loadouts, new accounts | `D/avatar/avatarLoadoutCatalog.ts` (`DEFAULT_*`), `SV/auth/authStore.ts:268` | new starters (§2.4) | P4 | Open |
| V10 | Allowed preset IDs | `SV/auth/authService.ts:68` | both body IDs kept | P4 | Open |
| V11 | Seed data | `SV/matches/matchRepository.ts:489`, `apps/server/scripts/seedTestPersonas.ts` | follow the new defaults | P4 | Open |
| V12 | Economy catalog and service | `D/economy/economyCatalog.ts`, `SV/economy/economyCatalog.ts`, `economyService.ts` | new entries; `LEGACY_AVATAR_ITEM_REPLACEMENTS` self-heal removed; inventory reads drop legacy IDs | P2 room, P4 avatar | Open |
| V13 | Coin packs, commerce, rewards | `D/economy/coinPacks.ts`, `SV/commerce/*` | unchanged; inputs to §12 | — | Open |
| V14 | Personal room decor | `SV/rooms/personalRoomDecorService.ts` | read drops legacy/unknown items; save also requires each item to be in the active room catalog | P2 | Open |
| V15 | Room showcase | `SV/rooms/roomSnapshotService.ts`, `roomSnapshotRenderer.ts` | renderer v2; old-version rows hidden | P2 | Open |
| V16 | Shared room decor | `SV/miniRooms/miniRoomService.ts`, `miniRoomRepository.ts:191`, `SV/db/postgresMiniRoomRepository.ts:192` | shell literal kept; host decor copied through the V14 projection | P2 | Open |
| V17 | Shared room motion checks | `SV/miniRooms/miniRoomMotionService.ts`, `D/roomWorld/miniRoomFloor.ts` | test: every calibrated walk and seat point is accepted by the server floor rule | P2 | Open |
| V18 | Legacy lobby server code | `SV/rooms/roomService.ts`, presence, `blumi_room_layouts` | left as is (out of scope; retired for clients) | — | Open |
| V19 | Account data export | `SV/account/accountDataExportStream.ts` | still exports the raw rows (the user's data) | P4 verify | Open |
| V20 | Release audit | `SV/operations/databaseReleaseAudit.ts`, `apps/server/scripts/auditDatabaseRelease.ts` | legacy IDs counted as ignored | P4 | Open |
| V21 | Live test account runner | `tools/security/live-test-account-runner.mjs` | shape unchanged; verified | P4 | Open |
| V22 | Loadout catalog, rules, retired set | `D/avatar/avatarLoadoutCatalog.ts`, `avatarLoadoutRules.ts`, `retiredAvatarItems.ts` | new catalog; rules kept; retired set folded into the legacy registry | P4 | Open |
| V23 | Universal core room candidates (45 IDs) | `D/economy/universalCoreRoomEconomy.ts` | deleted; IDs go to the legacy registry | P2 | Open |
| V24 | Room geometry fix | `D/roomWorld/roomWorldGeometry.ts` + test | experiment version (edge touch is not overlap) | P2 | Open |
| V25 | Contracts shapes | `C/avatar/AvatarSelection.ts`, `C/chat/ChatThreadSchemas.ts`, `C/realtime/ServerEventSchemas.ts`, `C/miniRooms/MiniRoom.ts` | unchanged; test fixtures use new IDs | P4 | Open |
| V26 | iOS notification extension | `M/plugins/notificationServiceExtension/NotificationService.swift` | unchanged | P3 verify | Open |

### 3.4 Lock artifacts and guards

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| L1 | Release catalog | `D/release/blumiR1ReleaseCatalog.json` | P2: remove the 5 receipts of the retired room items (the chair receipt is kept; see R1), replace the `room_v3_` hold with a `pricing-pending` scope (§5.3). P4: remove the 83 avatar receipts (80 retired items + the 3 girl starters). Removals only | P2, P4 | Open |
| L2 | Receipt test | `S/features/shop/shopReleaseCatalog.test.ts` | every rule kept, resolvers repointed; passes with only the chair receipt (or none, per R1) and binds any future one. A published item's resolver is never repointed before the commit that retires or re-receipts it (R5) | P2, P4 | Open |
| L3 | Publication manifest | `docs/quality/SHOP_CATALOG_PUBLICATION_2026-09-30.md` | never edited; unreferenced history once no receipt cites it | P4 | Open |
| L4 | Server release tests | `SV/economy/economyCatalog.release.test.ts`, `economyService.production.test.ts` | same intent with new IDs (free default bought-refused, held refused, legacy refused) | P2, P4 | Open |
| L5 | Catalog parity | `S/features/shop/shopCatalogParity.test.ts` | kept against the new catalogs | P4 | Open |
| L6 | Migration ledger | `SV/db/migrationLedger.test.ts`, `apps/server/db/migrations.applied.json` | untouched (no migration in this plan) | — | Open |
| L7 | Launch ledger | `docs/release/LAUNCH_CONTROL.md` | rows updated, column layout kept | P5 | Open |
| L8 | Candidate-path and no-media build guards | `M/app.config.js`, `M/scripts/mobile-release-assets.cjs`, `mobile-no-media.cjs` | unchanged; proven green with `react-native-webgpu` | P1 | Open |
| L9 | Approved art checksums | `APPROVED_GIRL_*.sha256`, `APPROVED_BOY_BASE_*.sha256` (Workbench) | ported files match byte for byte | P1 | Open |
| L10 | Engineering ratchet | `M/scripts/mobile-engineering-rules.test.mjs` | allowlists only shrink | P2 | Open |
| L11 | Worklet closure allowlist | `M/scripts/mobile-worklet-closure.test.mjs` | adds `Float32Array`, `Uint8Array`, `Uint16Array` with the reason in the same commit | P1 | Open |
| L12 | Import boundaries | `M/scripts/mobile-import-boundaries.test.mjs` | roomStudio guard removed with roomStudio; "shared room never reads the personal room" kept | P2 | Open |
| L13 | New guard: stills match rigs | — | manifest `rigSha256` equals the committed rig files | P1 | Open |
| L14 | New guard: legacy IDs never return | — | no active or reserved ID is in `legacyItemIds.json` | P2 | Open |
| L15 | New guard: nothing old remains | — | tree-wide: no import of `experimental/`, `avatarV2/`, `roomStudio/`, no `EXPO_PUBLIC_BLUMI_ROOM_AVATAR_25D*`, no `blumi://dev/avatar-*` link. Until Phase 6 it allows exactly one exception: the `S/features/session/assets` files that the onboarding, boot and register surfaces require (F15); Phase 6 removes the exception | P5, P6 | Open |

### 3.5 Test groups

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| T1 | Avatar runner (39 tests) | `M/scripts/run-avatar-v2-tests.mjs` | renamed `run-avatar-tests.mjs`; renderer, catalog, motion-atlas tests replaced by pose, resolver, stills, coercion tests | P1, P4 | Open |
| T2 | Avatar starter runner (2) | `run-avatar-starter-tests.mjs` | starters per body on the new catalog | P4 | Open |
| T3 | Match and room runner (79) | `run-match-room-tests.mjs` | + the experiment's 13 files with final paths | P2 | Open |
| T4 | Room persistence and hydration (8) | `run-room-persistence-tests.mjs`, `test:room-hydration` | kept; provider test rewritten by behaviour | P2 | Open |
| T5 | Inventory runner (11) | `run-inventory-tests.mjs` | kept; demo-owner fixture dropped; legacy projection test added | P4 | Open |
| T6 | Session runner (29) | `run-session-tests.mjs` | onboarding sprite tests follow the re-baked sets | P3 | Open |
| T7 | Realtime, chat, discovery, connections, navigation runners (21) | `run-*-tests.mjs` | fixtures only | P3 | Open |
| T8 | Inline groups | `test:wardrobe`, `test:shop-preview-assets`, `test:performance-assets`, `test:layout` in `M/package.json` | scripts edited freely once OTA is gone | P2–P4 | Open |
| T9 | Verified source-text pins (7) | `wardrobeCatalogModel.test.ts`, `useInRoomChat.reconnect.test.ts`, `CurrentSceneAssetWarmup.test.mjs`, `roomV2ProviderLifecycle.test.ts`, `CosmeticShopScreen.test.mjs`, `WardrobeV2Screen.test.mjs`, `useRoomEditorInventoryEntries.test.mjs` | behaviour tests with the same intent (§10.2) | with their code | Open |
| T10 | Two-phone e2e | `S/features/miniRoom/miniRoomMotionTwoPhones.e2e.test.ts` | three-way hand merge with develop's hunk | P2 | Open |
| T11 | Server tests using old art or IDs | `avatarPortrait.test.ts`, `roomSnapshot*.test.ts`, `discoverRoomShowcase.test.ts`, economy and adversarial fixtures | same intent, new art pack and IDs | P2–P4 | Open |
| T12 | Domain and contracts tests | `avatarLoadoutRules.test.ts`, `universalCoreRoomEconomy.test.ts`, schema tests | rules kept on the new catalog; universal test replaced by L14 | P2, P4 | Open |
| T13 | 77 tests that only mention avatars or rooms | list in the audit §G2 | re-run; fixtures only | each phase | Open |
| T14 | Python art tests (120) | `M/scripts/test_*.py` | deleted with G19 (not in the npm chain) | P4 | Open |
| T15 | Visual gate | Workbench `vgate/` | adapted to app renders + stills vs live frame 0 | P5 | Open |

### 3.6 Dev-only items that must not ship

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| D1 | Demo furniture ownership and demo starter room | `roomAvatar25dDemoRoom.ts`, its hunks in `inventoryStore.ts`, `RoomV2Provider.tsx`, `MyRoomScreen.tsx`, two tests | not ported; real ownership through the catalog | P2 | Open |
| D2 | Dev deep links | `S/navigation/useRoomAvatar25dDevQaLink.ts` with all six links `blumi://dev/mini-room-qa`, `avatar-body`, `avatar-astc`, `avatar-blink`, `avatar-breath`, `avatar-outfit` (the last three added by Step A), the dev body override in `roomAvatar25dContract.ts` (~line 143), `RootNavigator.tsx` hunks, `env.ts` flag | not ported; L15 also fails on any `blumi://dev/avatar-` or `mini-room-qa` string in `apps/` | P1 | Open |
| D3 | Rig preview QA route | `MiniRoomRigPreviewScreen.tsx`, `CAN_REGISTER_MINI_ROOM_RIG_PREVIEW`, dev entry | removed | P2 | Open |
| D4 | Flag routing | `roomAvatar25dModule.ts`, `roomAvatar25dStub.ts`, `M/scripts/roomAvatar25dModuleRouting.*`, `roomAvatarLabModuleRouting.*`, `metro.config.js` aliases, `index.js` `@blumi/app-root` | not ported | P1 | Open |
| D5 | Spike root | `X/Avatar25SpikeRoot.tsx` | not ported | P1 | Open |
| D6 | Dev flags | `..._ROOM_AVATAR_25D`, `_SPIKE`, `_DEMO_OUTFIT`, `_AVATAR25_ASTC`, `_ROOM_CALIBRATION`, `_ROOM_AVATAR_LAB` | removed; ASTC is a code constant (on, PNG fallback) | P1 | Open |
| D7 | ASTC, life and outfit dev switches | dev override in `avatar25Astc.ts`, blink/breath QA holds in `avatar25Life.ts`, the bare/default outfit override | removed at the snapshot boundary; if one is kept it is behind `__DEV__` with no deep link and no setter reachable from release code | P1 | Open |
| D8 | Uncalibrated fallbacks | fields in `layeredFurnitureCatalog.ts`, `layeredFurniture.ts` | removed | P2 | Open |
| D9 | Old lab and unrelated files | `tools/room-avatar-lab/{native,guides,*.js,build*.py}`, `tools/website-screen-concepts-2026-10-07/` | not ported | P1 | Open |
| D10 | Avatar QA unlock | `S/features/avatarV2/qa/avatarQaInventory.ts`, `EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS`, `start:go` script | removed | P4 | Open |
| D11 | Room QA flags and dev entries | `EXPO_PUBLIC_BLUMI_HOME_STUDIO_*`, `ROOM_V3_DRAFT_PREVIEW`, `ROOM_VNEXT_*`, `UNIVERSAL_CORE_QA`, `FOCUS_12_QA`, `DEV_ENTRY_ROUTE` values `myroom`, `mini-room-rig-preview`, `home-studio-pilot`, `S/features/dev/blumiDevEntryPolicy.ts` | removed; `productionPolicy.forbiddenRuntimeFlags` in the release JSON trimmed in the same commit | P2 | Open |
| D12 | Onboarding QA flags | `PROFILE_CHARACTER_REACTION_QA`, `ONBOARDING_RUN_V3_QA` | removed with the sprite work | P6 (F15) | Open |
| D13 | Stale notes in ported data | `status` and note fields in `item.json` (the sofa still says "NOT owner-approved") | stripped by the port | P2 | Open |

### 3.7 OTA, documents, non-source files

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| O1 | OTA runtime | `expo-updates` in `M/package.json`, `runtimeVersion` and `updates` in `M/app.json`, channels in `M/eas.json`, `M/App.tsx` hook, `S/features/appUpdates/*`, OTA label in `SettingsScreen.tsx` | removed (experiment port, reconciled with develop's newer `package.json` and `app.json`); lockfile regenerated | P1 | Open |
| O2 | OTA workflows | `.github/workflows/develop-ota-publish.yml`, `M/.eas/workflows/develop-preview-update.yml`, OTA jobs in `testflight.yml`, `preview-testflight-build.yml`; `testflight-after-asc-upload.yml` checked in review: no OTA step | removed or simplified | P1 | Open |
| O3 | OTA guards | `M/scripts/mobile-ota-asset-budget.test.mjs`, `mobile-release-channels.test.mjs`, entries in `run-avatar-v2-tests.mjs`, `run-navigation-tests.mjs`, `.railway/railway.test.ts` | budget test retired with the reason (no EAS Update, so no 1,000-asset cap); channel test becomes "no OTA is configured" | P1 | Open |
| O4 | OTA documents | `docs/release/OTA_AND_TESTFLIGHT.md`, `docs/quality/OTA_ASSET_BUDGET_2026-10-02.md`, `docs/quality/ENGINEERING_RULES.md` | first rewritten for TestFlight-only; second left as a dated snapshot; third updated | P1 | Open |
| O5 | `AGENTS.md` | Strict "conventions" fingerprint rule, OTA facts, "071 next", avatar/room facts, asset count | P1: dated waiver, OTA removal, script rule dropped, "074 next". P5: avatar and room facts rewritten for the new system | P1, P5 | Open |
| O6 | `README.md:29` | "chibi characters" blurb | updated text | P5 | Open |
| O7 | Images outside `src` | `M/assets/**` (11 PNG), `.github/assets/blumi-cover.svg` | no old art (swept); delete the unused `home-liquid-background.png` v1 after an import check | P5 | Open |
| O8 | Dated docs (26 in `docs/quality/`) | snapshots that mention old art | left as snapshots | — | Open |
| O9 | Session inventory backlog | `docs/quality/SESSION_INVENTORY_2026-10-01.md` VIS-01..13 | closed or carried over in a short note in `LAUNCH_CONTROL.md` | P5 | Open |
| O10 | Whole-repo sweep | — | Phase 5 gate: grep for old IDs, paths and flags + an image sweep of every tracked image (§10.3) | P5 | Open |
| O11 | Beta reset | — | ops script (§9) | R | Open |
| O12 | Economy balance | — | proposal (§12) | after P3 | Open |

### 3.8 Art production lanes and late work (owner, 2026-10-10)

| # | What | Old file(s) | New replacement | Phase | Status |
|---|---|---|---|---|---|
| A1 | Boy outfits 2, 3, 4, 12, 13, 14 (18 pieces) + 2 basics | Workbench `male/outfits2`, `male/outfits3` | factory fit → rig export → stills → catalog (§5.5); outfit 2 first (boy default, F16); outfit 14 after the plain-white-tee edit | P4 follow-ups | Open |
| A2 | Boy hairs: 3 approved + 9 colour variants + 2 redrawn old designs (`male_blue_black_short_curls`, `male_short_twists_textured_style`) | Workbench `male/phase5`, `male/recolor`, `boy_hair_refs/originals/` | same lane as A1; the 2 redrawn hairs get NEW IDs (§5.1) | P4 follow-ups | Open |
| A3 | Girl hairs: 5 redrawn old designs (#1, #2, #3, #11, #13) | Workbench `girl_hair_refs/originals/` | NEW IDs (§5.1); blocked on the girl's factory stages e–h | P4 follow-ups | Open |
| A4 | Girl basics (2 combos) | — | concepts to the owner first (F19) | P4 follow-ups | Open |
| A5 | Free starter bed `room_v3_bed_blumi_starter` | — | own design from the furniture pipeline, shown to the owner, then layered art + `ownedByDefault` + default room (F9) | P4 (4.7) | Open |
| A6 | Onboarding, boot and loading characters | `S/features/session/assets/**` | Phase 6 (F15, §2.6) | P6 | Open |

## 4. Port map

From the frozen snapshot of `~/blumisonv2` (90 tracked files changed, `src/experimental` 287 files, exporter 3 files) to this branch. Per-file detail is in `integration/phase0/PORT_MAP.md`; this table gives the destination and the method.

| Group (experiment) | Files | Destination | Method | Phase |
|---|---|---|---|---|
| Renderer (`X/Avatar25Canvas.tsx`, `RoomAvatar25dBody.tsx`, `avatar25*.ts`, `rigTypes.ts`, `resolveRoomAvatar25d.ts`, 4 tests) | ≈17 | `S/features/avatar/{renderer,components,model}` | move; strip flag, stub and demo-outfit code; resolver made total | P1 |
| Rigs (`X/rig`, `X/rig_male`) | 20 | `S/features/avatar/rigs/{girl,boy}` | copy byte for byte, verify checksums | P1 |
| Exporter (`tools/room-avatar-lab/bake25/*`) | 3 | `tools/avatar25d/` | copy; default `--out` paths updated | P1 |
| Contract (`roomAvatar25dContract.ts`) | 1 | `S/features/avatar/model/avatarRoomContract.ts` | move, types only | P1 |
| Calibration (`X/calibration/*`) | 7 | `S/features/roomV2/calibration/` | move; `room_calibration.json` verbatim | P2 |
| Furniture code + 28 item folders (`X/furniture/*`) | 11 + 229 | `S/features/roomV2/furniture/` | move; uncalibrated fallbacks and stale `item.json` notes removed; IDs untouched | P2 |
| Renderer hooks in shared code (`avatarRoom.types.ts`, `avatarRoomSelectors.ts`, `RoomRendererAvatarBody.tsx`, `RoomRenderer2D.tsx`, tap-target models, `MyRoomStageVeil.tsx`, `MyRoomScreen.tsx`) | 8 | same paths | `git apply --3way` onto the seam, then rewrite by hand: `RoomRenderer2D.tsx` (+170/−56) and `MyRoomScreen.tsx` (+119/−18) are read line by line; demo lines dropped | P2 |
| Room model and calibration hooks (`roomV2Selectors.ts`, `roomWorldRoomV2Projection.ts`, `roomV2.types.ts`, `roomV2Catalog.ts`, `roomV2RenderSurface.ts`, `roomV2PlacementSurface.ts`, `roomV2FloorGrid.ts`, `roomV2ExactRotation.ts`, `roomV2EditorSession.ts`, `myRoomCopy.ts`, `shopScreenModel.ts`, `roomWorldWallInset.ts`) | 12 | same paths | apply; calibration called directly; catalog source becomes the new items | P2 |
| Editor (15 changed + 6 new + 3 new tests + `MyRoomEditorScreen.tsx`) | 25 | same paths | apply; flags removed | P2 |
| MiniRoom (9 changed + `miniRoomLayeredSeats.ts` + test) | 11 | same paths | apply; `AvatarLayer.tsx` and `miniRoomSceneStore.ts` by hand | P2 |
| Pager first-tap workaround (`useBottomNavChrome.ts`, `mainTabPagerController.ts`, `MainTabPager.tsx`, model test) | 4 | same paths | apply after re-checking on develop | P2 |
| Domain (`roomWorldGeometry.ts` + test) | 2 | same paths | apply | P2 |
| Tests in runners (`run-match-room-tests.mjs` +36) | 1 | same path | rewritten with final paths | P2 |
| OTA removal (≈20 files) | ≈20 | same paths | re-done on develop's files (O1–O4) | P1 |
| Not ported | — | — | D1–D9, `AGENTS.md` hunk, `package-lock.json` (regenerated), `provider/inventory` demo hunks | — |

Conflicts with the six develop commits (only four files overlap):

| File | Resolution |
|---|---|
| `M/package.json` | Take develop's file (app-check, app-integrity, expo-crypto, bumped Expo packages). Remove `expo-updates` (drop develop's bump). Add `react-native-webgpu ^0.13.0` |
| `M/app.json` | Take develop's (app-check plugin, App Attest entitlement). Remove only `runtimeVersion` and `updates` |
| `package-lock.json` | Never merged. Regenerate with `npm install` after `package.json` is final; confirm the no-media guard and that no OTP dependency moved |
| `S/features/miniRoom/miniRoomMotionTwoPhones.e2e.test.ts` | Three-way hand merge around line 533: keep develop's "wait for authoritative room entry", add the experiment's seat cases |

Nothing under `apps/server/src/auth`, `tools/firebase-sms-defense/` or the OTP routes is touched by this plan. Server edits are limited to `avatar/`, `rooms/`, `miniRooms/` decor copy, `economy/`, `operations/databaseReleaseAudit.ts`, capability keys and scripts.

## 5. Catalog plan (D)

One canonical ID per item through Shop → Purchase → Inventory → Wardrobe → Avatar → Room → MiniRoom. The server decides ownership. An item enters the catalog in the same commit as its art (rig item + stills), so nothing wearable is ever undrawable.

### 5.1 Avatar items

| ID | Slot | Body | Price | State at launch |
|---|---|---|---|---|
| `avatar_v2_body_default`, `avatar_v2_body_male_light` | body | — | free default | active (kept) |
| `avatar_v2_face_default`, `avatar_v2_eyes_mocha_doe`, `avatar_v2_nose_soft_button`, `avatar_v2_mouth_peach_whisper_smile` | face parts | girl | free default | active, hidden constants |
| `avatar_v2_face_male_warm_friendly`, `avatar_v2_eyes_male_warm_brown`, `avatar_v2_nose_male_gentle_bridge`, `avatar_v2_mouth_male_soft_smile` | face parts | boy | free default | active, hidden constants |
| `avatar_v2_hair_ink_pageboy_star` | hair | girl | free default (was 460, receipt removed) | active |
| `avatar_v2_top_coral_wave_polo` | top | girl | free default (was 80, receipt removed) | active |
| `avatar_v2_bottom_coral_wave_pants` | bottom | girl | free default (was 440, receipt removed) | active |
| `avatar_v2_shoes_mint_ribbon_court_sneakers` | shoes | girl | free default (already) | active |
| `avatar_v2_hair_male_soft_black_side_part` | hair | boy | free default (already) | active when his hair art lands |
| `avatar_v2_hair_male_ink_soft_tousled`, `avatar_v2_hair_male_ink_fluffy_fringe` | hair | boy | free default (F16) | follow-up port |
| `avatar_v2_hair_male_blue_black_curls`, `avatar_v2_hair_male_textured_twists` (redrawn from the old `male_blue_black_short_curls`, `male_short_twists_textured_style`) | hair | boy | set by §12 | proposed IDs; same lane as the outfits (A2); held `pricing-pending` until §12 |
| `avatar_v2_hair_berry_soft_updo`, `avatar_v2_hair_caramel_crown_braid`, `avatar_v2_hair_cherry_twin_braids_ribbon`, `avatar_v2_hair_rosewood_butterfly_cut`, `avatar_v2_hair_mocha_ribbon_waves` (redrawn from old #1, #2, #3, #11, #13) | hair | girl | set by §12 | proposed IDs; follow-up ports after the girl's factory stages e–h (A3); held `pricing-pending` until §12 |
| 9 hair colour variants (`..._walnut_`, `_chestnut_`, pastel × `soft_tousled`, `neat_side_part`, `fluffy_fringe`; exact IDs in `male/recolor/VARIANT_IDS.md`) | hair | boy | set by §12 | reserved, held |
| Outfit 2: `avatar_v2_top_male_navy_knit_polo`, `avatar_v2_bottom_male_cream_pleated_trousers`, `avatar_v2_shoes_male_tan_loafers` | top/bottom/shoes | boy | free default | proposed IDs; boy default (F16); fitted first in the A1 lane |
| Outfit 3: `avatar_v2_top_male_olive_overshirt`, `avatar_v2_bottom_male_dark_straight_jeans`, `avatar_v2_shoes_male_sand_desert_boots` | | boy | free default | proposed IDs; follow-up port |
| Outfit 4: `avatar_v2_top_male_forest_collar_sweater`, `avatar_v2_bottom_male_charcoal_trousers`, `avatar_v2_shoes_male_brown_loafers` | | boy | free default | proposed IDs; follow-up port |
| Outfit 12: `avatar_v2_top_male_black_embroidered_sweatshirt`, `avatar_v2_bottom_male_cream_drawstring_trousers`, `avatar_v2_shoes_male_cream_chunky_sneakers` | | boy | free default | proposed IDs; follow-up port |
| Outfit 13: `avatar_v2_top_male_taupe_waffle_blouson`, `avatar_v2_bottom_male_ecru_wide_trousers`, `avatar_v2_shoes_male_dark_leather_sneakers` | | boy | free default | proposed IDs; follow-up port |
| Outfit 14: `avatar_v2_top_male_check_flannel_white_tee`, `avatar_v2_bottom_male_grey_wide_jeans`, `avatar_v2_shoes_male_green_skate_shoes` | | boy | free default | proposed IDs; follow-up port |
| Boy basics: `avatar_v2_top_male_white_basic_tee`, `avatar_v2_top_male_black_basic_tee`, `avatar_v2_bottom_male_black_straight_trousers`, `avatar_v2_shoes_male_white_clean_sneakers`, `avatar_v2_shoes_male_black_clean_sneakers` | | boy | free default | proposed IDs; follow-up port |
| Girl basics: `avatar_v2_top_white_cute_crop_top`, `avatar_v2_top_black_cute_crop_top`, `avatar_v2_bottom_black_highwaist_trousers`, `avatar_v2_shoes_white_clean_sneakers` | | girl | free default | proposed IDs; concepts need approval, follow-up port (F19) |

"Proposed IDs" follow the existing naming and were chosen to avoid every old ID (the seven new hair IDs and `room_v3_bed_blumi_starter` have zero hits in the repo and in `OLD_ITEM_ID_CATALOG.md`, checked 2026-10-10); the registering commit proves it with guard L14. The old hair IDs they are drawn from (`avatar_v2_hair_berry_velvet_soft_updo`, `..._caramel_braided_crown`, `..._cherry_ribbon_twin_braids`, `..._rosewood_butterfly_layers`, `..._mocha_ribbon_blowout`, `avatar_v2_hair_male_blue_black_short_curls`, `..._male_short_twists_textured_style`) go into the legacy registry like every other old ID. The IDs in `male/phase5/ITEM_ID_PLAN.md` for the rejected pastel outfits A/B/C and the 18 outfit recolours are NOT registered.

### 5.2 Furniture and room

| ID | State at launch | Notes |
|---|---|---|
| `room_v2_shell_blumi_world_v1` | active (kept) | the only shell the server accepts |
| `room_v2_chair_blush` | stays published, price 0, receipt untouched (F8) | NOT in the default room. Its receipt binds the OLD flat art (`roomV2/assets/runtime/furniture_world_chair_v1.png` + its Shop thumbnail), so it cannot switch to its layered folder without a decision: see R1 (§11.1). Until R1 is decided X8 keeps those two files and the chair is excluded from the old-art deletion |
| `room_v3_sofa_japon_cream` | User approved, `pricing-pending` | like the other 26 (F14); NOT in the default room |
| `room_v3_bed_blumi_starter` | reserved, no art, not owned by anyone | the free starter bed (F9). Its own design is made with the furniture pipeline in Phase 4 (4.7) and shown to the owner. It becomes `ownedByDefault` in the commit that adds its art; the inventory self-heal then grants it to everyone on their next read. It is the ONLY item of the default room. Rooms that already exist get it only when their decor reads empty (all legacy) and the client rebuilds the default room |
| 26 other `room_v3_*` (12 Japon, 14 Oyun; list in `furniture/ROOM_SYSTEM_HANDOFF.md` §2) | User approved (F14), `pricing-pending` | art in the repo; economy entries with placeholder prices inside the `pricing-pending` held scope, so the server refuses purchase and placement and Shop and editor hide them. After §12: one commit per batch sets the final price, removes the batch from the hold, and adds the thumbnail. The production projection (`resolveR1PublishedEconomyCatalog`) keeps only `ownedByDefault` items and items with a receipt, so even a price-0 Shop item needs an owner receipt; free without a receipt means `ownedByDefault` (everyone owns it) |
| 7 connector items, recolour variants | not in the repo | built after the integration |

Default room: created on the client as today (`roomStarterModel.ts`), saved with `expectedRevision` 0 or the kept row's revision; contents: the starter bed only (F9) on a fixed calibrated cell; the empty shell until the bed's art lands in 4.7. New category `storage` ("Dolap") is a client label only; the server stores no category.

### 5.3 Release catalog edits (`blumiR1ReleaseCatalog.json`)

| When | Edit | Why it is allowed |
|---|---|---|
| P2 | Remove the 5 receipts of the retired room items (`room_v2_table_round`, `_lamp_heart`, `_cute_bookshelf`, `_heart_rug`, `_side_table`). The `room_v2_chair_blush` receipt stays untouched (F8, R1) | removal, in the commit that retires those items (X8) |
| P2 | Scope `room-v3-shell-and-furniture-candidates` (`^(?:universal_|room_v3_)`, `^room_v2_(?:qa_|candidate_)`) → a `pricing-pending` scope `^room_v3_(?!bed_blumi_starter$)`; the `room_v2_(qa_|candidate_)` pattern moves to the dev/QA scope | the 27 approved pieces wait for prices, not approval (F14); `universal_*` become legacy IDs; the starter bed is `ownedByDefault` and never held |
| P2 | Trim `forbiddenRuntimeFlags` to the flags that still exist | D11 |
| P4 | Remove the 83 avatar receipts, including the three girl starters | removal (F8 + F1); `publishedItems` then holds only `room_v2_chair_blush` (or nothing, per R1) |
| P4 | Remove the `female-wardrobe-promotion-hold` scope; extend `pricing-pending` to the 9 boy hair colour variants and the 7 redrawn hairs as they land | its item is legacy; these wait for §12 |
| after §12 | Each priced batch leaves `pricing-pending`; a paid or price-0 Shop item gets an owner-approved receipt binding its new runtime bytes | owner only |
| later | Any paid item | only with an owner-approved receipt that binds its new runtime bytes |

### 5.4 Legacy registry and tolerant reads

| Piece | Rule |
|---|---|
| `D/legacy/legacyItemIds.json` | frozen list of 226 IDs: the 216 old catalog IDs marked "retire" in `OLD_ITEM_ID_CATALOG.md` (165 avatar, 6 `room_v2_*`, 45 `universal_*`) plus the 10 replacement-only legacy IDs. Replaces `RETIRED_AVATAR_ITEM_IDS` and `LEGACY_AVATAR_ITEM_REPLACEMENTS`. The room part lands in P2, the avatar part in P4 |
| Never reused | guard L14: no active or reserved ID is in the registry |
| Loadout read | coercion (§2.4) |
| Inventory read | owned arrays are filtered to active IDs in the response; rows untouched; `ownedByDefault` self-heal keeps granting new starters |
| Room decor read | placed items with a legacy, unknown or unowned ID are dropped in the response; an empty result makes the client build the default room; the stored revision is returned so the next save succeeds |
| Purchase, equip, place | refused for legacy, reserved and unknown IDs |
| Release audit | legacy IDs reported as a separate "ignored" count, exit code 0 |

### 5.5 How an item arrives later (boy outfits, hairs, basics, approved furniture)

One commit per batch: (1) new snapshot of the art; (2) rig re-export (`tools/avatar25d/export_rig.py`) and ASTC; (3) `bake-stills.mjs`; (4) `avatarItemArt.ts` entry; (5) domain catalog + economy entry (`ownedByDefault` for free starters); (6) tests green, vgate for that body. Nothing else changes, because every surface reads the catalog and the manifest.

## 6. Deletion list in commit order (G)

Each line is one commit (one purpose). "Needs" names what must already be merged so typecheck and tests stay green.

| # | Commit | Deletes | Needs |
|---|---|---|---|
| X1 | `chore: remove OTA updates` | O1–O4 | — |
| X2 | `chore: drop unused onboarding candidate art` (moved to Phase 6, F15: no `session/assets` file is deleted before then) | 55 unrequired files under `S/features/session/assets/*-candidate`, `*-source`, `runners-v4..v9` | Phase 6 start |
| X3 | `refactor: remove the dead RoomDebrief screen` | S12 | — |
| X4 | `refactor: remove Home Studio QA` | G10, S53, Metro alias, routing scripts, boundary-test rule, QA flags | — |
| X5 | `refactor: remove the rig preview QA route and dev entries` | S52, D3, D11 | experiment MiniRoom port (its tests no longer need the route) |
| X6 | `refactor: remove Room V3 / VNext / universal-core candidates` | ≈20 `roomV3*`, `roomVNext*` files, `D/economy/universalCoreRoomEconomy.ts`, their scripts | legacy registry (room part), L14 |
| X7 | `feat(server): ignore legacy items in stored room decor` | — (tolerance) | — |
| X8 | `refactor: retire the old furniture items` | 6 old room economy entries (all but the chair, incl. the old free `room_v2_cozy_bed`), 5 room receipts (the chair receipt and the two files it binds stay until R1 is decided), old entries in `roomV2Catalog.ts`, `roomV2ProductionAssets.ts` (shell kept), `roomV2/assets/runtime` furniture, `roomV2/assets/shop-thumbnails`, flat-sprite branches in `RoomRenderer2D.tsx`, server snapshot v1 table | X7, new furniture + thumbnails, snapshot renderer v2, default room, `RoomSetup` rework |
| X9 | `refactor: remove the dance state` | G14 | F17 |
| X10 | `refactor: inline the room avatar seam` | old avatar branch in `RoomRendererAvatarBody.tsx`, `AvatarLayer.tsx`, `miniRoomAvatarMotion.ts`, `enabled` checks | P2 gate |
| X11 | `refactor: switch portraits to AvatarPortrait` etc. (P3 surface commits) | per-surface use of `RoomAvatarStill`, `RoomAvatarRenderer2D`, `AvatarPreview2D`, `ProfileChibi` | P1 components |
| X12 | `feat(server): portrait v2` | `build-avatar-portrait-layers.mjs`, old `avatarPortrait` drawing code and its art-bound test | art pack |
| X13 | `refactor: replace onboarding sprites` (Phase 6, F15) | old runner, arrival, wave, reaction sets, scan frames, register world hero and their gates | Phase 5 done, owner approval of before/after captures, boy starter outfit |
| X14 | `feat: legacy registry, avatar part` | — (additive) | — |
| X15 | `refactor: new avatar catalog and starters` (atomic across domain, mobile, server) | 165 old loadout entries, old economy entries, 83 receipts, `retiredAvatarItems.ts`, legacy replacement self-heal, `avatarV2Catalog.ts`, capsule definition files, `shopAssets.ts` avatar thumbnails, old fixtures | X14, Wardrobe/Shop/AvatarSetup already on `AvatarHero` and `thumb` stills, tolerant reader (P1), first boy outfit or the bare-base fallback |
| X16 | `refactor: delete the avatarV2 renderer and art` | G2, G15, motion atlas builder, old renderer tests (replaced in P1/P3) | X15 (no receipt binds the art any more) |
| X17 | `refactor: move avatar state and wardrobe to features/avatar` | the rest of `S/features/avatarV2/` (moves); the shared glass kit to `S/ui/`; every importer outside avatarV2 updated (R8) | X16 |
| X18 | `chore: delete old art production scripts` | G19 | X16 |
| X19 | `refactor: split the retired lobby from Discover` | G12, S6 | — |
| X20 | `refactor: client storage epoch` | G18 keys | X15 |
| X21 | `refactor: rename roomV2 to room` | — (mechanical move) | P4 reviewer gate |
| X22 | `refactor: drop pre-2.5D client projections` | V6 old branches, obsolete capability keys | cutover done |

Source-text tests are replaced inside the commit that changes their code (§10.2). A test is never deleted without its replacement in the same commit. No commit before Phase 6 deletes or edits a file under `S/features/session/assets` (F15).

## 7. Asset count

Counted with the retired budget test's own logic (distinct `require()`d image and font files under `S/`).

| Group | Before (distinct bundled) | After, launch catalog | After, full planned catalog |
|---|---|---|---|
| Old avatar layers, room layers, motion frames, atlases, item thumbnails | 767 | 0 | 0 |
| Old room runtime + room thumbnails + mini-room backgrounds | 29 | 1 (shell) | 1 |
| Home Studio QA bitmaps | 16 | 0 | 0 |
| Onboarding and reaction sprites | 42 | 42 (unchanged until Phase 6, F15) | ≈30 after Phase 6 (re-baked sets) |
| Session scene art | 4 | 4 (until Phase 6) | 3 |
| Brand, fonts, UI | 11 | 11 (10 if the unused v1 background goes) | 11 |
| Rig pages (PNG) + ASTC blobs | 0 | 12 | ≈40 (pages grow with items) |
| Layered furniture (28 folders) | 0 | 201 | 201 + connectors |
| Furniture thumbnails | 0 | 28 | 28+ |
| Avatar stills (`full`, `bust`, `thumb`) | 0 | ≈65 (2 bodies, ≈10 items) | ≈215 (≈44 items) |
| **Total distinct** | **869** | **≈363** | **≈530** |
| Test estimate (+60 package allowance) | 929 of 950 allowed | ≈423 | ≈590 |
| Old-system files on disk | 1,481 (≈66 MB) | 101 (`session/assets`, until Phase 6) + the 2 chair receipt files while R1 is open | 0 |

The 1,000-asset limit belonged to EAS Update and disappears with OTA (F6); the App Store build has no comparable per-file cap. The count is still reported in Phase 5 (and after Phase 6) by running the old scan once as a script, and it stays well under 1,000 in every column, so turning OTA back on later would not hit the cap. Note the scan only sees literal relative `require()` calls: the ported rig, furniture and still tables must keep literal requires (Metro needs them anyway) or the count is wrong. Review R9 recommends replacing the retired budget test with a bundled-bytes ratchet instead of nothing. App size: about −43 MB of old art, +18 MB rigs and furniture, +≈5 MB stills.

## 8. Phase plan

After every phase a separate fresh reviewer (Opus) compares §3, this section and the real diff. A phase closes only when the reviewer finds nothing; then the statuses in §3 are updated. Local working commits are allowed (owner, 2026-10-10, Q1): commit early and often; nothing is pushed without "push at".

### Phase 1: foundation

| # | Commit |
|---|---|
| 1.1 | `docs: record the 2.5D migration waiver and plan` (this file; the §4 waiver with its date 2026-10-10 and "confirmed by the owner in the lead chat" in `AGENTS.md`; the experiment's "Subagent strategy" hunk is NOT ported) |
| 1.2 | `chore: remove OTA updates` (X1; `AGENTS.md` script rule and OTA facts; "074 next") |
| 1.3 | `chore: add react-native-webgpu` (dependency, regenerated lockfile, L11) |
| 1.4 | `feat: add the 2.5D avatar renderer and rigs` (final home, tests in `run-avatar-tests.mjs`, checksums verified) |
| 1.5 | `chore: add the rig exporter tools` |
| 1.6 | `fix: read stored avatars with unknown item IDs` (V1–V4, domain coercion, tests) |
| 1.7 | `feat: bake avatar stills from the rigs` (baker, manifest, layers, L13) |
| 1.8 | `feat: avatar still, portrait and hero components with a live-canvas budget` |

Gate: `npm run typecheck`, `npm test`, release-config and release-infra checks green; ported art equals the approved checksums; a still and the live frame 0 match in the Simulator for girl and boy (zoomed, on the floor colour); the OTP test suites untouched and green.
Reviewer checks: nothing from D4–D9 arrived; no pure module imports `react-native-webgpu`; no flag or env read remains; the tolerant reader cannot throw for any ID and never writes; the six develop commits are byte-identical outside the four merged files.

### Phase 2: room

| # | Commit |
|---|---|
| 2.1 | `feat: room calibration and layered furniture` (code, art, seam) |
| 2.2 | `feat(domain): register the 2.5D furniture IDs` (27 approved `room_v3_*` in the `pricing-pending` scope, reserved `room_v3_bed_blumi_starter`, legacy registry room part, L14; the chair and its receipt untouched, R1) |
| 2.3 | `feat: draw My Room with the calibrated room and the 2.5D avatar` |
| 2.4 | `feat: room editor on the calibrated grid` (old room items keep their old thumbnails and flat sprites until X8, R5) |
| 2.5 | `feat: shared room with per-seat sitting and both rigs` (incl. T10) |
| 2.6 | `fix: first tap after switching from Discover to My Room` |
| 2.7 | `feat: default room and room setup step` (S37; empty shell until the starter bed lands in 4.7, F9) |
| 2.8 | `feat(server): ignore legacy items in stored room decor and inventory` (X7, V14, V16, plus the room part of the §5.4 inventory read projection, so X8 cannot surface an unknown owned ID) |
| 2.9 | `feat(server): room showcase renderer v2 from the art pack` (V15, S3) |
| 2.10 | `refactor: retire the old furniture items` (X8) |
| 2.11–2.15 | X3, X4, X5, X6, X9, then X10 |

Gate: typecheck; `test:match-room`, `test:room-persistence`, `test:room-hydration`, `test:theme`, `test:navigation`, domain and server suites; Simulator: My Room, editor (drag from tray, rotate, undo, wall pieces), sit on sofa and armchair front and back for girl and boy, MiniRoom two phones on the memory server, default room for a new and an existing account, Discover room picture.
Reviewer checks: no flat-sprite or demo-ownership path left; every placed item is checked against ownership AND the active catalog on save; held IDs cannot be bought, placed or seen; the calibration JSON equals the Workbench file; server walk checks accept calibrated points (V17).

### Phase 3: surfaces

| # | Commit |
|---|---|
| 3.1 | `feat(server): push and link portrait from the 2.5D avatar` (V7, V8, S24, fallback chain, capability key) |
| 3.2 | `refactor: chat, inbox and invite avatars use AvatarPortrait` (S13–S19, S27, S51) |
| 3.3 | `refactor: Discover cards use the 2.5D avatar` (S1, S2, S4, S5, S54) |
| 3.4 | `refactor: match moment uses the 2.5D avatar` (S7–S10) |
| 3.5 | `refactor: profile screens use the 2.5D avatar` (S11, S25, S26, S28, S34, S35) |
| 3.6 | moved to Phase 6 (F15). Phase 3 only moves the old-renderer parts of S28, S34 and S35 |
| 3.7 | verification-only notes for S20, S22, S23, V26 |

Gate: every S-row of P3 passes the Simulator walkthrough for a girl and a boy account; inbox scroll and Discover swipe hold 60 fps in a release-mode Simulator run (phone numbers come in P5); a push sent on the memory server carries a picture for a sender with legacy IDs.
Reviewer checks: no surface outside the allowed list mounts a canvas; no import of `RoomAvatarStill`, `RoomAvatarRenderer2D`, `AvatarPreview2D`, `CandidateAvatarPreview`'s old renderer remains outside files queued for P4; no user, room or item value in any new log line.

### Phase 4: items and catalog

| # | Commit |
|---|---|
| 4.1 | `refactor: Wardrobe, Shop and avatar setup preview with the 2.5D avatar` (S36, S38–S44; items without stills, i.e. every old item, keep their old thumbnail resolver until X15, so the receipt drift test stays green, R5) |
| 4.2 | X14 `feat: legacy item registry (avatar part)` |
| 4.3 | X15 `refactor: new avatar catalog and starters` (lock artifacts L1–L5 in the same commit) |
| 4.4 | X16, X17, X18 |
| 4.5 | X19 lobby split; X20 storage epoch; D10 |
| 4.6 | follow-up ports (§5.5) as their art is approved: boy outfits (outfit 2 first), boy hairs (3 + 9 colours + 2 redrawn), girl hairs (5 redrawn), boy and girl basics (§3.8 A1–A4) |
| 4.7 | `feat: free starter bed` (A5): design with the furniture pipeline, owner sees it, then layered art, thumbnail, `ownedByDefault`, default room and RoomSetup place it |

Gate: `npm run verify`; `npm run verify:postgres` (as `pgtest` in the cloud container); the release audit run against a disposable database seeded with old IDs exits 0 and reports them as ignored; a new girl, a new boy and an existing account with an old loadout, old inventory and old room all open every screen.
Reviewer checks: `publishedItems` holds at most the untouched chair receipt (R1) and no receipt was added; no legacy ID in any active list; every catalog item has rig art and stills; `SHOP_CATALOG_PUBLICATION_2026-09-30.md` unchanged; purchase and ownership rules unchanged in behaviour (money tests still cover refusal, double spend, idempotent rewards).

### Phase 5: verify and ship

| Step | Content |
|---|---|
| 5.1 | X21 rename; `AGENTS.md` avatar/room facts; `README.md`; `LAUNCH_CONTROL.md`; `ENGINEERING_RULES.md` |
| 5.2 | Guard L15 and the whole-repo sweep (§10.3), with the single F15 exception for the onboarding sprites |
| 5.3 | Visual gate (T15) with re-captured goldens for every body × outfit |
| 5.4 | Memory and frame rate on a phone: Discover, MiniRoom with a girl and a boy (budgets in §2.2) |
| 5.5 | Full walkthrough matrix (§10.4) as a screenshot table |
| 5.6 | Owner: yes for `main`, the TestFlight build, the Railway deploy; then his phone check |
| 5.7 | Beta reset (§9), then the Turkish report with counts only |
| 5.8 | X22 after the cutover |

### Phase 6: onboarding, boot and loading characters (last, F15)

| Step | Content |
|---|---|
| 6.1 | X2: drop the 55 unused candidate and source files in `session/assets` |
| 6.2 | Re-bake the sprite sets from the approved rigs (girl and boy in their starter outfits; §2.6), same timings; before/after captures to the owner (a visible look change) |
| 6.3 | X13 + S21, S29–S33, the atlas half of S35, G5, G17, D12 |
| 6.4 | L15 loses its exception; the sweep (§10.3) runs again with no exception |
| 6.5 | Owner: yes for the TestFlight build that ships it (no OTA) |

## 9. Beta reset script

`apps/server/scripts/betaReset.ts`, started through one npm script of the server workspace. It is an ops script, not a migration (the migration ledger rejects data writes). It runs LAST, after Phase 5.6, and is reviewed by the phase reviewer and a database reviewer before it runs.

| Rule | Detail |
|---|---|
| Default mode | dry run: prints counts, changes nothing |
| Execute | needs `--execute` and a typed confirmation phrase; prints the database HOST only and asks the operator to confirm it; never prints the URL or any ID |
| Atomic | one transaction, the migration advisory lock, `SET LOCAL lock_timeout` and `statement_timeout`; any assertion failure rolls back |
| Hard stops | account or profile count changes; a table outside the list would be touched; `blumi_store_transactions` or `blumi_economy_iap_ledger` has rows (real money: stop and ask the owner) |
| Backup | before `--execute`, a data-only `pg_dump` (PostgreSQL 17 client, owner's Mac) of exactly the tables below, unless the owner skips it (he declined the mandatory restore proof; the dump stays cheap insurance) |

Delete order (children first; "no FK" means the script must delete explicitly):

| # | Table | Action | FK note |
|---|---|---|---|
| 1 | `blumi_chat_delivery_outbox` | delete all | → `blumi_chat_messages` CASCADE |
| 2 | `blumi_chat_message_edit_audit` | delete all | no FK |
| 3 | `blumi_chat_messages` | delete all | → `blumi_chat_threads` CASCADE |
| 4 | `blumi_chat_thread_participants` | delete all | → `blumi_chat_threads` CASCADE |
| 5 | `blumi_chat_threads` | delete all | no FK to accounts |
| 6 | `blumi_active_mini_room_participants` | delete all | → `blumi_mini_rooms` CASCADE |
| 7 | `blumi_media_revocations` | delete all | no FK |
| 8 | `blumi_connection_decisions`, `blumi_connection_matches` | delete all | no FK (keyed by mini room) |
| 9 | `blumi_mini_rooms` | delete all | references `blumi_mini_room_invites`, so it goes first |
| 10 | `blumi_mini_room_invites` | delete all | no FK |
| 11 | `blumi_matches`, `blumi_discovery_decisions`, `blumi_reactions` | delete all | no FK |
| 12 | `blumi_discovery_snapshot_candidates`, `blumi_discovery_snapshots` | delete all | candidates → snapshots CASCADE |
| 13 | `blumi_discovery_decision_quotas` | delete all (usage counters) | no FK |
| 14 | `blumi_push_delivery_outbox`, `blumi_push_delivery_audit`, `blumi_push_receipts` | delete all (no stale notifications about deleted chats) | no FK |
| 15 | `blumi_notification_policy_events`, `blumi_notification_policy_audit` | delete all (dedupe keys of deleted things) | no FK |
| 16 | `blumi_realtime_payload_refs`, `blumi_room_presence` | delete all; `blumi_realtime_payload_budget.used_bytes` → 0 | TTL data |
| 17 | `blumi_economy_inventories` | `UPDATE` `coins` = `STARTER_COIN_BALANCE` (1250 today, or the §12 value), `coin_debt` = 0; owned arrays untouched | → accounts CASCADE |

Kept untouched: `blumi_accounts` (profile, body, `avatar_selection`, onboarding flags), sessions, every OTP, SMS, deletion, recovery and Firebase table, `blumi_safety_blocks`, `blumi_safety_reports`, `blumi_moderation_phone_bans`, `blumi_notification_preferences`, `blumi_push_devices`, `blumi_chat_privacy_preferences`, `blumi_referral_invites`, `blumi_discovery_watches`, `blumi_discovery_quota_overrides`, `blumi_economy_reward_ledger`, `blumi_store_*`, `blumi_economy_iap_ledger`, `blumi_personal_room_decor`, `blumi_room_showcase_snapshots`, `blumi_admin_user_audit`, `blumi_test_personas`, `blumi_migrations`, config tables, and (review R10) `blumi_discover_profiles` (seed display rows), `blumi_room_layouts` (legacy lobby, V18), `blumi_realtime_tickets` and `blumi_realtime_connection_leases` (short-lived session data), `blumi_shared_rate_budgets` (abuse budgets of the OTP defence, F7). The script reads the live table list from `information_schema` and stops if a table it names is missing or an unlisted table appears; `blumi_chat_privacy_preferences` and the hide-for-me columns come from the optional migrations 070/071, which are not in `migrations.applied.json`, so their absence is allowed. Old loadouts, inventories and rooms stay as rows and are ignored by code (§5.4).

Dry-run output shape (counts only):

```
host: <db host>           accounts: N (must stay N)
table                               rows_now   will_delete   will_update
blumi_chat_messages                    ...        ...            0
...
blumi_economy_inventories              ...         0            ...   (coins -> 1250)
money tables (must be 0 to continue): store_transactions=0 iap_ledger=0
legacy data left in place: loadouts_with_legacy_ids=..., inventories_with_legacy_ids=..., rooms_with_legacy_items=...
```

Reversibility: deletions and the coin update can be restored only from the dump (Supabase Free has no point-in-time recovery). Nothing about avatars, items or rooms is written, so that part is fully reversible by code. Known side effect: the reward ledger stays, so a daily reward already claimed today is not claimable again that day.

Before the reset can be called done: a test on the memory server proves that a phone holding cached chats, matches and invites recovers when the server has none (empty inbox, no stuck outbox). If it does not, a server-sent data epoch that clears those caches is added first.

## 10. Risks and test plan

### 10.1 Risks, ranked

| # | Risk | Mitigation |
|---|---|---|
| 1 | An account with old IDs fails to load once the catalog shrinks (500 on login, chat, Discover, push) | Tolerant reader in Phase 1, tested through every read path, before any catalog change; Phase 4 gate with a database seeded with old data |
| 2 | Still pictures differ from the live avatar (tears, halos, wrong order, leg variants), or drift after a rig change | Baker reuses `compileAvatar`; guard L13; property test "still order equals live order" for every catalog combination per slot; zoomed visual gate still vs live frame 0 |
| 3 | WebGPU on real phones: memory, frame rate, GPU loss in background, Simulator-only proof for the boy, many canvases | Live budget (1, or 2 in MiniRoom), stills everywhere else, canvas size cap, pause when unfocused, PNG fallback; Phase 5 phone measurements before TestFlight |
| 4 | Lock artifacts: a red receipt test tempts someone to weaken it, or a receipt is added without the owner | Removals only, in the same commit as the item change; the test keeps every rule; reviewer checks `publishedItems` and the manifest file hash |
| 5 | Boy art is late (long-sleeve seams, outfits, hairs not in the rig yet) | Catalog accepts items in small ports (§5.5); if needed the boy ships on the branch in his approved base; the TestFlight gate stays closed until his starter outfit and hair pass the visual gate |
| 6 | Server pictures silently missing after deploy (Railway file layout unverified) | Art pack inside the server build output, build fails on a missing file, start-up self-check, fallback chain |
| 7 | Hand merges of the 1,100-line `RoomRenderer2D.tsx`, `MyRoomScreen.tsx`, `AvatarLayer.tsx`, `miniRoomSceneStore.ts` drop a behaviour | Seam-first port, three-way apply, experiment tests ported with their source, two-phone e2e, reviewer diff against the snapshot |
| 8 | Old TestFlight builds against the new server | F18 order of cutover; capability key to count them |
| 9 | Beta reset on the only database, no point-in-time recovery | Script rails in §9, dry run, dump, runs last |
| 10 | Rig pages grow with the catalog (each page ≈3.4 MB of GPU memory per view with ASTC) | Exporter packs pages per item group; confirm the renderer uploads only the pages of worn items (its texture cache is keyed by the page list); measure when the boy catalog lands |
| 11 | Onboarding re-bake does not match the approved choreography (walk instead of run, no twirl); until Phase 6 new users see the old chibi in onboarding next to the new avatar elsewhere (F15) | Phase 6 is last and gets its own TestFlight build; show the owner before/after; non-character fallback |
| 12 | All 27 approved furniture pieces wait for §12 prices, so a launch before §12 has a room with only the starter bed (and the chair) | `pricing-pending` scope keeps them refused and hidden; §12 is reviewed after Phase 3, well before Phase 5.6; the TestFlight gate checks that §12 is decided or that the owner accepts a bed-only launch |
| 13 | Lost first tap after mount and the pager desync are only worked around | Carried as an open issue; cheaper first mount is future work |
| 14 | Editing `M/package.json` scripts before OTA removal lands would change the native fingerprint | OTA removal is commit 1.2; script edits come after |

### 10.2 Behaviour tests to add, and guards to retire or replace

| Add (behaviour) | Covers |
|---|---|
| Coercion: any string in any slot, wrong body, retired, legacy, dress/outerwear set → a wearable starter look; envelope errors still throw | V1–V4 |
| Account load, chat thread, Discover deck, presence, push sender each succeed for a stored loadout full of legacy IDs (memory + Postgres contract suite) | risk 1 |
| Save refuses legacy, reserved, unknown and unowned IDs; purchase refuses them | ownership rule |
| Still resolver: order equals `compileAvatar` stand order; leg variant follows the worn set; mirror flag; every item in `avatarItemArt.ts` has `full`, `bust`, `thumb` (iterating the art map, not the economy catalog, which still holds the 165 old items until X15; after X15 a second assertion requires every active avatar catalog item to be in the art map) (R4) | A |
| Live budget: an unfocused pager page and a second screen get stills; MiniRoom gets two; release on blur | A |
| Portrait v2: 192 px PNG under 64 KB, deterministic, cache within budget, picture for legacy loadouts, fallback when a layer file is missing, no IDs in logs | B |
| Art pack: build fails on a missing or changed file | B |
| Room snapshot v2: non-empty WebP for the default room; legacy items skipped; old-version rows hidden | B |
| Room decor: read drops legacy items and keeps the revision; save needs ownership and the active catalog; shared room copies the projected decor | V14, V16 |
| Inventory read hides legacy IDs and still grants new defaults; coins unchanged | §5.4 |
| Default room and starters for a new girl, a new boy, and an existing account | F3 |
| Reset script on a disposable database: counts match the dry run, accounts unchanged, money tables stop it | §9 |

| Retire or replace | Reason |
|---|---|
| `mobile-ota-asset-budget.test.mjs` | EAS Update is gone; the cap no longer exists (retired with the reason in commit 1.2) |
| `mobile-release-channels.test.mjs` | rewritten to assert no OTA configuration |
| `roomAvatarMotionAtlas.test.ts`, atlas and capsule asset tests | their code and art are deleted; L13 keeps the "baked art equals its source" intent |
| `avatarPortrait.test.ts` (asserts old layer order and mobile paths) | replaced by the portrait v2 tests above |
| `economyService.production.test.ts`, `economyCatalog.release.test.ts` fixtures | same intent on new IDs |
| `universalCoreRoomEconomy.test.ts` | replaced by L14 and the held-item refusal tests |
| The 7 verified source-text pins (T9) | each replaced by a behaviour test of its first-title intent: try-on stays pending until the server confirms; room chat replays one entry message and reconciles without duplicates; warm-up pauses during a swipe; equal ownership arrays cause no storage work; unverified catalog cards show a neutral state; the tray reacts to hydration and ownership |
| Stub and flag-off assertions in `roomAvatar25d.test.ts`, `rootNavigatorConcerns.test.mjs` hunks | the flag and the QA route no longer exist |

Tests in old directories are read before they are removed (the audit classified most by heuristic); a test that guards a strict rule keeps its intent in the new place.

### 10.3 Visual gate and sweeps (Phase 5)

| Check | Pass condition |
|---|---|
| Workbench `vgate/run_gate.py`, adapted | every pose per body × outfit against re-captured goldens; hole, crack and halo checks |
| Still vs live | `full`, `half`, `bust` composites equal the live frame 0 within tolerance, zoomed 2–4× on the floor colour |
| Old-code grep | no `avatarV2`, `roomStudio`, `experimental/`, `RoomAvatarRenderer2D`, `RoomAvatarStill`, `EXPO_PUBLIC_BLUMI_ROOM_AVATAR_25D`, `universal_` in `apps/` and `packages/` outside the legacy registry and dated docs |
| Old-ID grep | every ID in `legacyItemIds.json` appears nowhere else in `apps/` and `packages/` except test fixtures that test refusal |
| Image sweep | every tracked image is opened and classified; none shows the old chibi, old room or old items (covers `M/assets`, `.github/assets`, `S/**/assets`). Until Phase 6 the only allowed exception is the list of `S/features/session/assets` files that onboarding, boot and register require (F15); while R1 is open, also the two chair receipt files |
| Dev-only sweep | none of D1–D13 exists; no `*candidate/` import; no Workbench path in app code |

### 10.4 Simulator walkthrough matrix

Each cell is a screenshot with pass/fail. Columns: girl new account, boy new account, girl existing beta account (old loadout, old inventory, old room), boy existing beta account.

| Row group | Screens |
|---|---|
| First run | boot/loading, AuthEntry intro, Register (create, sign-in), ProfileSetup, AvatarSetup, RoomSetup, done moment (until Phase 6 the boot, intro, register and reaction sprites are expected to be the old ones, F15; the cell checks they are unchanged and that the new avatar appears everywhere else) |
| Discover | deck (top card live, cards behind still), card back with room picture, empty deck, match pop-up and flight, MatchResult |
| Chat | inbox list, actions sheet, thread header, empty thread, room invite cards, door zoom, notification permission card, push banner on the lock screen |
| Profile | You, ProfileEdit, ProfilePreview, LinkedProfile, Settings blocked list |
| Items | Wardrobe (try-on, save, locked preview), Shop avatar and home modes, checkout sheet, purchase flight |
| Rooms | My Room (walk, tap wave, sit front and back on sofa and armchair), editor (place, rotate, undo, wall piece, save), MiniRoom girl + boy (both seats of one sofa, chat, leave) |
| Accessibility | Reduce Motion on, Reduce Transparency on, VoiceOver labels on the new components |

Native visual checks run on the owner's Mac or phone; until then their status stays Open.

## 11. Audit corrections and spot checks

Verified against the worktree (correct as stated): `postgresAuthRepository.ts` `mapAvatarSelection` calls the throwing normaliser (line 1814); highest migration is 073, two `032` files, no `044`, 71 applied entries without 070/071; shell ID constants at `personalRoomDecorService.ts:17`, `miniRoomRepository.ts:191`, `postgresMiniRoomRepository.ts:192`; `RoomDebriefScreen` has no importer; 25 root routes; budget test constants 1000/50/60; `avatarPortrait.ts` window and version constants; the portrait build script bundles a mobile module; `roomSnapshotRenderer.ts` has 7 hard-coded items; the ledger test forbids data writes; `economyService.production.test.ts` uses the six named old IDs; lobby modules are imported by six Discover/Lobby files; the three girl starters and the chair are published, the mint sneakers are not; `STARTER_COIN_BALANCE` is 1250.

| # | Finding |
|---|---|
| 1 | `AGENTS.md` says the next migration is 071. It is 074 |
| 2 | The mobile inventory says 11 verified source-text pins; its table marks 7. The other 4 are unidentified, so old-directory tests are read before removal |
| 3 | `PORT_MAP.md` predates Step A: it misses `X/avatar25Life.ts`, its line counts for `avatar25Gpu.ts` and `Avatar25Canvas.tsx` are stale, and its question about ASTC defaulting off is closed (on) |
| 4 | `PORT_MAP.md`'s OTA list does not mention `M/.eas/workflows/testflight-after-asc-upload.yml`; checked in review: it has no OTA step. `.railway/railway.test.ts` names `develop-ota-publish.yml` and is edited in X1 |
| 5 | The mobile inventory says to keep the OTA budget test and warns about the script fingerprint rule; both are superseded by F6 |
| 6 | `DB_TABLES_FOR_RESET.md` does not note that `blumi_room_showcase_snapshots.mime_type` is CHECKed to `image/webp` with a NOT NULL body (migration 043). This is why the room picture stays a server image |
| 7 | The sofa's `item.json` still says "NOT owner-approved"; the handoffs say approved. The port strips these note fields |
| 8 | Unverified, treated as true: an invalid stored ID gives a 500 on login; Railway runs with the whole repository present. The design depends on neither |
| 9 | Not in any audit: the experiment's resolver returns `null` (falls back to avatarV2) for loadouts it cannot draw and for the dance state. With the old renderer gone it must be total |
| 10 | The boy rig holds no items yet (`items: {}`, empty item map); "hairs are final" refers to art sheets, not to rig data |
| 11 | `male/phase5/ITEM_ID_PLAN.md` and `VARIANT_IDS.md` list IDs for the rejected A/B/C outfits and 18 outfit recolours. The final six outfits and the basics had no IDs; §5.1 proposes them |
| 12 | The audits treat the stand pose as a set of layers. In the rig it is one skinned mesh per owner with interleaved painter order and worn-set leg variants (§2.2) |
| 13 | A canvas can draw several avatars, but the room body component mounts one canvas per avatar (furniture fronts are layered between avatars); "one live canvas" therefore means one per avatar, two in MiniRoom |

### 11.1 Review findings (2026-10-10)

Independent review of this plan against the eight Phase 0 audits, `RESUME_INTEGRATION.md` and the worktree code. Clear errors were fixed in place (paths, line refs, the onboarding deferral, the furniture approval, the default room, the boy and girl hairs, the reset keep list); the items below are judgement calls or facts the fixes rest on.

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| R1 | CRITICAL (owner) | `room_v2_chair_blush` is to stay "published, price 0, receipt untouched", but its receipt binds the OLD flat art `roomV2/assets/runtime/furniture_world_chair_v1.png` and `roomV2/assets/shop-thumbnails/room_v2_chair_blush.png`. `shopReleaseCatalog.test.ts` ("each receipt binds exactly the runtime assets the app resolves") fails the moment the chair draws from its layered folder. "Untouched" is only possible if the chair keeps old flat art and the flat-sprite path survives X8, which contradicts F1/F12 | Ask the owner once, at the §12 review: (a) he issues a new receipt that binds the chair's layered art (his act, never ours); or (b) the receipt is REMOVED and the chair joins the `pricing-pending` scope with the 27 others until §12; or (c) receipt removed and the chair becomes `ownedByDefault`. Lead's recommendation: (b). Until then the chair keeps its flat art, its two bound files and the flat-sprite branch for that one ID; the Phase 5 sweep lists them as the second known exception |
| R2 | HIGH | Free price-0 items that are not `ownedByDefault` disappear in production: `resolveR1PublishedEconomyCatalog` keeps only `ownedByDefault` items and receipt-bound items (`releaseCatalog.ts`). So "free furniture in the Shop" needs an owner receipt per item, and "free boy outfits, no receipts" works only as `ownedByDefault` | Folded into §5.2, §5.3 and §12. Every free starter wearable (boy outfits, basics, base hairs) is `ownedByDefault`; body compatibility, not ownership, keeps the girl from wearing them |
| R3 | HIGH | Mid-plan breakage: from Phase 1 to Phase 4 the old items stay active, coercion keeps them, but the rigs cannot draw them, and today's `DEFAULT_FEMALE_AVATAR_LOADOUT` is NOT the coral starter (it is `hair_mocha_ribbon_blowout` + `top_default` + `bottom_default` + `shoes_milk_tea_court_sneakers`). Every Phase 3 surface would draw undrawable loadouts | Folded into §2.4: a draw-only fallback to the per-body rig starter, and coercion reads the `DEFAULT_*` constants that X15 switches |
| R4 | MEDIUM | The planned "every catalog item has `full`, `bust`, `thumb`" test fails from 1.7 to X15 if it walks the economy catalog | Folded into §10.2: iterate `avatarItemArt.ts`; add the catalog-wide assertion in X15 |
| R5 | HIGH | Receipt drift mid-way: repointing the Shop/Wardrobe thumbnail resolver (4.1) or the room thumbnail and sprite resolver (2.3, 2.4) for items that are still published fails the receipt test before X15 / X8 | Folded into 2.4 and 4.1: a published item's resolver changes only in the commit that retires or re-receipts it |
| R6 | MEDIUM | Interim look (F15): ProfileSetup (S35) will show the new avatar still and then play the OLD chibi twirl/collar atlas; boot and onboarding show the old chibi before the new avatar appears in the done moment (S28). This is what "keep the sprites" means in practice, and the Phase 5.6 TestFlight build carries it | Tell the owner in the Phase 0 summary. Option for him: in P3 skip the reaction atlas (still only) instead of mixing; it touches only code, not `session/assets` |
| R7 | MEDIUM | The default room is the empty shell from Phase 2 until the starter bed's art lands in 4.7; the Phase 2 gate "default room for a new and an existing account" therefore proves an empty room only | Re-run that gate row in Phase 4 after 4.7; the bed design must start early in Phase 4 so the boy outfit lane does not delay it |
| R8 | MEDIUM | Old-avatar importers missing from the checklist: `WardrobeGlass` / `wardrobeV2Styles` used by `miniRoom/scene/MiniRoomHud.tsx` and five `roomV2/editor/RoomEditor*` files; `navigation/LinkedProfileScreen.tsx` (`candidateAvatarSnapshot`); `ProfileSetupScreen.tsx` (`avatarV2Catalog`, `avatarStarterModel`); `PreAuthSetupFlowScreen.tsx`, `RegisterScreen.tsx` (`UserAvatar` type). X15/X17 would break typecheck without them | Folded into G3, G13, X17 |
| R9 | LOW | Retiring `mobile-ota-asset-budget.test.mjs` is justified (no EAS Update cap), but it leaves no guard on bundle growth while rig pages and stills grow with the catalog (§10.1 risk 10) | In commit 1.2, replace it with a bundled-bytes ratchet (total size of required assets, generous ceiling) and give the reason; keep the old count script for the Phase 5 report |
| R10 | LOW | The reset table list missed five tables and did not know that 070/071 are optional in production | Folded into §9: explicit keep list, live `information_schema` check, optional tables allowed to be absent |
| R11 | LOW | Phase 6 has no OTA path, so the onboarding re-bake needs its own TestFlight build; and old onboarding sprites stay in the binary for every build before it | Folded into Phase 6 (6.5) |
| R12 | LOW | Coercion hint: legacy preset strings `dusk` and `sunset` are still allowed presets (`authService.ts:68`); falling back to the girl could put a male user in the girl body | Folded into §2.4: use the profile's gender before the girl fallback; verify the field during 1.6 |
| R13 | INFO | Verified on disk: highest migration file `073_sms_verification_outcomes.sql`, two `032`, no `044`; next free number is **074** (`AGENTS.md` "071 next" is stale and fixed in 1.2). This plan needs no migration. `migrations.applied.json` has 71 entries and lacks 070/071, which are `OPTIONAL_READINESS_MIGRATIONS` | none |
| R14 | INFO | Verified: tolerant reader (1.6) lands before the avatar catalog shrinks (X15 in 4.3); room decor and inventory tolerance (2.8) before the furniture catalog shrinks (X8 in 2.10) and before `universal_*` go (X6); no `*candidate/` path, Workbench path or `/Users/` path is imported by `X/`; the dev links are listed in D2 and guarded by L15 | none |

## 12. Economy balance workstream

Does not block Phases 1–3. The launch catalog is entirely free; no paid item is published and no receipt is requested until the owner approves this proposal.

| Input (today) | Value | Source |
|---|---|---|
| Starter coins | 1250 | `D/economy/economyCatalog.ts` |
| Daily reward | 25 | `SV/economy/economyService.ts` |
| Event rewards | room complete 25, mutual match 50 | same |
| Coin packs | 500, 1500, 4000 coins (`com.blumi.mobile.coins.*`) | `D/economy/coinPacks.ts` |
| Old price points | clothes and shoes 75–520, hair 260–490, accessories 150–300, furniture 240 and 360 | `OLD_ITEM_ID_CATALOG.md` |
| Payments | off in the deployed environment (`BLUMI_PAYMENTS_ENABLED=0`) | `AGENTS.md` |

| Output (one proposal the owner approves) | Notes |
|---|---|
| Price tiers for hair, hair colours, clothes, furniture, collections | first candidates: the 27 approved `room_v3_*` pieces (F14), the 9 boy hair colour variants, the 2 redrawn boy hairs and the 5 redrawn girl hairs, and the chair (R1). For each: paid (owner receipt), price-0 Shop item (still an owner receipt, because the production projection keeps only receipt-bound or `ownedByDefault` items), or `ownedByDefault` (everyone owns it, no receipt) |
| Starter coins after the reset, daily and event earn rates | the reset script reads `STARTER_COIN_BALANCE`, so a change lands before the reset |
| Coin pack sizes and whether payments turn on | changing a pack or the payment flag is a third-party and production change: owner's yes |
| Days of play needed to afford each tier, with and without packs | the balance check ("pazarın dengesi") |
| Receipts | each paid item then needs an owner-approved receipt binding its runtime bytes |

