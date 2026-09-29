# Cleanup Manifest — 2026-09-29 (P4 step A, evidence only)

Status: **evidence only**. Nothing has been archived, moved or deleted. The
machine list is `docs/quality/cleanup-manifest-2026-09-29.json` (2,046 entries,
each with path, bytes, SHA-256, decision, basis and evidence). Base commit:
`2a55475e59d9d8efc1c54fc8c49cef918f4e6753`.

## Owner rules applied

1. Approved onboarding images and required animation files stay. A
   `candidate`/`vnext` name alone is not a removal reason.
2. Unused visual experiments and production sources are **archived first** to
   the Workbench (file list + SHA-256 + verified copies). Git history is not a
   backup.
3. Code is removable only when proven unused across every consumer: production
   graph, Metro QA resolver, deferred screen requires, `app.config.js`,
   `apps/mobile/plugins/*`, package scripts, `apps/mobile/scripts/*` runners
   and gate tests, `.github/workflows`, and string manifests such as
   `apps/mobile/src/features/roomV2/assets/catalog/**/manifest.json`.
4. Tests, QA tools and release/candidate gates stay, and so does everything
   they load.
5. Ambiguous files are KEEP and reported as UNSURE.

`apps/mobile/src/features/session/*` is treated as KEEP because its 29
candidate onboarding imports are being promoted in parallel.

## Totals

| Area | Decision | Files | Bytes | Size |
| --- | --- | ---: | ---: | ---: |
| `roomV2/assets/runtime/candidates` | KEEP | 162 | 198,462,136 | 189.27 MiB |
| | UNSURE | 6 | 20,653 | 0.02 MiB |
| | ARCHIVE | 0 | 0 | 0 |
| `roomV2/assets/runtime/room-vnext` | KEEP | 1,483 | 120,862,051 | 115.26 MiB |
| | UNSURE | 7 | 59,470 | 0.06 MiB |
| | ARCHIVE | 12 | 3,045,201 | 2.90 MiB |
| Non-test TS/TSX in `apps/mobile/src` outside the production graph | KEEP | 63 | 854,944 | 0.82 MiB |
| | ARCHIVE | 5 | 14,509 | 0.01 MiB |
| `apps/mobile/scripts/*.py` | KEEP | 245 | 1,793,471 | 1.71 MiB |
| | ARCHIVE | 63 | 501,617 | 0.48 MiB |
| **All areas** | **ARCHIVE** | **80** | **3,561,327** | **3.40 MiB** |

KEEP by basis:

| Area | Basis | Files | Size |
| --- | --- | ---: | ---: |
| candidates | test-or-gate-only (via `roomV3UniversalCoreRuntimeFurniture.ts`, `roomV3Focus12QaCatalog.ts`) | 156 | 181.50 MiB |
| candidates | string-reference (`roomV3QaShellCatalog.ts` shell PNG paths) | 6 | 7.77 MiB |
| room-vnext | test-or-gate-only (via `roomVNextFullWave*RuntimeAssets.ts`, `roomV2Assets.ts`) | 1,483 | 115.26 MiB |
| TS/TSX | test-or-gate-only | 38 | 0.73 MiB |
| TS/TSX | qa-runtime (HomeStudio QA graph) | 9 | 0.05 MiB |
| TS/TSX | production-type-import (type-only, erased from the bundle) | 5 | 0.01 MiB |
| TS/TSX | owner-keep (`features/session/*`) | 6 | 0.01 MiB |
| TS/TSX | string-reference / metro-resolver | 5 | 0.01 MiB |
| py | python-test (`test_*.py`; rule 4) | 120 | 0.50 MiB |
| py | string-reference (named or imported by a gate test, a Python test, a kept script or a candidate manifest) | 125 | 1.21 MiB |

## What is actually shipped

- **Production iOS export:** none of the 1,670 files in `runtime/candidates`
  or `runtime/room-vnext` is in the production asset map. It ships 27
  `roomV2/assets` files in total:
  - 7 top-level `runtime/*` files
  - 9 in `runtime/starter-modeled-pink-cloud-bed-v29/`
  - 4 in `runtime/starter-pink-cloud-bed/`
  - 7 in `shop-thumbnails/`
