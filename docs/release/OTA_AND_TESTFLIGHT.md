# OTA and TestFlight channels

One TestFlight app (`com.blumi.mobile`), two binaries, two EAS Update channels.

| Binary | eas.json profile | Channel | Built by |
|---|---|---|---|
| Development | `preview` | `preview` | `preview-testflight-build.yml` (manual only) |
| Stable | `production` | `production` | `testflight.yml` on `main`, only when native code changed |

Both upload with an EAS `submit` job (App Store Connect app id in `submit.production`); `testflight-after-asc-upload.yml` adds the What to Test notes once Apple finishes processing. Pick which build a device installs in TestFlight.

## Flows

- **Push to `develop`** → `develop-preview-update.yml` (no checks job; checks run before the push and on GitHub): iOS fingerprint → look up a `preview` build with that fingerprint → OTA to `preview`. If no build matches (native change), the `native_build_required` job fails and nothing is published. It never builds.
- **Push to `main`** → `testflight.yml`: release checks → fingerprint → if a `production` build matches, OTA to `production`; otherwise build `production` and upload it to App Store Connect / TestFlight.
- **Manual** → `preview-testflight-build.yml`: builds the `preview` binary and uploads it to App Store Connect / TestFlight. Run it once to start and again whenever develop reports a native change.

Other branches (including `claude/*`) trigger nothing.

## Safety

- `runtimeVersion` uses the `fingerprint` policy, so an update is only served to binaries with identical native code.
- A channel is embedded in the binary at build time; `preview` updates never reach `production` binaries.
- The fingerprint includes `apps/mobile/package.json` **scripts**: editing a `test:*` script line changes it and stops develop OTAs until a new preview build. Register new tests in the `scripts/run-*.mjs` runners instead.
- Fingerprint and update jobs replicate `build.<profile>.env` from eas.json, pinned by `apps/mobile/scripts/mobile-release-channels.test.mjs`.

## On the device

- The `preview` binary checks for an update on launch and every time it returns to the foreground (at most every 30 s), downloads it and reloads (`src/features/appUpdates/useOtaUpdates.ts`).
- The `production` binary keeps the default: download on launch, apply on the next launch.
- TestFlight builds made before expo-updates was added cannot receive OTA updates.

## Owner prerequisites

1. A `develop` branch on GitHub.
2. An App Store Connect API key in EAS credentials (`ascAppId` is set).
3. The first `preview` build (manual workflow) and the first `production` build (a push to `main`).
