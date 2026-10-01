import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { RoomPoint } from "./miniRoomSceneTypes"

function mount() {
  const runtime = createFakeReactRuntime()
  const calls: string[] = []
  let reduced = false
  let progress: { value: number } | undefined
  const useRef = runtime.react.useRef as <T>(initial: T) => { current: T }
  type Element = { props: { children: Element[]; style: { read?: () => { opacity: number; transform: { scale: number }[] } }[] } }
  const { RoomTapFeedback } = loadSourceWithFakeReact<{
    RoomTapFeedback: (props: { point: RoomPoint }) => Element
  }>("features/miniRoom/scene/RoomTapFeedback.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub().module,
      "../../../ui/animations": { useReducedMotion: () => reduced },
      "react-native-reanimated": {
        default: { View: "AnimatedView" },
        useSharedValue: (value: number) => {
          progress = useRef({ value }).current
          return progress
        },
        useAnimatedStyle: (read: () => unknown) => ({ read }),
        withTiming: () => { calls.push("start"); return 0 },
        cancelAnimation: () => { calls.push("cancel") },
        Easing: { out: (value: unknown) => value, cubic: "cubic" },
        ReduceMotion: { Never: "never" }
      }
    }
  })
  return {
    calls,
    runtime,
    render(point: RoomPoint, reduceMotion = false) {
      reduced = reduceMotion
      return runtime.render(() => RoomTapFeedback({ point }))
    },
    sample(element: Element, value: number) {
      progress!.value = value
      return element.props.children[0]!.props.style[1]!.read!()
    }
  }
}

test("each new destination plays once; parent renders do not restart feedback", () => {
  const f = mount()
  const point = { x: 0.4, y: 0.7 }
  f.render(point)
  f.render(point)
  assert.equal(f.calls.filter((call) => call === "start").length, 1)
  // A second tap at the same destination is still a new interaction.
  f.render({ ...point })
  assert.equal(f.calls.filter((call) => call === "start").length, 2)
  assert.equal(f.calls.filter((call) => call === "cancel").length, 1)
  f.runtime.unmount()
  assert.equal(f.calls.filter((call) => call === "cancel").length, 2)
})

test("feedback fades completely, and Reduce Motion keeps its footprint still", () => {
  const f = mount()
  const point = { x: 0.5, y: 0.6 }
  const normal = f.render(point)
  const start = f.sample(normal, 0)
  const end = f.sample(normal, 1)
  assert.ok(start.opacity > 0)
  assert.equal(end.opacity, 0)
  assert.ok(end.transform[0]!.scale > start.transform[0]!.scale)
  const reduced = f.render(point, true)
  assert.equal(f.sample(reduced, 0).transform[0]!.scale, f.sample(reduced, 1).transform[0]!.scale)
  assert.equal(f.sample(reduced, 1).opacity, 0)
})