- The production bundle includes only room-vNext **code** (IDs and contracts):
  `roomVNextCandidateIdAdapter.ts`, `roomVNextContracts.ts`,
  `roomVNextPilotIds.ts`, `roomVNextRuntimeGate.ts` and `roomVNextScale.ts`.
  It does not include `roomV2Assets.ts` or any `roomVNextFullWave*` module.
- The HomeStudio-QA and all-QA-flags exports don't ship any
  candidate or room-vNext asset either. The 1,639 kept room files are loaded only by
  tests, gates and evidence generators under Node. For example,
  `shop/shopCatalogParity.test.ts`, `roomV2/roomV2.mock.test.ts`,
  `roomV3QaFurnitureCatalogRuntime.test.ts` and
  `scripts/generate-room-v3-universal-core-static-runtime-evidence.ts` load them.
- The production graph **does** contain 29 candidate-named assets from
  `features/session/assets/*-candidate/`. This is the concurrent onboarding
  promotion, and it is why `EAS_BUILD_PROFILE=production` currently fails in
  `app.config.js`.

## ARCHIVE items

- **`room-vnext/pink-cloud-bed-v0.23-candidate/*` (12 files, 2.90 MiB).**
  No code, test, gate, manifest or script references them.
  `ENGINEERING_AUDIT_2026-09-28.md` item 4 records that the QA binding moved
  back to the v0.12 asset.
- **5 dead TS/TSX modules:**
  - `features/miniRoom/useMiniRoomReactions.ts`
  - `features/roomV2/components/RoomSetupProgressRail.tsx`
  - `screens/components/onboardingInteraction.ts`
  - `screens/components/WardrobeEquippedSlotsRail.tsx`
  - `ui/typingIndicator.tsx`

  Four of them have explicit negative guards: tests assert that screen
  sources do *not* use them. Removing the files keeps those guards green.
- **63 Python production/QA-source scripts.** No package script, workflow,
  test (JS or Python), gate, runner, kept script or manifest names them, and no
  kept Python file imports them. The 120 Python tests (`test_*.py`) are KEEP
  under rule 4. The scripts they exercise are KEEP through those references. Under `AGENTS.md`, production sources and temporary
  scripts belong in the Workbench.

## UNSURE items (kept)

- **`candidates/cocoa_*/manifest.json` (6).** Each directory holds only a
  manifest. `roomV3CollectionCoverage.ts` lists the directories as coverage
  evidence. `roomV3FurnitureCandidateGate.ts` names PNGs such as
  `cocoa_dining_chair_a_front.png` that are **not present** in the checkout.
  This dangling gate data should be reviewed separately.
- **`room-vnext/pilot-v17/*/render-evidence.json` (7).** These are
  provenance JSON files beside PNGs that `roomV2Assets.ts` requires. No
  code reads them. They are Workbench-type content, but they stay until the
  pilot-v17 set is retired as a whole.

## Largest follow-up opportunity (not in this step)

About 297 MiB of candidate and room-vNext art (1,639 files) stays in the repo
only because tests, QA catalogs and evidence generators import it. Rule 4 keeps
all of it today. Retiring it needs an explicit owner decision to retire the
matching test and QA modules together (for example `roomVNextFullWave*`,
`roomV2HistoricalQaCatalog.ts`, `roomV3UniversalCore*` and
`roomV3Focus12QaCatalog.ts`). It isn't an asset-only deletion.

## Integration-branch note (commit `58d2d04`)

`58d2d04` (feat: promote approved onboarding and profile artwork) moves 5
session images from `*-candidate/` to `*-runtime/` folders and deletes 24
duplicate candidate PNGs. This manifest has **no entries under
`features/session/assets`**, so none of its asset entries are affected.
Effects on the manifest:

- `apps/mobile/scripts/test_profile_character_reaction_v4_assets.py`
  (KEEP, python-test) is modified by that commit. Its recorded SHA-256
  describes the pre-merge file. It is not archived, so the archive tool
  never reads it.
- `apps/mobile/scripts/package_onboarding_arrival_v3.py` (KEEP) is kept
  through `session/assets/onboarding-arrival-v3-candidate/candidate-manifest.json`.
  That file still exists at `58d2d04`.
