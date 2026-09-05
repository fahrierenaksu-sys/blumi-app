import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath, URL } from "node:url"

const SCREEN_ROOT = new URL("../../../screens/", import.meta.url)
const NAVIGATION_ROOT = new URL("../../../navigation/", import.meta.url)

function readScreen(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, SCREEN_ROOT)), "utf8")
}

test("setup screens keep character motion inside their dedicated stages", () => {
  const profileSource = readScreen("ProfileSetupScreen.tsx")
  assert.match(profileSource, /ProfileCharacterReactionStage/)
  assert.doesNotMatch(profileSource, /SetupAnimatedAvatarPreview/)

  const reactionStageSource = readFileSync(
    fileURLToPath(new URL("../ProfileCharacterReactionStage.tsx", import.meta.url)),
    "utf8"
  )
  assert.match(reactionStageSource, /AvatarPreview2D/)
  assert.match(reactionStageSource, /animationState="idle_front"/)
  assert.doesNotMatch(reactionStageSource, /animationState="wave_front"|animationState="walk_front"/)

  const avatarSource = readScreen("AvatarSetupScreen.tsx")
  assert.doesNotMatch(avatarSource, /SetupAnimatedAvatarPreview/)
  assert.match(avatarSource, /AvatarSetupStudioStage/)
  const avatarStageSource = readFileSync(
    fileURLToPath(
      new URL("../../avatarV2/components/AvatarSetupStudioStage.tsx", import.meta.url)
    ),
    "utf8"
  )
  assert.doesNotMatch(avatarStageSource, /SetupAnimatedAvatarPreview/)
  assert.match(avatarStageSource, /AvatarPreview2D/)
  assert.match(avatarStageSource, /animationState="idle_front"/)

  const registerSource = readScreen("RegisterScreen.tsx")
  assert.doesNotMatch(registerSource, /SetupAnimatedAvatarPreview/)
  assert.match(registerSource, /AvatarPreview2D/)
  assert.match(registerSource, /animationState="idle_front"/)

  const roomSource = readScreen("RoomSetupScreen.tsx")
  assert.doesNotMatch(roomSource, /RoomSetupCharacterPhase/)
  assert.doesNotMatch(roomSource, /setInterval\(/)
  assert.match(roomSource, /motionEnabled=\{false\}/)
  assert.match(roomSource, /const avatarState = "idle"/)
})

test("the four setup surfaces use the same header, progress and action dock system", () => {
  for (const screen of [
    "ProfileSetupScreen.tsx",
    "AvatarSetupScreen.tsx",
    "RoomSetupScreen.tsx",
    "RegisterScreen.tsx"
  ]) {
    const source = readScreen(screen)
    assert.match(source, /BlumiSetupShell/)
  }

  const registerSource = readScreen("RegisterScreen.tsx")
  assert.match(registerSource, /step=\{isCodeStep \? "otp" : "phone"\}/)
})

test("the phone to OTP handoff commits before the next frame", () => {
  const registerSource = readScreen("RegisterScreen.tsx")

  assert.match(registerSource, /import \{[\s\S]*useLayoutEffect[\s\S]*\} from "react"/)
  assert.match(
    registerSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*?onCreateFlowStageChange\?\./
  )
})

test("pre-auth CTA commits the visible step before draft persistence can resolve", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")
  const visibleStepCommit = coordinatorSource.indexOf("setStep(nextStep)")
  const draftPersistence = coordinatorSource.indexOf("await persistDraftInOrder(nextDraft, nextStep)")

  assert.ok(visibleStepCommit >= 0)
  assert.ok(draftPersistence >= 0)
  assert.ok(
    visibleStepCommit < draftPersistence,
    "the CTA must not wait on storage before showing the next setup step"
  )
  assert.match(coordinatorSource, /optimisticDraft/)
})

test("pre-auth back navigation keeps the optimistic draft during an in-flight save", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")

  assert.match(
    coordinatorSource,
    /const moveTo = useCallback\(async \([\s\S]*?nextDraft = renderedDraft/
  )
})

test("reactivated setup layers reset their scroll position before paint", () => {
  const shellSource = readFileSync(
    fileURLToPath(new URL("BlumiSetupShell.tsx", import.meta.url)),
    "utf8"
  )

  assert.match(
    shellSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*?if \(!motionActive\) return[\s\S]*?scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: false \}\)/
  )
})

