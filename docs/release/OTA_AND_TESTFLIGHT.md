# OTA and TestFlight channels

One TestFlight app (`com.blumi.mobile`), two binaries, two EAS Update channels.

| Binary | eas.json profile | Channel | TestFlight group | Built by |
|---|---|---|---|---|
| Development | `preview` | `preview` | Blumi Dev | `preview-testflight-build.yml` (manual only) |
| Stable | `production` | `production` | Blumi QA | `testflight.yml` on `main`, only when native code changed |

## Flows

- **Push to `develop`** → `develop-preview-update.yml`: release checks → iOS fingerprint → look up a `preview` build with that fingerprint → OTA to `preview`. If no build matches (native change), the `native_build_required` job fails and nothing is published. It never builds.
- **Push to `main`** → `testflight.yml`: release checks → fingerprint → if a `production` build matches, OTA to `production`; otherwise build `production` and upload it to TestFlight (Blumi QA).
- **Manual** → `preview-testflight-build.yml`: builds the `preview` binary and uploads it to TestFlight (Blumi Dev). Run it once to start and again whenever develop reports a native change.

Other branches (including `claude/*`) trigger nothing.

## Safety

- `runtimeVersion` uses the `fingerprint` policy, so an update is only served to binaries with identical native code.
- A channel is embedded in the binary at build time; `preview` updates never reach `production` binaries.
- Fingerprint and update jobs replicate `build.<profile>.env` from eas.json, pinned by `apps/mobile/scripts/mobile-release-channels.test.mjs`.

## On the device

- The `preview` binary checks for an update on launch and every time it returns to the foreground (at most every 30 s), downloads it and reloads (`src/features/appUpdates/useOtaUpdates.ts`).
- The `production` binary keeps the default: download on launch, apply on the next launch.
- TestFlight builds made before expo-updates was added cannot receive OTA updates.

## Owner prerequisites

1. A `develop` branch on GitHub.
2. `submit.production.ascAppId` in eas.json and an App Store Connect API key in EAS credentials.
3. TestFlight internal groups `Blumi Dev` and `Blumi QA`.
4. The first `preview` build (manual workflow) and the first `production` build (a push to `main`).
