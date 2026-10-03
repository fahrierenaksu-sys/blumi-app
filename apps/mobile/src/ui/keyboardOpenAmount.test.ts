import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, createReactNativeStub, createReanimatedStub, loadSourceWithFakeReact } from "../testing/hookHarness"
import type * as KeyboardHooks from "./keyboard"

type Frame = { height: number; progress: number }
type Handler = Partial<Record<"onStart" | "onMove" | "onInteractive" | "onEnd", (event: Frame) => void>>

function mount(platform: "ios" | "android", initialProgress = 0, visible = initialProgress > 0) {
  const runtime = createFakeReactRuntime()
  let handler: Handler = {}
  const providerProgress = { value: initialProgress }
  const listeners = new Map<string, () => void>()
  const hook = loadSourceWithFakeReact<typeof KeyboardHooks>("ui/keyboard.tsx", runtime, {
    modules: {
      "react-native": createReactNativeStub({
        Platform: { OS: platform },
        Keyboard: { isVisible: () => visible, addListener: (name: string, listener: () => void) => {
          listeners.set(name, listener)
          return { remove: () => listeners.delete(name) }
        } }
      }).module,
      "react-native-reanimated": createReanimatedStub(runtime).module,
      "react-native-keyboard-controller": {
        useReanimatedKeyboardAnimation: () => ({ progress: providerProgress }),
        useKeyboardHandler: (next: Handler) => { handler = next }
      }
    },
    real: ["./keyboardGlueModel"]
  })
  const amount = runtime.render(() => hook.useKeyboardOpenAmount())
  return { runtime, amount, providerProgress, listeners,
    frame: (name: keyof Handler, height: number, progress: number) => handler[name]?.({ height, progress }) }
}

test("iOS setup follows real keyboard frames and restores panels after an interactive dismiss", () => {
  const { runtime, amount, providerProgress, frame } = mount("ios")
  try {
    // iOS provider start jumps to the destination instead of tracking travel.
    providerProgress.value = 1
    frame("onStart", 336, 1)
    assert.equal(amount.value, 0)
    frame("onMove", 168, 0.5)
    assert.equal(amount.value, 0.5)
    frame("onEnd", 336, 1)
    assert.equal(amount.value, 1)
    // The last interactive frame is not necessarily fully closed.
    providerProgress.value = 0.3
    frame("onInteractive", 100, 0.3)
    assert.equal(amount.value, 0.3)
    frame("onEnd", 0, 0)
    assert.equal(amount.value, 0, "terminal hide restores the full layout despite stale provider progress")
    assert.equal(providerProgress.value, 0.3)
    assert.equal(runtime.renderCount, 1, "keyboard frames never render React")
    frame("onMove", 84, 0.25)
    assert.equal(amount.value, 0.25, "the next keyboard cycle works")
    frame("onEnd", 0, 0)
    assert.equal(amount.value, 0)
  } finally { runtime.unmount() }
})

test("iOS keyboard reversals, instant closes and mounting while open settle correctly", () => {
  const { runtime, amount, frame } = mount("ios", 1)
  try {
    assert.equal(amount.value, 1)
    frame("onMove", 100, 0.3)
    assert.equal(amount.value, 0.3)
    frame("onMove", 200, 0.6)
    assert.equal(amount.value, 0.6)
    frame("onEnd", 0, 0.1)
    assert.equal(amount.value, 0, "zero height is closed even if the progress is stale")
  } finally { runtime.unmount() }
})

test("mounting a setup page after a missed hide never inherits stale provider progress", () => {
  const { runtime, amount } = mount("ios", 1, false)
  try { assert.equal(amount.value, 0) } finally { runtime.unmount() }
})

test("a native hide restores the setup even when the controller omits its terminal frame", () => {
  const { runtime, amount, frame, listeners } = mount("ios")
  frame("onMove", 336, 1)
  assert.equal(amount.value, 1)
  listeners.get("keyboardDidHide")?.()
  assert.equal(amount.value, 0)
  runtime.unmount()
  assert.equal(listeners.size, 0)
})

test("Android retains event-driven window-resize behavior and removes listeners", () => {
  const { runtime, amount, listeners } = mount("android")
  listeners.get("keyboardDidShow")?.()
  assert.equal(amount.value, 1)
  listeners.get("keyboardDidHide")?.()
  assert.equal(amount.value, 0)
  runtime.unmount()
  assert.equal(listeners.size, 0)
})
