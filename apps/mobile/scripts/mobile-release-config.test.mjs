import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import releaseConfig from "./mobile-release-config.cjs"

const { resolveMobileReleaseEnvironment } = releaseConfig
const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
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
    revenueCatIosApiKey: undefined,
    revenueCatAndroidApiKey: undefined
  })
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
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0"
    }),
    /EXPO_PUBLIC_SENTRY_DSN/
  )
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...secureReleaseEnvironment,
      EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
      EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
      EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
      EXPO_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com"
    }),
    /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/
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
    revenueCatIosApiKey: "appl_test_ios",
    revenueCatAndroidApiKey: "goog_test_android"
  })
})

test("release crash reporting uses the official Sentry integration without PII", () => {
  const app = read("App.tsx")
  const crashReporting = read("src/observability/crashReporting.ts")
  const metroConfig = read("metro.config.js")
  const appConfig = read("app.json")

  assert.match(app, /initializeCrashReporting\(\)/)
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

  assert.match(packageJson.dependencies.expo, /^\^57\.0\./)
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
    "src/screens/LegalScreen.tsx",
    "src/screens/RegisterScreen.tsx",
    "src/screens/AuthEntryScreen.tsx",
    "src/screens/MyRoomScreen.tsx",
    "src/screens/CosmeticShopScreen.tsx",
    "src/screens/MatchResultScreen.tsx",
    "src/screens/WardrobeV2Screen.tsx",
    "src/ui/bottomNav.tsx",
    "src/ui/AvatarFrame.tsx"
  ].map(read).join("\n")

  assert.doesNotMatch(app, /from "@expo-google-fonts\/inter"/)
  assert.match(app, /@expo-google-fonts\/inter\/400Regular/)
  assert.doesNotMatch(sourceFiles, /from "@expo\/vector-icons"/)
  assert.match(sourceFiles, /@expo\/vector-icons\/Ionicons/)
})

