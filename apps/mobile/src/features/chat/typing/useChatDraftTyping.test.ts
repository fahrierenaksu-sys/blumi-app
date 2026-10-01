import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTypingCommand } from "@blumi/contracts"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { chatTypingStore } from "./chatTypingStore"
import type * as Hook from "./useChatDraftTyping"

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
