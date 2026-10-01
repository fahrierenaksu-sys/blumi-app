import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../testing/hookHarness"
import type * as Hook from "./useInboxClock"

function mount(options: { focused?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const timers = new Map<number, { fn: () => void; delay: number }>()
  const appListeners = new Set<(state: string) => void>()
  const focusListeners = new Map<string, Set<() => void>>()
  let counter = 0
  let nowMs = Date.UTC(2026, 8, 30, 12, 0, 30)
  let focused = options.focused ?? true
  const appState = {
    currentState: "active",
    addEventListener: (_event: string, fn: (state: string) => void) => {
      appListeners.add(fn)
      return { remove: () => appListeners.delete(fn) }
    }
  }
  const navigation = {
    isFocused: () => focused,
    addListener: (type: string, fn: () => void) => {
      const set = focusListeners.get(type) ?? new Set()
      set.add(fn)
      focusListeners.set(type, set)
      return () => set.delete(fn)
    }
  }
  const FakeDate = { now: () => nowMs }
  const hook = loadSourceWithFakeReact<typeof Hook>("features/inbox/useInboxClock.ts", runtime, {
    modules: { "react-native": { AppState: appState } },
    real: ["./inboxRowModel"],
    globals: {
      Date: FakeDate,
      setTimeout: (fn: () => void, delay: number) => { timers.set(++counter, { fn, delay }); return counter },
      clearTimeout: (id: number) => timers.delete(id)
    }
  })
  const render = () => runtime.render(() => hook.useInboxClock(navigation))
  const value = () => runtime.output as number
  const advance = (ms: number) => {
    nowMs += ms
    const due = [...timers.values()]
    timers.clear()
    for (const timer of due) timer.fn()
  }
  const emit = (type: string) => { for (const fn of focusListeners.get(type) ?? []) fn() }
  const setAppState = (state: string) => {
    appState.currentState = state
    for (const fn of appListeners) fn(state)
  }
  const setFocused = (next: boolean) => { focused = next; emit(next ? "focus" : "blur") }
  render()
  return { runtime, timers, value, advance, setAppState, setFocused, getNow: () => nowMs }
}

test("the inbox clock ticks at each minute boundary while the inbox is on screen", () => {
  const f = mount()
  const start = f.value()
  assert.equal(f.timers.size, 1)
  assert.equal([...f.timers.values()][0].delay, 30_000 + 250)
  f.advance(30_250)
  assert.equal(f.value(), start + 30_250)
  assert.equal(f.timers.size, 1, "the next minute is scheduled")
  f.runtime.unmount()
  assert.equal(f.timers.size, 0)
})

test("a hidden inbox or a backgrounded app schedules nothing and catches up on return", () => {
  const f = mount()
  f.setFocused(false)
  assert.equal(f.timers.size, 0)
  f.advance(5 * 60_000)
  f.setFocused(true)
  assert.equal(f.value(), f.getNow(), "focus refreshes immediately")
  assert.equal(f.timers.size, 1)
  f.setAppState("background")
  assert.equal(f.timers.size, 0)
  f.advance(60 * 60_000)
  f.setAppState("active")
  assert.equal(f.value(), f.getNow())
  assert.equal(f.timers.size, 1)
  f.runtime.unmount()
})

test("an inbox mounted off screen waits for focus", () => {
  const f = mount({ focused: false })
  assert.equal(f.timers.size, 0)
  f.runtime.unmount()
})
