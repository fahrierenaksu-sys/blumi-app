import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  getOnboardingBootGateRemainingMs,
  getOnboardingPreludeMountElapsedMs
} from "./onboardingBrandPreludeModel"

const mobileRoot = resolve(import.meta.dirname, "../../..")
const nativeOverlayPath = resolve(
  mobileRoot,
  "ios/Blumi/NativeOnboardingBootOverlay.swift"
)
const read = (path: string) => readFileSync(resolve(mobileRoot, path), "utf8")
const nativeSourcePaths = [
  "ios/Blumi/NativeOnboardingBootOverlay.swift",
  "ios/Blumi/BlumiBootBridge.swift",
  "ios/Blumi/BlumiBootBridge.m",
  "ios/Blumi/Blumi-Bridging-Header.h",
  "ios/Blumi/AppDelegate.swift",
  "ios/Blumi/SplashScreen.storyboard",
  "ios/Blumi.xcodeproj/project.pbxproj"
]
const versionedNativePaths = new Set(execFileSync(
  "git",
  ["ls-files", "--", ...nativeSourcePaths],
  { cwd: mobileRoot, encoding: "utf8" }
).trim().split("\n"))
const hasVersionedNativeProject = nativeSourcePaths.every(
  (path) => versionedNativePaths.has(path)
)
// A local Expo prebuild is not evidence for a reproducible native contract.
// If an Expo plugin becomes the authority, test its generated output instead.
const nativeTest = hasVersionedNativeProject ? test : test.skip

test("native boot overlay has a versioned source of truth", () => {
  assert.ok(
    hasVersionedNativeProject,
    `Native boot overlay has no maintained Expo config plugin and the iOS project is not versioned. Missing tracked sources: ${nativeSourcePaths.filter((path) => !versionedNativePaths.has(path)).join(", ")}. Keep this native gate open until either the native project is checked in or a maintained plugin generates and verifies the equivalent Swift/Xcode output.`
  )
})

nativeTest("native boot motion starts before React and waits for explicit Blumi content readiness", () => {
  assert.equal(existsSync(nativeOverlayPath), true)

  const appDelegate = read("ios/Blumi/AppDelegate.swift")
  const installIndex = appDelegate.indexOf("bootOverlay.install(in: window)")
  const reactStartIndex = appDelegate.indexOf("factory.startReactNative")

  assert.ok(installIndex >= 0)
  assert.ok(reactStartIndex >= 0)
  assert.ok(installIndex < reactStartIndex)
  assert.match(appDelegate, /BlumiReactContentReadyNotification/)
  assert.doesNotMatch(appDelegate, /RCTContentDidAppearNotification/)
  assert.match(appDelegate, /bootOverlay\.handoffToReact\(\)/)
  assert.match(appDelegate, /\[weak self\]/)
  assert.match(appDelegate, /removeObserver\(observer\)/)
  assert.doesNotMatch(appDelegate, /asyncAfter|Timer\.scheduledTimer/)
})

test("font loading never replaces the onboarding scan with a generic spinner", () => {
  const app = read("App.tsx")
  const navigator = read("src/navigation/RootNavigator.tsx")

  assert.doesNotMatch(app, /ActivityIndicator/)
  assert.doesNotMatch(app, /if \(!fontsLoaded\)/)
  assert.match(app, /<RootNavigator fontsReady=\{fontsLoaded\}/)
  assert.doesNotMatch(navigator, /!fontsReady \|\|/)
  assert.match(navigator, /sessionEntryRoute === "Splash"/)
})

