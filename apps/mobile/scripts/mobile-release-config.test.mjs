import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import releaseConfig from "./mobile-release-config.cjs"
import releaseAssets from "./mobile-release-assets.cjs"
import noMedia from "./mobile-no-media.cjs"

const { resolveMobileReleaseEnvironment } = releaseConfig
const { assertNoCandidateAssetImportsInSourceRoot, findCandidateAssetImports } = releaseAssets
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("build config rejects direct and transitive native capture dependencies before upload", () => {
  const { assertNoMediaDependencies } = noMedia
  assert.doesNotThrow(() => assertNoMediaDependencies({ dependencies: { "expo-file-system": "1" } }, { packages: {} }))
  assert.throws(() => assertNoMediaDependencies({ dependencies: { "@livekit/react-native": "1" } }, { packages: {} }), /camera\/audio SDKs/)
  assert.throws(() => assertNoMediaDependencies({ dependencies: {} }, {
    packages: { "node_modules/parent/node_modules/react-native-webrtc": {} }
  }), /react-native-webrtc/)
  assert.throws(() => assertNoMediaDependencies({ devDependencies: { "expo-camera": "1" } }, { packages: {} }), /expo-camera/)
  assert.match(read("app.config.js"), /assertNoMediaDependencies\(require\("\.\/package\.json"\), require\("\.\.\/\.\.\/package-lock\.json"\)\)/)
})

test("iOS builds package file-system and SDWebImage privacy manifests using source pods", () => {
  const pkg = JSON.parse(read("package.json"))
  assert.ok(pkg.expo.autolinking.ios.buildFromSource.includes("expo-file-system"))
  assert.ok(pkg.expo.autolinking.ios.buildFromSource.includes("expo-image"))
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve("expo-file-system/package.json")
  const manifest = readFileSync(join(dirname(packagePath), "ios/PrivacyInfo.xcprivacy"), "utf8")
  assert.match(manifest, /NSPrivacyAccessedAPICategoryDiskSpace/)
  assert.match(manifest, /E174\.1/)
})

const require = createRequire(import.meta.url)

test("development keeps explicit local defaults and demo media", () => {
  assert.deepEqual(resolveMobileReleaseEnvironment({}), {
    buildProfile: "development",
    apiHttpUrl: "http://127.0.0.1:4000",
    realtimeWsUrl: "ws://127.0.0.1:4100",
    mediaMode: "demo",
    qaUnlockAvatarItems: "0",
    enableDemo: "1",
    devEntryRoute: undefined,
    localQaAuth: "0",
    sentryDsn: undefined,
    posthogApiKey: undefined,
    posthogHost: undefined,
    paidCoinsEnabled: "0",
    voiceEnabled: "0",
    revenueCatIosApiKey: undefined,
    revenueCatAndroidApiKey: undefined
  })
})

test("development cannot re-enable live voice or microphone access", () => {
  assert.throws(
    () => resolveMobileReleaseEnvironment({ EXPO_PUBLIC_BLUMI_VOICE_ENABLED: "1" }),
    /Live voice and microphone access are disabled/
  )
})

test("preview and production builds require secure public services", () => {
  for (const buildProfile of ["preview", "production"]) {
    assert.throws(
      () => resolveMobileReleaseEnvironment({ EAS_BUILD_PROFILE: buildProfile }),
      /EXPO_PUBLIC_BLUMI_API_HTTP_URL/
    )
    assert.throws(
      () => resolveMobileReleaseEnvironment({
        EAS_BUILD_PROFILE: buildProfile,
        EXPO_PUBLIC_BLUMI_API_HTTP_URL: "http://api.blumi.app",
        EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app",
        EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native"
      }),
      /HTTPS/
    )
    assert.throws(
      () => resolveMobileReleaseEnvironment({
        EAS_BUILD_PROFILE: buildProfile,
        EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
        EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "ws://realtime.blumi.app",
        EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native"
      }),
      /WSS/
    )
  }
})

