# Cleanup Manifest — 2026-09-30 (room QA art)

Status: **evidence only**. Nothing has been archived, moved or deleted.
- Machine list: `docs/quality/cleanup-manifest-2026-09-30.json` (1,658 entries,
  each with path, bytes, SHA-256, decision, basis and evidence).
- Base commit: `4ed9b40b1fb7ae9ea30a5def80037bea306ecd33`.
- Follows [`CLEANUP_MANIFEST_2026-09-29.md`](./CLEANUP_MANIFEST_2026-09-29.md);
  that manifest and its receipt are unchanged.

## Owner decision applied

The QA/test-only modules that were the only users of
`roomV2/assets/runtime/candidates` and `roomV2/assets/runtime/room-vnext` may be
retired: the Room VNext and Room V3 QA catalogs, candidate gates and evidence
generators, with their tests. Production code and release gates stay. The art
is archived to the Workbench first and deleted only after the owner's Mac
receipt, as with the earlier 75 files.

## Totals

| Area | Decision | Files | Bytes | Size |
| --- | --- | ---: | ---: | ---: |
| `roomV2/assets/runtime/candidates` | ARCHIVE | 168 | 198,482,789 | 189.29 MiB |
| `roomV2/assets/runtime/room-vnext` | ARCHIVE | 1,490 | 120,921,521 | 115.32 MiB |
| **All** | **ARCHIVE** | **1,658** | **319,404,310** | **304.61 MiB** |
| | KEEP | 0 | 0 | 0 |

This includes the 13 files the 2026-09-29 manifest marked UNSURE:
- the six `candidates/cocoa_*/manifest.json` files, whose only reader
  `roomV3CollectionCoverage.ts` is retired;
- the seven `room-vnext/pilot-v17/*/render-evidence.json` files, whose
  pilot-v17 set is now retired as a whole.

Once the owner has archived the files and the removal commit has run, the
~297 MiB follow-up that the 2026-09-29 manifest and the F-10 audit entry
describe is closed.

## Evidence

### 1. Production graph before and after the code retirement

The export ran from `apps/mobile` with:

- `EAS_BUILD_PROFILE=production` and
  `EXPO_PUBLIC_BLUMI_BUILD_PROFILE=production`, so the `app.config.js`
  candidate-import release gate ran and passed. No `server-test` substitution
  was needed any more.
- `EXPO_PUBLIC_BLUMI_MEDIA_MODE=native`.
- demo, voice, paid coins and QA unlock set to `0`.
- placeholder HTTPS, WSS, Sentry and PostHog values.

The command was:

```sh
npx expo export --platform ios --output-dir <scratch> --dump-assetmap --dump-sourcemap --clear
```

| | Before (`ca863be`) | After (`505b877`) |
|---|---:|---:|
| Source-map modules | 4,634 | 4,634 |
| … under `apps/mobile/src` | 1,927 | 1,927 |
| Asset files in the asset map | 1,223 | 1,223 |
| … under `roomV2/assets` | 27 | 27 |
| … under `runtime/candidates` or `runtime/room-vnext` | 0 | 0 |
| Asset (path, SHA-256) list digest | `f901a5a5…a13e9e6` | `f901a5a5…a13e9e6` |
| Files in the exported `assets/` directory (SHA-256 compared one by one) | 1,220 | 1,220, identical |
| Hermes bundle | `index-600da466f198c8e629f13c7ee6a73f15.hbc`, 11,893,068 B | same name and size |

- Module lists are identical: nothing removed, nothing added.
- None of the retired modules was in the production graph, so the production
  bundle did not change at all.
- The 27 `roomV2/assets` files that ship are:
  - 7 top-level `runtime/*` files
  - 9 files in `runtime/starter-modeled-pink-cloud-bed-v29/`
  - 4 files in `runtime/starter-pink-cloud-bed/`
  - 7 files in `shop-thumbnails/`

  They are untouched and outside this manifest.

