import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import {
  applyReceiptEvent,
  applyReceiptSnapshot,
  deriveChatMessageDeliveryState
} from "./chatReceiptModel"

const T1 = "2026-10-01T10:00:00.000Z"
const T2 = "2026-10-01T10:00:01.000Z"
const T3 = "2026-10-01T10:00:02.000Z"

function message(messageId: string, sentAt: string, senderUserId = "me"): ChatMessage {
  return { messageId, threadId: "thread", senderUserId, body: "hi", sentAt }
}

test("a list snapshot never moves delivery back and follows the server on read visibility", () => {
  const current = { deliveredUpTo: { sentAt: T2, messageId: "m2" }, readUpTo: { sentAt: T2, messageId: "m2" } }
  // Older delivery (a slow list) keeps the newer local cursor; a missing read hides it.
  assert.deepEqual(applyReceiptSnapshot(current, { deliveredUpTo: { sentAt: T1, messageId: "m1" } }), {
    deliveredUpTo: { sentAt: T2, messageId: "m2" }
  })
  assert.deepEqual(applyReceiptSnapshot(current, {
    deliveredUpTo: { sentAt: T3, messageId: "m3" },
    readUpTo: { sentAt: T1, messageId: "m1" }
  }), {
    deliveredUpTo: { sentAt: T3, messageId: "m3" },
    readUpTo: { sentAt: T2, messageId: "m2" }
  })
})

test("a list from a server without receipts keeps what the client knows", () => {
  const current = { deliveredUpTo: { sentAt: T1, messageId: "m1" } }
  assert.equal(applyReceiptSnapshot(current, undefined), current)
  assert.equal(applyReceiptSnapshot(undefined, undefined), undefined)
})

test("a realtime receipt only moves the cursors it carries, never backwards", () => {
  const current = { deliveredUpTo: { sentAt: T2, messageId: "m2" } }
  assert.deepEqual(applyReceiptEvent(current, { readUpTo: { sentAt: T1, messageId: "m1" } }), {
    deliveredUpTo: { sentAt: T2, messageId: "m2" },
    readUpTo: { sentAt: T1, messageId: "m1" }
  })
  assert.equal(applyReceiptEvent(current, { deliveredUpTo: { sentAt: T1, messageId: "m1" } }), current,
    "an unchanged state keeps its identity, so the timeline does not re-render")
  assert.deepEqual(applyReceiptEvent(undefined, { deliveredUpTo: { sentAt: T1 } }), { deliveredUpTo: { sentAt: T1 } })
})

test("my confirmed messages advance from sent to delivered to read; local states win", () => {
  const receipts = {
    deliveredUpTo: { sentAt: T2, messageId: "m2" },
    readUpTo: { sentAt: T1, messageId: "m1" }
  }
  const state = (item: ChatMessage, localState: "sending" | "failed" | "sent" = "sent", isMe = true) =>
    deriveChatMessageDeliveryState({ message: item, localState, isMe, receipts })
  assert.equal(state(message("m1", T1)), "read")
  assert.equal(state(message("m2", T2)), "delivered")
  assert.equal(state(message("m3", T3)), "sent")
  assert.equal(state(message("m1", T1), "sending"), "sending")
  assert.equal(state(message("m1", T1), "failed"), "failed")
  assert.equal(state(message("__local_1_0", T1)), "sent", "an unconfirmed bubble has no server position")
  assert.equal(state(message("m1", T1, "partner"), "sent", false), "sent", "partner messages show no ticks state")
  assert.equal(deriveChatMessageDeliveryState({ message: message("m1", T1), localState: "sent", isMe: true }), "sent",
    "receipts off or an old server: a single tick")
})
