# Workbench-fixture tests — 2026-09-30

Status: **Implemented, Tested** (runner and its tests). The 14 kept tests are
**Open** until the owner runs `test:workbench` on the Mac: they cannot run in
this container because the Workbench is not reachable here.

Closes the "57 missing-fixture tests" item of
[`ENGINEERING_AUDIT_2026-09-30.md`](./ENGINEERING_AUDIT_2026-09-30.md) (F-11,
"Kept as ambiguous").

## How the set was found

1. Every `*.test.{ts,tsx,mjs,js,cjs}` under `apps/mobile/src` and
   `apps/mobile/scripts` (458 files on `ca863be`) was matched against every
   `apps/mobile/package.json` and root `package.json` script and every
   `apps/mobile/scripts/run-*.mjs` runner (by path, file name or runner stem).
   65 files were listed nowhere.
2. Each of the 65 was run on its own, first from `apps/mobile`, then from the
   repository root (several tests assume one or the other).
   - 3 pass (`features/legal/*`); they run from
     `apps/server/scripts/run-server-tests.mjs`, so they are wired.
   - 62 fail: 4 are the art QA gates
     ([`ART_GATE_DECISIONS_2026-09-30.md`](./ART_GATE_DECISIONS_2026-09-30.md)),
     4 need the generated `apps/mobile/ios` project, and **54 fail only
     because fixtures that live in the Workbench are missing**.
   The audit's figure of 57 was not backed by a recorded list; this recount of
   54 comes from the runner lists above.
3. Every test was imported from the predecessor repository in `922fe89`
   (2026-09-05); none of its Workbench fixtures was ever in this repository's
   history.
4. For each test: what it asserts on (Workbench staging output, or shipped
   runtime files), and whether that subject is in the production iOS export
   (`EAS_BUILD_PROFILE=production`, 4,634 modules, 1,223 asset files; asset
   membership checked by SHA-256 because Metro de-duplicates identical files).

## Decision rules

- **test:workbench**: the test asserts on shipped runtime files (or on a
  repository tool in the promotion chain that writes them) against
  approved Workbench evidence. Kept unchanged and run by
  `npm --workspace @blumi/mobile run test:workbench`.
- **retired**: the subject is QA-only, only Workbench staging output, or
  a superseded plan. Retired in a commit that lists each file and the reason.
  Git history keeps it.
- **not a Workbench fixture**: left unwired and reported. These tests need a
  different fix.

## `test:workbench`

`apps/mobile/scripts/run-workbench-fixture-tests.mjs` (tests:
`run-workbench-fixture-tests.test.mjs`, wired in `test:launch-config`):

- `BLUMI_WORKBENCH_ROOT` must name a directory that holds the fixture trees
  at their original repository-relative paths
  (`$BLUMI_WORKBENCH_ROOT/docs/avatar-motion-pipeline/<tree>/...`).
- Unset, empty or not a directory: the runner prints why and exits 1. It
  never skips.
- If a required tree is missing, the runner lists every missing tree and
  exits 1 before any test runs.
- For the run, it links each Workbench child of `docs/avatar-motion-pipeline`
  that the checkout lacks into the checkout. It never replaces an existing
  path, so `female-fit-zones.json` stays. It runs exactly the 14 files below
  with `node --test` from the repository root, then removes the links.
- The tests themselves are unmodified.

```sh
# on the owner's Mac, from the repository root
BLUMI_WORKBENCH_ROOT=/Users/evrenevren/BlumiArtWorkbench/<dir that contains docs/avatar-motion-pipeline> \
  npm --workspace @blumi/mobile run test:workbench
```

If the Workbench stores these trees under a different layout, create a
directory with `docs/avatar-motion-pipeline/<tree>` links to them and point the
variable there.

## Table

Paths in "needs" are relative to the repository root, or to the Workbench root
for `test:workbench`. `dap/` stands for `docs/avatar-motion-pipeline/`.

### Kept: `test:workbench` (14)

