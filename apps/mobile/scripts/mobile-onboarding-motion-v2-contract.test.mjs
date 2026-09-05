import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (relativePath) => readFileSync(resolve(mobileRoot, relativePath), "utf8")

test("the scene orchestrates one overlapping physical timeline", () => {
  const scene = read("src/features/session/OnboardingWorldScene.tsx")

  assert.match(scene, /ONBOARDING_INTRO_TIMELINE_MS/)
  assert.match(scene, /globeImpact/)
  assert.match(scene, /avatarFlight/)
  assert.match(scene, /landingReaction/)
  assert.match(scene, /populationReveal/)
  assert.match(scene, /type:\s*"globe-impact"/)
  assert.match(scene, /type:\s*"launch-finished"/)
  assert.match(scene, /type:\s*"landing-started"/)
  assert.match(scene, /type:\s*"landing-finished"/)
  assert.match(scene, /hapticMedium/)
  assert.match(scene, /hapticLight/)
  assert.match(scene, /useNativeDriver:\s*true/)
})

test("the premium world is one hero rig with editorial population typography", () => {
  const scene = read("src/features/session/OnboardingWorldScene.tsx")
  const hero = read("src/features/session/OnboardingWorldHero.tsx")
  const styles = read("src/features/session/onboardingWorldSceneStyles.ts")
  const geometry = read("src/features/session/onboardingWorldCompositionModel.ts")

  assert.match(scene, /OnboardingWorldHero/)
  assert.match(hero, /getOnboardingWorldLayout/)
  assert.match(hero, /getOnboardingWorldRunnerPlacement/)
  assert.match(hero, /useWindowDimensions/)
  assert.match(hero, /styles\.pairRig/)
  assert.match(hero, /styles\.populationStat/)
  assert.match(hero, /styles\.worldAura/)
  assert.match(hero, /styles\.globeAtmosphereEdge/)
  assert.match(hero, /styles\.runnerCrownMask/)
  assert.match(hero, /styles\.runnerCrownCircle/)
  assert.match(hero, /styles\.runnerCrownTextureTrack/)
  assert.match(hero, /OnboardingRunner/)
  assert.match(geometry, /ONBOARDING_WORLD_GLOBE_SIZE = 304/)
  assert.match(geometry, /statSurface:\s*"editorial"/)
  assert.doesNotMatch(styles, /populationStat:\s*{[^}]*top:/)
  assert.doesNotMatch(styles, /worldStage:\s*{[^}]*marginTop:/)
  assert.doesNotMatch(styles, /populationCard|messageSlot|greetingTail/)
  assert.doesNotMatch(styles, /runnerSurfaceBand|runnerHorizonCap/)
  assert.doesNotMatch(styles, /runnerCrownMask:\s*{[^}]*backgroundColor:/)
  assert.match(styles, /runnerCrownCircle:\s*{[^}]*borderRadius:\s*ONBOARDING_WORLD_GLOBE_SIZE \/ 2/)
  assert.match(styles, /runnerCrownMask:\s*{[\s\S]*?height:\s*16/)
  assert.doesNotMatch(styles, /worldBaseShadow/)
})

test("the same mounted pair crossfades from landing into running without a page snap", () => {
  const hero = read("src/features/session/OnboardingWorldHero.tsx")

  assert.match(hero, /const heroOpacity = phase === "population-counting"/)
  assert.match(hero, /const runnerOpacity = phase === "population-counting"/)
  assert.match(hero, /inputRange:\s*\[0, 0\.04, 0\.1\]/)
  assert.match(hero, /size=\{ONBOARDING_SHARED_CHARACTER_WIDTH\}/)
  assert.match(hero, /styles\.heroPair/)
  assert.match(hero, /styles\.runners/)
  assert.doesNotMatch(hero, /showHeroCharacter \? \(/)
})

test("home, greeting, and world phases share the approved world-frame character baseline", () => {
  const prelude = read("src/features/session/OnboardingBrandPrelude.tsx")
  const home = read("src/features/session/OnboardingWelcomeHomeScene.tsx")
  const geometry = read("src/features/session/onboardingWorldCompositionModel.ts")

  assert.match(geometry, /ONBOARDING_SHARED_CHARACTER_BASELINE_FROM_SCENE_CENTER/)
  assert.match(prelude, /ONBOARDING_GREETING_PAIR_LAYER_BOTTOM_IN_STAGE/)
  assert.match(home, /ONBOARDING_WELCOME_PAIR_SETTLED_TRANSLATE_Y/)
  assert.doesNotMatch(prelude, /greetingPairLayer:\s*\{[\s\S]*?bottom:\s*-10/)
  assert.doesNotMatch(home, /outputRange:\s*\[-26,\s*54,\s*52\]/)
})

test("runner feet use normalized frame anchors and finish as a readable pair", () => {
  const runner = read("src/features/session/OnboardingRunner.tsx")
  const model = read("src/features/session/onboardingIntroModel.ts")

  assert.match(runner, /AUTHORED_FRAME_BASELINE_OFFSETS/)
  assert.match(runner, /leader:\s*\[13,\s*13,\s*22,\s*22,\s*16,\s*16,\s*5,\s*5,\s*17,\s*17,\s*15,\s*15\]/)
  assert.match(runner, /chaser:\s*\[13,\s*13,\s*22,\s*22,\s*16,\s*16,\s*5,\s*5,\s*17,\s*17,\s*15,\s*15\]/)
  assert.match(runner, /sourceBaselineOffset/)
  assert.match(runner, /frameBaselineOffset/)
  assert.match(runner, /anchorBottom/)
  assert.match(runner, /anchorX/)
  assert.match(runner, /ONBOARDING_WORLD_RUNNER_PROGRESS\.map/)
  assert.doesNotMatch(runner, /placement\.footX - readyPlacement\.footX \+ track\.translateX/)
  assert.doesNotMatch(runner, /placement\.surfaceY - readyPlacement\.surfaceY \+ track\.translateY/)
  assert.match(runner, /getOnboardingWorldSurfaceY/)
  assert.match(runner, /const staticFrameIndex = isRunning\s+\? null\s+:\s+isArrivalRunWarmup\s+\? handoffFrameIndex\s+: 0/)
  assert.doesNotMatch(runner, /catchSpread/)
  assert.doesNotMatch(runner, /\?\? 0/)
  assert.doesNotMatch(runner, /leaderImageBaseline/)
  assert.doesNotMatch(runner, /const stride/)
  assert.doesNotMatch(runner, /setInterval|setFrameIndex/)
  assert.match(runner, /sharedFrameClock/)
  assert.doesNotMatch(runner, /Animated\.loop/)
  assert.doesNotMatch(runner, /CHASER_RUNNER_(?:FRAME_COUNT|LOOP_DURATION_MS|FRAME_CLOCK_POSITIONS)/)
  assert.match(runner, /const FRAME_CROSSFADE = 0\.0005/)
  assert.match(model, /translateX:\s*\[18, 10, 2, -14\]/)
  assert.match(model, /translateX:\s*\[-88, -88, -88, -88\]/)
  assert.match(model, /ONBOARDING_RUNNER_ORBIT_DURATION_MS = 4_200/)
  assert.match(model, /translateX:\s*\[0,\s*2,\s*0,\s*2,\s*0\]/)
  assert.match(model, /translateX:\s*\[0,\s*3,\s*4,\s*3,\s*0\]/)
})

test("compact world scaling is top-anchored and each visual is scaled only once", () => {
  const hero = read("src/features/session/OnboardingWorldHero.tsx")

  assert.match(hero, /transformOrigin:\s*"top center"/)
  assert.doesNotMatch(hero, /const globeScale/)
  assert.doesNotMatch(hero, /outputRange:\s*\[0\.72, globeScale\]/)
})

test("the globe impact stays soft and the flight arc is bounded", () => {
  const hero = read("src/features/session/OnboardingWorldHero.tsx")
  const geometry = read("src/features/session/onboardingWorldCompositionModel.ts")

  assert.match(hero, /outputRange:\s*\[1, 1\.025, 1\]/)
  assert.match(hero, /outputRange:\s*\[0, -10, 0\]/)
  assert.match(geometry, /translateY:\s*\[0, -72, -236, -154, -10\]/)
  assert.match(geometry, /translateY:\s*\[0, -80, -252, -164, -12\]/)
})

test("world motion obeys focus, app lifecycle, and reduced motion without a visible pause control", () => {
  const scene = read("src/features/session/OnboardingWorldScene.tsx")

  assert.match(scene, /useIsFocused/)
  assert.match(scene, /AppState\.addEventListener/)
  assert.match(scene, /shouldRunOnboardingIntroMotion/)
  assert.doesNotMatch(scene, /pauseButton/)
  assert.doesNotMatch(scene, /pauseWorldAnimation/)
  assert.doesNotMatch(scene, /resumeWorldAnimation/)
  assert.match(scene, /phaseClockRef/)
  assert.match(scene, /Date\.now\(\) - phaseClockRef\.current\.startedAtMs/)
})

test("Whoa starts the authored profile, avatar, room, and phone sequence", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")
  const register = read("src/screens/RegisterScreen.tsx")
  const navigation = read("src/navigation/RootNavigator.tsx")
  const preAuthFlow = read("src/screens/PreAuthSetupFlowScreen.tsx")
  const scene = read("src/features/session/OnboardingWorldScene.tsx")

  assert.match(authEntry, /type:\s*"handoff-started"/)
  assert.match(authEntry, /getCreateAccountInitialStep\(createInitialStep\)/)
  assert.match(navigation, /createInitialStep=\{preAuthDraftSnapshot\?\.resumeStep \?\? "profile"\}/)
  assert.match(navigation, /entryMotion\?:\s*"world-handoff"/)
  assert.match(preAuthFlow, /<ProfileSetupScreen/)
  assert.match(preAuthFlow, /<AvatarSetupScreen/)
  assert.match(preAuthFlow, /<RoomSetupScreen/)
  assert.match(preAuthFlow, /<RegisterScreen/)
  assert.match(register, /useEntranceAnimation/)
  assert.match(scene, /outputRange:\s*\[sceneLift,\s*sceneLift - 14\]/)
  assert.match(scene, /outputRange:\s*\[1,\s*0\.984\]/)
})

test("the current AuthEntry remains the owner and the retired Welcome carousel stays retired", () => {
  const routing = read("src/features/session/sessionRouting.ts")
  const authEntry = read("src/screens/AuthEntryScreen.tsx")

  assert.match(routing, /return "AuthEntry"/)
  assert.match(authEntry, /OnboardingWorldScene/)
  assert.match(authEntry, /CinematicActionButton/)
  assert.doesNotMatch(authEntry, /navigation\.navigate\("Welcome"/)
})

test("Get started opens the mounted character greeting before the world launch", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")
  const scene = read("src/features/session/OnboardingWorldScene.tsx")
  const greeting = read("src/features/session/OnboardingGreetingPair.tsx")
  const prelude = read("src/features/session/OnboardingBrandPrelude.tsx")

  assert.match(scene, /OnboardingBrandPrelude/)
  assert.match(authEntry, /copy\.letsGetStarted/)
  assert.match(authEntry, /copy\.introGreetingAction/)
  assert.match(authEntry, /type:\s*"open-greeting"/)
  assert.match(authEntry, /type:\s*"reveal-world"/)
  assert.match(greeting, /femaleWaveFrame/)
  assert.match(greeting, /maleWaveFrame/)
  assert.match(greeting, /ONBOARDING_GREETING_WAVE_SEQUENCE/)
  assert.match(greeting, /scheduleAmbientSpriteLoop/)
  assert.match(greeting, /greetingActive/)
  assert.match(greeting, /previousGreetingActive/)
  assert.match(greeting, /femaleWeightShift/)
  assert.match(greeting, /maleWeightShift/)
  assert.match(greeting, /onFinished/)
  assert.match(greeting, /femaleEntrance/)
  assert.match(greeting, /maleEntrance/)
  assert.match(prelude, /shouldReduceOnboardingBootMotion/)
  assert.match(
    prelude,
    /shouldReduceOnboardingBootMotion\(\s*motionPreferenceResolved,\s*reduceMotion\s*\)/
  )
  assert.match(prelude, /if \(!motionPreferenceResolved\) return undefined/)
  assert.match(prelude, /pairAura/)
  assert.doesNotMatch(prelude, /pairFloorShadow/)
  assert.match(prelude, /getOnboardingPreludeMountElapsedMs/)
  assert.match(greeting, /:\s*\[34,\s*-6,\s*2,\s*0\]/)
  assert.match(greeting, /outputRange:\s*\[0,\s*-3\.2\]/)
  assert.match(greeting, /character:\s*\{\s*width:\s*108,\s*height:\s*178\s*\}/)
  assert.match(prelude, /greetingBubble/)
  assert.match(prelude, /greetingTail/)
  assert.match(prelude, /greetingActive={greetingPairActive}/)
  assert.doesNotMatch(prelude, /WELCOME_NOOK|WELCOME_KITTEN|WELCOME_PUPPY|WELCOME_PETTING_PAIR/)
  assert.match(scene, /onActionsVisible/)
  assert.match(authEntry, /isPreludeInteractive/)
  assert.match(authEntry, /motionPreferenceResolved/)
})

test("setup characters use authored walking frames instead of the unsupported waving fallback", () => {
  const preview = read("src/features/session/setupFlow/SetupAnimatedAvatarPreview.tsx")
  const model = read("src/features/session/setupFlow/setupCharacterMotionModel.ts")

  assert.match(preview, /setAnimationState\(plan\.spriteCueState\)/)
  assert.match(preview, /spriteTravel\.value = withSequence/)
  assert.match(model, /spriteCueState:\s*"walk_front"/)
  assert.doesNotMatch(preview, /setAnimationState\("wave_front"\)/)
})

test("first-launch account handoff errors remain visible throughout the cinematic entry", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")

  assert.match(
    authEntry,
    /errorMessage\s*&&\s*\(\s*isPrelude\s*\|\|\s*isWorldReady\s*\)/
  )
})

test("the duplicate account-choice page is removed from the cinematic flow", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")
  const model = read("src/features/session/onboardingIntroModel.ts")

  assert.doesNotMatch(authEntry, /isAccountChoices|copy\.identityStartsHere|copy\.startProfile/)
  assert.doesNotMatch(model, /account-choices/)
  assert.match(authEntry, /onboarding-already-have-account/)
  assert.match(authEntry, /onboarding-whoa/)
})

