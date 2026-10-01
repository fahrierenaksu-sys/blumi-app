import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"

// Characterizes the onboarding prelude timeline: it starts once per motion
// state, re-renders (typing, parent updates) never restart it, and a Reduce
// Motion change restarts it with the new telemetry mode.
type Element = { props: { onLayout?: () => void } }

function mount() {
  const runtime = createFakeReactRuntime()
  const beats: { beat: string; reduceMotion: boolean }[] = []
  const samplerStates: boolean[] = []
  // Stable like the real hook's useCallback result.
  const readFrameGaps = () => undefined
  const { OnboardingBrandPrelude } = loadSourceWithFakeReact<{ OnboardingBrandPrelude: (props: unknown) => Element }>(
    "features/session/OnboardingBrandPrelude.tsx",
    runtime,
    {
      modules: {
        "react-native": createReactNativeStub().module,
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
    onActionsVisible: () => undefined,
    onSecondaryActionVisible: () => undefined,
    onFinished: () => undefined,
    reduceMotion: false,
    showCharacters: true,
    showGreetingBubble: false
  }
  const render = (next: Partial<typeof props> = {}) => {
    props = { ...props, ...next }
    return runtime.render(() => OnboardingBrandPrelude(props))
  }
  return { runtime, beats, samplerStates, render }
}

const scanBeats = (beats: { beat: string; reduceMotion: boolean }[]) => beats.filter(({ beat }) => beat === "scan")

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

test("turning on Reduce Motion finishes the prelude with reduced-motion telemetry", () => {
  const f = mount()
  f.render().props.onLayout?.()
  f.render({ reduceMotion: true })
  const beats = scanBeats(f.beats)
  assert.deepEqual(beats[0], { beat: "scan", reduceMotion: false })
  assert.deepEqual(beats.at(-1), { beat: "scan", reduceMotion: true })
  f.render({ reduceMotion: true })
  f.render({ greetingText: "Hello" })
  assert.equal(scanBeats(f.beats).length, beats.length, "settled: re-renders capture nothing")
})
