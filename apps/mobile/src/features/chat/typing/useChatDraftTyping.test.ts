import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTypingCommand } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { chatTypingStore, createChatTypingStore } from "./chatTypingStore"
import type * as Hook from "./useChatDraftTyping"
import type * as PartnerHook from "./usePartnerTyping"

function mount(options: { enabled?: boolean; online?: boolean } = {}) {
  const runtime = createFakeReactRuntime()
  const listeners = new Set<(state: string) => void>()
  const appState = { currentState: "active", addEventListener: (_event: string, fn: (state: string) => void) => {
    listeners.add(fn); return { remove: () => listeners.delete(fn) }
  } }
  const sent: string[] = []
  const dispose = chatTypingStore.configure({
    ownerUserId: "ada",
    enabled: options.enabled ?? true,
    send: (command: ChatTypingCommand) => {
      if (options.online === false) return false
      sent.push(`${command.state}:${command.threadId}`)
      return true
    }
  })
  const hook = loadSourceWithFakeReact<typeof Hook>("features/chat/typing/useChatDraftTyping.ts", runtime, {
    modules: { "react-native": { AppState: appState } },
    real: ["./chatTypingModel", "./chatTypingStore"]
  })
  let input = { threadId: "t1" as string | undefined, active: true }
  let typing!: Hook.ChatDraftTyping
  const render = (patch: Partial<typeof input> = {}) => {
    input = { ...input, ...patch }
    typing = runtime.render(() => hook.useChatDraftTyping(input.threadId, input.active))
  }
  render()
  const background = () => { for (const fn of listeners) fn("background") }
  return { runtime, sent, render, typing: () => typing, background, listeners, dispose }
}

test("keystrokes send one start per 3 s and sending the message stops it", () => {
  const f = mount()
  f.typing().noteDraft("h")
  f.typing().noteDraft("he")
  f.typing().noteDraft("hel")
  f.typing().endDraft()
  f.typing().endDraft()
  assert.deepEqual(f.sent, ["start:t1", "stop:t1"])
  f.runtime.unmount()
  f.dispose()
})

test("going to the background, losing focus or leaving the screen stops a showing start", () => {
  const f = mount()
  f.typing().noteDraft("h")
  f.background()
  f.typing().noteDraft("hi")
  f.render({ active: false })
  f.render({ active: true })
  f.typing().noteDraft("hey")
  f.runtime.unmount()
  assert.deepEqual(f.sent, ["start:t1", "stop:t1", "start:t1", "stop:t1", "start:t1", "stop:t1"])
  assert.equal(f.listeners.size, 0)
  f.dispose()
})

test("nothing is sent while the capability is off, unfocused, or for a pending thread", () => {
  const off = mount({ enabled: false })
  off.typing().noteDraft("h")
  off.runtime.unmount()
  assert.deepEqual(off.sent, [])
  off.dispose()

  const pending = mount()
  pending.render({ threadId: undefined })
  pending.typing().noteDraft("h")
  pending.render({ threadId: "t1", active: false })
  pending.typing().noteDraft("h")
  pending.runtime.unmount()
  assert.deepEqual(pending.sent, [])
  pending.dispose()
})

test("a start that could not be sent is retried on the next keystroke", () => {
  const f = mount({ online: false })
  f.typing().noteDraft("h")
  f.typing().endDraft()
  f.runtime.unmount()
  assert.deepEqual(f.sent, [], "offline: nothing went out and no stop is owed")
  f.dispose()
})

test("incoming typing in any conversation leaves the draft owner idle while capability changes still stop sending", () => {
  const f = mount()
  const first = f.typing()
  const renders = f.runtime.renderCount
  chatTypingStore.applyUpdate({ threadId: "synthetic-other-thread", userId: "synthetic-peer", state: "start", expiresInMs: 6_000 })
  chatTypingStore.applyUpdate({ threadId: "t1", userId: "synthetic-peer", state: "start", expiresInMs: 6_000 })
  chatTypingStore.noteMessage({ threadId: "synthetic-other-thread", senderUserId: "synthetic-peer" })
  assert.equal(f.runtime.renderCount, renders, "transient partner typing never invalidates the full timeline owner")
  assert.equal(f.typing(), first)
  f.typing().noteDraft("Synthetic draft")
  f.dispose()
  const sent = [...f.sent]
  f.typing().noteDraft("Synthetic disabled draft")
  assert.deepEqual(f.sent, sent, "the capability reset is still observed immediately")
  f.runtime.unmount()
})

test("a next account starts its own typing session without renewing or stopping the previous account's draft", () => {
  const f = mount()
  f.typing().noteDraft("Synthetic previous draft")
  const nextSignals: string[] = []
  const stopNext = chatTypingStore.configure({ ownerUserId: "synthetic-next-owner", enabled: true,
    send: (command) => { nextSignals.push(command.state); return true } })
  f.typing().noteDraft("Synthetic next draft")
  assert.deepEqual(nextSignals, ["start"], "a stale draft neither sends a stop through the new actor nor blocks its first start")
  f.runtime.unmount()
  stopNext()
  f.dispose()
})

test("the typing bubble observes only its partner and thread, including message clear, expiry and account reset", () => {
  const runtime = createFakeReactRuntime()
  let now = 0
  const timers = new Map<number, () => void>()
  let counter = 0
  const store = createChatTypingStore({ now: () => now,
    setTimeout: (fn) => { timers.set(++counter, fn); return counter },
    clearTimeout: (id) => { timers.delete(id as number) } })
  const announcements: string[] = []
  const hook = loadSourceWithFakeReact<typeof PartnerHook>("features/chat/typing/usePartnerTyping.ts", runtime, {
    modules: { "react-native": { AccessibilityInfo: { announceForAccessibilityWithOptions: (text: string) => announcements.push(text) } },
      "./chatTypingStore": { chatTypingStore: store } },
    globals: { Date: class extends Date { static now() { return now } } }, real: ["./chatTypingModel"]
  })
  store.configure({ ownerUserId: "synthetic-owner", enabled: true, send: () => true })
  runtime.render(() => hook.usePartnerTyping("synthetic-thread", "synthetic-peer", "Synthetic typing"))
  const renders = runtime.renderCount
  store.applyUpdate({ threadId: "synthetic-other", userId: "synthetic-peer", state: "start", expiresInMs: 6_000 })
  assert.equal(runtime.renderCount, renders)
  store.applyUpdate({ threadId: "synthetic-thread", userId: "synthetic-peer", state: "start", expiresInMs: 6_000 })
  assert.equal(runtime.output, true)
  assert.deepEqual(announcements, ["Synthetic typing"])
  store.noteMessage({ threadId: "synthetic-thread", senderUserId: "synthetic-peer" })
  assert.equal(runtime.output, false)
  store.applyUpdate({ threadId: "synthetic-thread", userId: "synthetic-peer", state: "start", expiresInMs: 6_000 })
  now = 6_001
  const scheduled = [...timers.values()]
  timers.clear()
  for (const fn of scheduled) fn()
  assert.equal(runtime.output, false, "the expiry still removes the actual partner's bubble")
  store.applyUpdate({ threadId: "synthetic-thread", userId: "synthetic-peer", state: "start", expiresInMs: 6_000 })
  store.reset()
  assert.equal(runtime.output, false)
  runtime.unmount()
})
