import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTypingCommand } from "@blumi/contracts"
import { createGlobalRealtimeEventHandler } from "../../realtime/globalRealtimeEventHandler"
import { getChatTypingCopy } from "./chatTypingCopy"
import { isPartnerTyping } from "./chatTypingModel"
import { createChatTypingStore } from "./chatTypingStore"

function fakeClock() {
  let now = 0
  let nextId = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  return {
    now: () => now,
    setTimeout: (callback: () => void, ms: number) => { timers.set(++nextId, { at: now + ms, callback }); return nextId },
    clearTimeout: (handle: unknown) => { timers.delete(handle as number) },
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.callback() }
      }
    },
    pending: () => timers.size
  }
}

const START = { threadId: "t1", userId: "bora", state: "start" as const, expiresInMs: 6_000 }

test("signals go out only while configured and enabled for an account", () => {
  const store = createChatTypingStore(fakeClock())
  const sent: ChatTypingCommand[] = []
  const command = { threadId: "t1", state: "start" as const }
  assert.equal(store.send(command), false, "unconfigured")
  const dispose = store.configure({ ownerUserId: "ada", enabled: false, send: (c) => { sent.push(c); return true } })
  assert.equal(store.send(command), false, "capability off")
  dispose()
  store.configure({ ownerUserId: "ada", enabled: true, send: (c) => { sent.push(c); return true } })
  assert.equal(store.send(command), true)
  store.configure({ ownerUserId: undefined, enabled: true, send: (c) => { sent.push(c); return true } })
  assert.equal(store.send(command), false, "signed out")
  assert.deepEqual(sent, [command])
})

test("an indicator lapses on its own timer and an account switch drops it at once", () => {
  const clock = fakeClock()
  const store = createChatTypingStore(clock)
  store.configure({ ownerUserId: "ada", enabled: true, send: () => true })
  let notifications = 0
  store.subscribe(() => { notifications += 1 })
  store.applyUpdate(START)
  assert.equal(isPartnerTyping(store.getSnapshot().entries, "t1", "bora", clock.now()), true)
  clock.advance(5_999)
  assert.equal("t1" in store.getSnapshot().entries, true)
  clock.advance(1)
  assert.deepEqual(store.getSnapshot().entries, {})
  assert.equal(clock.pending(), 0)

  store.applyUpdate(START)
  const dispose = store.configure({ ownerUserId: "cem", enabled: true, send: () => true })
  assert.deepEqual(store.getSnapshot().entries, {}, "another account never sees it")
  assert.equal(clock.pending(), 0)
  dispose()
  assert.equal(store.getSnapshot().ownerUserId, undefined)
  assert.ok(notifications >= 4)
})

test("the realtime handler routes typing and a message from the typist clears it", () => {
  const clock = fakeClock()
  const store = createChatTypingStore(clock)
  store.configure({ ownerUserId: "ada", enabled: true, send: () => true })
  const handle = createGlobalRealtimeEventHandler({
    currentUserId: "ada",
    getMatchDeduplicationState: () => ({}) as never,
    normalizeRoomInviteRecord: () => { throw new Error("unused") },
    upsertRoomInvite: () => undefined,
    applyChatThreadListed: () => undefined,
    applyChatThreadCreated: () => undefined,
    applyChatMessageListed: () => undefined,
    applyChatMessageReceived: () => undefined,
    applyChatTypingUpdated: store.applyUpdate,
    clearChatTypingForMessage: store.noteMessage,
    getThreads: () => [],
    openReadyMiniRoom: () => undefined,
    onConnectionMatched: () => undefined,
    showIncomingMessageToast: () => undefined,
    shouldShowIncomingMessageAlert: () => false
  })
  handle({ type: "chat.typing_updated", payload: START })
  assert.equal("t1" in store.getSnapshot().entries, true)
  handle({ type: "chat.message_received", payload: {
    messageId: "m1", threadId: "t1", senderUserId: "bora", body: "hi", sentAt: "2026-10-01T10:00:00.000Z"
  } })
  assert.deepEqual(store.getSnapshot().entries, {})
  handle({ type: "chat.typing_updated", payload: START })
  handle({ type: "chat.typing_updated", payload: { ...START, state: "stop", expiresInMs: 0 } })
  assert.deepEqual(store.getSnapshot().entries, {})
})

test("typing copy is localized for Turkish and English", () => {
  assert.equal(getChatTypingCopy("tr").partnerTyping("Ada"), "Ada yazıyor…")
  assert.equal(getChatTypingCopy("tr-TR").typing, "yazıyor…")
  assert.equal(getChatTypingCopy("en").partnerTyping("Ada"), "Ada is typing…")
  assert.equal(getChatTypingCopy(undefined).typing, "typing…")
})