| File (`apps/mobile/scripts/`) | Protects | Needs | Decision |
|---|---|---|---|
| `male-wardrobe-production-gate.test.mjs` | The 66 shipped male items: each static + 4W + 1S runtime PNG is a pixel-exact, alpha-clean derivative of its approved candidate; evidence has `explicitUserApproval`, 396 files | `dap/male-wardrobe-redesign/2026-07-27/male-wardrobe-66-runtime-promotion-evidence-v1.json` plus the candidate PNGs it names | test:workbench |
| `male-wardrobe-fit-profile.test.mjs` | Independent fit review of the 66 (7 gates PASS); every promoted static layer on the 256×384 canvas | same tree: `male-wardrobe-66-final-independent-review-v1.json`, promotion evidence | test:workbench |
| `male-wardrobe-motion-fit.test.mjs` | Hash-bound 4W+1S state set per promoted item; sitting frame differs from walking | same tree: promotion evidence | test:workbench |
| `male-wardrobe-redesign-status.test.mjs` | `male-wardrobe-redesign-status.mjs`, used by `promote_male_wardrobe_66_runtime.py` and the motion-refresh producers: approval records fail closed; only checksummed candidates count | `dap/male-wardrobe-redesign/2026-07-27/asset-manifest.json` and tree | test:workbench |
| `male-premium-capsule-static-contract.test.mjs` | Shipped premium male static layers are alpha-clean and match the static batch | `dap/male-premium-capsule/2026-07-16/static-batch-manifest.json` | test:workbench |
| `male-premium-capsule-motion-contract.test.mjs` | Shipped premium male live 4W+1S frames exist for the 23 retained layers; hair fixed-head sources | `dap/male-premium-capsule/2026-07-16/full-motion-manifest.json`, `motion-candidates/` | test:workbench |
| `male-young-drop-contract.test.mjs` | Shipped young-drop layers (runner, beanie, …) are 256×384, alpha-clean, in the head/torso envelopes; cancelled items stay out of runtime | `dap/male-young-drop/2026-07-18/` (`motion-manifest.json`, `candidate-layers/`) | test:workbench |
| `female-dress-capsule.test.mjs` | Four shipped female dress pairs: room, motion, profile layer and shop thumbnail exist for each canonical source | `dap/render-sources/female-dresses/` | test:workbench |
| `female-new-tops-jackets-capsule.test.mjs` | Seven shipped female tops/jackets: static, 4W+1S, profile, thumbnail and evidence | `dap/female-new-tops-jackets/2026-07-16/capsule-manifest.json` | test:workbench |
| `female-fresh-bottom-shoe-motion.test.mjs` | Fresh female bottoms and shoes: shipped runtime static and 4W+1S frames exist and pass the rig check | `dap/female-fresh-bottom-shoe-capsule/2026-07-16/` | test:workbench |
| `female-fresh-bottom-shoe-static.test.mjs` | Static fit manifest of the same 8 items (alpha residue 0, no detached islands) | same tree: `static-manifest.json`, `static-fit-contact-sheet.png` | test:workbench |
| `female-accessory-occlusion-staging.test.mjs` | Shipped cherry micro-bag split parts (`*_part_bag-{front,back}` static and motion files, all in the production export) are byte-for-byte the reviewed parts and do not paint over the forearm zone | `dap/female-accessory-occlusion-staging/2026-07-15/`, `dap/female-shoes-accessories-staging/2026-07-15/accessory/cherry_micro_bag` | test:workbench |
| `create_female_nondress_promotion_approval.test.mjs` | `create_female_nondress_promotion_approval.mjs`, called by the wired `promote-female-nondress-wardrobe.mjs`: approval is opt-in and bound to the exact 18-item evidence set | `dap/female-nondress-promotion-evidence/2026-07-15/`, `dap/female-combined-promotion-gate/candidate-source-manifest.json` | test:workbench |
| `female-nondress-promotion-evidence.test.mjs` | `generate_female_nondress_promotion_evidence.mjs` (same promotion chain): one current static, close-up and 4W+1S proof per allowlisted item | `dap/female-combined-promotion-gate/candidate-source-manifest.json` and the candidate sources it names | test:workbench |

**Could any run in CI instead?** Only by committing Workbench provenance.
`male-wardrobe-motion-fit` reads nothing but
`male-wardrobe-66-runtime-promotion-evidence-v1.json`, a runtime-derived
metadata file with SHA-256s of shipped PNGs. If that one file is under 200 KB,
committing it would let this test run in CI; `male-wardrobe-fit-profile` would
also need `male-wardrobe-66-final-independent-review-v1.json`. Its size is not
knowable here. **Owner decision needed** (AGENTS.md keeps provenance in the
Workbench); nothing was invented.

### Retired (39) and repaired (1)

Commit `030b73d` (21 tests plus 3 tool modules that only they used):

