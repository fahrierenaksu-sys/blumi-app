import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import test, { mock } from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import {
  createClockedReanimatedStub,
  findElements,
  loadClockedMotion,
  styleValue,
  type RenderedElement
} from "../testing/reanimatedClock"

// The Discover cover plays the boot scan once its images are on screen (or
// continues the boot scan's shared clock) and releases Discover only when the
// scan has played out. Assertions are relative to the real timeline.
const requireReal = createRequire(resolve(__dirname, "index.ts"))
const preludeModel = requireReal("../features/session/onboardingBrandPreludeModel") as Record<string, unknown> & {
  ONBOARDING_BRAND_PRELUDE_TIMELINE_MS: {
    scanRowsComplete: number
    scanSweepStart: number
    scanSweepComplete: number
    scanDissolveComplete: number
  }
}
const TIMELINE = preludeModel.ONBOARDING_BRAND_PRELUDE_TIMELINE_MS
const SCAN_ASSET_COUNT = 7 // six characters plus the laser

interface SharedNumber { readonly value: number }

function mount(resume = { startElapsedMs: 0, resumesBootScan: false }) {
  const runtime = createFakeReactRuntime()
  const reactNative = createReactNativeStub().module
  const clock = createClockedReanimatedStub(runtime)
  const motion = { reduceMotion: false, isResolved: true }
  const { PreparedDiscoveryLoadingScreen } = loadSourceWithFakeReact<{
    PreparedDiscoveryLoadingScreen: (props: { onFinished: () => void; onError: () => void }) => unknown
  }>("ui/BlumiLoadingScreen.tsx", runtime, {
    modules: {
      "react-native": reactNative,
      "react-native-reanimated": clock.module,
      "react-native-worklets": clock.worklets,
      "./motion": loadClockedMotion(runtime, clock.module, reactNative),
      "../features/session/OnboardingScanStage": { OnboardingScanStage: "Scan" },
      "../features/session/OnboardingGreetingPair": { ONBOARDING_SCAN_FRAMES: Array(SCAN_ASSET_COUNT - 1).fill("asset") },
      "../features/session/onboardingBrandPreludeModel": {
        ...preludeModel,
        getOnboardingLoadingScanResume: () => resume,
        getOnboardingBootPreludeElapsedSnapshotMs: () => resume.startElapsedMs
      },
      "../features/session/nativeOnboardingBootBridge": {
        getNativeOnboardingBootReduceMotion: () => null,
        getNativeOnboardingBootStartedAtMs: () => null
      },
      "./backgrounds": { SoftBlobBackground: "Background" },
      "./animations": { useReducedMotionPreference: () => motion }
    },
    real: ["./loadingScreenCopy", "./uiLocale"]
  })
  let completions = 0
  let failures = 0
  const props = { onFinished: () => { completions += 1 }, onError: () => { failures += 1 } }
  const render = () => runtime.render(() => PreparedDiscoveryLoadingScreen(props))
  const stage = (): RenderedElement => {
    const [found] = findElements(runtime.output, (element) => element.props.accessibilityRole === "progressbar")
    assert.ok(found)
    return found
  }
  const scan = () => {
    const [found] = findElements(runtime.output, (element) => element.type === "Scan")
    assert.ok(found)
    return found.props as {
      scanRows: SharedNumber
      scanSweep: SharedNumber
      onAssetLoad: (id: number) => void
      onAssetError: () => void
    }
  }
  const loadAll = () => {
    for (let id = 0; id < SCAN_ASSET_COUNT; id += 1) scan().onAssetLoad(id)
  }
  return {
    runtime,
    motion,
    render,
    loadAll,
    scan,
    stageOpacity: () => styleValue(stage(), "opacity"),
    get completions() { return completions },
    get failures() { return failures }
  }
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 50_000 })
})

test.afterEach(() => {
  mock.timers.reset()
})

