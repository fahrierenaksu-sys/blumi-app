import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Hook from "./useInboxThreadWarmup"

function mount(options: { focused?: boolean; enabled?: boolean; idleAvailable?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const timers = new Map<number, () => void>()
  const idleTasks = new Map<number, () => void>()
  const listeners = new Map<string, Set<() => void>>()
  const appListeners = new Set<(state: string) => void>()
  const started: string[] = []
  const pending = new Map<string, { resolve(): void; reject(): void }>()
  let counter = 0
  let focused = options.focused ?? true
  const appState = { currentState: "active", addEventListener: (_type: string, fn: (state: string) => void) => {
    appListeners.add(fn); return { remove: () => appListeners.delete(fn) }
  } }
  const navigation = {
    isFocused: () => focused,
    addListener(type: string, fn: () => void) {
      const group = listeners.get(type) ?? new Set()
      group.add(fn); listeners.set(type, group)
      return () => group.delete(fn)
    }
  }
  const hook = loadSourceWithFakeReact<typeof Hook>("features/inbox/useInboxThreadWarmup.ts", runtime, {
    modules: { "react-native": { AppState: appState } },
    globals: {
      setTimeout: (fn: () => void) => { timers.set(++counter, fn); return counter },
      clearTimeout: (id: number) => timers.delete(id),
      globalThis: options.idleAvailable === false ? {} : {
        requestIdleCallback: (fn: () => void) => { idleTasks.set(++counter, fn); return counter },
        cancelIdleCallback: (id: number) => idleTasks.delete(id)
      }
    }
  })
  let input: Parameters<typeof hook.useInboxThreadWarmup>[0] = {
    navigation, enabled: options.enabled ?? true,
    threadIds: "synthetic-0|synthetic-1|synthetic-2|synthetic-3|synthetic-4|synthetic-5",
    warmThread: (id) => {
      started.push(id)
      return new Promise<void>((resolve, reject) => { pending.set(id, { resolve, reject: () => reject(new Error("Synthetic warmup failure")) }) })
    }
  }
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }
    runtime.render(() => hook.useInboxThreadWarmup(input))
  }
  const flush = (tasks: Map<number, () => void>) => {
    const queued = [...tasks.values()]; tasks.clear(); queued.forEach((run) => run())
  }
  const setFocused = (next: boolean) => {
    focused = next
    for (const fn of listeners.get(next ? "focus" : "blur") ?? []) fn()
  }
  const setAppState = (state: string) => {
    appState.currentState = state
    for (const fn of appListeners) fn(state)
  }
  const finish = async (id: string, fail = false) => {
    const task = pending.get(id)!
    pending.delete(id)
    if (fail) task.reject()
    else task.resolve()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  render()
  return { runtime, render, timers, idleTasks, started, pending, appListeners, listeners,
    flushTimers: () => flush(timers), flushIdle: () => flush(idleTasks), setFocused, setAppState, finish }
}

test("automatic warming waits for idle and yields between bounded batches, including after a failure", async () => {
  const f = mount()
  assert.deepEqual(f.started, [], "first render and focus do no prefetch work")
  f.flushTimers()
  assert.deepEqual(f.started, [], "the initial delay still waits for an idle slot")
  f.flushIdle()
  assert.deepEqual(f.started, ["synthetic-0", "synthetic-1"])
  await f.finish("synthetic-0")
  assert.equal(f.timers.size, 0, "both pending conversations finish before another batch")
  await f.finish("synthetic-1", true)
  assert.deepEqual(f.started, ["synthetic-0", "synthetic-1"], "a completion never starts more work inline")
  f.flushTimers(); f.flushIdle()
  assert.deepEqual(f.started, ["synthetic-0", "synthetic-1", "synthetic-2", "synthetic-3"])
  assert.equal(f.pending.size, 2)
  await f.finish("synthetic-2"); await f.finish("synthetic-3")
  f.flushTimers(); f.flushIdle()
  assert.deepEqual(f.started.slice(-2), ["synthetic-4", "synthetic-5"])
  await f.finish("synthetic-4"); await f.finish("synthetic-5")
  assert.equal(f.timers.size, 0)
  f.runtime.unmount()
})

test("blur cancels queued warming and an already delivered idle callback remains harmless", () => {
  const f = mount()
  f.flushTimers()
  const staleIdle = [...f.idleTasks.values()][0]!
  f.setFocused(false)
  assert.equal(f.idleTasks.size, 0)
  staleIdle()
  assert.deepEqual(f.started, [])
  f.setFocused(true)
  f.flushTimers(); f.flushIdle()
  assert.deepEqual(f.started, ["synthetic-0", "synthetic-1"])
  f.runtime.unmount()
  assert.equal(f.appListeners.size, 0)
  assert.ok([...f.listeners.values()].every((group) => group.size === 0))
})

test("background and blur stop later batches without discarding warmed responses", async () => {
  const f = mount()
  f.flushTimers(); f.flushIdle()
  f.setAppState("background")
  await f.finish("synthetic-0"); await f.finish("synthetic-1")
  assert.equal(f.timers.size, 0)
  f.setFocused(false)
  f.setAppState("active")
  assert.equal(f.timers.size, 0, "a hidden Inbox does not resume warmup")
  f.setFocused(true)
  assert.equal(f.timers.size, 1)
  f.runtime.unmount()
  f.flushTimers(); f.flushIdle()
  assert.equal(f.started.length, 2)
})

test("changing eligible threads or session inputs cancels the previous queue", async () => {
  const f = mount()
  f.flushTimers(); f.flushIdle()
  f.render({ threadIds: "synthetic-new" })
  await f.finish("synthetic-0"); await f.finish("synthetic-1")
  f.flushTimers(); f.flushIdle()
  assert.equal(f.started.at(-1), "synthetic-new")
  f.render({ enabled: false })
  await f.finish("synthetic-new")
  assert.equal(f.timers.size, 0)
  f.runtime.unmount()
})

test("offscreen and demo mounts do no warming; the timer fallback remains cancellable", () => {
  for (const options of [{ focused: false }, { enabled: false }]) {
    const f = mount(options)
    f.flushTimers(); f.flushIdle()
    assert.deepEqual(f.started, [])
    f.runtime.unmount()
  }
  const fallback = mount({ idleAvailable: false })
  assert.deepEqual(fallback.started, [])
  fallback.flushTimers()
  assert.deepEqual(fallback.started, ["synthetic-0", "synthetic-1"])
  fallback.runtime.unmount()
})