| File | Protects | Needs | Decision |
|---|---|---|---|
| `scripts/female-blush-cardigan-motion-staging.test.mjs` | Workbench staging frames; producer is staging-only | `dap/female-premium-top-motion-staging/blush_lace_cardigan/` | retired: staging only; shipped item guarded by the wired `female-wardrobe-combined-promotion-gate` |
| `scripts/female-bottom-motion-staging.test.mjs` | Workbench bottom staging + Python producer `--check` | `dap/female-bottom-motion-staging/` | retired: staging only (same guard) |
| `scripts/female-cream-tee-sitting-pilot.test.mjs` | Workbench Cream Tee sitting candidate | `dap/female-premium-top-motion-staging/cream_basic_tee/`, `dap/female-cream-tee-motion-staging/` | retired: staging only; shipped Cream Tee is the later `*_art_v17` set |
| `scripts/female-cream-tee-walk-staging.test.mjs` | Workbench Cream Tee walk pilot | same | retired: staging only |
| `scripts/female-long-pant-shoe-refit-staging.test.mjs` | Workbench long-pant refit staging | `dap/female-long-pant-shoe-refit-staging/2026-07-15/` | retired: staging only |
| `scripts/female-premium-top-motion-staging.test.mjs` | Workbench premium-top staging | `dap/female-premium-top-motion-staging/` | retired: staging only |
| `scripts/female-shoes-accessories-staging.test.mjs` | Workbench shoe/accessory staging (shipped base only as reference) | `dap/female-shoes-accessories-staging/2026-07-15/` | retired: staging only |
| `scripts/male-hair-shoes-wave3-static-contract.test.mjs` | Wave-3 hair/shoe candidates (shipped files only as references) | `dap/male-hair-shoes-wave3-qa/` | retired: staging; shipped result under `male-wardrobe-production-gate` |
| `scripts/male-motion-wave-independent-qa.test.mjs` | Staged male motion frames | `dap/male-motion-wave-staging/frames/` | retired: staging (same) |
| `scripts/male-motion-wave-staging-gate.test.mjs` | Staged male 4W+1S frames vs live references | `dap/male-motion-wave-staging/frames/`, `dap/male-wave2-static-qa/` | retired: staging (same) |
| `scripts/male-shoes-wave3-motion-contract.test.mjs` | Staged wave-3 shoe motion | `dap/male-shoes-wave3-motion-staging/` | retired: staging (same) |
| `scripts/male-wave2-static-rig-fit-qa.test.mjs` | Wave-2 static candidates | `dap/male-wave2-static-qa/` | retired: staging (same) |
| `scripts/male-premium-capsule-final-qa.test.mjs` | Presence of Workbench final-QA evidence only | `dap/male-premium-capsule/2026-07-16/final-qa/` | retired: evidence-only |
| `scripts/male-wardrobe-redesign-plan.test.mjs` | The 54-item redesign plan | `dap/male-wardrobe-redesign/2026-07-27/asset-manifest.json` | retired: stale (also fails on repo data: the plan still lists two rejected tops that the promoted 66 replaced) |
| `scripts/render-male-wardrobe-redesign-board.test.mjs` (+ `render-male-wardrobe-redesign-board.mjs`) | 54-item review-board renderer | same manifest | retired: QA tool with no other consumer |
| `scripts/generate-room-v3-universal-core-qa-persistence-contract.test.ts` (+ generator `.ts`) | Workbench QA persistence JSON | `docs/room-v3-qa/2026-07-18-universal-core-wave/` | retired: room QA evidence |
| `scripts/generate-room-v3-universal-core-qa-runtime-evidence.test.ts` | Workbench QA runtime JSON | same | retired: generator retired with Room V3 QA |
| `scripts/phase7-scale-board.test.mjs` | Phase 7 scale board | `docs/room-v3-qa/2026-07-18-phase7-scale/` | retired: room QA evidence |
| `scripts/verify-room-v3-simulator-evidence.test.mjs` | Cocoa-pilot Simulator evidence | `docs/room-v3-qa/2026-07-20-cocoa-pilot-wave/` | retired: room QA evidence |
| `scripts/verify-room-v3-universal-core-qa-renderer-gallery-manifest.test.mjs` (+ `create-room-v3-universal-core-qa-renderer-gallery.mjs`) | QA gallery for retired Universal Core candidates | `docs/room-v3-qa/…/live-gallery/manifest.json` | retired: room QA |
| `src/features/roomStudio/roomStudioRecipeLayoutParity.test.ts` | HomeStudio QA recipes vs Workbench layout JSON | `art/room-vnext/home-studio-pilot-v1/layouts/balanced-v0.4.json` | retired: QA-only (production resolves `homeStudioQaStub.tsx`) |