test("all six scan characters plus the laser must load before the scan shows or runs", () => {
  const screen = mount()
  screen.render()
  assert.equal(screen.stageOpacity(), 0)
  const load = screen.scan().onAssetLoad
  load(-1); load(SCAN_ASSET_COUNT); load(0); load(0)
  for (let id = 1; id < SCAN_ASSET_COUNT - 1; id += 1) load(id)
  mock.timers.tick(TIMELINE.scanRowsComplete)
  assert.equal(screen.stageOpacity(), 0)
  assert.equal(screen.scan().scanRows.value, 0, "the scan clock has not started")
  load(SCAN_ASSET_COUNT - 1)
  assert.equal(screen.stageOpacity(), 1)
  mock.timers.tick(TIMELINE.scanRowsComplete)
  assert.equal(screen.scan().scanRows.value, 1, "the scan runs once everything is on screen")
})

test("a loaded scan plays the whole timeline and releases Discover once, at its end", () => {
  const screen = mount()
  screen.render()
  screen.loadAll()
  mock.timers.tick(TIMELINE.scanSweepStart)
  assert.equal(screen.scan().scanSweep.value, 0, "the sweep waits for its beat")
  mock.timers.tick(TIMELINE.scanSweepComplete - TIMELINE.scanSweepStart)
  assert.equal(screen.scan().scanSweep.value, 1)
  assert.equal(screen.completions, 0, "the scan holds before releasing")
  mock.timers.tick(TIMELINE.scanDissolveComplete - TIMELINE.scanSweepComplete - 1)
  assert.equal(screen.completions, 0)
  mock.timers.tick(1)
  assert.equal(screen.completions, 1)
  screen.render()
  mock.timers.tick(5_000)
  assert.equal(screen.completions, 1)
})

test("unmounting cancels the scan and ignores its late end", () => {
  const screen = mount()
  screen.render()
  screen.loadAll()
  mock.timers.tick(TIMELINE.scanSweepStart)
  screen.runtime.unmount()
  mock.timers.tick(TIMELINE.scanDissolveComplete)
  assert.equal(screen.completions, 0)
})

test("Reduce Motion shows the loaded static scan without a timed delay", () => {
  const screen = mount()
  screen.motion.reduceMotion = true
  screen.render()
  screen.loadAll()
  assert.equal(screen.completions, 1)
  assert.equal(screen.scan().scanRows.value, 1)
  assert.equal(screen.scan().scanSweep.value, 1)
})

test("an unresolved accessibility preference does not consume the scan clock", () => {
  const screen = mount()
  screen.motion.isResolved = false
  screen.render()
  screen.loadAll()
  assert.equal(screen.stageOpacity(), 0)
  mock.timers.tick(TIMELINE.scanDissolveComplete)
  assert.equal(screen.scan().scanRows.value, 0)
  assert.equal(screen.completions, 0)
  screen.motion.isResolved = true
  screen.render()
  assert.equal(screen.stageOpacity(), 1)
  mock.timers.tick(TIMELINE.scanDissolveComplete)
  assert.equal(screen.completions, 1, "the full scan plays after the preference resolves")
})

test("an image failure goes to recovery without revealing a partial scan", () => {
  const screen = mount()
  screen.render()
  screen.scan().onAssetError()
  assert.equal(screen.failures, 1)
  assert.equal(screen.stageOpacity(), 0)
  mock.timers.tick(TIMELINE.scanDissolveComplete)
  assert.equal(screen.completions, 0)
})

test("straight after the boot surface the scan continues the shared clock without an image gate", () => {
  const resumeAt = TIMELINE.scanRowsComplete + 200
  const screen = mount({ startElapsedMs: resumeAt, resumesBootScan: true })
  screen.render()
  assert.equal(screen.stageOpacity(), 1, "the boot surface already showed these images")
  assert.equal(screen.scan().scanRows.value, 1, "rows are already complete")
  mock.timers.tick(TIMELINE.scanSweepComplete - resumeAt)
  assert.equal(screen.scan().scanSweep.value, 1, "the sweep finishes on the shared clock")
  mock.timers.tick(TIMELINE.scanDissolveComplete - TIMELINE.scanSweepComplete - 1)
  assert.equal(screen.completions, 0)
  mock.timers.tick(1)
  assert.equal(screen.completions, 1)
})

test("a boot scan that already finished rests complete and releases at once", () => {
  const screen = mount({ startElapsedMs: TIMELINE.scanDissolveComplete, resumesBootScan: true })
  screen.render()
  assert.equal(screen.completions, 1)
  assert.equal(screen.scan().scanSweep.value, 1, "no replay of a finished scan")
})