test("server-test requires public TLS endpoints and disables local test bypasses", () => {
  const profile = JSON.parse(readFileSync(resolve(mobileRoot, "eas.json"), "utf8")).build["server-test"]
  assert.equal(profile.distribution, "internal")
  assert.notEqual(profile.developmentClient, true)
  assert.equal(profile.env.EAS_BUILD_PROFILE, "server-test")
  assert.equal(profile.env.EXPO_PUBLIC_BLUMI_ENABLE_DEMO, "0")
  assert.equal(profile.env.EXPO_PUBLIC_FIREBASE_DISABLE_APP_VERIFICATION, "0")
  assert.equal(profile.env.EXPO_PUBLIC_BLUMI_VOICE_ENABLED, "0")
  assert.equal(profile.env.EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED, "0")
  const base = {
    EAS_BUILD_PROFILE: "server-test",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://blumi-app-production.up.railway.app",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://blumi-app-production.up.railway.app",
    EXPO_PUBLIC_BLUMI_MEDIA_MODE: "demo",
    EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0"
  }
  assert.equal(profile.env.EXPO_PUBLIC_BLUMI_API_HTTP_URL, base.EXPO_PUBLIC_BLUMI_API_HTTP_URL)
  assert.equal(profile.env.EXPO_PUBLIC_REALTIME_EDGE_WS_URL, base.EXPO_PUBLIC_REALTIME_EDGE_WS_URL)
  assert.equal(resolveMobileReleaseEnvironment(base).apiHttpUrl, base.EXPO_PUBLIC_BLUMI_API_HTTP_URL)
  assert.equal(resolveMobileReleaseEnvironment(base).enableDemo, "0")
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_BLUMI_API_HTTP_URL: "http://127.0.0.1:4000" }),
    /HTTPS/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "ws://127.0.0.1:4100" }),
    /WSS/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "1" }),
    /Demo sessions cannot be enabled/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS: "1" }),
    /QA avatar unlock/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE: "myroom" }),
    /Development entry routes cannot be enabled/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_BLUMI_LOCAL_QA_AUTH: "1" }),
    /Local QA sign-in is only allowed in development builds/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EXPO_PUBLIC_BLUMI_LOCAL_QA_CODE: "135790" }),
    /Local QA sign-in is only allowed in development builds/
  )
  for (const profile of ["preview", "production"]) {
    assert.throws(
      () => resolveMobileReleaseEnvironment({ ...base, EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_BLUMI_LOCAL_QA_AUTH: "1" }),
      /Local QA sign-in is only allowed in development builds/,
      profile
    )
  }
  // The internal simulator build and a production-mode bundle (local Release, expo export) refuse it too.
  const qaPhones = { EXPO_PUBLIC_BLUMI_LOCAL_QA_PHONES: "+12025550101,+12025550102" }
  assert.throws(
    () => resolveMobileReleaseEnvironment({ ...base, EAS_BUILD_PROFILE: "native-ui-test", ...qaPhones }),
    /only allowed in development builds/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({ EAS_BUILD_PROFILE: "development", NODE_ENV: "production", ...qaPhones }),
    /only allowed in development builds/
  )
  assert.doesNotThrow(() => resolveMobileReleaseEnvironment({ ...base, EAS_BUILD_PROFILE: "development", EXPO_PUBLIC_BLUMI_LOCAL_QA_AUTH: "1", ...qaPhones }))
})

test("every EAS profile ships with voice and paid coin sales disabled", () => {
  const profiles = JSON.parse(readFileSync(resolve(mobileRoot, "eas.json"), "utf8")).build
  for (const name of ["development", "server-test", "preview", "production"]) {
    assert.equal(profiles[name].env.EXPO_PUBLIC_BLUMI_VOICE_ENABLED, "0")
  }
  for (const name of ["server-test", "preview", "production"]) {
    assert.equal(profiles[name].env.EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED, "0")
  }
})