Commit `505b877` (Room VNext / Room V3 QA retirement, Item 3; 18 of these
were in the unwired set):

| File | Needs | Decision |
|---|---|---|
| `scripts/generate-room-v3-collection-coverage.test.ts`, `generate-room-v3-universal-core-placement-depth-evidence.test.ts`, `generate-room-v3-universal-core-static-runtime-evidence.test.ts` | `docs/room-v3-qa/2026-07-18-universal-core-wave/*.json` | retired with their generators |
| `scripts/prepare-room-v3-furniture-runtime-assets.test.mjs`, `room-v3-phase7-furnished-layout-evidence.test.mjs` | candidate PNG / artifact registry | retired with their scripts |
| `scripts/verify-room-v3-cocoa-dining-pilots`, `-cocoa-navy-dining-table-b`, `-cocoa-navy-lounge-armchair-b`, `verify-room-v3-shell-assets` (`.test.mjs`) | cocoa `*_runtime_v2.png` and v3 shell PNGs that were never in the repo | retired |
| `src/features/roomV2/roomV3FurnitureCandidateArtifacts`, `roomV3UniversalCorePlacementDepthEvidence`, `roomV3UniversalCoreStaticRuntimeEvidence`, `roomV3UniversalLongSofaArtifacts`, `roomV3UniversalNeutralWaveArtifacts`, `roomV3UniversalSurfaceWaveArtifacts`, `roomVNextFullWaveCatalog`, `roomVNextFullWavePromotion`, `roomVNextFullWaveRuntimeProof` (`.test.ts`) | `scripts/room-vnext-pilot/full-wave-catalog-spec.json`, `art/room-vnext/**`, Workbench registries | retired with the QA modules |
| `src/features/roomV2/roomV2Catalog.test.ts` | (failed only through a QA import) | **repaired**: its 7 production My Room tests now run in `test:match-room`; its QA tests were retired (`c03af39`) |

### Not Workbench fixtures (left unwired, reported)

| File | Why it fails | Decision |
|---|---|---|
| `scripts/mobile-onboarding-world-intro-contract.test.mjs` (8 pass, 1 fail) | Reads `apps/mobile/ios/BlumiMobile/SplashScreen.storyboard`; `ios/` is prebuild output and git-ignored, and `BlumiMobile` is an old target name (the project is `Blumi`) | Needs a native owner decision: move the native assertion to a config-plugin/prebuild check or drop it. Unchanged. |
| `src/features/session/nativeOnboardingBootOverlayContract.test.ts` (6 pass, 2 fail) | Asserts that `ios/Blumi/NativeOnboardingBootOverlay.swift` etc. are versioned; they are not, because `ios/` is ignored | **Deleted** in the 2026-10-02 test audit; its Reduce Motion fail-closed intent stays behavior-tested in `onboardingBrandPreludeModel.test.ts` |
| `scripts/run-native-ui-tests.test.mjs` (7 pass, 2 fail) | Needs `ios/Blumi.xcodeproj/xcshareddata/xcschemes/Blumi.xcscheme` | Same; passes only after `expo prebuild` |
| `scripts/roomPerspectiveNativeUiContract.test.mjs` | Needs `ios/BlumiMobileUITests/BlumiMobileUITests.swift` (old target name); partly checks Room VNext full-wave native routes | Same; probably retire with native UI test cleanup |
| `female-walk-rig-contract`, `female-legacy-milk-tea-repair`, `male-basic-tshirt-static-contract`, `male-basic-tshirt-rig-fit-qa` | Fail on the shipped art | See `ART_GATE_DECISIONS_2026-09-30.md` |

## Follow-ups (not done here)

- Python producers that only the retired staging tests named are now
  unreferenced production sources:
  - `prepare_female_premium_top_motion_staging.py`
  - `prepare_female_bottom_motion_staging.py`
  - `prepare_female_long_pant_shoe_refit_staging.py`
  - `produce_female_fresh_bottom_shoe_capsule.py` (kept: the kept motion test runs it)

  List them in the next archive manifest after a reference check; don't
  delete them directly.
- `male-wardrobe-redesign-plan.mjs` is still used by
  `generate-male-wardrobe-redesign-manifest.mjs` (Workbench tooling) and now
  has no test.
- The legacy female Cream Tee files without `_art_v17`
  (`avatar_room_top_female_cream_basic_tee_v2.png` and its `walking_front_f0*`
  and sitting frames) are not in the production export.
