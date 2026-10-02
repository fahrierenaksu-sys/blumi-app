import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../testing/hookHarness"
import { createClockedReanimatedStub, findElements, loadClockedMotion } from "../../testing/reanimatedClock"
import {
  ONBOARDING_GREETING_WAVE_SEQUENCE as SEQUENCE
} from "./onboardingGreetingPairModel"
import { ONBOARDING_BRAND_PRELUDE_TIMELINE_MS } from "./onboardingBrandPreludeModel"

// The greeting pair waves on a UI-thread clock (ONBV-03): each character
// shows the authored wave frames on their beats (the male a little later),
// the pair reports the end of the wave once, a pause resumes where it
// stopped, and Reduce Motion rests on the idle frame.
const FRAME_MS = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.waveFrameDuration
const MALE_OFFSET_MS = ONBOARDING_BRAND_PRELUDE_TIMELINE_MS.maleWaveOffset
const FRAMES = 6
const IDLE_FRAME = FRAMES - 1

interface Props {
  ambientOnly?: boolean
  greetingActive: boolean
  motionEnabled: boolean
  motionPreferenceResolved: boolean
  reduceMotion: boolean
  onFinished: () => void
}

function mount(initial: Partial<Props> = {}) {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub().module
  const clock = createClockedReanimatedStub(runtime)
  const frames = (role: string) => Array.from({ length: FRAMES }, (_, index) => `${role}-${index}`)
  const { OnboardingGreetingPair } = loadSourceWithFakeReact<{ OnboardingGreetingPair: (props: Props) => unknown }>(
    "features/session/OnboardingGreetingPair.tsx",
    runtime,
    {
      modules: {
        "react-native": reactNative,
        "react-native-reanimated": clock.module,
        "react-native-worklets": clock.worklets,
        "../../ui/motion": loadClockedMotion(runtime, clock.module, reactNative),
        "./onboardingRunAssetGate": { ONBOARDING_RUN_ASSET_MODE: "approved" },
        "./onboardingRunApprovedAssetCatalog": {
          APPROVED_ONBOARDING_RUN_ASSETS: { wave: { female: frames("female"), male: frames("male") } }
        },
        "./onboardingRunAssetCatalog": { getOnboardingRunAssetSet: () => { throw new Error("candidate assets") } }
      },
      real: ["./onboardingBrandPreludeModel", "./onboardingGreetingPairModel"]
    }
  )
  let finished = 0
  let props: Props = {
    greetingActive: false,
    motionEnabled: true,
    motionPreferenceResolved: true,
    reduceMotion: false,
    onFinished: () => { finished += 1 },
    ...initial
  }
  const render = (next: Partial<Props> = {}) => {
    props = { ...props, ...next }
    return runtime.render(() => OnboardingGreetingPair(props))
  }
  const sprite = (role: "female" | "male") => {
    const [found] = findElements(runtime.output, (element) => element.props.testID === `onboarding-greeting-${role}`)
    assert.ok(found, `${role} sprite is on screen`)
    return found.props as { frame: { value: number }; stacked: boolean }
  }
  return {
    render,
    frame: (role: "female" | "male") => sprite(role).frame.value,
    stacked: (role: "female" | "male") => sprite(role).stacked,
    get finished() { return finished }
  }
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 200_000 })
})

test.afterEach(() => {
  mock.timers.reset()
})

test("each character plays the authored wave on its beats and the pair reports the end once", () => {
  const pair = mount()
  pair.render()
  assert.equal(pair.stacked("female"), true, "every frame is ready before the first swap")
  SEQUENCE.forEach((assetFrame, position) => {
    if (position > 0) mock.timers.tick(FRAME_MS)
    assert.equal(pair.frame("female"), assetFrame, `female frame at beat ${position}`)
  })
  // The male runs the same sequence a beat behind.
  assert.equal(pair.frame("male"), SEQUENCE[SEQUENCE.length - 2])
  mock.timers.tick(MALE_OFFSET_MS)
  assert.equal(pair.frame("male"), SEQUENCE.at(-1))
  assert.equal(pair.finished, 0, "both rest on their last frame before the pair is done")
  mock.timers.tick(FRAME_MS - 1)
  assert.equal(pair.finished, 0)
  mock.timers.tick(1)
  assert.equal(pair.finished, 1)
  mock.timers.tick(30_000)
  assert.equal(pair.finished, 1)
})

test("after the greeting the pair rests on the idle frame, then waves again now and then", () => {
  const pair = mount()
  pair.render()
  mock.timers.tick(SEQUENCE.length * FRAME_MS + MALE_OFFSET_MS)
  assert.equal(pair.finished, 1)
  assert.equal(pair.frame("female"), IDLE_FRAME)
  assert.equal(pair.frame("male"), IDLE_FRAME)
  mock.timers.tick(2_000)
  assert.equal(pair.frame("female"), IDLE_FRAME, "a quiet pause first")
  let sawFemaleWave = false
  for (let elapsed = 0; elapsed < 15_000; elapsed += FRAME_MS) {
    mock.timers.tick(FRAME_MS)
    if (pair.frame("female") !== IDLE_FRAME) sawFemaleWave = true
  }
  assert.ok(sawFemaleWave, "the female waves again on her own")
})

test("a paused wave resumes where it stopped", () => {
  const pair = mount()
  pair.render()
  mock.timers.tick(3 * FRAME_MS)
  pair.render({ motionEnabled: false })
  const held = pair.frame("female")
  assert.equal(held, SEQUENCE[3])
  mock.timers.tick(5_000)
  assert.equal(pair.frame("female"), held, "the frame holds while paused")
  assert.equal(pair.finished, 0)
  pair.render({ motionEnabled: true })
  mock.timers.tick(FRAME_MS)
  assert.equal(pair.frame("female"), SEQUENCE[4])
  mock.timers.tick((SEQUENCE.length - 5) * FRAME_MS + MALE_OFFSET_MS + FRAME_MS)
  assert.equal(pair.finished, 1)
})

test("a newly opened greeting replays the wave from its first frame", () => {
  const pair = mount()
  pair.render()
  mock.timers.tick(SEQUENCE.length * FRAME_MS + MALE_OFFSET_MS)
  assert.equal(pair.frame("female"), IDLE_FRAME)
  pair.render({ greetingActive: true })
  assert.equal(pair.frame("female"), SEQUENCE[0])
  mock.timers.tick(FRAME_MS)
  assert.equal(pair.frame("female"), SEQUENCE[1])
})

test("Reduce Motion rests on the idle frame and finishes at once", () => {
  const pair = mount({ reduceMotion: true })
  pair.render()
  assert.equal(pair.frame("female"), IDLE_FRAME)
  assert.equal(pair.frame("male"), IDLE_FRAME)
  assert.equal(pair.stacked("female"), false, "only the idle frame is mounted")
  mock.timers.tick(0)
  assert.equal(pair.finished, 1)
  mock.timers.tick(20_000)
  assert.equal(pair.frame("female"), IDLE_FRAME)
})