test("all app configurations remove microphone and camera permissions", () => {
  const sourceConfig = JSON.parse(read("app.json")).expo
  const originalProfile = process.env.EAS_BUILD_PROFILE
  const originalApi = process.env.EXPO_PUBLIC_BLUMI_API_HTTP_URL
  const originalWs = process.env.EXPO_PUBLIC_REALTIME_EDGE_WS_URL
  const originalVoiceEnabled = process.env.EXPO_PUBLIC_BLUMI_VOICE_ENABLED
  try {
    process.env.EAS_BUILD_PROFILE = "development"
    process.env.EXPO_PUBLIC_BLUMI_VOICE_ENABLED = "0"
    const configured = require("../app.config.js")({ config: sourceConfig })
    assert.equal(configured.ios.infoPlist.NSMicrophoneUsageDescription, undefined)
    assert.equal(configured.ios.infoPlist.NSCameraUsageDescription, undefined)
    assert.equal(configured.plugins.includes("@config-plugins/react-native-webrtc"), false)
    assert.equal(configured.plugins.includes("./plugins/withAudioOnlyLiveRoom"), false)
    assert.equal(configured.android.permissions.includes("android.permission.RECORD_AUDIO"), false)
    assert.equal(configured.android.permissions.includes("android.permission.MODIFY_AUDIO_SETTINGS"), false)
    assert.equal(configured.android.permissions.includes("android.permission.CAMERA"), false)
    assert.ok(configured.android.blockedPermissions.includes("android.permission.RECORD_AUDIO"))
    assert.ok(configured.android.blockedPermissions.includes("android.permission.MODIFY_AUDIO_SETTINGS"))
    assert.ok(configured.android.blockedPermissions.includes("android.permission.CAMERA"))
    assert.ok(configured.plugins.includes("./plugins/withNoMediaPermissions"))
    assert.match(read("src/config/env.ts"), /IS_BLUMI_VOICE_ENABLED\s*=\s*false/)
  } finally {
    if (originalProfile === undefined) delete process.env.EAS_BUILD_PROFILE
    else process.env.EAS_BUILD_PROFILE = originalProfile
    if (originalApi === undefined) delete process.env.EXPO_PUBLIC_BLUMI_API_HTTP_URL
    else process.env.EXPO_PUBLIC_BLUMI_API_HTTP_URL = originalApi
    if (originalWs === undefined) delete process.env.EXPO_PUBLIC_REALTIME_EDGE_WS_URL
    else process.env.EXPO_PUBLIC_REALTIME_EDGE_WS_URL = originalWs
    if (originalVoiceEnabled === undefined) delete process.env.EXPO_PUBLIC_BLUMI_VOICE_ENABLED
    else process.env.EXPO_PUBLIC_BLUMI_VOICE_ENABLED = originalVoiceEnabled
  }
})

test("the notification service extension is declared for EAS, marks the app for communication notifications and links no media framework", async () => {
  const withExtension = require("../plugins/withIosNotificationServiceExtension.js")
  const configured = withExtension({
    name: "Blumi",
    version: "1.0.0",
    ios: { bundleIdentifier: "com.blumi.mobile", buildNumber: "1" },
    extra: { eas: { projectId: "project" } }
  })
  assert.deepEqual(configured.extra.eas.build.experimental.ios.appExtensions, [
    { targetName: withExtension.TARGET_NAME, bundleIdentifier: "com.blumi.mobile.NotificationService", entitlements: {} }
  ])
  assert.equal(configured.extra.eas.projectId, "project")
  const entitlements = await configured.mods.ios.entitlements({ ...configured, modResults: { "aps-environment": "production" } })
  assert.deepEqual(entitlements.modResults, { "aps-environment": "production", [withExtension.COMMUNICATION_ENTITLEMENT]: true })
  const infoPlist = await configured.mods.ios.infoPlist({ ...configured, modResults: { NSUserActivityTypes: ["Existing"] } })
  assert.deepEqual(infoPlist.modResults.NSUserActivityTypes, ["Existing", "INSendMessageIntent"])
  assert.ok(configured.mods.ios.xcodeproj, "the extension target is added to the Xcode project")

  const swift = read("plugins/notificationServiceExtension/NotificationService.swift")
  const imports = [...swift.matchAll(/^import (\w+)/gm)].map((match) => match[1]).sort()
  assert.deepEqual(imports, ["Intents", "UserNotifications"], "no camera, audio or media framework")
  assert.ok(JSON.parse(read("app.json")).expo.plugins.includes("./plugins/withIosNotificationServiceExtension"))
})

test("native no-media config plugin strips every camera and microphone declaration", async () => {
  const withNoMediaPermissions = require("../plugins/withNoMediaPermissions.js")
  const configured = withNoMediaPermissions({
    android: {
      permissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.CAMERA",
        "android.permission.INTERNET"
      ],
      blockedPermissions: []
    }
  })
  assert.deepEqual(configured.android.permissions, ["android.permission.INTERNET"])
  assert.deepEqual(configured.android.blockedPermissions, [
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.CAMERA"
  ])

  const iosResult = await configured.mods.ios.infoPlist({
    ...configured,
    modResults: {
      NSMicrophoneUsageDescription: "Mic",
      NSCameraUsageDescription: "Camera",
      CFBundleIdentifier: "com.blumi.mobile"
    }
  })
  assert.deepEqual(iosResult.modResults, { CFBundleIdentifier: "com.blumi.mobile" })

  const androidResult = await configured.mods.android.manifest({
    ...configured,
    modResults: {
      manifest: {
        "uses-permission": [
          { $: { "android:name": "android.permission.RECORD_AUDIO" } },
          { $: { "android:name": "android.permission.CAMERA" } },
          { $: { "android:name": "android.permission.INTERNET" } }
        ]
      }
    }
  })
  assert.deepEqual(androidResult.modResults.manifest["uses-permission"], [
    { $: { "android:name": "android.permission.INTERNET" } }
  ])
})

