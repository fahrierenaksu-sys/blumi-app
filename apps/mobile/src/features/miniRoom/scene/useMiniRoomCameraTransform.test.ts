import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { resolveMiniRoomLayout, resolveMiniRoomRestCamera, type MiniRoomLayoutInput } from "./miniRoomLayout"
import type * as Hook from "./useMiniRoomCameraTransform"

const closed: MiniRoomLayoutInput = {
  windowWidth: 414, windowHeight: 896, safeTop: 44, safeBottom: 34,
  keyboardVisible: false, keyboardInset: 0, fontScale: 1, roomAspectRatio: 1254 / 714
}

function mount(reduceMotion = false) {
  const runtime = createFakeReactRuntime()
  const reanimated = createReanimatedStub(runtime)
  const timers = new Map<number, () => void>()
  let timerId = 0
  const fades: { target: number; duration: number }[] = []
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/scene/useMiniRoomCameraTransform.ts", runtime, {
    modules: {
      "react-native-reanimated": reanimated.module,
      "react-native-worklets": { scheduleOnUI: (work: (...args: unknown[]) => void, ...args: unknown[]) => work(...args) },
      "../../../ui/motion": {
        resolveMotion: () => ({ crossfade: { kind: "timing", duration: 200 } }),
        animateTo: (target: number, motion: { duration: number }) => { fades.push({ target, duration: motion.duration }); return target }
      }
    },
    real: ["./miniRoomLayout", "./miniRoomTransitionModel", "./miniRoomReducedMotion"],
    globals: {
      setTimeout: (run: () => void) => { timerId += 1; timers.set(timerId, run); return timerId },
      clearTimeout: (id: number) => { timers.delete(id) }
    }
  })
  let layoutInput = closed
  const render = () => runtime.render(() => hook.useMiniRoomCameraTransform({
    rest: resolveMiniRoomRestCamera(layoutInput),
    layout: resolveMiniRoomLayout(layoutInput),
    layoutInput,
    keyboardInset: layoutInput.keyboardInset,
    keyboardDurationMs: 250,
    reduceMotion
  }))
  render()
  const api = () => runtime.output as ReturnType<typeof Hook.useMiniRoomCameraTransform>
  /** The pose once the running transition has settled (the stub settles at once). */
  const settledProgress = () => { runtime.rerender(); return api().transition.value.progress }
  const commit = (patch: Partial<MiniRoomLayoutInput>) => { layoutInput = { ...layoutInput, ...patch }; render() }
  const runTimers = () => { for (const [id, run] of [...timers]) { timers.delete(id); run() } }
  return { runtime, api, settledProgress, commit, runTimers, timers, fades }
}

test("a touch-down that no keyboard confirms returns the room to rest after the fallback", () => {
  const { runtime, api, settledProgress, commit, runTimers } = mount()
  try {
    // A real keyboard was measured once, so the next touch-down may pre-open.
    api().animateKeyboard({ visible: true, inset: 336, durationMs: 250 })
    commit({ keyboardVisible: true, keyboardInset: 336 })
    api().animateKeyboard({ visible: false, inset: 0, durationMs: 250 })
    commit({ keyboardVisible: false, keyboardInset: 0 })
    assert.equal(settledProgress(), 0)

    api().prepareKeyboardOpen()
    assert.equal(settledProgress(), 1, "the warm opening starts on touch-down")
    runTimers()
    assert.equal(settledProgress(), 0, "no keyboard arrived: the dock and camera go back down")
  } finally {
    runtime.unmount()
  }
})

test("the first focus waits for the real keyboard frame; nothing is guessed", () => {
  const { runtime, api, settledProgress, timers } = mount()
  try {
    api().prepareKeyboardOpen()
    assert.equal(settledProgress(), 0)
    assert.equal(timers.size, 0)
  } finally {
    runtime.unmount()
  }
})

test("a close tap wins over a late native frame from the opening keyboard", () => {
  const { runtime, api, settledProgress, commit } = mount()
  try {
    api().animateKeyboard({ visible: true, inset: 336, durationMs: 250 })
    commit({ keyboardVisible: true, keyboardInset: 336 })
    assert.equal(settledProgress(), 1)
    api().animateKeyboard({ visible: false, inset: 0, durationMs: 250 }, "intent")
    assert.equal(settledProgress(), 0)
    // The suggestion bar's frame arrives after the tap: it must not reopen the dock.
    api().animateKeyboard({ visible: true, inset: 380, durationMs: 0 })
    assert.equal(settledProgress(), 0)
  } finally {
    runtime.unmount()
  }
})

test("Reduce Motion lands the pose at once and crossfades the dock's content", () => {
  const { runtime, api, commit, fades } = mount(true)
  try {
    api().animateKeyboard({ visible: true, inset: 336, durationMs: 250 })
    commit({ keyboardVisible: true, keyboardInset: 336 })
    runtime.rerender()
    assert.equal(api().transition.value.progress, 1, "the dock and camera do not travel")
    assert.deepEqual(fades.at(-1), { target: 1, duration: 200 }, "the text still crossfades")
    assert.equal(api().contentProgress.value, 1)
  } finally {
    runtime.unmount()
  }
})

test("with motion on, the content follows the moving dock", () => {
  const { runtime, api, commit, fades } = mount(false)
  try {
    api().animateKeyboard({ visible: true, inset: 336, durationMs: 250 })
    commit({ keyboardVisible: true, keyboardInset: 336 })
    runtime.rerender()
    assert.equal(fades.length, 0)
    assert.equal(api().contentProgress.value, api().transition.value.progress)
  } finally {
    runtime.unmount()
  }
})