test("a newly visible setup CTA is not blocked by the previous step's debounce window", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")

  assert.doesNotMatch(
    coordinatorSource,
    /transitionUnlockTimerRef|transitionLockedRef\.current = setTimeout/
  )
  assert.match(
    coordinatorSource,
    /transitionLockedStepRef\.current === step/
  )
})

test("heavy setup steps mount only after their first activation and then stay mounted", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")

  assert.match(
    coordinatorSource,
    /const \[mountedSteps, setMountedSteps\] = useState<ReadonlySet<PreAuthSetupStep>>/
  )
  assert.match(
    coordinatorSource,
    /new Set\(\[initialStep\]\)/,
    "the resumed entry step must mount immediately"
  )
  assert.match(
    coordinatorSource,
    /setMountedSteps\(\(currentSteps\)[\s\S]*currentSteps\.has\(step\)[\s\S]*new Set\(\[\.\.\.currentSteps, step\]\)/,
    "activating a step must add it immutably without removing visited steps"
  )

  for (const [step, screen] of [
    ["avatar", "AvatarSetupScreen"],
    ["room", "RoomSetupScreen"],
    ["phone", "RegisterScreen"]
  ] as const) {
    assert.match(
      coordinatorSource,
      new RegExp(`mountedSteps\\.has\\("${step}"\\)[\\s\\S]*?<${screen}`),
      `${screen} must not mount before ${step} is activated`
    )
  }
})

test("the authored world handoff is not composited with a second native fade", () => {
  const navigatorSource = readFileSync(
    fileURLToPath(new URL("RootNavigator.tsx", NAVIGATION_ROOT)),
    "utf8"
  )
  const preAuthRoute = navigatorSource.match(
    /<Stack\.Screen\s+name="PreAuthSetup"[\s\S]*?<Stack\.Screen\s+name="Register"/
  )?.[0] ?? ""

  assert.match(preAuthRoute, /animation: "none"/)
  assert.doesNotMatch(preAuthRoute, /animation: "fade"/)
})

