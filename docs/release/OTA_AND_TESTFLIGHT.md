# OTA and TestFlight channels

One TestFlight app (`com.blumi.mobile`), two binaries, two EAS Update channels.

| Binary | eas.json profile | Channel | Built by |
|---|---|---|---|
| Development | `preview` | `preview` | `preview-testflight-build.yml` (manual only) |
| Stable | `production` | `production` | `testflight.yml` (manual run on `main`; builds only when the native fingerprint changed, otherwise OTA) |

Both upload with an EAS `submit` job (App Store Connect app id in `submit.production`); `testflight-after-asc-upload.yml` adds the What to Test notes once Apple finishes processing. Pick which build a device installs in TestFlight.

## Flows

- **Push to `develop`** → nothing publishes. The iOS bundle carries about 1220 assets (908 of them avatar room motion frames) and EAS Update accepts at most 1000 per update, so develop OTAs are paused. Daily work runs against Metro on a development build; the phone gets a new binary through a TestFlight build.
- **Manual develop OTA** (once the asset count is under 1000) → GitHub Actions `.github/workflows/develop-ota-publish.yml` (needs the `EXPO_TOKEN` secret): latest `preview` build → `eas fingerprint:compare` against it → `eas update` to `preview`, failing unless the update's runtime equals the build's. `develop-preview-update.yml` on EAS is the manual fallback. Neither ever builds.
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