test("landing hands directly into the runtime-selected run cycle without a crouch leak", () => {
  const runner = read("src/features/session/OnboardingRunner.tsx")
  const greeting = read("src/features/session/OnboardingGreetingPair.tsx")
  const approvedCatalog = read("src/features/session/onboardingRunApprovedAssetCatalog.ts")
  const arrivalCatalog = read("src/features/session/onboardingArrivalAssetCatalog.ts")

  assert.match(runner, /APPROVED_ONBOARDING_RUN_ASSETS/)
  assert.match(runner, /getOnboardingRunHandoffFrameIndex/)
  assert.match(runner, /const AUTHORED_RUN_FRAMES = SELECTED_ONBOARDING_RUN_ASSETS\.run/)
  assert.match(runner, /ONBOARDING_RUN_ASSET_MODE === "candidate"/)
  assert.doesNotMatch(runner, /ONBOARDING_ARRIVAL_CANDIDATE_ASSETS/)
  assert.match(greeting, /APPROVED_ONBOARDING_RUN_ASSETS/)
  assert.match(greeting, /ONBOARDING_RUN_ASSET_MODE === "candidate"/)
  assert.match(greeting, /getOnboardingRunAssetSet\("candidate"\)/)
  assert.match(arrivalCatalog, /ONBOARDING_ARRIVAL_ATLAS_ASSETS/)
  assert.match(arrivalCatalog, /blumi_intro_arrival_female_atlas\.png/)
  assert.match(arrivalCatalog, /blumi_intro_arrival_male_atlas\.png/)
  assert.match(approvedCatalog, /onboarding-runners-v11-remodeled-runtime/)
  assert.match(approvedCatalog, /onboarding-runners-v3-runtime/)
  assert.doesNotMatch(approvedCatalog, /onboarding-(?:runners|wave)-v3-candidate/)
})