test("a repeated Whoa entry applies the requested setup step before paint", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")

  assert.match(coordinatorSource, /useLayoutEffect\(\(\) => \{[\s\S]*setStep/)
  assert.doesNotMatch(
    coordinatorSource,
    /useEffect\(\(\) => \{[\s\S]*?setStep\(\(currentStep\)[\s\S]*?\}, \[initialStep\]\)/,
    "route-param reconciliation must not leave the previous setup UI visible for one frame"
  )
})

test("persistent setup layers do not animate from an empty first frame", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")

  assert.match(coordinatorSource, /useSharedValue\(active && !animateOnMount \? 1 : 0\)/)
  assert.match(coordinatorSource, /useSharedValue\(reduceMotion \? 0 : direction \* 8\)/)
  assert.match(
    coordinatorSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*?if \(!didMountRef\.current\)[\s\S]*?didMountRef\.current = true/
  )
  assert.match(
    coordinatorSource,
    /if \(active && animateOnMount && !reduceMotion\)[\s\S]*opacity\.value = 0[\s\S]*withTiming\(1/
  )
})

test("Whoa handoff enters the profile flow with one bounded native bridge", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")
  const authSource = readScreen("AuthEntryScreen.tsx")

  assert.match(coordinatorSource, /entryMotion === "world-handoff" \? 0 : 1/)
  assert.match(coordinatorSource, /if \(!motionPreferenceResolved\) \{[\s\S]*entryProgress\.value = 0/)
  assert.match(coordinatorSource, /if \(reduceMotion\) \{[\s\S]*entryProgress\.value = 1/)
  assert.match(coordinatorSource, /duration: 240/)
  assert.match(coordinatorSource, /translateY: 12 \* \(1 - entryProgress\.value\)/)
  assert.match(authSource, /entryMotion: "world-handoff"/)
})

test("deferred auth destinations resolve before their first visible frame", () => {
  const bundlesSource = readFileSync(
    fileURLToPath(new URL("../../../navigation/deferredScreenBundles.tsx", import.meta.url)),
    "utf8"
  )

  assert.match(bundlesSource, /const Component = preload\(\)/)
  assert.doesNotMatch(
    bundlesSource,
    /if \(!Component\) return <DeferredRouteFallback \/>/,
    "a fallback frame lets the destination paint incorrectly before the real setup screen mounts"
  )
})

test("shared onboarding entrances establish their initial frame before paint", () => {
  const animationsSource = readFileSync(
    fileURLToPath(new URL("../../../ui/animations.ts", import.meta.url)),
    "utf8"
  )
  const entranceSource = animationsSource.slice(
    animationsSource.indexOf("export function useEntranceAnimation"),
    animationsSource.indexOf("/* ── Staggered List Entrance")
  )

  assert.match(entranceSource, /useLayoutEffect\(\(\) => \{[\s\S]*progress\.setValue\(1\)/)
  assert.doesNotMatch(
    entranceSource,
    /useEffect\(\(\) => \{[\s\S]*progress\.setValue\(1\)/,
    "post-paint entrance setup can expose a one-frame blank or incorrect onboarding surface"
  )
})

test("the shared progress rail has the correct fill before its width is measured", () => {
  const progressSource = readFileSync(
    fileURLToPath(new URL("SetupFlowProgress.tsx", import.meta.url)),
    "utf8"
  )

  assert.match(progressSource, /useLayoutEffect/)
  assert.match(progressSource, /railWidth\.value > 0/)
  assert.match(progressSource, /progress\.value \* 100/)
})

test("authenticated onboarding warms deferred setup routes and uses one light native fade", () => {
  const navigatorSource = readFileSync(
    fileURLToPath(new URL("RootNavigator.tsx", NAVIGATION_ROOT)),
    "utf8"
  )
  const authenticatedPreloadEffect = navigatorSource.match(
    /useEffect\(\(\) => \{[\s\S]*?onboardingEntryRoute[\s\S]*?preloadDeferredAuthScreens\(\)[\s\S]*?\}, \[onboardingEntryRoute, sessionEntryRoute\]\)/
  )?.[0] ?? ""
  const onboardingRoutes = navigatorSource.match(
    /<Stack\.Screen\s+name="ProfileSetup"[\s\S]*?<Stack\.Screen\s+name="RoomSetup"[\s\S]*?\) : \(/
  )?.[0] ?? ""

  assert.match(authenticatedPreloadEffect, /if \(sessionEntryRoute === "AuthEntry"\)/)
  assert.match(authenticatedPreloadEffect, /preloadDeferredAuthScreens\(\)/)
  assert.match(authenticatedPreloadEffect, /if \(onboardingEntryRoute\)/)
  assert.match(authenticatedPreloadEffect, /preloadDeferredAuthenticatedOnboardingScreens\(\)/)
  assert.match(onboardingRoutes, /name="ProfileSetup"[\s\S]*animation: "fade"/)
  assert.match(onboardingRoutes, /name="AvatarSetup"[\s\S]*animation: "fade"/)
  assert.match(onboardingRoutes, /name="RoomSetup"[\s\S]*animation: "fade"/)
})

test("setup layers crossfade vertically without shifting mismatched sheets sideways", () => {
  const coordinatorSource = readScreen("PreAuthSetupFlowScreen.tsx")

  assert.match(coordinatorSource, /translateY: translateY\.value/)
  assert.match(coordinatorSource, /direction \* 8/)
  assert.doesNotMatch(coordinatorSource, /translateX: translateAnimation/)
  assert.doesNotMatch(coordinatorSource, /scale: scaleAnimation/)
})

test("the shared setup shell keeps the same stage to heading to task-card order", () => {
  const shellSource = readFileSync(
    fileURLToPath(new URL("BlumiSetupShell.tsx", import.meta.url)),
    "utf8"
  )
  assert.match(
    shellSource,
    /<SetupFlowMotionSwap[\s\S]*?<SetupFlowStage[\s\S]*?<\/SetupFlowMotionSwap>[\s\S]*?<SetupFlowMotionSwap[\s\S]*?styles\.headingBlock[\s\S]*?<\/SetupFlowMotionSwap>[\s\S]*?<SetupFlowMotionSwap[\s\S]*?SetupFlowTaskCard/s
  )
})
