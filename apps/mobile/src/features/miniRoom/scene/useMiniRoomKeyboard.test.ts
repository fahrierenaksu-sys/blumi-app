import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useMiniRoomKeyboard"

type KeyboardListener = (event: { duration: number; endCoordinates: { screenY: number; height: number } }) => void

function mount(platform: "ios" | "android") {
  const runtime = createFakeReactRuntime()
  const listeners = new Map<string, Set<KeyboardListener>>()
  const Keyboard = {
    addListener: (name: string, listener: KeyboardListener) => {
      const set = listeners.get(name) ?? new Set<KeyboardListener>()
      set.add(listener)
      listeners.set(name, set)
      return { remove: () => set.delete(listener) }
    }
  }
  const reactNative = createReactNativeStub({ Keyboard, Platform: { OS: platform } }).module
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/scene/useMiniRoomKeyboard.ts", runtime, {
    modules: { "react-native": reactNative },
    real: ["./miniRoomLayout"]
  })
  const frames: Hook.MiniRoomKeyboardState[] = []
  // What React had committed when each frame was published.
  const committedAtPublish: Hook.MiniRoomKeyboardState[] = []
  const render = () => runtime.render(() => hook.useMiniRoomKeyboard((frame) => {
    frames.push(frame)
    committedAtPublish.push(runtime.output as Hook.MiniRoomKeyboardState)
  }))
  render()
  const emit = (name: string, screenY = 0, height = 0, duration = 250) => {
    for (const listener of [...(listeners.get(name) ?? [])]) {
      listener({ duration, endCoordinates: { screenY, height } })
    }
  }
  const listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
  return { runtime, frames, committedAtPublish, emit, listenerCount }
}

test("an iOS keyboard frame starts the room pose before React commits it, once per real change", () => {
  const { runtime, frames, committedAtPublish, emit, listenerCount } = mount("ios")
  try {
    // 844-point window; a 336-point keyboard whose top is at 508.
    emit("keyboardWillShow", 508, 336, 250)
    assert.deepEqual(frames.at(-1), { visible: true, inset: 336, durationMs: 250 })
    assert.equal(committedAtPublish.at(-1)?.visible, false, "the pose starts before the React commit")
    assert.deepEqual(runtime.output, { visible: true, inset: 336, durationMs: 250 })

    // UIKit repeats the same frame through keyboardWillChangeFrame: no second pose.
    emit("keyboardWillChangeFrame", 508, 336, 250)
    assert.equal(frames.length, 1)

    // The suggestion bar appears: the inset grows, a new pose starts.
    emit("keyboardWillChangeFrame", 464, 380, 0)
    assert.deepEqual(frames.at(-1), { visible: true, inset: 380, durationMs: 0 })

    emit("keyboardWillHide", 844, 0, 250)
    assert.deepEqual(frames.at(-1), { visible: false, inset: 0, durationMs: 250 })
    assert.deepEqual(runtime.output, { visible: false, inset: 0, durationMs: 250 })
  } finally {
    runtime.unmount()
  }
  assert.equal(listenerCount(), 0, "every keyboard listener is removed on unmount")
})

test("Android reports visibility only; the resized window carries the keyboard", () => {
  const { runtime, frames, emit } = mount("android")
  try {
    emit("keyboardWillShow", 508, 336)
    assert.equal(frames.length, 0, "Android has no will-events")
    emit("keyboardDidShow", 508, 336)
    assert.deepEqual(frames.at(-1), { visible: true, inset: 0, durationMs: 0 })
    emit("keyboardDidHide")
    assert.deepEqual(frames.at(-1), { visible: false, inset: 0, durationMs: 0 })
  } finally {
    runtime.unmount()
  }
})
