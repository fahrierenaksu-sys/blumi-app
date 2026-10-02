import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useMiniRoomKeyboard"

type KeyboardEvent = { height: number; progress: number; duration: number; target: number }
type Handler = Partial<Record<"onStart" | "onMove" | "onInteractive" | "onEnd", (event: KeyboardEvent) => void>>

function mount(platform: "ios" | "android", reduceMotion = false) {
  const runtime = createFakeReactRuntime()
  let handler: Handler = {}
  const listeners = new Map<string, Set<() => void>>()
  const Keyboard = {
    addListener: (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set<() => void>()
      set.add(listener)
      listeners.set(name, set)
      return { remove: () => set.delete(listener) }
    }
  }
  const crossings: boolean[] = []
  const animations: { target: number; motion: string }[] = []
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/scene/useMiniRoomKeyboard.ts", runtime, {
    modules: {
      "react-native": createReactNativeStub({ Keyboard, Platform: { OS: platform } }).module,
      "react-native-reanimated": createReanimatedStub(runtime).module,
      "react-native-keyboard-controller": { useKeyboardHandler: (next: Handler) => { handler = next } },
      "react-native-worklets": {
        scheduleOnRN: (work: (value: boolean) => void, value: boolean) => { crossings.push(value); work(value) }
      },
      "../../../ui/motion": {
        resolveMotion: (reduced: boolean) => ({ smooth: reduced ? "instant" : "smooth" }),
        animateTo: (target: number, motion: string) => { animations.push({ target, motion }); return target }
      }
    },
    real: ["./miniRoomTransitionModel", "./miniRoomLayout", "./miniRoomAvatarStageModel"]
  })
  runtime.render(() => hook.useMiniRoomKeyboard(reduceMotion))
  const api = () => runtime.output as Hook.MiniRoomKeyboard
  const frame = (name: keyof Handler, height: number, progress: number) =>
    handler[name]?.({ height, progress, duration: 250, target: 1 })
  const emit = (name: string) => { for (const listener of [...(listeners.get(name) ?? [])]) listener() }
  const listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
  return { runtime, api, frame, emit, crossings, animations, listenerCount }
}

test("iOS: the scene's progress is the keyboard's own position, every frame, and reverses with it", () => {
  const { runtime, api, frame, crossings } = mount("ios")
  try {
    frame("onStart", 336, 1)
    assert.equal(api().visible, true, "React hears the opening once, as it starts")
    assert.equal(api().openHeight.value, 336, "the open pose is known from the first frame")
    const seen: number[] = []
    for (const height of [0, 40, 120, 210, 290, 336]) {
      frame("onMove", height, height / 336)
      seen.push(api().progress.value)
    }
    assert.deepEqual(seen, [0, 40, 120, 210, 290, 336].map((height) => height / 336))
    // Tapped away mid-way: the keyboard turns back and the progress follows it down.
    frame("onStart", 0, 0)
    for (const height of [300, 180, 60, 0]) frame("onMove", height, height / 336)
    frame("onEnd", 0, 0)
    assert.equal(api().progress.value, 0)
    assert.equal(api().visible, false)
    assert.deepEqual(crossings, [true, false], "one React update per show and per hide, never per frame")
  } finally {
    runtime.unmount()
  }
})

test("iOS: a keyboard that changes size while open moves the open pose, with no extra React update", () => {
  const { runtime, api, frame, crossings } = mount("ios")
  try {
    frame("onStart", 336, 1)
    frame("onEnd", 336, 1)
    frame("onStart", 380, 1)
    frame("onMove", 358, 1)
    assert.equal(api().openHeight.value, 358)
    frame("onEnd", 380, 1)
    assert.equal(api().openHeight.value, 380)
    assert.deepEqual(crossings, [true])
  } finally {
    runtime.unmount()
  }
})

test("iOS Reduce Motion: the scene lands at its next pose when the keyboard starts and does not travel", () => {
  const { runtime, api, frame } = mount("ios", true)
  try {
    frame("onStart", 336, 1)
    assert.equal(api().progress.value, 1)
    frame("onMove", 100, 100 / 336)
    assert.equal(api().progress.value, 1, "no frame-by-frame travel")
    frame("onStart", 0, 0)
    assert.equal(api().progress.value, 0)
  } finally {
    runtime.unmount()
  }
})

test("Android keeps the resized window and eases between the two poses on the smooth token", () => {
  const { runtime, api, emit, animations, listenerCount } = mount("android")
  try {
    emit("keyboardDidShow")
    assert.equal(api().visible, true)
    assert.equal(api().progress.value, 1)
    assert.equal(api().openHeight.value, 0, "the window itself is above the keyboard")
    emit("keyboardDidHide")
    assert.equal(api().visible, false)
    assert.deepEqual(animations, [{ target: 1, motion: "smooth" }, { target: 0, motion: "smooth" }])
  } finally {
    runtime.unmount()
  }
  assert.equal(listenerCount(), 0, "every keyboard listener is removed on unmount")
})
