import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useChatThreadSync"

function mount() {
  const runtime = createFakeReactRuntime()
  const timers = new Map<number, () => void>()
  const listeners = new Set<(state: string) => void>()
  const reads: string[] = []
  const active: (string | null)[] = []
  let counter = 0
  const appState = { currentState: "active", addEventListener: (_event: string, fn: (state: string) => void) => {
    listeners.add(fn); return { remove: () => listeners.delete(fn) }
  } }
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/thread/useChatThreadSync.ts", runtime, {
    modules: { "react-native": { AppState: appState } },
    globals: { setTimeout: (fn: () => void) => { timers.set(++counter, fn); return counter },
      clearTimeout: (id: number) => timers.delete(id) }
  })
  let input = { resolvedThreadId: "thread-a", currentUserId: "a", isFocused: true,
    latestIncomingMessageId: "one", requestMessages: undefined,
    markThreadRead: (id: string) => { reads.push(id) }, setActiveThread: (id: string | null) => { active.push(id) } }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }; runtime.render(() => hook.useChatThreadSync(input))
  }
  const flush = () => { const scheduled = [...timers.values()]; timers.clear(); for (const fn of scheduled) fn() }
  const state = (value: string) => { appState.currentState = value; for (const fn of listeners) fn(value) }
  render()
  return { render, runtime, reads, active, timers, listeners, flush, state }
}

test("partner message bursts debounce server read updates while the chat is visible", () => {
  const f = mount()
  assert.deepEqual(f.reads, ["thread-a"])
  f.render({ latestIncomingMessageId: "two" })
  f.render({ latestIncomingMessageId: "three" })
  assert.equal(f.timers.size, 1)
  f.flush()
  assert.deepEqual(f.reads, ["thread-a", "thread-a"])
  f.render()
  assert.equal(f.timers.size, 0)
  f.runtime.unmount()
})

test("background and covered chat screens do not count incoming messages as read", () => {
  const f = mount()
  f.state("background")
  f.render({ latestIncomingMessageId: "two" })
  f.flush()
  assert.equal(f.reads.length, 1)
  assert.equal(f.active.at(-1), null)
  f.state("active")
  assert.equal(f.reads.length, 2)
  f.render({ isFocused: false })
  f.render({ latestIncomingMessageId: "three" })
  f.flush()
  assert.equal(f.reads.length, 2)
  f.runtime.unmount()
  assert.equal(f.listeners.size, 0)
})

test("blur flushes a pending observed message once; account switches cancel it", () => {
  const f = mount()
  f.render({ latestIncomingMessageId: "two" })
  f.render({ isFocused: false })
  assert.equal(f.reads.length, 2)
  f.flush()
  assert.equal(f.reads.length, 2)
  f.render({ isFocused: true })
  f.render({ latestIncomingMessageId: "three" })
  f.render({ currentUserId: "b", resolvedThreadId: "thread-b", latestIncomingMessageId: "other" })
  assert.deepEqual(f.reads, ["thread-a", "thread-a", "thread-a", "thread-b"])
  f.flush()
  assert.equal(f.reads.length, 4)
  f.runtime.unmount()
})
