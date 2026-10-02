import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useMiniRoomScrollToLatest"

function mount() {
  const runtime = createFakeReactRuntime()
  const hook = loadSourceWithFakeReact<typeof Hook>("features/miniRoom/scene/useMiniRoomScrollToLatest.ts", runtime)
  let keyboardVisible = false
  const render = () => runtime.render(() => hook.useMiniRoomScrollToLatest(keyboardVisible))
  let current = render()
  const setKeyboard = (visible: boolean) => { keyboardVisible = visible; current = render() }
  const act = (run: (value: Hook.MiniRoomScrollToLatest) => void) => { run(current); current = render() }
  return { runtime, setKeyboard, act, request: () => current.request }
}

test("closing the keyboard after sending while typing jumps the transcript to the user's message", () => {
  const scene = mount()
  scene.setKeyboard(true)
  const before = scene.request()
  scene.act((value) => value.noteMessageSent())
  scene.act((value) => value.noteMessageSent())
  assert.equal(scene.request(), before, "nothing moves while the keyboard is still up")
  scene.setKeyboard(false)
  assert.equal(scene.request(), before + 1, "one jump when the keyboard closes, however it closed")
  scene.setKeyboard(true)
  scene.setKeyboard(false)
  assert.equal(scene.request(), before + 1, "closing it again without a new send leaves the reading position alone")
  scene.runtime.unmount()
})

test("the history toggle jumps at once, and a send without the keyboard shows itself at once", () => {
  const scene = mount()
  const before = scene.request()
  scene.act((value) => value.requestScrollToLatest())
  assert.equal(scene.request(), before + 1)
  scene.act((value) => value.noteMessageSent())
  assert.equal(scene.request(), before + 2)
  // A send while typing, then the toggle (which closes the keyboard): one jump, not two.
  scene.setKeyboard(true)
  scene.act((value) => value.noteMessageSent())
  scene.act((value) => value.requestScrollToLatest())
  scene.setKeyboard(false)
  assert.equal(scene.request(), before + 3)
  scene.runtime.unmount()
})