- The six `features/session/*.ts(x)` owner-keep entries don't change.
- After that merge, `EAS_BUILD_PROFILE=production` should pass the
  `app.config.js` candidate-import gate. The production export can then be
  rerun without the `server-test` substitution.

If the manifest is applied on a branch where an ARCHIVE file changed, the
archive tool reports `source-hash-mismatch` for it and does not copy it.

## Method

1. `npm ci --no-audit --no-fund` at the worktree root.
2. **Production graph.** Run from `apps/mobile`:
   `npx expo export --platform ios --output-dir <scratch> --dump-assetmap --dump-sourcemap --clear`.
   - Environment: `EAS_BUILD_PROFILE=server-test`,
     `EXPO_PUBLIC_BLUMI_BUILD_PROFILE=production`,
     `EXPO_PUBLIC_BLUMI_MEDIA_MODE=native`, demo/voice/paid-coins/QA-unlock
     set to `0`, and placeholder HTTPS/WSS/Sentry/PostHog values.
   - Result: succeeded, with 4,428 source-map modules (1,808 under
     `apps/mobile/src`) and 1,223 assets.
   - `EAS_BUILD_PROFILE=production` stops at the `app.config.js` candidate
     import gate by design. `server-test` skips only that config gate; every
     bundle-inlined value and the Metro QA routing used production values.
3. **Development HomeStudio-QA graph.** Same export with
   `EXPO_PUBLIC_BLUMI_HOME_STUDIO_QA=1`,
   `EXPO_PUBLIC_BLUMI_BUILD_PROFILE=development`, demo media and QA unlock.
   Metro resolves `@blumi/home-studio-qa` to `src/screens/HomeStudioScreen.tsx`.
   Result: succeeded, with 4,452 modules and 1,239 assets.
4. **All-QA-flags graph.** Every `EXPO_PUBLIC_BLUMI_*_QA`, `_PREVIEW` and
   `_RUNTIME_PROOF` flag set to `1`, exported with `--dev --no-minify` so that
   no flag-gated `require` is dead-code eliminated. Result: succeeded, with
   4,624 modules and 1,244 assets.
5. **Static graph.** Imports, requires, dynamic imports and
   `new URL(…, import.meta.url)` are resolved from these roots:
   - 582 test files
   - 197 tool/config roots: `apps/mobile/scripts/*.{mjs,cjs,js,ts}`,
     `scripts/**`, `tools/**`, `apps/mobile/plugins/*`, `app.config.js`,
     `metro.config.js`, babel/eslint config, `index.js`, `App.tsx` and
     `.railway/**`

   The walk resolves the `@/` and `@contracts` aliases and both
   `@blumi/home-studio-qa` targets.
6. **String search.** Every text file outside `node_modules`/`.git` is
   searched, including JSON manifests, Python, workflows and package scripts.
   - Search terms: the exact runtime-relative path, a distinctive basename, a
     Python import, the src-relative module path, or the quoted module name.
   - A directory-only hit makes the file UNSURE.
   - Documentation-only hits are recorded but don't keep a file.
   - References that come only from files also marked ARCHIVE don't keep a
     file (fixpoint).

## Archive procedure (owner, on the Mac)

The default destination is
`/Users/evrenevren/BlumiArtWorkbench/2026-09-30/repo-cleanup-archive/`.
`--dest` overrides it.

```sh
node tools/workbench/archive-from-manifest.mjs --dry-run
node tools/workbench/archive-from-manifest.mjs --record-in-repo
```

The tool:

- copies only `ARCHIVE` entries, preserving their relative paths
- checks each source against its manifest SHA-256 before copying
- verifies each copy's SHA-256
- refuses to overwrite a differing destination file
- writes `archive-verification.json` into the destination and, with
  `--record-in-repo`, into
  `docs/quality/archive-verification-2026-09-29.json`
- never deletes or moves anything

**Deletion precondition:** before any deletion commit, commit
`docs/quality/archive-verification-2026-09-29.json` from the owner's Mac run.
It must show `complete: true` and a `manifestSha256` that matches this
manifest. A verification file from a CI or agent sandbox doesn't count. A later
deletion commit may remove only paths whose receipt entry is `verified: true`,
and it should rerun the relevant test suites.
