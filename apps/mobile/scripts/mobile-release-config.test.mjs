import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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

const DISCOVER_SCREEN_SOURCE_PATHS = [
  "src/screens/LobbyScreen.tsx",
  "src/features/discovery/screen/DiscoverDeckSurface.tsx",
  "src/features/discovery/screen/DiscoverHomeHeader.tsx",
  "src/features/discovery/screen/DiscoveryFeedbackPill.tsx",
  "src/features/discovery/screen/discoveryScreenModel.ts",
  "src/features/discovery/screen/useDiscoveryDecisions.ts",
  "src/features/discovery/screen/useDiscoveryDeck.ts",
  "src/features/discovery/screen/useDiscoveryFilters.ts",
  "src/features/discovery/screen/useDiscoveryRefresh.ts",
  "src/features/discovery/screen/useDiscoverySafetyList.ts",
  "src/features/discovery/screen/useDiscoveryStartup.ts",
  "src/features/discovery/screen/useDiscoveryWatch.ts",
  "src/features/discovery/screen/useProductionDiscoveryQuery.ts",
  "src/features/lobby/useLegacyLobbyInvites.ts",
  "src/features/lobby/useLegacyMiniRoomNavigation.ts",
  "src/features/lobby/PendingInviteStrip.tsx"
]
const require = createRequire(import.meta.url)
const legacyBrand = ["Date", "Vibe"].join("")

