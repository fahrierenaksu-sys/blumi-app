import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReanimatedStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import type * as AnimationsModule from "./animations"
import type * as CommittedRevealModule from "./committedReveal"

/**
 * Row 24b class (simqa6): with IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS a UI-thread write sent before the native view is
 * mounted is lost, so a view that mounts hidden keeps its mount-time style. These model the native view as exactly
 * that: the hidden style it mounted with plus whatever React commits afterwards, and no UI-thread writes at all.
 */
type Style = object | null | undefined | Style[]

function flatten(style: Style): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return style as Record<string, unknown>
}

function loadCommittedReveal(runtime: ReturnType<typeof createFakeReactRuntime>) {
  return loadSourceWithFakeReact<typeof CommittedRevealModule>("ui/committedReveal.ts", runtime, {
    // A UI-thread completion hands the call back to JS.
    modules: { "react-native-worklets": { scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) } }
  })
}

test("a reveal whose UI-thread writes were lost is shown once its animation has finished", () => {
  const runtime = createFakeReactRuntime()
  const { useCommittedReveal } = loadCommittedReveal(runtime)
  runtime.render(() => useCommittedReveal())
  const reveal = () => runtime.output as CommittedRevealModule.CommittedReveal
  const mountedHidden = { opacity: 0 }

  assert.equal(flatten([mountedHidden, reveal().style]).opacity, 0, "still hidden while the reveal runs")
  reveal().onRevealEnd(false)
  runtime.rerender()
  assert.equal(flatten([mountedHidden, reveal().style]).opacity, 0, "a cancelled reveal commits nothing")
  reveal().onRevealEnd(true)
  runtime.rerender()
  assert.equal(flatten([mountedHidden, reveal().style]).opacity, 1, "the finished reveal reaches the view through React")
  reveal().reset()
  runtime.rerender()
  assert.equal(flatten([mountedHidden, reveal().style]).opacity, 0, "hidden again after a reset")
})

test("a shared entrance that mounts hidden ends visible even when no UI-thread write reaches the view", () => {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  let finishEntrance: ((finished?: boolean) => void) | undefined
  const committedReveal = loadCommittedReveal(runtime)
  const { useEntranceAnimation } = loadSourceWithFakeReact<typeof AnimationsModule>("ui/animations.ts", runtime, {
    inertUnknown: true,
    modules: {
      "react-native-reanimated": reanimated.module,
      "./committedReveal": committedReveal,
      "./motion": {
        useMotion: () => ({ reduceMotion: false, smooth: { kind: "spring" }, crossfade: { kind: "timing", duration: 1 } }),
        animateTo: (target: number) => target,
        // The animation starts on the UI thread; the test decides when it finishes.
        animateToAfter: (_delay: number, _target: number, _token: unknown, callback?: (finished?: boolean) => void) => {
          finishEntrance = callback
          return 0
        }
      }
    }
  })
  runtime.render(() => useEntranceAnimation())
  const mountStyle = runtime.output as Style
  // The native view: the style it mounted with; the animated part never updates (its writes were lost).
  const nativeView = () => flatten([(mountStyle as Style[])[0], (runtime.output as Style[])[1]])

  assert.equal(nativeView().opacity, 0, "the entrance mounts hidden")
  assert.ok(finishEntrance, "the entrance reports when it is over")
  finishEntrance(true)
  runtime.rerender()
  assert.equal(nativeView().opacity, 1, "the finished entrance is committed through React")
})
