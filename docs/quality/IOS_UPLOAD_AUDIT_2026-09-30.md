# Blumi iOS upload audit — 2026-09-30

Scope: camera/audio removal and local iOS upload prerequisites after Apple's
ITMS-90683 notification for version 1.0.0, build 4, app 6817587217.
This is local evidence, not Apple acceptance or release approval.

## Changes

- Removed mobile LiveKit, WebRTC and `livekit-client` dependencies and native
  capture client. Shared rooms retain durable text; the media hook always
  reports voice unavailable with microphone and speaker off.
- `mobile-no-media.cjs` is invoked by Expo app config and rejects direct,
  development and lockfile-transitive camera/audio SDK dependencies.
- Source-build only `expo-file-system` and `expo-image` on iOS. The original
  precompiled configuration produced an empty `ExpoFileSystem_privacy.bundle`
  and omitted SDWebImage's privacy manifest. Source pods restore the vendors'
  manifests, including the file-system disk-space reasons; no replacement
  privacy declarations were invented. See [Expo's supported setting](https://docs.expo.dev/guides/prebuilt-expo-modules/).
- Updated transitive `ip-address` from 10.7.0 to 10.7.2 after release audit
  reported [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv)
  and [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw).
  No new audit exceptions were added.
- Preserved pre-existing worktree changes, including OTA and legal changes.

## Verification

- Initial `npm run verify` passed code tests and isolated PostgreSQL checks,
  then failed dependency audit on `ip-address`. After updating that package,
  a second full `npm run verify` passed, including Expo Doctor 21/21.
- The final source-pod settings were added after that full run; their focused
  release-config suite passed 45/45 and the final iOS Release build passed.
- Room/text/reconnect/decoration/media-state focused checks: 12/12.
  Rate-budget/trusted-proxy focused checks after dependency update: 8/8.
- Mobile TypeScript and lint passed. Expo app config lint and syntax checks
  for the new CommonJS guard passed. `git diff --check` passed.
- Production Expo introspection: no camera/microphone permission declarations,
  no audio background mode, and only the push entitlement.
- Source app icon: 1024 × 1024, no alpha.

## Exact local native artifact

Built with Xcode `Release`, `iphoneos`, generic iOS device, arm64,
`CODE_SIGNING_ALLOWED=NO`. Sentry upload was disabled for this local audit.

Executable SHA-256:
`3a746d022002f67959e2be61c39047721ba8a6bacfb1e44db39cfdf050090f5b`

- Bundle: `com.blumi.mobile`, version `1.0.0`.
- Executable plus 28 embedded framework binaries scanned.
- No LiveKit/WebRTC frameworks, capture-class references or searched capture
  selectors (`requestRecordPermission`, `requestAccessForMediaType:`).
- No camera/microphone usage keys; background modes are `fetch` and
  `remote-notification`.
- 36 parseable privacy manifests; required-reason arrays present.
  No empty `*_privacy.bundle` containers.
- `ExpoFileSystem_privacy.bundle/PrivacyInfo.xcprivacy` and
  `SDWebImage.framework/SDWebImage.bundle/PrivacyInfo.xcprivacy` present.
  Declared categories include file timestamp, disk space, boot time and
  user defaults.

Local evidence: `/tmp/blumi-deep-release-final-verify.log`,
`/tmp/blumi-deep-release-complete-build.log`, and
`/tmp/blumi-no-media-release-artifact-audit.json`.
Local app: `/tmp/blumi-no-media-release-derived/Build/Products/Release-iphoneos/Blumi.app`.
These temporary artifacts are not release inputs or committed assets.

## Open gates

- This unsigned local build is not an IPA, a signed EAS production artifact,
  or the rejected build 4. Production managed config was introspected
  separately; signed archive metadata must still be checked on the new build.
- No new EAS build, Apple upload, TestFlight acceptance, native user-flow or
  physical-device verification occurred in this audit.
- Apple validation and review cannot be guaranteed by local tests or symbol
  inspection. Existing documented audit exceptions remain in policy.
- At audit completion, no commit, push, deploy or release had been performed.
  Subsequent Git delivery is separate from Apple upload and acceptance.