test("the remaining skip control is quiet and accessible", () => {
  const scene = read("src/features/session/OnboardingWorldScene.tsx")
  const styles = read("src/features/session/onboardingWorldSceneStyles.ts")

  assert.match(scene, /SKIPPABLE_WORLD_PHASES\.has\(introState\.phase\)/)
  assert.match(styles, /skipButton:[\s\S]*minHeight:\s*44/)
  assert.doesNotMatch(scene, /pauseButton/)
  assert.doesNotMatch(styles, /pauseButton/)
})

test("the cinematic flow reserves one CTA anchor and one blush canvas", () => {
  const authEntry = read("src/screens/AuthEntryScreen.tsx")
  const register = read("src/screens/RegisterScreen.tsx")

  assert.match(authEntry, /cinematicActionSlot/)
  assert.match(authEntry, /useState\(false\)/)
  assert.doesNotMatch(authEntry, /useState\(hasSeenIntro\)/)
  assert.match(authEntry, /cinematicActions/)
  assert.match(authEntry, /minHeight:\s*ONBOARDING_PRIMARY_ACTION_LAYOUT\.height/)
  assert.match(authEntry, /SoftBlobBackground[\s\S]*variant="register"/)
  assert.match(register, /SoftBlobBackground[\s\S]*variant="register"/)
})
