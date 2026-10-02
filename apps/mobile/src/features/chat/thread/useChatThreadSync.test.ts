import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type * as Hook from "./useChatThreadSync"
import { createPushSettleGate } from "./useAfterPushTransition"
import type * as PushTransition from "./useAfterPushTransition"

function mount(refreshParticipants?: () => Promise<void>, extra: Partial<Parameters<typeof Hook.useChatThreadSync>[0]> = {}) {
  const runtime = createFakeReactRuntime()
  const timers = new Map<number, () => void>()
  const listeners = new Set<(state: string) => void>()
  const reads: string[] = []
  const readCursors: (string | undefined)[] = []
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
  let input: Parameters<typeof Hook.useChatThreadSync>[0] = { resolvedThreadId: "thread-a", currentUserId: "a", isFocused: true,
    refreshParticipants,
    latestIncomingMessageId: "one", requestMessages: undefined,
    markThreadRead: (id: string, upToMessageId?: string) => { reads.push(id); readCursors.push(upToMessageId) },
    setActiveThread: (id: string | null) => { active.push(id) }, ...extra }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }; runtime.render(() => hook.useChatThreadSync(input))
  }
  const flush = () => { const scheduled = [...timers.values()]; timers.clear(); for (const fn of scheduled) fn() }
  const state = (value: string) => { appState.currentState = value; for (const fn of listeners) fn(value) }
  render()
  return { render, runtime, reads, readCursors, active, timers, listeners, flush, state }
}

test("saved participant outfits refresh on chat entry and foreground, but not while covered", () => {
  let refreshes = 0
  const f = mount(async () => { refreshes += 1 })
  assert.equal(refreshes, 1)
  f.state("background")
  assert.equal(refreshes, 1)
  f.state("active")
  assert.equal(refreshes, 2)
  f.render({ isFocused: false })
  f.state("active")
  assert.equal(refreshes, 2)
  f.render({ isFocused: true })
  assert.equal(refreshes, 3)
  f.runtime.unmount()
  assert.equal(f.listeners.size, 0)
})

test("each read names the newest partner message the screen showed (the read receipt cursor)", () => {
  const f = mount()
  f.render({ latestIncomingMessageId: "two" })
  f.render({ latestIncomingMessageId: "three" })
  f.flush()
  f.state("background")
  f.state("active")
  assert.deepEqual(f.readCursors, ["one", "three", "three"])
  f.runtime.unmount()
})

test("no read is sent until a partner message is on screen, so the server never marks unseen messages read", () => {
  const g = mount()
  const before = g.readCursors.length
  g.render({ resolvedThreadId: "thread-b", latestIncomingMessageId: undefined })
  g.state("background")
  g.state("active")
  g.flush()
  assert.equal(g.readCursors.length, before, "entering or resuming an empty or loading chat sends no read")
  assert.equal(g.active.at(-1), "thread-b", "focus still flags the thread active, which clears its local badge")
  assert.ok(g.readCursors.every((cursor) => cursor !== undefined), "every read names a message")
  g.render({ latestIncomingMessageId: "first-shown" })
  g.flush()
  assert.equal(g.readCursors.at(-1), "first-shown")
  g.runtime.unmount()
})

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

test("entering a cached chat leaves its refreshes until the push settles; unknown history loads at once", () => {
  const cached = createPushSettleGate()
  const requests: string[] = []
  let refreshes = 0
  const requestMessages = async (id: string) => { requests.push(id) }
  const f = mount(async () => { refreshes += 1 }, { historyReady: true, whenSettled: cached.whenSettled, requestMessages })
  assert.deepEqual(requests, [], "the cached history refresh waits")
  assert.equal(refreshes, 0, "the thread-list refresh waits")
  assert.deepEqual(f.active, ["thread-a"], "the chat is still active (badge cleared) at once")
  cached.settle()
  assert.deepEqual(requests, ["thread-a"])
  assert.equal(refreshes, 1)
  f.runtime.unmount()

  const cold = createPushSettleGate()
  const coldRequests: string[] = []
  const g = mount(undefined, { historyReady: false, whenSettled: cold.whenSettled,
    requestMessages: async (id: string) => { coldRequests.push(id) } })
  assert.deepEqual(coldRequests, ["thread-a"], "what the screen waits for is never deferred")
  g.runtime.unmount()

  const left = createPushSettleGate()
  const leftRequests: string[] = []
  const h = mount(undefined, { historyReady: true, whenSettled: left.whenSettled,
    requestMessages: async (id: string) => { leftRequests.push(id) } })
  h.runtime.unmount()
  left.settle()
  assert.deepEqual(leftRequests, [], "a chat closed during its push starts no refresh")
})

test("the push settles on its own transitionEnd, or after the fallback when none arrives", () => {
  for (const ending of ["transition", "fallback"] as const) {
    const runtime = createFakeReactRuntime()
    const timers = new Map<number, () => void>()
    let counter = 0
    const listeners = new Set<(event: { data?: { closing?: boolean } }) => void>()
    const transition = loadSourceWithFakeReact<typeof PushTransition>("features/chat/thread/useAfterPushTransition.ts", runtime, {
      globals: { setTimeout: (fn: () => void) => { timers.set(++counter, fn); return counter },
        clearTimeout: (id: number) => timers.delete(id) }
    })
    const navigation = { addListener: (_type: "transitionEnd", listener: (event: { data?: { closing?: boolean } }) => void) => {
      listeners.add(listener); return () => listeners.delete(listener)
    } }
    let whenSettled!: PushTransition.WhenPushSettled
    runtime.render(() => { whenSettled = transition.useAfterPushTransition(navigation) })
    const first = whenSettled
    const ran: string[] = []
    whenSettled(() => ran.push("task"))
    runtime.rerender()
    assert.equal(whenSettled, first, "a stable function, so effects that use it do not re-run")
    for (const listener of listeners) listener({ data: { closing: true } })
    assert.deepEqual([...ran], [], "a closing transition is not this screen settling")
    if (ending === "transition") for (const listener of listeners) listener({ data: { closing: false } })
    else for (const fn of timers.values()) fn()
    assert.deepEqual([...ran], ["task"])
    whenSettled(() => ran.push("later"))
    assert.deepEqual(ran, ["task", "later"], "after settling, work runs at once")
    runtime.unmount()
    assert.equal(listeners.size, 0)
  }
})