The 2026-09-29 note that room-vnext was "partly production via `roomV2Assets.ts`"
does not hold on this checkout. Production imports only `roomV2ProductionAssets.ts`.
`roomV2Assets.ts`, a QA asset map, was never in the production export.

### 2. Code retirement (commits)

- `c03af39`: production assertions decoupled from QA modules.
  - `roomV2Catalog.test.ts` is repaired and wired.
  - The always-skipped `shopCatalogParity` subtest is gone.
  - The release-config room test reads `roomV2ProductionAssets.ts`.
- `505b877`: 74 QA-only files retired. They are every module that imported or
  named the two trees, plus their transitive importers, their tests, and
  scripts that were only referenced by those tests. The match-room runner,
  the shell-safety test and the engineering-rules allowlist were updated.
- `030b73d`: remaining unwired room QA evidence tests retired (Item 1).

### 3. Reference check for every entry

After `505b877`:

- No import, `require`, dynamic import or `new URL()` in apps/mobile, scripts,
  tools, packages or `.github` resolves into either tree.
- No non-doc text file names an entry, whether by repository path,
  roomV2-relative path or unique basename. 1,797 files were searched.
- The only remaining directory-level mention is a negative assertion in
  `roomV2Catalog.test.ts`, which checks that production assets never include
  `/assets/runtime/room-vnext/`.
- The release candidate-import gate
  (`scripts/mobile-release-assets.cjs`, `mobile-release-config.test.mjs`)
  stays in place and passes.

### 4. Tooling check

The tools were run in the agent sandbox against this manifest:

- `archive-from-manifest.mjs --dry-run` reported 1,658 files `would-copy`.
- A full archive to a scratch destination reported 1,658 files `copied`,
  all SHA-256 verified.
- `remove-archived-from-manifest.mjs` with that sandbox receipt reported
  "Would remove: 1,658".
- Without a committed receipt it refuses.

The sandbox copy was deleted and its receipt is not in the repo, because a
receipt from an agent sandbox does not count. The tools now honour the
manifest's `archiveDestinationDefault` and `archiveVerificationPath` (commit
`4ed9b40`), so this run cannot overwrite the 2026-09-29 receipt.

## What the owner runs on the Mac

From the repository root, on a checkout that contains this manifest, with
`npm ci` done:

```sh
# 1. Preview (copies nothing)
node tools/workbench/archive-from-manifest.mjs \
  --manifest docs/quality/cleanup-manifest-2026-09-30.json --dry-run

# 2. Archive to the Workbench and record the receipt in the repo
#    (default destination from the manifest:
#     /Users/evrenevren/BlumiArtWorkbench/2026-09-30/repo-cleanup-archive-room-qa-art/)
node tools/workbench/archive-from-manifest.mjs \
  --manifest docs/quality/cleanup-manifest-2026-09-30.json --record-in-repo
#    Expect: "Archive entries: 1658; verified: 1658; failed: 0" and
#    docs/quality/archive-verification-2026-09-30.json with complete: true.

# 3. Commit the receipt on its own
git add docs/quality/archive-verification-2026-09-30.json
git commit -m "docs: record the room QA art archive receipt"

# 4. Remove the archived files (report first, then stage git rm)
node tools/workbench/remove-archived-from-manifest.mjs \
  --manifest docs/quality/cleanup-manifest-2026-09-30.json
node tools/workbench/remove-archived-from-manifest.mjs \
  --manifest docs/quality/cleanup-manifest-2026-09-30.json --apply
git diff --cached --name-status | grep -c '^D'   # expect 1658
git diff --cached --name-status | grep -v '^D'   # expect nothing

# 5. Re-run the relevant checks, then commit
npm --workspace @blumi/mobile run test
npm run verify:workbench-tools
npm run verify:release-infra
git commit -m "chore: remove room QA art archived to the Workbench"
```

The tool refuses if the receipt:

- is from a dry run;
- is incomplete;
- was made from another manifest version (SHA-256 mismatch).

It only removes an entry that is `verified: true` and whose repository bytes
still match. If a file changed on the branch, the archive step reports
`source-hash-mismatch` for it and leaves it in place.