test("release builds reject QA inventory unlocks, demo sessions and dev entry routes", () => {
  const secureReleaseEnvironment = {
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app"
  }

  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS: "1"
    }),
    /QA avatar unlock/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "1"
    }),
    /Demo sessions cannot be enabled/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
      EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE: "mini-room-rig-preview"
    }),
    /Development entry routes cannot be enabled/
  )
  assert.doesNotThrow(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0"
    })
  )
  assert.equal(
    resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
      EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
      EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com"
    }).paidCoinsEnabled,
    "0"
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
      EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED: "1",
      EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
      EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com"
    }),
    /paid coin sales are deferred/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
      EXPO_PUBLIC_BLUMI_VOICE_ENABLED: "1",
      EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
      EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com"
    }),
    /Live voice and microphone access are disabled/
  )
})

test("production resolves a complete fail-closed environment", () => {
  assert.deepEqual(resolveMobileReleaseEnvironment({
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app/",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app/",
    EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
    EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS: "0",
    EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
    EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
    EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
    EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test_ios",
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test_android"
  }), {
    buildProfile: "production",
    apiHttpUrl: "https://api.blumi.app",
    realtimeWsUrl: "wss://realtime.blumi.app",
    mediaMode: "native",
    qaUnlockAvatarItems: "0",
    enableDemo: "0",
    devEntryRoute: undefined,
    localQaAuth: "0",
    sentryDsn: "https://public@example.ingest.sentry.io/123",
    posthogApiKey: "phc_public",
    posthogHost: "https://eu.i.posthog.com",
    paidCoinsEnabled: "0",
    voiceEnabled: "0",
    revenueCatIosApiKey: "appl_test_ios",
    revenueCatAndroidApiKey: "goog_test_android"
  })
})

test("release app configuration requires EAS linkage and accepts the promoted source tree", () => {
  const env = {
    ...process.env,
    EAS_BUILD_PROFILE: "preview",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.example.test",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://api.example.test",
    EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
    EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
    EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
    EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
    EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "appl_test_ios",
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "goog_test_android"
  }
  const code = `const app=require('./app.config.js'); app({config:{extra:{}}})`
  const missing = spawnSync(process.execPath, ["-e", code], { cwd: mobileRoot, env, encoding: "utf8" })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /linked EAS projectId/)

  const linked = spawnSync(process.execPath, ["-e", `const app=require('./app.config.js'); const config=app({config:{extra:{eas:{projectId:'project-test'}}}}); if(config.extra.eas.projectId!=='project-test') process.exit(1)`], {
    cwd: mobileRoot, env, encoding: "utf8"
  })
  assert.equal(linked.status, 0, linked.stderr)
  assert.doesNotMatch(linked.stderr, /candidate asset imports/)

  const development = spawnSync(process.execPath, ["-e", `const app=require('./app.config.js'); app({config:{extra:{}}})`], {
    cwd: mobileRoot,
    env: { ...process.env, EAS_BUILD_PROFILE: "development" },
    encoding: "utf8"
  })
  assert.equal(development.status, 0, development.stderr)
})

test("candidate asset release guard catches static imports and ignores ordinary runtime assets", () => {
  const references = findCandidateAssetImports([
    {
      filePath: "OnboardingWelcomeHomeScene.tsx",
      content: 'const cottage = require("./assets/welcome-v1-candidate/cottage.png")'
    },
    {
      filePath: "ApprovedScene.tsx",
      content: 'const cottage = require("./assets/welcome-v1-runtime/cottage.png")'
    }
  ])
  assert.deepEqual(references, [{
    filePath: "OnboardingWelcomeHomeScene.tsx",
    assetPath: "./assets/welcome-v1-candidate/cottage.png"
  }])

  assert.doesNotThrow(() => assertNoCandidateAssetImportsInSourceRoot(resolve(mobileRoot, "src")))
})

