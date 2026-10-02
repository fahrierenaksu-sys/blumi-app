# OTA and TestFlight channels

One TestFlight app (`com.blumi.mobile`), two binaries, two EAS Update channels.

| Binary | eas.json profile | Channel | Built by |
|---|---|---|---|
| Development | `preview` | `preview` | `preview-testflight-build.yml` (manual only) |
| Stable | `production` | `production` | `testflight.yml` (manual run on `main`; builds only when the native fingerprint changed, otherwise OTA) |

Both upload with an EAS `submit` job (App Store Connect app id in `submit.production`); `testflight-after-asc-upload.yml` adds the What to Test notes once Apple finishes processing. Pick which build a device installs in TestFlight.

## Flows

- **Push to `develop`** → nothing publishes. Automatic develop OTAs were paused on 2026-09-30 because the iOS bundle carried 1,210 assets and EAS Update accepts at most 1,000 per update. Since the room motion atlases (2026-10-02) the bundle has 888 assets (`docs/quality/OTA_ASSET_BUDGET_2026-10-02.md`), so a manual develop OTA fits again; the automatic trigger stays off until the owner turns it back on (see below). Daily work runs against Metro on a development build.
- **Manual develop OTA** (the asset count must stay under 1,000; `apps/mobile/scripts/mobile-ota-asset-budget.test.mjs` fails before it gets close) → GitHub Actions `.github/workflows/develop-ota-publish.yml` (needs the `EXPO_TOKEN` secret): latest `preview` build → `eas fingerprint:compare` against it → `eas update` to `preview`, failing unless the update's runtime equals the build's. `develop-preview-update.yml` on EAS is the manual fallback. Neither ever builds.
- **Manual run of `testflight.yml` on `main`** (EAS dashboard or `eas workflow:run testflight.yml`; manual only since `8d46d08`, 2026-10-01) → release checks → fingerprint → if a `production` build matches, OTA to `production`; otherwise build `production` and upload it to App Store Connect / TestFlight.
- **Manual** → `preview-testflight-build.yml`: builds the `preview` binary and uploads it to App Store Connect / TestFlight. Run it again whenever develop reports a native change.

No push to any branch builds or publishes an app. Automatic workflows: `testflight-after-asc-upload.yml` fires on App Store Connect's `build_upload` event and only adds test notes; GitHub `verify.yml` runs the release checks on pushes to `main` and on pull requests and publishes nothing. Railway, separately, builds the server from `main` but has not reliably auto-deployed, so check which commit is live.

Running `testflight.yml`, `preview-testflight-build.yml` or any OTA publish (`develop-ota-publish.yml`, `develop-preview-update.yml`, `eas update`) needs the owner's explicit yes first; builds and updates count against the free EAS plan.

## Safety

- `runtimeVersion` uses the `fingerprint` policy, so an update is only served to binaries with identical native code.
- A channel is embedded in the binary at build time; `preview` updates never reach `production` binaries.
- The fingerprint includes `apps/mobile/package.json` **scripts**: editing a `test:*` script line changes it and stops develop OTAs until a new preview build. Register new tests in the `apps/mobile/scripts/run-*.mjs` runners instead.
- Fingerprint and update jobs replicate `build.<profile>.env` from eas.json, pinned by `apps/mobile/scripts/mobile-release-channels.test.mjs`.

## On the device

- The `preview` binary checks for an update on launch and every time it returns to the foreground (at most every 30 s), downloads it and reloads (`src/features/appUpdates/useOtaUpdates.ts`).
- The `production` binary keeps the default: download on launch, apply on the next launch.
- TestFlight builds made before expo-updates was added cannot receive OTA updates.

## Owner prerequisites

1. A `develop` branch on GitHub (exists).
2. An App Store Connect API key in EAS credentials (`ascAppId` is set).
3. A `preview` build and a `production` build, each from a manual run (both exist: preview build 12 and production build 13, recorded 2026-09-30).

## Re-enabling develop OTAs

What the owner does, in order, once the atlas branch is merged into `develop` (each step needs the owner's yes):

1. Check the room on the phone with a development build or Metro (checklist in the atlas branch report): walking and sitting avatars, both bodies, MiniRoom with two avatars.
2. Run `.github/workflows/develop-ota-publish.yml` by hand (GitHub → Actions → "Publish OTA to preview channel" → Run workflow on `develop`). It publishes only if `develop`'s fingerprint equals the latest `preview` build's; if it fails on the fingerprint, a new `preview-testflight-build.yml` run is needed first.
3. Open the preview build on the phone twice (download, then apply) and repeat the room check.
4. Optional: to publish on every push again, restore the `push: branches: [develop]` trigger that commit `ec16625` removed from `develop-ota-publish.yml`, together with `apps/mobile/scripts/mobile-release-channels.test.mjs`, which pins it.

New room motion art: run `node apps/mobile/scripts/build-room-motion-atlases.mjs --rewrite-requires` after adding its `require()` lines, so frames that no receipt binds are packed instead of adding one asset each.
