import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test, { mock } from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../testing/hookHarness"

// The boot loading surface owns the scan. It dissolves the characters itself
// before an onboarding prelude takes over (ONB-02) and never dissolves when
// no prelude is waiting (splash, Discover, linking fallback).
interface Started { kind: string; items?: Started[]; config?: { toValue?: number; duration?: number }; value?: unknown }

function mountLoadingScreen(options: { reduceMotion?: boolean; resolved?: boolean } = {}) {
  const requireReal = createRequire(resolve(__dirname, "index.ts"))
  delete requireReal.cache[requireReal.resolve("../features/session/onboardingBrandPreludeModel")]
  const runtime = createFakeReactRuntime()
  const started: Started[] = []
  const setValues: { value: unknown; to: number }[] = []
  class Value {
    constructor(public current: number) {}
    setValue(to: number) { this.current = to; setValues.push({ value: this, to }) }
    stopAnimation() { /* recorded through setValue */ }
  }
  const describe = (animation: Started): Started => animation
  const make = (kind: string, extra: Partial<Started> = {}) => {
    const description: Started = { kind, ...extra }
    return Object.assign(description, {
      start: () => { started.push(describe(description)) },
      stop: () => undefined
    })
  }
  const motion = { reduceMotion: options.reduceMotion ?? false, isResolved: options.resolved ?? true }
  const reactNative = {
    Animated: {
      Value,
      View: "Animated.View",
      timing: (value: unknown, config: Started["config"]) => make("timing", { value, config }),
      delay: (duration: number) => make("delay", { config: { duration } }),
      sequence: (items: Started[]) => make("sequence", { items }),
      parallel: (items: Started[]) => make("parallel", { items })
    },
    Easing: new Proxy({}, { get: () => () => (value: number) => value }),
    StyleSheet: { create: <T>(styles: T) => styles },
    View: "View"
  }
  const { BlumiLoadingScreen } = loadSourceWithFakeReact<{
    BlumiLoadingScreen: (props: { onPreludeReady?: () => void }) => unknown
  }>("ui/BlumiLoadingScreen.tsx", runtime, {
    modules: {
      "react-native": reactNative,
      "../features/session/OnboardingScanStage": { OnboardingScanStage: "Scan" },
      "../features/session/OnboardingGreetingPair": { ONBOARDING_SCAN_FRAMES: [] },
      "../features/session/nativeOnboardingBootBridge": {
        getNativeOnboardingBootReduceMotion: () => null,
        getNativeOnboardingBootStartedAtMs: () => null
      },
      "./backgrounds": { SoftBlobBackground: "Background" },
      "./animations": { useReducedMotionPreference: () => motion }
    },
    real: ["../features/session/onboardingBrandPreludeModel"]
  })
  return { runtime, started, setValues, BlumiLoadingScreen }
}

function dissolveOf(started: Started[]) {
  const sequence = started.find((animation) => animation.kind === "sequence")
  if (!sequence?.items) return null
  const [delay, timing] = sequence.items
  return { delayMs: delay.config?.duration, durationMs: timing.config?.duration, toValue: timing.config?.toValue }
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

  assert.deepEqual(dissolveOf(screen.started), { delayMs: 1_700, durationMs: 250, toValue: 0 })
  mock.timers.tick(1_949)
  assert.equal(ready, 0, "the prelude never mounts over visible characters")
  mock.timers.tick(1)
  assert.equal(ready, 1)
})

test("a late handoff still plays a full dissolve instead of cutting the characters", () => {
  const screen = mountLoadingScreen()
  let ready = 0
  // Splash: no prelude yet, the scan stays.
  screen.runtime.render(() => screen.BlumiLoadingScreen({}))
  assert.equal(dissolveOf(screen.started), null)
  mock.timers.tick(2_400)
  // Hydration resolves to AuthEntry well after the authored dissolve time.
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  assert.deepEqual(dissolveOf(screen.started), { delayMs: 0, durationMs: 250, toValue: 0 })
  mock.timers.tick(249)
  assert.equal(ready, 0)
  mock.timers.tick(1)
  assert.equal(ready, 1)
})

test("without a waiting prelude the scan never dissolves", () => {
  const screen = mountLoadingScreen()
  screen.runtime.render(() => screen.BlumiLoadingScreen({}))
  mock.timers.tick(5_000)
  assert.equal(dissolveOf(screen.started), null)
  assert.ok(screen.setValues.some(({ to }) => to === 1), "the scan stays fully visible")
})

test("Reduce Motion hands off at once without a dissolve", () => {
  const screen = mountLoadingScreen({ reduceMotion: true })
  let ready = 0
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  assert.equal(ready, 1)
  assert.equal(dissolveOf(screen.started), null)
})

test("an unresolved motion preference keeps the gate closed", () => {
  const screen = mountLoadingScreen({ reduceMotion: true, resolved: false })
  let ready = 0
  screen.runtime.render(() => screen.BlumiLoadingScreen({ onPreludeReady: () => { ready += 1 } }))
  mock.timers.tick(5_000)
  assert.equal(ready, 0)
  assert.equal(dissolveOf(screen.started), null)
})