function readPngSize(relativePath) {
  const buffer = readFileSync(resolve(mobileRoot, relativePath))
  assert.equal(buffer.toString("ascii", 1, 4), "PNG")
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

test("development keeps explicit local defaults and demo media", () => {
  assert.deepEqual(resolveMobileReleaseEnvironment({}), {
    buildProfile: "development",
    apiHttpUrl: "http://127.0.0.1:4000",
    realtimeWsUrl: "ws://127.0.0.1:4100",
    mediaMode: "demo",
    qaUnlockAvatarItems: "0",
    enableDemo: "1",
    devEntryRoute: undefined,
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

test("iOS Debug builds do not require Sentry upload credentials", () => {
  const { configureBuildConfigurations } = require("../plugins/withSentryDebugSettings.js")
  const settings = configureBuildConfigurations({
    debug: { name: "Debug", buildSettings: {} },
    release: { name: "Release", buildSettings: {} }
  })
  assert.equal(settings.debug.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD, "true")
  assert.equal(settings.release.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD, undefined)
  assert.ok(JSON.parse(read("app.json")).expo.plugins.includes("./plugins/withSentryDebugSettings"))
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

test("release builds require native media and reject QA inventory unlocks", () => {
  const secureReleaseEnvironment = {
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app"
  }

  assert.throws(
    () => resolveMobileReleaseEnvironment(secureReleaseEnvironment),
    /native media/
  )
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

test("user-approved onboarding and profile artwork resolves from approved runtime paths", () => {
  const promotedSources = [
    "src/features/session/onboardingRunAssetCatalog.ts",
    "src/features/session/onboardingArrivalAssetCatalog.ts",
    "src/features/session/ProfileCharacterReactionStage.tsx",
    "src/features/session/OnboardingWelcomeHomeScene.tsx"
  ]
  const expectedRuntimeDirectories = new Map([
    ["src/features/session/onboardingRunAssetCatalog.ts", [
      "onboarding-wave-v3-runtime",
      "onboarding-runners-v3-runtime",
      "onboarding-runners-v10-synced-runtime"
    ]],
    ["src/features/session/onboardingArrivalAssetCatalog.ts", ["onboarding-arrival-v3-runtime"]],
    ["src/features/session/ProfileCharacterReactionStage.tsx", ["profile-character-reaction-v4-runtime"]],
    ["src/features/session/OnboardingWelcomeHomeScene.tsx", ["onboarding-welcome-home-v1-runtime"]]
  ])
  for (const sourcePath of promotedSources) {
    const source = read(sourcePath)
    assert.deepEqual(findCandidateAssetImports([{ filePath: sourcePath, content: source }]), [])
    const assetPaths = [...source.matchAll(/require\("(\.\/assets\/[^"]+\.png)"\)/g)].map((match) => match[1])
    assert.ok(assetPaths.length > 0, `${sourcePath} should reference runtime artwork`)
    for (const assetPath of assetPaths) {
      assert.doesNotMatch(assetPath, /candidate/, `${sourcePath} -> ${assetPath}`)
      assert.ok(
        existsSync(resolve(mobileRoot, "src/features/session", assetPath)),
        `${sourcePath} -> ${assetPath} must resolve`
      )
    }
    for (const directory of expectedRuntimeDirectories.get(sourcePath)) {
      assert.ok(source.includes(`./assets/${directory}/`), `${sourcePath} should use ${directory}`)
    }
  }
  assert.equal(read("src/features/session/onboardingRunAssetCatalog.ts").match(/require\(/g).length, 34)
  assert.equal(readPngSize("src/features/session/assets/profile-character-reaction-v4-runtime/blumi_profile_twirling_female_atlas_v4_final.png").width, 1024)
  assert.equal(readPngSize("src/features/session/assets/onboarding-arrival-v3-runtime/blumi_intro_arrival_female_atlas.png").width, 256 * 6)
})

test("release crash reporting uses the official Sentry integration without PII", () => {
  const app = read("App.tsx")
  const crashReporting = read("src/observability/crashReporting.ts")
  const metroConfig = read("metro.config.js")
  const appConfig = read("app.json")

  assert.match(app, /initializeCrashReporting\(\)/)
  assert.ok(
    app.indexOf("initializeCrashReporting()") < app.indexOf("assertLegalReleaseReady({"),
    "crash reporting must start before the startup legal assertion so a failed release check is reported"
  )
  assert.match(crashReporting, /sendDefaultPii:\s*false/)
  assert.match(crashReporting, /attachScreenshot:\s*false/)
  assert.match(crashReporting, /attachViewHierarchy:\s*false/)
  assert.match(metroConfig, /getSentryExpoConfig/)
  assert.match(appConfig, /@sentry\/react-native/)
  assert.equal(JSON.parse(appConfig).expo.plugins.includes("@sentry/react-native"), true)
})

test("managed project stays aligned with the Expo SDK 57 platform contract", () => {
  const packageJson = JSON.parse(read("package.json"))
  const tsconfig = JSON.parse(read("tsconfig.json"))

  assert.match(packageJson.dependencies.expo, /^~57\.0\./)
  assert.match(packageJson.dependencies.react, /^19\.2\./)
  assert.equal(packageJson.dependencies["react-native"], "0.86.3")
  assert.equal(tsconfig.compilerOptions.baseUrl, undefined)
  assert.deepEqual(tsconfig.compilerOptions.paths["@contracts"], [
    "../../packages/contracts/src/index.ts"
  ])
  assert.match(packageJson.dependencies["react-native-purchases"], /^\^10\./)
})

test("release bundle imports only the fonts and icon family used by the app", () => {
  const app = read("App.tsx")
  const sourceFiles = [
    "src/screens/MyRoomEditorScreen.tsx",
    "src/features/roomV2/editor/RoomEditorTopBar.tsx",
    "src/features/roomV2/editor/RoomEditorPersistenceBanner.tsx",
    "src/features/roomV2/editor/RoomEditorStage.tsx",
    "src/features/roomV2/editor/RoomEditorSelectedItemActions.tsx",
    "src/features/roomV2/editor/RoomEditorInventoryControls.tsx",
    "src/features/roomV2/editor/RoomEditorStageTools.tsx",
    "src/features/roomV2/editor/RoomEditorCategoryTabs.tsx",
    "src/features/roomV2/editor/InventoryCatalogCard.tsx",
    "src/features/roomV2/editor/RoomEditorLoadingOverlay.tsx",
    "src/screens/LegalScreen.tsx",
    "src/screens/RegisterScreen.tsx",
    "src/features/session/register/RegisterCreateView.tsx",
    "src/features/session/register/RegisterSignInView.tsx",
    "src/features/session/register/RegisterOtpEntry.tsx",
    "src/features/session/register/RegisterTermsConsent.tsx",
    "src/features/session/register/RegisterErrorNotice.tsx",
    "src/features/session/register/RegisterFormMetaRow.tsx",
    "src/screens/AuthEntryScreen.tsx",
    "src/screens/MyRoomScreen.tsx",
    "src/screens/CosmeticShopScreen.tsx",
    ...readdirSync(resolve(mobileRoot, "src/features/shop/screen"))
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => `src/features/shop/screen/${name}`),
    "src/screens/MatchResultScreen.tsx",
    "src/screens/WardrobeV2Screen.tsx",
    "src/features/avatarV2/wardrobe/wardrobeTryOn.ts",
    "src/features/avatarV2/wardrobe/useWardrobeTryOn.ts",
    "src/features/avatarV2/wardrobe/WardrobeCatalogCard.tsx",
    "src/features/avatarV2/wardrobe/WardrobeCategoryTabs.tsx",
    "src/features/avatarV2/wardrobe/WardrobeSectionSwitcher.tsx",
    "src/features/avatarV2/wardrobe/WardrobeTopBar.tsx",
    "src/features/avatarV2/wardrobe/WardrobePreviewStage.tsx",
    "src/features/avatarV2/wardrobe/WardrobeSaveError.tsx",
    "src/features/avatarV2/wardrobe/WardrobeCatalogEmpty.tsx",
    "src/features/avatarV2/wardrobe/WardrobeCatalogList.tsx",
    "src/ui/bottomNav.tsx",
    "src/ui/AvatarFrame.tsx"
  ].map(read).join("\n")

  assert.doesNotMatch(app, /from "@expo-google-fonts\/inter"/)
  assert.match(app, /@expo-google-fonts\/inter\/400Regular/)
  assert.doesNotMatch(sourceFiles, /from "@expo\/vector-icons"/)
  assert.match(sourceFiles, /@expo\/vector-icons\/Ionicons/)
})

test("Blumi Room keeps text chat and declares no live audio or camera permission", () => {
  const appConfig = read("app.json")
  const app = JSON.parse(appConfig)
  const mobilePackage = JSON.parse(read("package.json"))
  const mediaHook = read("src/features/miniRoom/useMiniRoomMedia.ts")
  const miniRoomScreen = read("src/screens/MiniRoomScreen.tsx")
  const miniRoomScene = read("src/features/miniRoom/scene/MiniRoomScene.tsx")

  assert.match(appConfig, /\.\/plugins\/withNoMediaPermissions/)
  assert.doesNotMatch(appConfig, /@config-plugins\/react-native-webrtc|withAudioOnlyLiveRoom/)
  assert.match(appConfig, /"blockedPermissions":\s*\[\s*"android\.permission\.CAMERA"/)
  assert.equal(app.expo.android.permissions.includes("android.permission.CAMERA"), false)
  assert.deepEqual(app.expo.android.blockedPermissions, [
    "android.permission.CAMERA",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.RECORD_AUDIO"
  ])
  assert.doesNotMatch(appConfig, /NSCameraUsageDescription/)
  assert.doesNotMatch(appConfig, /NSMicrophoneUsageDescription/)
  for (const name of ["@livekit/react-native", "@livekit/react-native-webrtc", "livekit-client", "react-native-webrtc", "expo-camera", "expo-av", "expo-audio"]) {
    assert.equal(mobilePackage.dependencies[name], undefined, `${name} must not ship in text-only Blumi`)
  }
  const lock = JSON.parse(readFileSync(resolve(mobileRoot, "../../package-lock.json"), "utf8"))
  const mediaPackages = Object.keys(lock.packages).filter((path) =>
    /(?:^|\/)node_modules\/(?:@livekit\/[^/]+|livekit-client|react-native-webrtc|expo-camera|expo-av|expo-audio)$/.test(path)
  )
  assert.deepEqual(mediaPackages, [], "Transitive capture packages must not enter the native binary")
  assert.doesNotMatch(mediaHook, /createLivekitClient|setMicrophoneEnabled/)
  assert.doesNotMatch(mediaHook, /toggleCamera|cameraEnabled/)
  assert.match(miniRoomScreen, /useInRoomChat/)
  // The room's text composer is its own view since 2026-10-01; the scene mounts it.
  assert.match(miniRoomScene, /<RoomChatComposer\b/)
  assert.match(read("src/features/miniRoom/scene/RoomChatComposer.tsx"), /<TextInput/)
})

test("privacy copy accurately describes first-release text rooms and deferred audio", () => {
  const legalScreen = read("src/screens/LegalScreen.tsx")
  const legalCopy = read("src/features/legal/legalCopy.ts")

  assert.match(legalScreen, /getLegalContent\(/)
  assert.match(legalCopy, /shared room, you can use text chat/)
  assert.match(legalCopy, /Live audio is unavailable in this version/)
  assert.doesNotMatch(legalCopy, /Live camera and microphone media/)
  assert.match(legalCopy, /Your phone number, exact location, reports, and private messages are not shown/)
  assert.match(legalCopy, /does not request camera access or transmit audio to LiveKit/)
  assert.match(legalCopy, /RevenueCat/)
  assert.match(legalCopy, /coin balance and debt/i)
})

test("Metro defers heavy screen modules until first use", async () => {
  const metroConfig = require(resolve(mobileRoot, "metro.config.js"))
  const options = await metroConfig.transformer.getTransformOptions()

  assert.equal(options.transform.inlineRequires, true)
})

test("infinite UI animations stop when their surface is hidden", () => {
  const matchResult = read("src/components/MatchResultModal.tsx")

  assert.match(matchResult, /entranceAnimationRef/)
  assert.match(matchResult, /entranceAnimationRef\.current\?\.stop\(\)/)
  assert.match(matchResult, /return stopEntrance/)
})

test("room runtime ships only the production shell and layered avatar", () => {
  // roomV2ProductionAssets.ts is the only room asset module in the production
  // graph (the QA-only roomV2Assets.ts was retired with the Room VNext QA art).
  const assets = read("src/features/roomV2/roomV2ProductionAssets.ts")
  const runtimeAssets = readdirSync(resolve(
    mobileRoot,
    "src/features/roomV2/assets/runtime"
  ))

  assert.match(assets, /room_shell_blumi_world_v1\.webp/)
  assert.doesNotMatch(assets, /placeholder|empty_foundation|avatar_room_blumi_v1/)
  assert.equal(
    runtimeAssets.some((name) =>
      /placeholder|empty_foundation|avatar_room_blumi_v1/.test(name)
    ),
    false
  )
})

test("shop cards show product cutouts while selection updates the live avatar preview", () => {
  const shop = read("src/screens/CosmeticShopScreen.tsx")
  const shopCard = read("src/features/shop/screen/ShopProductCard.tsx")
  const shopPreviewSelection = read("src/features/shop/screen/useShopPreviewSelection.ts")
  const shopPurchaseActions = read("src/features/shop/screen/useShopPurchaseActions.ts")
  const shopAssets = read("src/features/shop/shopAssets.ts")
  const shopPreview = read("src/features/shop/ShopPreviewPanel.tsx")

  assert.match(shopAssets, /export const SHOP_THUMBNAIL_SOURCES/)
  assert.match(shopCard, /getShopProductThumbnailSource\(product\.sourceItemId\)/)
  assert.match(shopCard, /<AvatarProductThumbnail[\s\S]*source=\{avatarPreviewSource\}/)
  assert.match(shopPurchaseActions, /shopCombinationDraftToAvatar\([\s\S]*?combinationStateRef\.current\.draft,[\s\S]*?avatarV2\.avatar/)
  assert.match(shopPreviewSelection, /shopCombinationDraftToAvatar\([\s\S]*?combinationStateRef\.current\.draft,[\s\S]*?avatar/)
  for (const source of [shop, shopPreviewSelection, shopPurchaseActions]) {
    assert.doesNotMatch(source, /multiItemApplyEnabled\s*\?\s*shopCombinationDraftToAvatar/)
  }
  assert.match(shopPurchaseActions, /if \(savedAvatar\) \{[\s\S]*?createShopCombinationState\([\s\S]*?equipped:\s*avatarToShopCombinationDraft\(savedAvatar\)/)
  assert.match(shop, /<ShopPreviewPanel[\s\S]*previewAvatar=\{previewAvatar\}/)
  assert.match(shopPreview, /export function ShopPreviewPanel\(/)
})

test("shop exit discards previews and cannot interrupt an active transaction", () => {
  const shop = read("src/screens/CosmeticShopScreen.tsx")
  const combinationSession = read("src/features/shop/screen/useShopCombinationSession.ts")

  assert.match(combinationSession, /const shopExitLocked = combinationState\.phase !== "editing"/)
  assert.match(combinationSession, /event\.preventDefault\(\)/)
  assert.match(shop, /disabled=\{shopExitLocked\}/)
  assert.match(combinationSession, /dispatchCombination\(\{ type: "discard_draft" \}\)/)
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

test("production UI and session runtime hide and reject demo entry", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")
  const sessionState = read("src/features/session/useSessionState.ts")
  const environment = read("src/config/env.ts")
  const navigator = read("src/navigation/RootNavigator.tsx")

  assert.match(authEntry, /IS_BLUMI_DEMO_ENABLED/)
  assert.match(authEntry, /IS_BLUMI_DEMO_ENABLED\s*\?\s*\(/)
  assert.match(sessionState, /if \(!IS_BLUMI_DEMO_ENABLED\)/)
  assert.match(environment, /EXPO_PUBLIC_BLUMI_ENABLE_DEMO/)
  assert.match(environment, /EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE/)
  assert.match(
    navigator,
    /sessionActor\.session\.mode === "production"/
  )
})

test("MiniRoom rig preview is Debug-only and has no server or media side effects", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const preview = read("src/screens/MiniRoomRigPreviewScreen.tsx")

  assert.match(navigator, /canApplyBlumiDevEntry\(\{[\s\S]*isDevelopmentRuntime:\s*__DEV__/)
  assert.match(navigator, /BLUMI_DEV_ENTRY_ROUTE === "mini-room-rig-preview"/)
  assert.match(
    navigator,
    /\{CAN_REGISTER_MINI_ROOM_RIG_PREVIEW\s*\?\s*\([\s\S]*name="MiniRoomRigPreview"[\s\S]*\)\s*:\s*null\}/
  )
  assert.doesNotMatch(preview, /useGlobalRealtime|useMiniRoomMedia|useMiniRoomReactions|useInRoomChat/)
  assert.doesNotMatch(preview, /MediaSessionToken|livekit|sessionToken|readyMiniRoom/)
  assert.match(preview, /createCurrentUserAvatarSnapshot/)
  assert.match(preview, /<MiniRoomScene/)
})

test("legacy Universal Core gallery is removed in favor of the current My Room QA flow", () => {
  const environment = read("src/config/env.ts")
  const navigator = read("src/navigation/RootNavigator.tsx")
  const deferredBundles = read("src/navigation/deferredScreenBundles.tsx")

  assert.doesNotMatch(environment, /"universal-core-qa"/)
  assert.doesNotMatch(navigator, /UniversalCoreQaGallery/)
  assert.doesNotMatch(deferredBundles, /UniversalCoreQaGalleryScreen/)
  assert.match(environment, /\|\s*"myroom"/)
  assert.match(navigator, /BLUMI_DEV_ENTRY_ROUTE === "myroom"/)
  assert.match(navigator, /navigationRef\.navigate\("MyRoom"\)/)
})

test("legacy local Shared Match Room cannot ship beside the server-backed Mini Room flow", () => {
  const environment = read("src/config/env.ts")
  const navigator = read("src/navigation/RootNavigator.tsx")
  const deferredBundles = read("src/navigation/deferredScreenBundles.tsx")

  assert.equal(
    existsSync(resolve(mobileRoot, "src/screens/SharedMatchRoomScreen.tsx")),
    false
  )
  assert.equal(
    existsSync(resolve(mobileRoot, "src/features/matches/sharedMatchRoomRuntime.ts")),
    false
  )
  assert.doesNotMatch(environment, /shared-match-room/)
  assert.doesNotMatch(navigator, /SharedMatchRoom/)
  assert.doesNotMatch(deferredBundles, /SharedMatchRoomScreen|sharedMatchRoomScreenBundle/)
  assert.doesNotMatch(
    read("src/features/matches/matchRoomModel.ts"),
    /SharedRoomConversation|appendRoomMessage|appendRoomReaction/
  )
  assert.match(navigator, /name="MiniRoom"/)
})

test("unreachable Saved Connections UI and its orphan profile context are removed", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const linkedProfile = read("src/navigation/LinkedProfileScreen.tsx")
  const profilePreview = read("src/screens/ProfilePreviewScreen.tsx")

  assert.equal(
    existsSync(resolve(mobileRoot, "src/screens/SavedConnectionsScreen.tsx")),
    false
  )
  assert.doesNotMatch(navigator, /SavedConnections|SavedProfileConnectionContext/)
  assert.doesNotMatch(linkedProfile, /savedConnection|contextOverride/)
  assert.doesNotMatch(
    profilePreview,
    /SavedProfileConnectionContext|isSavedConnection|canMessageSavedConnection/
  )
})

test("production MiniRoom carries and renders the partner avatar instead of a demo stand-in", () => {
  const lobby = read("src/features/lobby/useLegacyMiniRoomNavigation.ts")
  const miniRoom = read("src/screens/MiniRoomScreen.tsx")
  const miniRoomAssetsPath = "src/features/miniRoom/scene/miniRoomAssets.ts"
  const miniRoomAssets = read(miniRoomAssetsPath)

  assert.match(
    lobby,
    /avatarSnapshot:\s*createCandidateAvatarSnapshot\(\{[\s\S]*avatarPresetId:\s*partnerAvatarPresetId/
  )
  assert.match(lobby, /readyMiniRoom\.participants\.find/)
  assert.match(lobby, /partnerParticipant\?\.avatar\.presetId/)
  assert.match(miniRoom, /createMiniRoomPartnerAvatarSnapshot/)
  assert.doesNotMatch(miniRoom, /demo_partner_fallback|avatars\.partnerBoy/)
  assert.doesNotMatch(miniRoomAssets, /avatar_(?:boy|girl)_fullbody/)
  for (const match of miniRoomAssets.matchAll(/require\("([^"]+)"\)/g)) {
    const absoluteAssetPath = resolve(
      mobileRoot,
      dirname(miniRoomAssetsPath),
      match[1]
    )
    assert.equal(
      existsSync(absoluteAssetPath),
      true,
      `Missing MiniRoom runtime asset: ${match[1]}`
    )
  }
})

test("store UI is honest, globally usable, and consistently branded", () => {
  const environment = read("src/config/env.ts")
  // Discover is LobbyScreen plus the feature modules it composes.
  const lobby = DISCOVER_SCREEN_SOURCE_PATHS.map(read).join("\n")
  const myRoom = read("src/screens/MyRoomScreen.tsx")
  const registerFeature = "src/features/session/register"
  const registerPhoneEntry = read(`${registerFeature}/RegisterPhoneEntry.tsx`)
  const registerSignIn = read(`${registerFeature}/RegisterSignInView.tsx`)
  const register = [
    read("src/screens/RegisterScreen.tsx"),
    read(`${registerFeature}/RegisterCreateView.tsx`),
    registerSignIn,
    registerPhoneEntry,
    read(`${registerFeature}/RegisterOtpEntry.tsx`),
    read(`${registerFeature}/registerScreenModel.ts`)
  ].join("\n")
  const authEntryCopy = read("src/features/session/authEntryCopy.ts")
  const roomDebrief = read("src/screens/RoomDebriefScreen.tsx")
  const settings = read("src/screens/SettingsScreen.tsx")
  const settingsAccount = read("src/features/settings/SettingsAccountSection.tsx")
  const settingsCopy = read("src/features/settings/settingsCopy.ts")
  const smsProvider = read("../server/src/auth/smsProvider.ts")
  const firebaseAuth = read("src/features/session/firebasePhoneAuth.ts")
  const realtimeRouter = read("../server/src/realtime/realtimeRouter.ts")
  const navigator = read("src/navigation/RootNavigator.tsx")
  const avatarSetup = read("src/screens/AvatarSetupScreen.tsx")
  const avatarStage = read(
    "src/features/avatarV2/components/AvatarSetupStudioStage.tsx"
  )

  assert.match(
    environment,
    /EXPO_PUBLIC_BLUMI_ENABLE_DEMO\?\.trim\(\)\s*===\s*"1"/
  )
  assert.doesNotMatch(lobby, /runIrmakDemo|Irmak accepted|demo\.livekit\.invalid/)
  assert.doesNotMatch(lobby, /return "Nearby"|canInvite:\s*true/)
  assert.doesNotMatch(lobby, /Here together|nearby and active right now/)
  assert.doesNotMatch(myRoom, /3 new likes|View room likes/)
  assert.doesNotMatch(register, /\+90 5XX XXX XX XX/)
  assert.match(registerPhoneEntry, /<CountryCallingCodePicker/)
  assert.match(registerPhoneEntry, /authCopy\.automaticCallingCodeHint/)
  assert.match(authEntryCopy, /enter only your local number/)
  assert.doesNotMatch(register, /YOUR BLUMI ACCOUNT/)
  assert.match(registerSignIn, /<BrandMark size=\{28\}/)
  assert.match(registerSignIn, /style=\{styles\.brandText\}>Blumi<\/Text>/)
  assert.doesNotMatch(roomDebrief, /addInventoryCoins/)
  assert.match(settings, /onSignOut=\{handleSignOutPrompt\}/)
  assert.match(settingsAccount, /label=\{copy\.signOut\}/)
  assert.match(settingsAccount, /onPress=\{onSignOut\}/)
  assert.match(settingsCopy, /signOut:\s*"Sign out"/)
  assert.match(settingsCopy, /signOut:\s*"Çıkış yap"/)
  assert.match(firebaseAuth, /signInWithPhoneNumber\(/)
  assert.match(firebaseAuth, /confirmation\.confirm\(verificationCode\)/)
  assert.doesNotMatch(smsProvider, /fetch\(|https:\/\//)
  assert.equal(realtimeRouter.includes(`title: "${legacyBrand}"`), false)
  assert.doesNotMatch(navigator, /\bRoomV2Preview\b|\bRoomShop\b/)
  assert.equal(existsSync(resolve(mobileRoot, "src/screens/RoomV2PreviewScreen.tsx")), false)
  assert.match(avatarStage, /testID="avatar-gender-woman"/)
  assert.match(avatarStage, /testID="avatar-gender-man"/)
  assert.match(avatarStage, /onSelectGender\("woman"\)/)
  assert.match(avatarStage, /onSelectGender\("man"\)/)
  assert.match(
    avatarSetup,
    /gender === "man" \? MALE_STARTER_BODY_ID : FEMALE_STARTER_BODY_ID/
  )
})

test("production profile and chat actions never fall back to local demo behavior", () => {
  const profilePreview = read("src/screens/ProfilePreviewScreen.tsx")
  // The conversation surface: the screen plus every non-test thread module.
  const chatThread = [
    read("src/screens/ChatThreadScreen.tsx"),
    ...readdirSync(new URL("../src/features/chat/thread/", import.meta.url))
      .filter((fileName) => /\.tsx?$/.test(fileName) && !/\.test\.tsx?$/.test(fileName))
      .map((fileName) => read(`src/features/chat/thread/${fileName}`))
  ].join("\n")
  const matchResult = read("src/screens/MatchResultScreen.tsx")
  const discoverCard = read("src/components/DiscoverCard.tsx")
  const navigator = read("src/navigation/RootNavigator.tsx")

  assert.match(
    profilePreview,
    /profile\.decisionCapability === "unavailable"/
  )
  assert.doesNotMatch(profilePreview, /\bprofile\.canInvite\b/)
  assert.doesNotMatch(chatThread, /createLocalDemoMatch/)
  assert.doesNotMatch(chatThread, /TypingIndicator/)
  assert.doesNotMatch(chatThread, /setTimeout\(\(\) => setIsLoadingEarlier\(false\), 700\)/)
  // The chat callbacks reach ChatThread as a prop typed by chatThreadBindings, not as route params.
  assert.match(read("src/features/chat/thread/chatThreadBindings.ts"), /requestMessages: \(threadId: string, options\?: FetchThreadMessagesOptions\) => Promise<void>/)
  assert.match(navigator, /bindings=\{chatThreadBindings\}/)
  assert.match(matchResult, /const canStartConversation = canOpenMatchExperience\(sessionActor\)/)
  assert.match(matchResult, /navigation\.reset\(/)
  assert.doesNotMatch(matchResult, /canEnterSharedRoom|Go to Room|SharedMatchRoom/)
  assert.doesNotMatch(discoverCard, /Save this vibe for later|Taking it slow/)
})

test("Room sync alerts are actionable without raw backend diagnostics", () => {
  const provider = read("src/features/roomV2/state/RoomV2Provider.tsx")
  const editorScreen = read("src/screens/MyRoomEditorScreen.tsx")
  // The editor's sync banner is the RoomEditorPersistenceBanner it composes.
  const preview = read("src/features/roomV2/editor/RoomEditorPersistenceBanner.tsx")
  assert.match(
    editorScreen,
    /persistenceState === "failed" && persistenceErrorMessage \? \(\s*<RoomEditorPersistenceBanner/
  )

  assert.match(
    provider,
    /import \{ getRoomV2PersistenceErrorMessageForDisplay \} from "\.\.\/roomV2PersistenceErrorCopy"/
  )
  assert.match(
    provider,
    /getRoomV2PersistenceErrorMessageForDisplay\("load", error, \{[\s\S]*?hasLocalRoom: localDecor !== null/
  )
  assert.match(
    provider,
    /getRoomV2PersistenceErrorMessageForDisplay\("sync", error, \{[\s\S]*?isSavedOnDevice: pending\.isSavedOnDevice/
  )
  assert.match(provider, /isSavedOnDevice: boolean/)
  assert.doesNotMatch(provider, /error\.message/)
  assert.match(preview, /accessibilityRole="alert"/)
  assert.match(preview, /accessibilityLabel=\{copy\.retrySync\}/)
})

test("shared session errors redact native diagnostics before they reach user-visible screens", () => {
  const sessionState = read("src/features/session/useSessionState.ts")
  const sessionCopy = read("src/features/session/sessionErrorCopy.ts")

  assert.match(
    sessionState,
    /import \{ getSessionErrorMessageForDisplay \} from "\.\/sessionErrorCopy"/
  )
  assert.match(sessionState, /return getSessionErrorMessageForDisplay\(error\)/)
  assert.doesNotMatch(
    sessionState,
    /function getErrorMessage\(error: unknown\): string \{[\s\S]*?return error\.message/
  )
  assert.match(sessionCopy, /"expomodulescore"/)
  assert.match(sessionCopy, /"promise\.swift"/)
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

test("navigation links and offline status remain wired to native runtime", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const rootLinking = read("src/navigation/rootLinking.ts")
  const networkStore = read("src/features/network/networkStore.ts")
  const connectionBanner = read("src/features/realtime/connectionBanner/ConnectionBanner.tsx")
  const connectionBannerState = read("src/features/realtime/connectionBanner/useConnectionBannerState.ts")
  const connectionBannerModel = read("src/features/realtime/connectionBanner/connectionBannerModel.ts")
  const connectionBannerCopy = read("src/features/realtime/connectionBanner/connectionBannerCopy.ts")

  assert.match(rootLinking, /prefixes: \["blumi:\/\/"\]/)
  for (const path of [
    "discover",
    "inbox",
    "chat/:threadId",
    "profile/:userId",
    "settings",
    "room",
    "wardrobe",
    "shop"
  ]) {
    assert.match(rootLinking, new RegExp(`"${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`))
  }
  assert.match(navigator, /import \{ linking \} from "\.\/rootLinking"/)
  assert.match(navigator, /linking=\{linking\}/)
  // SYS-3: the banner subscribes to the connection state itself, so a
  // reconnect re-renders only the banner, not the navigator.
  assert.match(navigator, /<RootConnectionBanner \/>/)
  assert.match(read("src/navigation/RootConnectionBanner.tsx"), /const \{ connectionStatus \} = useGlobalRealtime\(\)\s*return <ConnectionBanner status=\{connectionStatus\} \/>/)
  assert.match(networkStore, /NetInfo\.addEventListener/)
  assert.doesNotMatch(networkStore, /\bany\b|console\.warn|try\s*\{\s*require/)
  // Updated 2026-09-30 (owner feedback): the banner moved to
  // features/realtime, waits out a foreground grace period so a resume
  // reconnect stays invisible, and uses the app locale (TR/EN) with shorter copy.
  assert.match(connectionBanner, /useConnectionBannerState\(status\)/)
  assert.match(connectionBanner, /getAppLocale/)
  assert.match(connectionBanner, /pointerEvents="none"/)
  assert.match(connectionBannerState, /isConnected/)
  assert.match(connectionBannerModel, /if \(!isConnected\) return "offline"/)
  assert.match(connectionBannerModel, /CONNECTION_BANNER_GRACE_MS = 3_000/)
  assert.match(connectionBannerCopy, /No internet connection/)
  assert.match(connectionBannerCopy, /İnternet bağlantısı yok/)
  assert.match(connectionBannerCopy, /Can't reach Blumi/)
  assert.doesNotMatch(connectionBannerCopy, /Reconnecting to Blumi/)
  assert.doesNotMatch(connectionBanner, /Connecting to the room/)
  assert.doesNotMatch(DISCOVER_SCREEN_SOURCE_PATHS.map(read).join("\n"), /<ConnectionBanner/)
  assert.match(read("src/screens/SettingsScreen.tsx"), /Platform\.select/)
})

test("the public mobile brand is Blumi while stable runtime identifiers remain unchanged", () => {
  const appConfig = JSON.parse(read("app.json"))
  const brandMark = read("src/ui/brandMark.tsx")
  const brandAssetFiles = readdirSync(resolve(mobileRoot, "assets/brand"))
  const publicBrandSurfaces = [
    "src/navigation/RootNavigator.tsx",
    "src/screens/AuthEntryScreen.tsx",
    "src/screens/YouScreen.tsx",
    "src/screens/SettingsScreen.tsx",
    ...readdirSync(resolve(mobileRoot, "src/features/settings"))
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => `src/features/settings/${name}`),
    "src/ui/errorBoundary.tsx"
  ].map(read).join("\n")

  assert.equal(appConfig.expo.name, "Blumi")
  assert.equal(appConfig.expo.slug, "blumi")
  assert.equal(appConfig.expo.scheme, "blumi")
  assert.equal(appConfig.expo.ios.bundleIdentifier, "com.blumi.mobile")
  assert.equal(appConfig.expo.android.package, "com.blumi.mobile")
  assert.equal(appConfig.expo.icon, "./assets/brand/blumi-app-icon-1024.png")
  assert.deepEqual(readPngSize("assets/adaptive-icon-foreground.png"), {
    width: 1024,
    height: 1024
  })
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
  assert.equal(
    appConfig.expo.android.adaptiveIcon.foregroundImage,
    "./assets/adaptive-icon-foreground.png"
  )
  assert.match(brandMark, /blumi-app-icon-1024\.png/)
  assert.doesNotMatch(brandMark, />DV</)
  assert.equal(
    existsSync(resolve(mobileRoot, "assets/brand/blumi-app-icon-source.png")),
    true
  )
  assert.equal(brandAssetFiles.some((name) => name.endsWith(".svg")), false)
  assert.equal(publicBrandSurfaces.includes(legacyBrand), false)
})

test("native and hydrated loading surfaces share the Blumi liquid-glass identity", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const loadingScreen = read("src/ui/BlumiLoadingScreen.tsx")
  const scanStage = read("src/features/session/OnboardingScanStage.tsx")
  const appConfig = JSON.parse(read("app.json"))

  assert.match(navigator, /<BlumiLoadingScreen/)
  assert.match(loadingScreen, /OnboardingScanStage/)
  assert.match(loadingScreen, /getOnboardingBootPreludeElapsedMs/)
  assert.match(loadingScreen, /Animated\.parallel/)
  assert.match(loadingScreen, /animation\.stop\(\)/)
  assert.match(loadingScreen, /accessibilityRole="progressbar"/)
  assert.match(scanStage, /ONBOARDING_SCAN_FRAMES\.map/)
  assert.doesNotMatch(loadingScreen, /blumi-splash-mark|Meet\. Match\. Bloom\.|<Text/)
  const splashPlugin = appConfig.expo.plugins.find((plugin) =>
    Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
  )
  assert.deepEqual(splashPlugin, ["expo-splash-screen", { backgroundColor: "#FFF6F8" }])
})

test("production economy has one wallet and never grants local-only rewards", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const roomDebrief = read("src/screens/RoomDebriefScreen.tsx")
  const miniRoomService = read("../server/src/miniRooms/miniRoomService.ts")

  assert.doesNotMatch(navigator, /features\/cosmetics\/cosmeticStore/)
  assert.doesNotMatch(roomDebrief, /features\/cosmetics\/cosmeticStore/)
  assert.doesNotMatch(navigator, /addInventoryCoins|checkDailyReward/)
  assert.doesNotMatch(roomDebrief, /addInventoryCoins/)
  assert.equal(
    existsSync(resolve(mobileRoot, "src/features/rewards/dailyReward.ts")),
    false
  )
  assert.match(miniRoomService, /grantEventReward\([\s\S]*"room_complete"/)
})

test("the complete server avatar persists and drives exact remote cards", () => {
  const avatarSetup = read("src/screens/AvatarSetupScreen.tsx")
  const sessionState = read("src/features/session/useSessionState.ts")
  const discoveryDeckState = read("src/features/discovery/screen/useDiscoveryDeck.ts")
  const discoveryDeckSurface = read("src/features/discovery/screen/DiscoverDeckSurface.tsx")
  const navigator = read("src/navigation/RootNavigator.tsx")
  const linkedProfile = read("src/navigation/LinkedProfileScreen.tsx")
  const avatarPersistence = read(
    "src/features/avatarV2/avatarV2Persistence.ts"
  )
  const candidateAvatar = read(
    "src/features/avatarV2/candidateAvatarSnapshot.ts"
  )
  const discoveryCandidate = read(
    "src/features/discovery/discoveryCandidateModel.ts"
  )

  assert.match(avatarSetup, /onComplete\(starterAvatar\)/)
  assert.match(
    sessionState,
    /saveAvatarSelection:\s*\(\s*avatar:\s*UserAvatar,[\s\S]*?\)\s*=>\s*Promise<CompleteAvatarSelection>/
  )
  assert.match(sessionState, /saveProductionAvatar\([\s\S]*userAvatarToLoadout\(avatar\)/)
  const completeAvatarBlock = sessionState.slice(
    sessionState.indexOf("const completeAvatarSetup"),
    sessionState.indexOf("const completeRoomSetup")
  )
  const saveAvatarIndex = completeAvatarBlock.indexOf(
    "saveAvatarSelectionOutcome(avatar, undefined, mutationTicket)"
  )
  const completeStepIndex = completeAvatarBlock.indexOf(
    "completeProductionOnboardingStep("
  )
  assert.ok(saveAvatarIndex >= 0, "avatar setup must persist the complete server selection")
  assert.ok(
    completeStepIndex > saveAvatarIndex,
    "the server avatar must persist before onboarding is marked complete"
  )
  assert.match(completeAvatarBlock, /mutationCoordinator\.commit\(mutationTicket, next\)/)
  assert.match(discoveryCandidate, /avatarPresetId:\s*profile\.avatarPresetId/)
  assert.match(discoveryCandidate, /avatar:\s*cloneAvatarSelection\(profile\.avatar\)/)
  assert.match(discoveryCandidate, /age:\s*profile\.age/)
  assert.match(discoveryCandidate, /bio:\s*profile\.bio/)
  assert.match(discoveryDeckState, /productionProfiles\.map\(createProductionDiscoveryCandidate\)/)
  assert.match(discoveryDeckSurface, /profiles=\{visibleDiscoverDeck\}/)
  assert.match(candidateAvatar, /MALE_AVATAR_PRESET_ID/)
  assert.match(candidateAvatar, /normalizeCompleteAvatarSelection/)
  assert.match(candidateAvatar, /projectAvatarV2ToRoomAvatarAppearance/)
  assert.match(
    navigator,
    /storageScopeId=\{sessionActor\?\.profile\.userId \?\? preAuthDraftScopeId\}/
  )
  assert.match(navigator, /initialAvatarSelection=\{sessionActor\?\.profile\.avatar\}/)
  assert.match(
    linkedProfile,
    /createDeepLinkedProfile[\s\S]*avatarSelection:\s*profile\.avatar/
  )
  assert.match(avatarPersistence, /encodeURIComponent\(normalizedUserId\)/)
  assert.match(avatarPersistence, /!serverAuthoritative/)
})

function read(path) {
  return readFileSync(resolve(mobileRoot, path), "utf8")
}