test("the React loading scan cannot settle or release while motion preference is unresolved", () => {
  const loadingScreen = read("src/ui/BlumiLoadingScreen.tsx")

  assert.match(loadingScreen, /useReducedMotionPreference/)
  assert.match(loadingScreen, /motionPreferenceResolved/)
  assert.match(loadingScreen, /shouldReduceOnboardingBootMotion/)
  assert.match(loadingScreen, /if \(!bootMotionPreferenceResolved\) return undefined/)
  assert.match(
    loadingScreen,
    /useLayoutEffect\([\s\S]*hydrateOnboardingBootPreludeStart/
  )
  assert.doesNotMatch(
    loadingScreen,
    /const timeline = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS\s*\n\s*hydrateOnboardingBootPreludeStart/
  )
  assert.doesNotMatch(loadingScreen, /import \{ useReducedMotion \}/)
})

test("motion preference lookup failures remain fail-closed for accessibility", () => {
  const animations = read("src/ui/animations.ts")
  assert.match(
    animations,
    /\.catch\(\(\) => \{[\s\S]*setPreference\(\{ reduceMotion: true, isResolved: true \}\)/
  )
})

test("unauthenticated startup defers non-auth setup screens out of the initial navigator parse path", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const bundles = read("src/navigation/deferredScreenBundles.tsx")

  assert.match(bundles, /registerScreenBundle = createDeferredScreen/)
  assert.match(bundles, /preAuthSetupFlowScreenBundle = createDeferredScreen/)
  assert.match(bundles, /profileSetupScreenBundle = createDeferredScreen/)
  assert.match(bundles, /avatarSetupScreenBundle = createDeferredScreen/)
  assert.match(bundles, /roomSetupScreenBundle = createDeferredScreen/)
  assert.doesNotMatch(navigator, /import \{ RegisterScreen \}/)
  assert.doesNotMatch(navigator, /import \{ PreAuthSetupFlowScreen \}/)
  assert.doesNotMatch(navigator, /import \{ ProfileSetupScreen \}/)
  assert.doesNotMatch(navigator, /import \{ AvatarSetupScreen \}/)
  assert.doesNotMatch(navigator, /import \{ RoomSetupScreen \}/)
})

test("the Whoa destination is warmed before the user can enter the setup flow", () => {
  const navigator = read("src/navigation/RootNavigator.tsx")
  const authPreloadEffect = navigator.match(
    /useEffect\(\(\) => \{[\s\S]*?sessionEntryRoute === "AuthEntry"[\s\S]*?onboardingEntryRoute[\s\S]*?\}, \[onboardingEntryRoute, sessionEntryRoute\]\)/
  )?.[0] ?? ""

  assert.match(authPreloadEffect, /preloadDeferredAuthScreens\(\)/)
  assert.match(authPreloadEffect, /preloadDeferredAuthenticatedOnboardingScreens\(\)/)
  assert.doesNotMatch(authPreloadEffect, /scheduleDeferredPreload/)
})

test("the laid-out Blumi prelude explicitly marks React content ready", () => {
  const bridgePath = resolve(
    mobileRoot,
    "src/features/session/nativeOnboardingBootBridge.ts"
  )
  assert.equal(existsSync(bridgePath), true)

  const bridge = read("src/features/session/nativeOnboardingBootBridge.ts")
  const prelude = read("src/features/session/OnboardingBrandPrelude.tsx")

  assert.match(bridge, /markOnboardingContentReady/)
  assert.match(bridge, /BlumiBootBridge/)
  assert.match(prelude, /markOnboardingContentReady/)
  assert.match(prelude, /onLayout/)
  assert.doesNotMatch(prelude, /setTimeout\([^)]*markOnboardingContentReady/)
})

nativeTest("native boot handoff is idempotent and cleans up every owned resource", () => {
  const nativeOverlay = read("ios/Blumi/NativeOnboardingBootOverlay.swift")
  const appDelegate = read("ios/Blumi/AppDelegate.swift")

  assert.match(nativeOverlay, /guard !hasHandedOff else \{ return \}/)
  assert.match(nativeOverlay, /removeAllAnimations\(\)/)
  assert.match(nativeOverlay, /removeFromSuperview\(\)/)
  assert.match(nativeOverlay, /rootView = nil/)
  assert.match(nativeOverlay, /removeObserver\(observer\)/)
  assert.match(appDelegate, /deinit/)
  assert.match(appDelegate, /removeBootObserver\(\)/)
  assert.match(appDelegate, /bootOverlay\.removeImmediately\(\)/)
})

nativeTest("native scan keeps moving throughout the handoff fade", () => {
  const nativeOverlay = read("ios/Blumi/NativeOnboardingBootOverlay.swift")
  const handoffStart = nativeOverlay.indexOf("func handoffToReact()")
  const handoffEnd = nativeOverlay.indexOf("func removeImmediately()", handoffStart)
  const handoff = nativeOverlay.slice(handoffStart, handoffEnd)
  const fadeStart = handoff.indexOf("UIView.animate")
  const motionStop = handoff.indexOf("self?.stopMotion()")

  assert.ok(fadeStart >= 0)
  assert.ok(motionStop > fadeStart)
  assert.doesNotMatch(handoff.slice(0, fadeStart), /\bstopMotion\(\)/)
})

nativeTest("native boot motion respects Reduce Motion before and during animation", () => {
  const nativeOverlay = read("ios/Blumi/NativeOnboardingBootOverlay.swift")

  assert.match(nativeOverlay, /UIAccessibility\.isReduceMotionEnabled/)
  assert.match(nativeOverlay, /UIAccessibility\.reduceMotionStatusDidChangeNotification/)
  assert.match(nativeOverlay, /if reduceMotion \{[\s\S]*renderStaticFirstFrame\(\)[\s\S]*return/)
  assert.match(nativeOverlay, /handleReduceMotionChange/)
  assert.match(nativeOverlay, /stopMotion\(\)/)
})

nativeTest("the boot bridge publishes the initial native motion preference synchronously", () => {
  const nativeBridge = read("ios/Blumi/BlumiBootBridge.swift")
  const nativeBridgeExports = read("ios/Blumi/BlumiBootBridge.m")
  const bridgingHeader = read("ios/Blumi/Blumi-Bridging-Header.h")
  const appDelegate = read("ios/Blumi/AppDelegate.swift")
  const reactBridge = read("src/features/session/nativeOnboardingBootBridge.ts")
  const loadingScreen = read("src/ui/BlumiLoadingScreen.tsx")

  assert.doesNotMatch(nativeBridge, /RCTBridgeModule/)
  assert.match(nativeBridgeExports, /RCT_EXTERN_MODULE\(BlumiBootBridge, NSObject\)/)
  assert.doesNotMatch(bridgingHeader, /RCTBridgeModule/)
  assert.doesNotMatch(appDelegate, /BlumiBootBridge\.registerWithReactNative\(\)/)
  assert.match(nativeBridge, /reduceMotionEnabled/)
  assert.match(nativeBridge, /UIAccessibility\.isReduceMotionEnabled/)
  assert.match(reactBridge, /getNativeOnboardingBootReduceMotion/)
  assert.match(loadingScreen, /nativeReduceMotion/)
  assert.match(loadingScreen, /motionPreferenceResolved\s*\|\| nativeReduceMotion !== null/)
})

nativeTest("native and React scan layers share the same continuity geometry", () => {
  const nativeOverlay = read("ios/Blumi/NativeOnboardingBootOverlay.swift")
  const reactScan = read("src/features/session/OnboardingScanStage.tsx")
  const storyboard = read("ios/Blumi/SplashScreen.storyboard")

  for (const contract of [
    /stageWidth: CGFloat = 286/,
    /stageHeight: CGFloat = 330/,
    /gridWidth: CGFloat = 250/,
    /cellWidth: CGFloat = 72/,
    /cellHeight: CGFloat = 78/,
    /cellRadius: CGFloat = 18/,
    /cellGap: CGFloat = 10/,
    /scanWidth: CGFloat = 268/,
    /scanHeight: CGFloat = 24/,
    /scanStartOffset: CGFloat = -142/,
    /scanEndOffset: CGFloat = 150/,
    /0xFFF6F8/
  ]) {
    assert.match(nativeOverlay, contract)
  }

  assert.match(reactScan, /width: 286/)
  assert.match(reactScan, /height: 330/)
  assert.match(reactScan, /width: 250/)
  assert.match(reactScan, /width: 72/)
  assert.match(reactScan, /height: 78/)
  assert.match(reactScan, /borderRadius: 18/)
  assert.match(reactScan, /gap: 10/)
  assert.match(reactScan, /width: 268/)
  assert.match(reactScan, /height: 24/)
  assert.match(reactScan, /outputRange: \[-142, 150\]/)
  assert.match(nativeOverlay, /transform\.translation\.y/)
  assert.match(nativeOverlay, /handoffDuration: TimeInterval = 0\.14/)
  assert.match(nativeOverlay, /renderStaticFirstFrame\(\)/)
  assert.match(storyboard, /id="BLUMI-SCAN-BAND"/)
  assert.match(storyboard, /id="BLUMI-SCAN-LINE"/)
  assert.match(storyboard, /y="11"/)
  assert.match(nativeOverlay, /band\.centerYAnchor\.constraint\(equalTo: stage\.centerYAnchor\)/)
  assert.match(nativeOverlay, /completion: \{ \[weak self\]/)
})

nativeTest("the native scan band actually travels instead of faking motion with a fixed glow", () => {
  const nativeOverlay = read("ios/Blumi/NativeOnboardingBootOverlay.swift")

  assert.match(nativeOverlay, /stage\.clipsToBounds = true/)
  assert.match(nativeOverlay, /scanBand\?\.transform = CGAffineTransform\(translationX: 0, y: Layout\.scanStartOffset\)/)
  assert.match(nativeOverlay, /let sweep = CABasicAnimation\(keyPath: "transform\.translation\.y"\)/)
  assert.match(nativeOverlay, /sweep\.fromValue = Layout\.scanStartOffset/)
  assert.match(nativeOverlay, /sweep\.toValue = Layout\.scanEndOffset/)
  assert.match(nativeOverlay, /scanBand\?\.layer\.add\(sweep, forKey: "blumi\.native\.band\.sweep"\)/)
})

nativeTest("native delight overlaps startup work without bypassing the authored React prelude", () => {
  const nativeOverlay = read("ios/Blumi/NativeOnboardingBootOverlay.swift")
  const appDelegate = read("ios/Blumi/AppDelegate.swift")
  const bridgePath = resolve(
    mobileRoot,
    "src/features/session/nativeOnboardingBootBridge.ts"
  )
  assert.equal(existsSync(bridgePath), true)
  const bridge = read("src/features/session/nativeOnboardingBootBridge.ts")
  const prelude = read("src/features/session/OnboardingBrandPrelude.tsx")
  const loading = read("src/ui/BlumiLoadingScreen.tsx")

  assert.equal(getOnboardingBootGateRemainingMs(0, false), 1_950)
  assert.equal(getOnboardingBootGateRemainingMs(1_750, false), 200)
  assert.equal(getOnboardingBootGateRemainingMs(0, true), 0)
  assert.equal(getOnboardingBootGateRemainingMs(0, true, false), null)
  assert.equal(getOnboardingPreludeMountElapsedMs(9_000), 1_950)
  assert.match(appDelegate, /markBootStarted/)
  assert.match(bridge, /getNativeOnboardingBootStartedAtMs/)
  assert.match(loading, /getNativeOnboardingBootStartedAtMs/)
  assert.match(loading, /hydrateOnboardingBootPreludeStart/)
  assert.match(prelude, /getOnboardingBootPreludeElapsedSnapshotMs/)
  assert.doesNotMatch(prelude, /hydrateOnboardingBootPreludeStart/)
  assert.doesNotMatch(nativeOverlay, /RCTEventEmitter|sendEvent/)
})

test("the React loading scan does not freeze before Reduce Motion resolves", () => {
  const loading = read("src/ui/BlumiLoadingScreen.tsx")

  assert.match(loading, /useReducedMotionPreference\(\)/)
  assert.match(loading, /shouldReduceOnboardingBootMotion\(/)
  assert.match(loading, /const gateElapsedMs = getOnboardingBootPreludeElapsedMs\(\)/)
  assert.match(loading, /if \(remainingMs === null\) return undefined/)
  assert.doesNotMatch(loading, /useReducedMotion\(\)/)
})

nativeTest("the explicit boot bridge is compiled into the app target", () => {
  const project = read("ios/Blumi.xcodeproj/project.pbxproj")

  assert.match(project, /BlumiBootBridge\.swift in Sources/)
  assert.match(project, /BlumiBootBridge\.swift/)
})

nativeTest("the native boot overlay is compiled into the app target", () => {
  const project = read("ios/Blumi.xcodeproj/project.pbxproj")

  assert.match(project, /NativeOnboardingBootOverlay\.swift in Sources/)
  assert.match(project, /NativeOnboardingBootOverlay\.swift/)
})