test("candidate asset release guard also catches a plural candidates directory", () => {
  const references = findCandidateAssetImports([
    {
      filePath: "MaleHairPreview.tsx",
      content: 'import hair from "../assets/male-hair-v2/candidates/front.png"'
    }
  ])
  assert.deepEqual(references, [{
    filePath: "MaleHairPreview.tsx",
    assetPath: "../assets/male-hair-v2/candidates/front.png"
  }])
})

test("candidate asset release guard still rejects a source root that imports a candidate asset", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "blumi-candidate-guard-"))
  try {
    writeFileSync(
      join(fixtureRoot, "Scene.tsx"),
      'const cottage = require("./assets/welcome-v1-candidate/cottage.png")\n'
    )
    writeFileSync(
      join(fixtureRoot, "Scene.test.tsx"),
      'const cottage = require("./assets/welcome-v1-candidate/cottage.png")\n'
    )
    assert.throws(
      () => assertNoCandidateAssetImportsInSourceRoot(fixtureRoot),
      /candidate asset imports.*Scene\.tsx \(1\)/
    )
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test("release crash reporting sends no PII, screenshots or view hierarchy", () => {
  const crashReporting = read("src/observability/crashReporting.ts")

  assert.match(crashReporting, /sendDefaultPii:\s*false/)
  assert.match(crashReporting, /attachScreenshot:\s*false/)
  assert.match(crashReporting, /attachViewHierarchy:\s*false/)
})

test("release telemetry is optional and validates supplied configuration", () => {
  const release = {
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app",
    EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
    EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
    EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123"
  }
  for (const profile of ["preview", "production"]) {
    const result = resolveMobileReleaseEnvironment({
      ...release,
      EAS_BUILD_PROFILE: profile,
      EXPO_PUBLIC_SENTRY_DSN: ""
    })
    assert.equal(result.sentryDsn, undefined)
    assert.equal(result.posthogApiKey, undefined)
    assert.equal(result.posthogHost, undefined)
  }
  assert.throws(() => resolveMobileReleaseEnvironment({
    ...release,
    EXPO_PUBLIC_SENTRY_DSN: "http://example.ingest.sentry.io/123"
  }), /Sentry DSN must use HTTPS/)
  assert.throws(() => resolveMobileReleaseEnvironment({
    ...release,
    EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public"
  }), /POSTHOG_HOST/)
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...release,
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
      EXPO_PUBLIC_POSTHOG_HOST: "http://eu.i.posthog.com"
    }),
    /PostHog host must use HTTPS/
  )
})

