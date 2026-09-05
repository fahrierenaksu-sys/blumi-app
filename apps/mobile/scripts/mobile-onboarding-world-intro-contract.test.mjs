import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const mobileRoot = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(mobileRoot, path), "utf8")

test("the current AuthEntry owns the new intro without reviving the retired Welcome route", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")
  const scene = read("src/features/session/OnboardingWorldScene.tsx")
  const prelude = read("src/features/session/OnboardingBrandPrelude.tsx")
  const welcomeHomeScene = read("src/features/session/OnboardingWelcomeHomeScene.tsx")
  const model = read("src/features/session/onboardingBrandPreludeModel.ts")
  const routing = read("src/features/session/sessionRouting.ts")

  assert.match(scene, /OnboardingBrandPrelude/)
  assert.match(authEntry, /OnboardingWorldScene/)
  assert.match(authEntry, /hasSeenIntro/)
  assert.match(authEntry, /continueFromOnboardingIntro/)
  assert.match(authEntry, /handoff-started/)
  assert.match(authEntry, /ONBOARDING_INTRO_TIMELINE_MS/)
  assert.match(routing, /return "AuthEntry"/)
  assert.match(prelude, /BLUMI_MARK/)
  assert.match(prelude, /OnboardingScanStage/)
  assert.match(prelude, /scanSweepStart/)
  assert.match(prelude, /brandReveal/)
  assert.match(prelude, /characterReveal/)
  assert.match(model, /scanDissolveComplete:\s*1_950/)
  assert.match(model, /brandRevealStart:\s*1_950/)
  assert.match(model, /brandRevealComplete:\s*2_250/)
  assert.match(model, /characterEntranceStart:\s*2_250/)
  assert.doesNotMatch(prelude, /communityPair|communityCharacter/)
  assert.doesNotMatch(prelude, /GOTCHA|animal collector/i)
  assert.match(welcomeHomeScene, /styles\.floorLight/)
  assert.doesNotMatch(welcomeHomeScene, /characterShadow/)
})

test("the native launch surface hands directly into the animated scan instead of showing the retired branded splash", () => {
  const appConfig = JSON.parse(read("app.json"))
  const splashPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
  )
  const storyboard = read("ios/BlumiMobile/SplashScreen.storyboard")
  const appDelegate = read("ios/BlumiMobile/AppDelegate.swift")
  const nativeOverlay = read("ios/BlumiMobile/NativeOnboardingBootOverlay.swift")
  const loadingScreen = read("src/ui/BlumiLoadingScreen.tsx")
  const prelude = read("src/features/session/OnboardingBrandPrelude.tsx")
  const scanStage = read("src/features/session/OnboardingScanStage.tsx")
  const androidColors = read("android/app/src/main/res/values/colors.xml")
  const androidSplash = read("android/app/src/main/res/drawable/ic_launcher_background.xml")

  assert.deepEqual(splashPlugin, [
    "expo-splash-screen",
    { backgroundColor: "#FFF6F8" }
  ])
  assert.doesNotMatch(storyboard, /SplashBackdrop|SplashMark/)
  assert.match(storyboard, /BLUMI-SCAN-STAGE/)
  assert.match(storyboard, /SplashGlass/)
  assert.doesNotMatch(storyboard, /Meet\. Match\. Bloom\.|BLM-Title|BLM-Tagline|BLM-Progress/)
  assert.match(storyboard, /red="1" green="0\.9647058824" blue="0\.9725490196"/)
  assert.match(appDelegate, /bootOverlay\.install\(in: window\)/)
  assert.match(appDelegate, /BlumiReactContentReadyNotification/)
  assert.doesNotMatch(appDelegate, /RCTContentDidAppearNotification/)
  assert.match(nativeOverlay, /UIAccessibility\.isReduceMotionEnabled/)
  assert.match(nativeOverlay, /handoffToReact/)
  assert.match(loadingScreen, /OnboardingScanStage/)
  assert.match(loadingScreen, /getOnboardingBootPreludeElapsedMs/)
  assert.match(loadingScreen, /Animated\.parallel/)
  assert.doesNotMatch(loadingScreen, /blumi-splash-mark|Meet\. Match\. Bloom\.|<Text/)
  assert.match(prelude, /new Animated\.Value\(initialProgress\.scanRows\)/)
  assert.match(prelude, /getOnboardingBootPreludeElapsedSnapshotMs/)
  assert.match(prelude, /<OnboardingScanStage scanRows={scanRows} scanSweep={scanSweep}/)
  assert.match(scanStage, /ONBOARDING_SCAN_FRAMES\.map/)
  assert.match(scanStage, /scanLineTranslateY/)
  assert.match(androidColors, /<color name="splashscreen_background">#FFF6F8<\/color>/)
  assert.doesNotMatch(androidSplash, /splashscreen_logo/)
})