test("Blumi Room keeps text chat, makes live audio optional, and never declares camera access", () => {
  const appConfig = read("app.json")
  const app = JSON.parse(appConfig)
  const livekitClient = read("src/features/miniRoom/livekitClient.ts")
  const mediaHook = read("src/features/miniRoom/useMiniRoomMedia.ts")
  const miniRoomScreen = read("src/screens/MiniRoomScreen.tsx")
  const miniRoomScene = read("src/features/miniRoom/scene/MiniRoomScene.tsx")

  assert.match(appConfig, /\.\/plugins\/withAudioOnlyLiveRoom/)
  assert.match(appConfig, /"blockedPermissions":\s*\[\s*"android\.permission\.CAMERA"/)
  assert.equal(app.expo.android.permissions.includes("android.permission.CAMERA"), false)
  assert.deepEqual(app.expo.android.blockedPermissions, ["android.permission.CAMERA"])
  assert.doesNotMatch(appConfig, /NSCameraUsageDescription/)
  assert.doesNotMatch(livekitClient, /setCameraEnabled/)
  assert.doesNotMatch(mediaHook, /toggleCamera|cameraEnabled/)
  assert.match(miniRoomScreen, /useInRoomChat/)
  assert.match(miniRoomScene, /<TextInput/)
})

test("privacy copy accurately describes Room text chat, optional audio, and profile exposure", () => {
  const legalScreen = read("src/screens/LegalScreen.tsx")
  const legalCopy = read("src/features/legal/legalCopy.ts")

  assert.match(legalScreen, /getLegalContent\(/)
  assert.match(legalCopy, /shared room, you can use text chat/)
  assert.match(legalCopy, /choose to turn on live audio/)
  assert.doesNotMatch(legalCopy, /Live camera and microphone media/)
  assert.match(legalCopy, /Your phone number, exact location, reports, and private messages are not shown/)
  assert.match(legalCopy, /live audio, it is transmitted in real time/)
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
  const assets = read("src/features/roomV2/roomV2Assets.ts")
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
  const shopAssets = read("src/features/shop/shopAssets.ts")
  const shopPreview = read("src/features/shop/ShopPreviewPanel.tsx")

  assert.match(shopAssets, /export const SHOP_THUMBNAIL_SOURCES/)
  assert.match(shop, /getShopProductThumbnailSource\(product\.sourceItemId\)/)
  assert.match(shop, /<AvatarProductThumbnail[\s\S]*source=\{avatarPreviewSource\}/)
  assert.match(shop, /shopCombinationDraftToAvatar\([\s\S]*?combinationStateRef\.current\.draft,[\s\S]*?avatarV2\.avatar/)
  assert.doesNotMatch(shop, /multiItemApplyEnabled\s*\?\s*shopCombinationDraftToAvatar/)
  assert.match(shop, /if \(savedAvatar\) \{[\s\S]*?createShopCombinationState\([\s\S]*?equipped:\s*avatarToShopCombinationDraft\(savedAvatar\)/)
  assert.match(shop, /<ShopPreviewPanel[\s\S]*previewAvatar=\{previewAvatar\}/)
  assert.match(shopPreview, /export function ShopPreviewPanel\(/)
})

test("shop exit discards previews and cannot interrupt an active transaction", () => {
  const shop = read("src/screens/CosmeticShopScreen.tsx")

  assert.match(shop, /const shopExitLocked = combinationState\.phase !== "editing"/)
  assert.match(shop, /event\.preventDefault\(\)/)
  assert.match(shop, /disabled=\{shopExitLocked\}/)
  assert.match(shop, /dispatchCombination\(\{ type: "discard_draft" \}\)/)
})

test("release analytics requires an explicit PostHog project and secure host", () => {
  const release = {
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_BLUMI_API_HTTP_URL: "https://api.blumi.app",
    EXPO_PUBLIC_REALTIME_EDGE_WS_URL: "wss://realtime.blumi.app",
    EXPO_PUBLIC_BLUMI_MEDIA_MODE: "native",
    EXPO_PUBLIC_BLUMI_ENABLE_DEMO: "0",
    EXPO_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123"
  }
  assert.throws(() => resolveMobileReleaseEnvironment(release), /POSTHOG_API_KEY/)
  assert.throws(
    () => resolveMobileReleaseEnvironment({
      ...release,
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_public",
      EXPO_PUBLIC_POSTHOG_HOST: "http://eu.i.posthog.com"
    }),
    /PostHog host must use HTTPS/
  )
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
  const lobby = read("src/screens/LobbyScreen.tsx")
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
  const lobby = read("src/screens/LobbyScreen.tsx")
  const myRoom = read("src/screens/MyRoomScreen.tsx")
  const register = read("src/screens/RegisterScreen.tsx")
  const authEntryCopy = read("src/features/session/authEntryCopy.ts")
  const roomDebrief = read("src/screens/RoomDebriefScreen.tsx")
  const settings = read("src/screens/SettingsScreen.tsx")
  const settingsCopy = read("src/features/settings/settingsCopy.ts")
  const smsProvider = read("../server/src/auth/smsProvider.ts")
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
  assert.match(register, /<CountryCallingCodePicker/)
  assert.match(register, /authCopy\.automaticCallingCodeHint/)
  assert.match(authEntryCopy, /enter only your local number/)
  assert.doesNotMatch(register, /YOUR BLUMI ACCOUNT/)
  assert.match(register, /<BrandMark size=\{28\}/)
  assert.match(register, /style=\{styles\.brandText\}>Blumi<\/Text>/)
  assert.doesNotMatch(roomDebrief, /addInventoryCoins/)
  assert.match(settings, /label=\{copy\.signOut\}/)
  assert.match(settingsCopy, /signOut:\s*"Sign out"/)
  assert.match(settingsCopy, /signOut:\s*"Çıkış yap"/)
  assert.match(smsProvider, /input\.purpose === "account_deletion"/)
  assert.match(smsProvider, /input\.purpose === "account_data_export"/)
  assert.match(smsProvider, /input\.purpose === "phone_change_current"/)
  assert.match(smsProvider, /input\.purpose === "phone_change_new"/)
  assert.match(
    smsProvider,
    /Body: `Your Blumi \$\{message\} code is \$\{input\.code\}\. It expires in 5 minutes\.`/
  )
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
  const chatThread = read("src/screens/ChatThreadScreen.tsx")
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
  assert.match(navigator, /requestMessages[\s\S]*Promise<void>/)
  assert.match(matchResult, /const canStartConversation = canOpenMatchExperience\(sessionActor\)/)
  assert.match(matchResult, /navigation\.navigate\("ChatThread"/)
  assert.doesNotMatch(matchResult, /canEnterSharedRoom|Go to Room|SharedMatchRoom/)
  assert.doesNotMatch(discoverCard, /Save this vibe for later|Taking it slow/)
})

test("Room sync alerts are actionable without raw backend diagnostics", () => {
  const provider = read("src/features/roomV2/state/RoomV2Provider.tsx")
  const preview = read("src/screens/MyRoomEditorScreen.tsx")

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
  assert.deepEqual(app.android.blockedPermissions, ["android.permission.CAMERA"])
  assert.equal(app.android.permissions.some((permission) =>
    /CAMERA|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|SYSTEM_ALERT_WINDOW/.test(permission)
  ), false)
})

test("navigation links and offline status remain wired to native runtime", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const networkStore = read("src/features/network/networkStore.ts")
  const connectionBanner = read("src/ui/connectionBanner.tsx")

  assert.match(navigator, /prefixes: \["blumi:\/\/"\]/)
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
    assert.match(navigator, new RegExp(`"${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`))
  }
  assert.match(navigator, /linking=\{linking\}/)
  assert.match(navigator, /<ConnectionBanner status=\{rootConnectionStatus\}/)
  assert.match(networkStore, /NetInfo\.addEventListener/)
  assert.doesNotMatch(networkStore, /\bany\b|console\.warn|try\s*\{\s*require/)
  assert.match(connectionBanner, /!isConnected/)
  assert.match(connectionBanner, /No internet connection/)
  assert.match(connectionBanner, /Reconnecting to the room/)
  assert.doesNotMatch(read("src/screens/LobbyScreen.tsx"), /<ConnectionBanner/)
  assert.match(read("src/screens/SettingsScreen.tsx"), /Platform\.select/)
})

test("the public mobile brand is Blumi while stable runtime identifiers remain unchanged", () => {
  const appConfig = JSON.parse(read("app.json"))
  const brandMark = read("src/ui/brandMark.tsx")
  const brandAssetFiles = readdirSync(resolve(mobileRoot, "assets/brand"))
  const publicBrandSurfaces = [
    "src/navigation/RootNavigator.tsx",
    "src/screens/AuthEntryScreen.tsx",
    "src/screens/WelcomeScreen.tsx",
    "src/screens/YouScreen.tsx",
    "src/screens/SettingsScreen.tsx",
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
  const lobby = read("src/screens/LobbyScreen.tsx")
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
  assert.match(lobby, /productionProfiles\.map\(createProductionDiscoveryCandidate\)/)
  assert.match(lobby, /profiles=\{visibleDiscoverDeck\}/)
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
