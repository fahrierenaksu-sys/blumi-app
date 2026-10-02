import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { RoomWorldMovementSegment } from "../../roomWorld/roomWorldRuntime"
import type * as Positions from "./miniRoomAvatarPositions"

interface Step { to: number; duration: number; callback?: (finished?: boolean) => void }
interface Sequence { steps: Step[] }

/**
 * A small UI thread: an assigned sequence plays its steps one after another
 * on frames that never wait for the JS thread; scheduleOnRN only queues.
 */
function loadAnimator() {
  const jsQueue: (() => void)[] = []
  const playing = new Map<object, { box: { current: number }; sequence: Sequence; index: number }>()
  const cancel = (shared: object) => {
    // A cancelled or replaced animation's unfinished steps hear `false`.
    const current = playing.get(shared)
    playing.delete(shared)
    current?.sequence.steps.slice(current.index).forEach((step) => step.callback?.(false))
  }
  const sharedValue = (initial: number) => {
    const box = { current: initial }
    const shared = {
      get value() { return box.current },
      set value(next: number | Sequence) {
        cancel(shared)
        if (typeof next === "number") box.current = next
        else playing.set(shared, { box, sequence: next, index: 0 })
      }
    }
    return shared
  }
  const reanimated = {
    makeMutable: sharedValue,
    cancelAnimation: cancel,
    withTiming: (to: number, config: { duration: number }, callback?: Step["callback"]): Step =>
      ({ to, duration: config.duration, callback }),
    withSequence: (_reduceMotion: string, ...steps: Step[]): Sequence => ({ steps }),
    ReduceMotion: { Never: "never" }
  }
  const module = loadSourceWithFakeReact<typeof Positions>(
    "features/miniRoom/scene/miniRoomAvatarPositions.ts", createFakeReactRuntime(), {
      modules: {
        "react-native-reanimated": reanimated,
        "react-native-worklets": {
          scheduleOnRN: (work: (...args: unknown[]) => void, ...args: unknown[]) => { jsQueue.push(() => work(...args)) }
        }
      },
      real: ["../../roomWorld/roomWorldRuntime"]
    })
  /** One UI-thread frame: every running sequence finishes its current step. */
  const frame = () => {
    for (const [shared, entry] of [...playing]) {
      const step = entry.sequence.steps[entry.index]!
      entry.box.current = step.to
      entry.index += 1
      if (entry.index >= entry.sequence.steps.length) playing.delete(shared)
      step.callback?.(true)
    }
  }
  const runJs = () => { while (jsQueue.length) jsQueue.shift()!() }
  return { module, frame, runJs, jsQueue, playing }
}

const PATH: RoomWorldMovementSegment[] = [
  { from: { x: 0.1, y: 0.7 }, to: { x: 0.3, y: 0.7 }, facing: "right", distance: 0.2, durationMs: 380, isFinal: false },
  { from: { x: 0.3, y: 0.7 }, to: { x: 0.3, y: 0.55 }, facing: "back", distance: 0.15, durationMs: 285, isFinal: false },
  { from: { x: 0.3, y: 0.55 }, to: { x: 0.2, y: 0.55 }, facing: "left", distance: 0.1, durationMs: 190, isFinal: true }
]

test("the UI thread walks the whole path through every corner while JS is busy; JS hears each step after", () => {
  const ui = loadAnimator()
  const position = ui.module.createMiniRoomAvatarPosition(PATH[0]!.from)
  const animator = ui.module.createMiniRoomPathAnimator(position)
  const reported: number[] = []
  animator.animate(PATH, (index) => reported.push(index))
  // JS is blocked: nothing it runs reaches the UI thread, yet the walk goes on.
  ui.frame()
  ui.frame()
  ui.frame()
  assert.deepEqual(ui.module.readMiniRoomAvatarPosition(position), PATH[2]!.to, "the walk reached the end without JS")
  assert.deepEqual(reported, [], "the reports wait in the JS queue")
  ui.runJs()
  assert.deepEqual(reported, [0, 1, 2], "each segment is reported once, in order")
})

test("a cancelled or replaced path never reports again", () => {
  const ui = loadAnimator()
  const position = ui.module.createMiniRoomAvatarPosition(PATH[0]!.from)
  const animator = ui.module.createMiniRoomPathAnimator(position)
  const first: number[] = []
  animator.animate(PATH, (index) => first.push(index))
  ui.frame()
  animator.cancel()
  ui.frame()
  ui.runJs()
  assert.deepEqual(first, [], "a report queued before the cancel is dropped")
  assert.deepEqual(ui.module.readMiniRoomAvatarPosition(position), PATH[0]!.to, "it stops where it was")

  const second: number[] = []
  animator.animate(PATH.slice(1), (index) => second.push(index))
  ui.frame()
  const third: number[] = []
  animator.animate([PATH[2]!], (index) => third.push(index))
  ui.frame()
  ui.runJs()
  assert.deepEqual(second, [], "the replaced path is silent")
  assert.deepEqual(third, [0])
})
