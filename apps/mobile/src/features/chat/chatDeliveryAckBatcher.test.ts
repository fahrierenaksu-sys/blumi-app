import assert from "node:assert/strict"
import test from "node:test"
import type { ChatAckDeliveredCommand, ChatMessage } from "@blumi/contracts"
import { createChatDeliveryAckBatcher } from "./chatDeliveryAckBatcher"

function message(messageId: string, threadId: string, sentAt: string): ChatMessage {
  return { messageId, threadId, senderUserId: "partner", body: "hi", sentAt }
}

function createHarness(options: { active?: () => boolean; delivered?: () => boolean } = {}) {
  const sent: ChatAckDeliveredCommand[] = []
  const timers: { callback: () => void; cancelled: boolean }[] = []
  const batcher = createChatDeliveryAckBatcher({
    send: (ack) => { sent.push(ack); return options.delivered?.() ?? true },
    isActive: options.active ?? (() => true),
    schedule: (callback) => {
      const timer = { callback, cancelled: false }
      timers.push(timer)
      return timer
    },
    cancel: (handle) => { (handle as { cancelled: boolean }).cancelled = true }
  })
  const fire = () => {
    const pending = timers.filter((timer) => !timer.cancelled)
    timers.length = 0
    for (const timer of pending) timer.callback()
  }
  return { batcher, sent, timers, fire }
}

test("a burst of partner messages becomes one ack per thread for the newest message", () => {
  const { batcher, sent, timers, fire } = createHarness()
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  batcher.note(message("a3", "thread_a", "2026-10-01T10:00:02.000Z"))
  batcher.note(message("a2", "thread_a", "2026-10-01T10:00:01.000Z"))
  batcher.note(message("b1", "thread_b", "2026-10-01T10:00:00.000Z"))
  assert.equal(timers.length, 1, "one debounce window for the burst")
  assert.deepEqual(sent, [])
  fire()
  assert.deepEqual(sent, [
    { threadId: "thread_a", upToMessageId: "a3" },
    { threadId: "thread_b", upToMessageId: "b1" }
  ])
})

test("a message already covered by a sent ack is not acknowledged again", () => {
  const { batcher, sent, fire } = createHarness()
  batcher.note(message("a2", "thread_a", "2026-10-01T10:00:01.000Z"))
  fire()
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  batcher.note(message("a2", "thread_a", "2026-10-01T10:00:01.000Z"))
  fire()
  assert.deepEqual(sent, [{ threadId: "thread_a", upToMessageId: "a2" }])
})

test("nothing is acknowledged in the background or while receipts are off", () => {
  let active = false
  const { batcher, sent, timers, fire } = createHarness({ active: () => active })
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  assert.equal(timers.length, 0)
  active = true
  batcher.note(message("a2", "thread_a", "2026-10-01T10:00:01.000Z"))
  active = false
  fire()
  assert.deepEqual(sent, [], "backgrounded before the window closed: dropped, the next history load covers it")
})

test("an ack the socket could not take is retried with the next one", () => {
  let delivered = false
  const { batcher, sent, fire } = createHarness({ delivered: () => delivered })
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  fire()
  delivered = true
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  fire()
  assert.deepEqual(sent.map((ack) => ack.upToMessageId), ["a1", "a1"])
})

test("a flush sends at most two acks; the rest follow in paced windows instead of being dropped by the server budget", () => {
  const { batcher, sent, timers, fire } = createHarness()
  for (let index = 1; index <= 5; index++) {
    batcher.note(message(`m${index}`, `thread_${index}`, "2026-10-01T10:00:00.000Z"))
  }
  fire()
  assert.deepEqual(sent.map((ack) => ack.threadId), ["thread_1", "thread_2"])
  assert.equal(timers.filter((timer) => !timer.cancelled).length, 1, "the remainder is paced")
  fire()
  fire()
  assert.deepEqual(sent.map((ack) => ack.threadId), ["thread_1", "thread_2", "thread_3", "thread_4", "thread_5"])
  fire()
  assert.equal(sent.length, 5, "nothing is sent twice")
})

test("an ack the socket refused waits for the reconnect instead of being lost", () => {
  let delivered = false
  const { batcher, sent, timers, fire } = createHarness({ delivered: () => delivered })
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  batcher.note(message("b1", "thread_b", "2026-10-01T10:00:00.000Z"))
  batcher.noteConnection(false)
  fire()
  assert.deepEqual(sent.map((ack) => ack.threadId), ["thread_a"], "the first refusal stops the flush")
  assert.equal(timers.filter((timer) => !timer.cancelled).length, 0, "no retry loop while offline")
  delivered = true
  batcher.noteConnection(true)
  fire()
  assert.deepEqual(sent.map((ack) => ack.threadId), ["thread_a", "thread_a", "thread_b"])
})

test("a reconnect re-sends the acks sent shortly before the drop, which may have died with the socket", () => {
  let now = 0
  const sent: ChatAckDeliveredCommand[] = []
  const timers: (() => void)[] = []
  const batcher = createChatDeliveryAckBatcher({
    send: (ack) => { sent.push(ack); return true },
    isActive: () => true,
    now: () => now,
    schedule: (callback) => { timers.push(callback); return callback },
    cancel: () => undefined
  })
  const fire = () => { const due = timers.splice(0); for (const callback of due) callback() }
  batcher.noteConnection(true)
  batcher.note(message("old1", "thread_old", "2026-10-01T10:00:00.000Z"))
  fire()
  now = 120_000
  batcher.note(message("new1", "thread_new", "2026-10-01T10:02:00.000Z"))
  fire()
  now = 125_000
  batcher.noteConnection(false)
  now = 140_000
  batcher.noteConnection(true)
  fire()
  assert.deepEqual(sent.map((ack) => ack.upToMessageId), ["old1", "new1", "new1"],
    "only the ack inside the resend window is repeated; an older one was long delivered")
  batcher.noteConnection(true)
  fire()
  assert.equal(sent.length, 3, "a repeated connected status is not a reconnect")
})

test("dispose cancels the pending window and forgets the account's threads", () => {
  const { batcher, sent, timers, fire } = createHarness()
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  batcher.dispose()
  assert.equal(timers[0]?.cancelled, true)
  fire()
  batcher.note(message("a1", "thread_a", "2026-10-01T10:00:00.000Z"))
  assert.deepEqual(sent, [])
})