test("the runtime cannot resolve the retired JavaScript onboarding shells", () => {
  assert.equal(existsSync(resolve(mobileRoot, "src/screens/AuthEntryScreen.js")), false)
  assert.equal(existsSync(resolve(mobileRoot, "src/navigation/RootNavigator.js")), false)
  assert.equal(
    existsSync(resolve(mobileRoot, "src/features/session/onboardingIntroModel.js")),
    false
  )
})

test("the world scene uses shipped Blumi avatars, lifecycle gates, and reduced motion", () => {
  const scene = read("src/features/session/OnboardingWorldScene.tsx")
  const hero = read("src/features/session/OnboardingWorldHero.tsx")
  const composition = read("src/features/session/onboardingWorldCompositionModel.ts")
  const runner = read("src/features/session/OnboardingRunner.tsx")
  const assetCatalog = read("src/features/session/onboardingRunAssetCatalog.ts")
  const builder = read("scripts/build_onboarding_runner_frames.py")

  assert.match(scene, /OnboardingWorldHero/)
  assert.match(hero, /OnboardingRunner/)
  assert.doesNotMatch(scene, /AvatarPreview2D/)
  assert.doesNotMatch(runner, /AvatarPreview2D/)
  assert.match(assetCatalog, /blumi_intro_canonical_runner_male_f01/)
  assert.match(assetCatalog, /blumi_intro_canonical_runner_female_f01/)
  assert.match(builder, /base_male_light_v1/)
  assert.match(builder, /base_female_v2/)
  assert.match(builder, /top_female_cream_basic_tee_v2/)
  assert.match(scene, /useIsFocused/)
  assert.match(scene, /AppState\.addEventListener/)
  assert.match(scene, /!reduceMotion && !introState\.isPaused/)
  assert.doesNotMatch(scene, /pauseButton/)
  assert.doesNotMatch(scene, /pauseWorldAnimation/)
  assert.match(scene, /ONBOARDING_GLOBE_LOOP_DURATION_MS/)
  assert.match(scene, /ONBOARDING_INTRO_TIMELINE_MS/)
  assert.match(scene, /worldComposition/)
  assert.match(scene, /preludeOpacity/)
  assert.match(scene, /accessibilityElementsHidden={!isPrelude}/)
  assert.match(scene, /importantForAccessibility={isPrelude \? "yes" : "no-hide-descendants"}/)
  assert.match(scene, /SKIPPABLE_WORLD_PHASES/)
  assert.match(scene, /SKIPPABLE_WORLD_PHASES\.has\(introState\.phase\)/)
  assert.doesNotMatch(scene, /introState\.phase !== "globe-launching"/)
  assert.doesNotMatch(scene, /introState\.phase !== "impact"/)
  assert.match(composition, /inputRange:\s*\[0, 0\.18, 0\.32, 0\.74, 1\]/)
  assert.match(scene, /Animated\.parallel\(\[/)
  assert.match(scene, /getOnboardingIntroAnimationProgress/)
  assert.match(scene, /globe-impact/)
  assert.match(scene, /landing-started/)
  assert.match(scene, /population-finished/)
  assert.match(scene, /catch-finished/)
  assert.match(hero, /worldPopulationAccessibilityLabel/)
})

test("onboarding runners reuse the canonical animated room-avatar rig", () => {
  const motionAssets = read("src/features/avatarV2/room/avatarRoomMotionAssets.ts")

  assert.match(motionAssets, /room_avatar_base_male_light_v1_walking_front_f04/)
  assert.match(motionAssets, /room_avatar_base_female_v2_walking_front_f04/)
  for (const role of ["male", "female"]) {
    for (const frame of ["01", "02", "03", "04"]) {
      const assetPath = resolve(
        mobileRoot,
        `src/features/session/assets/onboarding-runners/blumi_intro_canonical_runner_${role}_f${frame}.png`
      )
      assert.equal(existsSync(assetPath), true)
      assert.ok(statSync(assetPath).size > 20_000)
    }
  }
})

test("the runner asset gate does not promote the four-pose walk fallback as a six-pose run cycle", () => {
  const builder = read("scripts/build_onboarding_runner_frames.py")

  assert.match(builder, /TARGET_RUN_FRAME_COUNT = 6/)
  assert.match(builder, /CANONICAL_WALK_FRAME_COUNT = 4/)
  assert.match(builder, /RUN_PROMOTION_STATUS = "blocked"/)
  assert.match(builder, /run-readiness/)

  const readiness = spawnSync(
    "python3",
    [resolve(mobileRoot, "scripts/build_onboarding_runner_frames.py"), "run-readiness"],
    { encoding: "utf8" }
  )
  assert.equal(readiness.status, 2)
  const report = JSON.parse(readiness.stdout)
  assert.equal(report.status, "blocked")
  assert.equal(report.targetFrameCount, 6)
  assert.equal(report.availableCanonicalWalkFrameCount, 4)
  assert.deepEqual(report.canvas, [256, 384])
  assert.deepEqual(report.runtimeAnchor, [128, 384])
  assert.ok(report.missingSourceCount > 0)
  assert.equal(report.walkFallbackInspection.male.distinctFrameCount, 4)
  assert.equal(report.walkFallbackInspection.female.distinctFrameCount, 4)
  assert.equal(report.walkFallbackInspection.male.visualStatus, "not-a-run-cycle")
  assert.equal(report.walkFallbackInspection.female.visualStatus, "not-a-run-cycle")

  for (const role of ["male", "female"]) {
    for (const frame of ["05", "06"]) {
      const assetPath = resolve(
        mobileRoot,
        `src/features/session/assets/onboarding-runners/blumi_intro_canonical_runner_${role}_f${frame}.png`
      )
      assert.equal(existsSync(assetPath), false)
    }
  }
})

test("the authored globe texture is a real packaged asset, not a placeholder", () => {
  const assetPath = resolve(
    mobileRoot,
    "src/features/session/assets/blumi_world_intro_texture_v1.webp"
  )

  assert.equal(existsSync(assetPath), true)
  assert.ok(statSync(assetPath).size > 50_000)
})

test("the selected population, Whoa, and phone-screen handoff copy stay localized", () => {
  const copy = read("src/features/session/authEntryCopy.ts")
  const register = read("src/screens/RegisterScreen.tsx")

  assert.match(copy, /8\.000\.000\.000\+/)
  assert.match(copy, /whoa: "Whoa!"/)
  assert.match(copy, /letsGetStarted: "Hadi başlayalım\."/)
  assert.match(register, /authCopy\.registerHeroTitle/)
  assert.match(register, /authCopy\.registrationProgressLabel/)
  assert.match(register, /authCopy\.registrationProgressValue/)
})

test("the phone verification screen uses the Blumi character hero instead of an email-first form", () => {
  const register = read("src/screens/RegisterScreen.tsx")
  const hero = read("src/screens/RegisterCharacterHero.tsx")
  const copy = read("src/features/session/authEntryCopy.ts")

  assert.match(register, /RegisterCharacterHero/)
  assert.match(register, /authCopy\.registerHeroMessage/)
  assert.match(register, /authCopy\.registerHeroTitle/)
  assert.match(register, /authCopy\.registerHeroBody/)
  assert.match(register, /register-phone-step/)
  assert.match(register, /register-code-step/)
  assert.match(hero, /ONBOARDING_HERO_FRAME/)
  assert.match(hero, /ONBOARDING_MALE_HERO_FRAME/)
  assert.match(hero, /reduceMotion|useReducedMotion/)
  assert.match(copy, /registerHeroMessage:/)
  assert.doesNotMatch(register, /email|e-mail/i)
})
