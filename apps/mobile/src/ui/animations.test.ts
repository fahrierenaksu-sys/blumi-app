import assert from "node:assert/strict"
import test from "node:test"
import {
  createFakeReactRuntime,
  createReanimatedStub,
  loadSourceWithFakeReact,
  type FakeReactRuntime
} from "../testing/hookHarness"
import type * as AnimationsModule from "./animations"

type Style = { opacity?: number; transform?: Record<string, number>[] }

// The shared hooks run against the real motion resolution; only the Reduce
// Motion answer is injected. Passive effects are off, so whatever a hook
// shows is what the first painted frame shows.
function load(reduceMotion: boolean) {
  const runtime = createFakeReactRuntime()
  runtime.react.useEffect = runtime.react.useLayoutEffect
  const reanimated = createReanimatedStub(runtime)
  const snapshot = { reduceMotion, isResolved: true }
  const motionStub = loadSourceWithFakeReact<Record<string, unknown>>("ui/motion.ts", runtime, {
    modules: {
      "react-native": { AccessibilityInfo: {} },
      "react-native-reanimated": reanimated.module,
      "./reducedMotionStore": {
        createReducedMotionStore: () => ({
          subscribe: () => () => undefined,
          getSnapshot: () => snapshot
        })
      }
    },
    real: ["./motionTokens"]
  })
  const hooks = loadSourceWithFakeReact<typeof AnimationsModule>("ui/animations.ts", runtime, {
    modules: { "react-native-reanimated": reanimated.module, "./motion": motionStub },
    real: ["./ambientMotionModel"]
  })
  return { runtime, reanimated, hooks }
}

const translateY = (style: Style) => style.transform?.find((entry) => "translateY" in entry)?.translateY ?? 0
const scale = (style: Style) => style.transform?.find((entry) => "scale" in entry)?.scale ?? 1

function renderFirstFrame<T>(runtime: FakeReactRuntime, hook: () => T): T {
  // The stub settles animations at once; capture the style the hook returns
  // on its first render, before any effect has run.
  let first: T | undefined
  runtime.render(() => {
    const value = hook()
    first ??= value
    return value
  })
  return first as T
}

test("an entrance starts hidden and low on its first frame, then rises in", () => {
  const { runtime, reanimated, hooks } = load(false)
  const first = renderFirstFrame(runtime, () => hooks.useEntranceAnimation({ translateY: 20 }) as Style)
  assert.equal(first.opacity, 0)
  assert.equal(translateY(first), 20)
  assert.ok(reanimated.calls.some((call) => call.kind === "withSpring" && call.target === 1))
  const settled = runtime.rerender() as Style
  assert.equal(settled.opacity, 1)
  assert.equal(translateY(settled), 0)
})

test("Reduce Motion: an entrance only crossfades, with no travel and no delay", () => {
  const { runtime, reanimated, hooks } = load(true)
  const first = renderFirstFrame(runtime, () => hooks.useEntranceAnimation({ translateY: 20, delay: 300 }) as Style)
  assert.equal(translateY(first), 0, "nothing moves")
  assert.equal(first.opacity, 0, "it still fades in")
  assert.ok(!reanimated.calls.some((call) => call.kind === "withDelay"))
  assert.ok(reanimated.calls.some((call) => call.kind === "withTiming" && call.target === 1))
})

test("a bounded pulse ends at full size; Reduce Motion keeps it still at full size", () => {
  const full = load(false)
  full.runtime.render(() => full.hooks.usePulse({ minScale: 0.9, maxScale: 1.15, iterations: 2 }))
  const repeat = full.reanimated.calls.find((call) => call.kind === "withRepeat")
  assert.equal(repeat?.config?.count, 2, "the pulse is bounded")
  assert.equal(scale(full.runtime.rerender() as Style), 1)

  const reduced = load(true)
  const style = reduced.runtime.render(() => reduced.hooks.usePulse({ minScale: 0.9, maxScale: 1.15 })) as Style
  assert.equal(scale(style), 1)
  assert.ok(!reduced.reanimated.calls.some((call) => call.kind === "withRepeat"))
})

test("a selection transition plays only when the selection changes", () => {
  const { runtime, reanimated, hooks } = load(false)
  let key = "a"
  runtime.render(() => hooks.useSelectionTransition(key))
  runtime.rerender()
  assert.equal(reanimated.calls.length, 0, "the first selection and re-renders do not animate")
  key = "b"
  runtime.rerender()
  assert.ok(reanimated.calls.some((call) => call.kind === "withSpring" && call.target === 1))
})

test("Reduce Motion: a selection change crossfades without moving", () => {
  const { runtime, reanimated, hooks } = load(true)
  let key = "a"
  runtime.render(() => hooks.useSelectionTransition(key, { translateY: 6, fromScale: 0.9 }))
  key = "b"
  const style = runtime.rerender() as Style
  assert.ok(!reanimated.calls.some((call) => call.kind === "withSpring"))
  assert.equal(translateY(style), 0)
  assert.equal(scale(style), 1)
})
