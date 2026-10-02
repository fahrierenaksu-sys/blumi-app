import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test, { mock } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import {
  createClockedReanimatedStub,
  findElements,
  loadClockedMotion,
  styleValue
} from "../../testing/reanimatedClock"

// Characterizes the onboarding prelude timeline: it starts once per motion
// state, re-renders (typing, parent updates) never restart it, a Reduce
// Motion change settles it with the new telemetry mode, and its beats land
// on the shared clock while the motion itself runs on the UI thread.
type Element = { props: { onLayout?: () => void } }

const { ONBOARDING_BRAND_PRELUDE_TIMELINE_MS: TIMELINE } = createRequire(resolve(__dirname, "index.ts"))(
  "./onboardingBrandPreludeModel"
) as {
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS: {
    brandRevealComplete: number
    primaryCtaStart: number
    interactive: number
  }
}

function mount() {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub().module
  const clock = createClockedReanimatedStub(runtime)
  const beats: { beat: string; reduceMotion: boolean }[] = []
  const samplerStates: boolean[] = []
  const calls = { actions: 0, finished: 0 }
  // Stable like the real hook's useCallback result.
  const readFrameGaps = () => undefined
  const { OnboardingBrandPrelude } = loadSourceWithFakeReact<{ OnboardingBrandPrelude: (props: unknown) => Element }>(
    "features/session/OnboardingBrandPrelude.tsx",
    runtime,
    {
      modules: {
        "react-native": reactNative,
        "react-native-reanimated": clock.module,
        "../../ui/motion": loadClockedMotion(runtime, clock.module, reactNative),
        "../../analytics/productAnalytics": { captureProductEvent: () => undefined },
        "./nativeOnboardingBootBridge": { markOnboardingContentReady: () => undefined },
        "./onboardingIntroTelemetry": {
          createOnboardingIntroTelemetry: (startedAtMs: number) => ({ startedAtMs }),
          getOnboardingIntroBeatEvent: (_telemetry: unknown, input: { beat: string; reduceMotion: boolean }) => {
            beats.push({ beat: input.beat, reduceMotion: input.reduceMotion })
            return null
          },
          getOnboardingIntroPerformanceEvent: () => ({ name: "performance", properties: {} }),
          recordOnboardingFrameGaps: () => undefined
        },
        "./onboardingIntroFrameSampler": {
          useOnboardingIntroFrameSampler: (active: boolean) => {
            samplerStates.push(active)
            return readFrameGaps
          }
        }
      },
      real: ["./onboardingBrandPreludeModel"],
      inertUnknown: true,
      // No frame loop may run on the JS thread: a frame API call would throw.
      globals: {
        requestAnimationFrame: () => { throw new Error("JS frame loop") },
        cancelAnimationFrame: () => undefined
      }
    }
  )
  let props = {
    compact: false,
    greetingText: "Hi",
    motionEnabled: true,
    motionPreferenceResolved: true,
    onActionsVisible: () => { calls.actions += 1 },
    onSecondaryActionVisible: () => undefined,
    onFinished: () => { calls.finished += 1 },
    reduceMotion: false,
    showCharacters: true,
    showGreetingBubble: false
  }
  const render = (next: Partial<typeof props> = {}) => {
    props = { ...props, ...next }
    return runtime.render(() => OnboardingBrandPrelude(props))
  }
  const brandOpacity = () => {
    // The layer that directly holds the "Blumi" wordmark.
    const [brand] = findElements(runtime.output, (element) =>
      Array.isArray(element.props.children) &&
      element.props.children.some((child: { props?: { children?: unknown } } | null) => child?.props?.children === "Blumi")
    )
    assert.ok(brand)
    return styleValue(brand, "opacity")
  }
  return { runtime, beats, samplerStates, calls, render, brandOpacity }
}

const scanBeats = (beats: { beat: string; reduceMotion: boolean }[]) => beats.filter(({ beat }) => beat === "scan")

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100_000 })
})

test.afterEach(() => {
  mock.timers.reset()
})

test("the prelude timeline starts once and re-renders do not restart it", () => {
  const f = mount()
  const root = f.render()
  assert.equal(scanBeats(f.beats).length, 0, "waits for the native layout")
  assert.equal(f.samplerStates.at(-1), false, "no frame sampling before layout")
  root.props.onLayout?.()
  assert.equal(f.samplerStates.at(-1), true, "frame pacing is sampled on the UI thread")
  assert.deepEqual(scanBeats(f.beats), [{ beat: "scan", reduceMotion: false }])
  f.render()
  f.render({ greetingText: "Hello", showGreetingBubble: true })
  f.render({ compact: true })
  assert.equal(scanBeats(f.beats).length, 1)
})

test("the brand, the actions and the finish land on the shared clock", () => {
  const f = mount()
  f.render().props.onLayout?.()
  assert.ok((f.brandOpacity() as number) < 1, "the brand has not arrived yet")
  mock.timers.tick(TIMELINE.brandRevealComplete)
  assert.equal(f.brandOpacity(), 1)
  mock.timers.tick(TIMELINE.primaryCtaStart - TIMELINE.brandRevealComplete - 1)
  assert.equal(f.calls.actions, 0)
  mock.timers.tick(1)
  assert.equal(f.calls.actions, 1)
  mock.timers.tick(TIMELINE.interactive - TIMELINE.primaryCtaStart)
  assert.equal(f.calls.finished, 1)
  mock.timers.tick(10_000)
  f.render()
  assert.deepEqual(f.calls, { actions: 1, finished: 1 }, "each beat fires once")
})

test("turning on Reduce Motion finishes the prelude with reduced-motion telemetry", () => {
  const f = mount()
  f.render().props.onLayout?.()
  f.render({ reduceMotion: true })
  const beats = scanBeats(f.beats)
  assert.deepEqual(beats[0], { beat: "scan", reduceMotion: false })
  assert.deepEqual(beats.at(-1), { beat: "scan", reduceMotion: true })
  assert.equal(f.brandOpacity(), 1, "the brand lands at once")
  assert.equal(f.calls.finished, 1)
  f.render({ reduceMotion: true })
  f.render({ greetingText: "Hello" })
  assert.equal(scanBeats(f.beats).length, beats.length, "settled: re-renders capture nothing")
})
