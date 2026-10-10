# TestFlight builds (no OTA updates)

The app has no over-the-air updates. The owner decided this on 2026-10-08, and it reached `develop` on 2026-10-10 with the 2.5D avatar work (`docs/release/AVATAR_25D_INTEGRATION_PLAN.md`, F6). `expo-updates`, the `runtimeVersion` and `updates` keys, the EAS Update channels and the OTA workflows are gone. Every JavaScript, asset or native change reaches testers in a new TestFlight build.

One TestFlight app (`com.blumi.mobile`), two binaries:

| Binary | eas.json profile | Built by |
|---|---|---|
| Development | `preview` | `apps/mobile/.eas/workflows/preview-testflight-build.yml` (manual only) |
| Stable | `production` | `apps/mobile/.eas/workflows/testflight.yml` (manual run on `main`) |

Both upload with an EAS `submit` job (App Store Connect app id in `submit.production`); `testflight-after-asc-upload.yml` adds the What to Test notes once Apple finishes processing. Pick which build a device installs in TestFlight.

## Flows

- **Push to any branch** → no app build and no upload. Daily work runs against Metro on a development build.
- **Manual run of `testflight.yml` on `main`** (EAS dashboard or `eas workflow:run testflight.yml`) → release checks → a new `production` build → upload to App Store Connect / TestFlight.
- **Manual run of `preview-testflight-build.yml`** → release checks → a new `preview` build → upload to TestFlight.

Automatic workflows: `testflight-after-asc-upload.yml` fires on App Store Connect's `build_upload` event and only adds test notes; GitHub `verify.yml` runs the release checks on pushes to `main` and on pull requests and publishes nothing. Railway, separately, builds the server from `main` but has not reliably auto-deployed, so check which commit is live.

Running `testflight.yml` or `preview-testflight-build.yml` needs the owner's explicit yes first; builds count against the free EAS plan.

## Guards

- `apps/mobile/scripts/mobile-release-channels.test.mjs`: no `expo-updates`, no `updates` or `runtimeVersion` in `app.json`, no build channel in `eas.json`, no `update` job in any EAS workflow; both builds run the release checks first and are started by hand only.
- `apps/mobile/scripts/mobile-bundled-asset-bytes.test.mjs`: the bytes of the assets app code requires stay under a generous ceiling. It replaced the EAS Update 1,000-asset guard, which no longer applies. `node apps/mobile/scripts/mobileBundledAssets.mjs` prints the current count and size.
- `apps/mobile/package.json` scripts are no longer part of an update fingerprint, so editing them no longer blocks anything.

## Old builds

TestFlight builds made before this change still contain `expo-updates` and look for updates on their old channels. Nothing is published there any more, so they keep running the JavaScript they shipped with until the tester installs a new build.

## Owner prerequisites

1. An App Store Connect API key in EAS credentials (`ascAppId` is set).
2. A new `preview` or `production` build after this change; the 2.5D avatar also needs one for its native module (`react-native-webgpu`).
