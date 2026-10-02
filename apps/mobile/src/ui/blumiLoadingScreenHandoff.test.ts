import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test, { mock } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import {
  createClockedReanimatedStub,
  findElements,
  loadClockedMotion,
  styleValue
} from "../testing/reanimatedClock"

// The timeline the loading screen itself loads (see `real` below).
const { ONBOARDING_BRAND_PRELUDE_TIMELINE_MS } = createRequire(resolve(__dirname, "index.ts"))(
  "../features/session/onboardingBrandPreludeModel"
) as { ONBOARDING_BRAND_PRELUDE_TIMELINE_MS: { scanDissolveStart: number; scanDissolveComplete: number } }
const DISSOLVE_START = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveStart
const DISSOLVE_END = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.scanDissolveComplete
const DISSOLVE_MS = DISSOLVE_END - DISSOLVE_START

// The boot loading surface owns the scan. It dissolves the characters itself
// before an onboarding prelude takes over (ONB-02) and never dissolves when
// no prelude is waiting (splash, Discover, linking fallback). The scan plays
// on the UI thread; this test reads what is on screen as time passes.
function mountLoadingScreen(options: { reduceMotion?: boolean; resolved?: boolean } = {}) {
  const requireReal = createRequire(resolve(__dirname, "index.ts"))
  delete requireReal.cache[requireReal.resolve("../features/session/onboardingBrandPreludeModel")]
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub().module
  const clock = createClockedReanimatedStub(runtime)
  const motion = { reduceMotion: options.reduceMotion ?? false, isResolved: options.resolved ?? true }
  const { BlumiLoadingScreen } = loadSourceWithFakeReact<{
    BlumiLoadingScreen: (props: { onPreludeReady?: () => void }) => unknown
  }>("ui/BlumiLoadingScreen.tsx", runtime, {
    modules: {
      "react-native": reactNative,
      "react-native-reanimated": clock.module,
      "react-native-worklets": clock.worklets,
      "./motion": loadClockedMotion(runtime, clock.module, reactNative),
      "../features/session/OnboardingScanStage": { OnboardingScanStage: "Scan" },
      "../features/session/OnboardingGreetingPair": { ONBOARDING_SCAN_FRAMES: [] },
      "../features/session/nativeOnboardingBootBridge": {
        getNativeOnboardingBootReduceMotion: () => null,
        getNativeOnboardingBootStartedAtMs: () => null
      },
      "./backgrounds": { SoftBlobBackground: "Background" },
      "./animations": { useReducedMotionPreference: () => motion }
    },
    real: ["../features/session/onboardingBrandPreludeModel", "./loadingScreenCopy", "./uiLocale"]
  })
  const scanOpacity = () => {
    const [stage] = findElements(runtime.output, (element) => element.props.accessibilityRole === "progressbar")
    assert.ok(stage, "the scan stage is on screen")
    return styleValue(stage, "opacity")
  }
  return { runtime, BlumiLoadingScreen, scanOpacity }
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 })
})

test.afterEach(() => {
  mock.timers.reset()
})

test("with a waiting prelude the scan dissolves on the shared clock, then hands off", () => {
  const screen = mountLoadingScreen()
  let ready = 0
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))

  mock.timers.tick(DISSOLVE_START)
  assert.equal(screen.scanOpacity(), 1, "the characters stay until the authored dissolve")
  mock.timers.tick(DISSOLVE_MS - 1)
  assert.ok((screen.scanOpacity() as number) > 0, "still dissolving")
  assert.equal(ready, 0, "the prelude never mounts over visible characters")
  mock.timers.tick(1)
  assert.equal(screen.scanOpacity(), 0)
  assert.equal(ready, 1)
})

test("a late handoff still plays a full dissolve instead of cutting the characters", () => {
  const screen = mountLoadingScreen()
  let ready = 0
  // Splash: no prelude yet, the scan stays.
  screen.runtime.render(() => screen.BlumiLoadingScreen({}))
  mock.timers.tick(DISSOLVE_END + 450)
  assert.equal(screen.scanOpacity(), 1)
  // Hydration resolves to AuthEntry well after the authored dissolve time.
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  assert.equal(screen.scanOpacity(), 1, "the dissolve starts from fully visible")
  mock.timers.tick(DISSOLVE_MS - 1)
  assert.ok((screen.scanOpacity() as number) > 0)
  assert.equal(ready, 0)
  mock.timers.tick(1)
  assert.equal(screen.scanOpacity(), 0)
  assert.equal(ready, 1)
})

test("without a waiting prelude the scan never dissolves", () => {
  const screen = mountLoadingScreen()
  screen.runtime.render(() => screen.BlumiLoadingScreen({}))
  mock.timers.tick(5_000)
  assert.equal(screen.scanOpacity(), 1, "the scan stays fully visible")
})

test("Reduce Motion hands off at once without a dissolve", () => {
  const screen = mountLoadingScreen({ reduceMotion: true })
  let ready = 0
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  assert.equal(ready, 1)
  mock.timers.tick(5_000)
  assert.equal(screen.scanOpacity(), 1, "no dissolve plays under Reduce Motion")
  assert.equal(ready, 1)
})

test("an unresolved motion preference keeps the gate closed", () => {
  const screen = mountLoadingScreen({ reduceMotion: true, resolved: false })
  let ready = 0
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  mock.timers.tick(5_000)
  assert.equal(ready, 0)
  assert.equal(screen.scanOpacity(), 1)
})

test("unmounting mid-dissolve cancels the handoff", () => {
  const screen = mountLoadingScreen()
  let ready = 0
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  mock.timers.tick(DISSOLVE_START + 1)
  screen.runtime.unmount()
  mock.timers.tick(5_000)
  assert.equal(ready, 0)
})