test("unconfigured Sentry omits native upload plugins while configured Sentry retains them", () => {
  for (const configured of [false, true]) {
    const env = {
      ...process.env,
      EAS_BUILD_PROFILE: "production",
      EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
      EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app",
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
      EXPO_PUBLIC_SENTRY_DSN: configured ? "https://public@example.ingest.sentry.io/123" : "",
      EXPO_PUBLIC_POSTHOG_API_KEY: "",
      EXPO_PUBLIC_POSTHOG_HOST: ""
    }
    const result = spawnSync(process.execPath, ["-e", `
      const app = require('./app.config.js');
      const input = require('./app.json').expo;
      const output = app({config: input});
      console.log(JSON.stringify(output.plugins));
    `], { cwd: mobileRoot, env, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    const plugins = JSON.parse(result.stdout)
    assert.equal(plugins.includes("@sentry/react-native"), configured)
    assert.equal(plugins.includes("./plugins/withSentryDebugSettings"), configured)
    assert.ok(plugins.includes("@react-native-firebase/app"))
  }
})

test("managed config declares the release identity, custom scheme, push, and privacy-safe permissions", () => {
  const app = JSON.parse(read("app.json")).expo

  assert.equal(app.ios.bundleIdentifier, "com.blumi.mobile")
  assert.equal(app.ios.entitlements["aps-environment"], "production")
  assert.equal(app.android.package, "com.blumi.mobile")
  assert.equal(app.scheme, "blumi")
  assert.equal(app.android.intentFilters, undefined)
  assert.deepEqual(app.android.blockedPermissions, [
    "android.permission.CAMERA",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.RECORD_AUDIO"
  ])
  assert.equal(app.android.permissions.some((permission) =>
    /CAMERA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|SYSTEM_ALERT_WINDOW/.test(permission)
  ), false)
})

test("the public mobile brand is Blumi while stable runtime identifiers remain unchanged", () => {
  const appConfig = JSON.parse(read("app.json"))

  assert.equal(appConfig.expo.name, "Blumi")
  assert.equal(appConfig.expo.slug, "blumi")
  assert.equal(appConfig.expo.scheme, "blumi")
  assert.equal(appConfig.expo.ios.bundleIdentifier, "com.blumi.mobile")
  assert.equal(appConfig.expo.android.package, "com.blumi.mobile")
  assert.equal(appConfig.expo.icon, "./assets/brand/blumi-app-icon-1024.png")
  assert.equal(
    appConfig.expo.android.adaptiveIcon.foregroundImage,
    "./assets/adaptive-icon-foreground.png"
  )
  const splashPlugin = appConfig.expo.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
  )
  assert.equal(appConfig.expo.splash, undefined)
  assert.deepEqual(splashPlugin, [
    "expo-splash-screen",
    {
      backgroundColor: "#FFF6F8"
    }
  ])
  assert.equal(appConfig.expo.android.adaptiveIcon.backgroundColor, "#F26779")
})

function read(path) {
  return readFileSync(resolve(mobileRoot, path), "utf8")
}

test("the release check refuses front (showcase) looks the owner has not approved", () => {
  const dir = mkdtempSync(join(tmpdir(), "blumi-showcase-baked-"))
  const baked = join(dir, "showcase-baked.json")
  try {
    assert.doesNotThrow(() => releaseAssets.assertShowcaseLooksOwnerApproved(join(dir, "missing.json")), "no bake, no front art")
    writeFileSync(baked, JSON.stringify({ bodies: { female: { ownerApproved: true }, male: { ownerApproved: false } } }))
    assert.throws(() => releaseAssets.assertShowcaseLooksOwnerApproved(baked), /not approved: male/)
    writeFileSync(baked, JSON.stringify({ bodies: { female: { ownerApproved: true }, male: {} } }))
    assert.throws(() => releaseAssets.assertShowcaseLooksOwnerApproved(baked), /male/)
    writeFileSync(baked, JSON.stringify({ bodies: { female: { ownerApproved: true }, male: { ownerApproved: true } } }))
    assert.doesNotThrow(() => releaseAssets.assertShowcaseLooksOwnerApproved(baked))
    writeFileSync(baked, "{ not json")
    assert.throws(() => releaseAssets.assertShowcaseLooksOwnerApproved(baked), /Cannot read the showcase bake/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the native UI test session reset can only be enabled in the native-ui-test profile", () => {
  const profiles = ["development", "native-ui-test", "server-test", "preview", "production"]
  const connected = {
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app"
  }
  for (const profile of profiles) {
    for (const publicProfile of [undefined, ...profiles]) {
      for (const reset of [undefined, "", "0", "1", "true", " 1 "]) {
        const environment = {
          ...connected,
          EAS_BUILD_PROFILE: profile,
          ...(publicProfile ? { EXPO_PUBLIC_BLUMI_BUILD_PROFILE: publicProfile } : {}),
          ...(reset === undefined ? {} : { EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET: reset })
        }
        const wantsReset = reset !== undefined && reset.trim() !== "" && reset.trim() !== "0"
        const shouldRefuse =
          (publicProfile !== undefined && publicProfile !== profile) ||
          (wantsReset && reset.trim() !== "1") ||
          (wantsReset && profile !== "native-ui-test")
        const label = `${profile}/${publicProfile ?? "-"}/${JSON.stringify(reset)}`
        if (shouldRefuse) {
          assert.throws(() => resolveMobileReleaseEnvironment(environment), /EXPO_PUBLIC_BLUMI_BUILD_PROFILE|session reset|SESSION_RESET/, label)
        } else {
          assert.doesNotThrow(() => resolveMobileReleaseEnvironment(environment), label)
        }
      }
    }
  }
})

test("eas.json turns the session reset on for native-ui-test only and every profile names itself", () => {
  const easProfiles = JSON.parse(read("eas.json")).build
  assert.ok(Object.keys(easProfiles).length >= 5)
  for (const [name, profile] of Object.entries(easProfiles)) {
    assert.equal(profile.env.EAS_BUILD_PROFILE, name)
    assert.equal(profile.env.EXPO_PUBLIC_BLUMI_BUILD_PROFILE, name)
    const reset = profile.env.EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET
    if (name === "native-ui-test") assert.equal(reset, "1")
    else assert.ok(reset === undefined || reset === "0", `${name} must not enable the session reset`)
    if (name === "preview" || name === "production") {
      assert.throws(
        () => resolveMobileReleaseEnvironment({
          ...profile.env,
          EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
          EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app",
          EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET: "1"
        }),
        /native-ui-test/
      )
    }
  }
})
