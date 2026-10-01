import assert from "node:assert/strict"
import test from "node:test"
import {
  compareChatMessagePositions,
  getChatOwnMessageReceiptState,
  isChatMessageCoveredByCursor,
  laterChatReceiptCursor
} from "./chatReceiptCursor"

const T1 = "2026-10-01T09:00:00.000Z"
const T2 = "2026-10-01T09:00:01.000Z"

test("messages are ordered by sentAt, then by message id within one instant", () => {
  assert.ok(compareChatMessagePositions({ sentAt: T1, messageId: "m_b" }, { sentAt: T2, messageId: "m_a" }) < 0)
  assert.ok(compareChatMessagePositions({ sentAt: T1, messageId: "m_a" }, { sentAt: T1, messageId: "m_b" }) < 0)
  assert.equal(compareChatMessagePositions({ sentAt: T1, messageId: "m_a" }, { sentAt: T1, messageId: "m_a" }), 0)
})

test("a tuple cursor covers earlier messages and same-instant messages up to its id", () => {
  const cursor = { sentAt: T1, messageId: "m_b" }
  assert.equal(isChatMessageCoveredByCursor({ sentAt: "2026-10-01T08:59:59.999Z", messageId: "m_z" }, cursor), true)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T1, messageId: "m_a" }, cursor), true)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T1, messageId: "m_b" }, cursor), true)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T1, messageId: "m_c" }, cursor), false)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T2, messageId: "m_a" }, cursor), false)
})

test("a cursor without a message id covers the whole instant", () => {
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T1, messageId: "m_zzz" }, { sentAt: T1 }), true)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T2, messageId: "m_a" }, { sentAt: T1 }), false)
})

test("missing cursors and invalid dates never mark a message", () => {
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T1, messageId: "m" }, undefined), false)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: T1, messageId: "m" }, { sentAt: "later" }), false)
  assert.equal(isChatMessageCoveredByCursor({ sentAt: "nope", messageId: "m" }, { sentAt: T2 }), false)
})

test("the later cursor wins; an id-less cursor beats a tuple at the same instant", () => {
  const early = { sentAt: T1, messageId: "m_a" }
  const sameInstant = { sentAt: T1, messageId: "m_b" }
  const later = { sentAt: T2, messageId: "m_a" }
  assert.equal(laterChatReceiptCursor(early, later), later)
  assert.equal(laterChatReceiptCursor(later, early), later)
  assert.equal(laterChatReceiptCursor(early, sameInstant), sameInstant)
  assert.deepEqual(laterChatReceiptCursor(sameInstant, { sentAt: T1 }), { sentAt: T1 })
  assert.equal(laterChatReceiptCursor(undefined, early), early)
  assert.equal(laterChatReceiptCursor(early, undefined), early)
  assert.equal(laterChatReceiptCursor({ sentAt: "bad" }, early), early)
  assert.equal(laterChatReceiptCursor(undefined, { sentAt: "bad" }), undefined)
})

test("own message state: read implies delivered, otherwise delivered or sent", () => {
  const message = { sentAt: T1, messageId: "m_b" }
  assert.equal(getChatOwnMessageReceiptState(message, undefined), "sent")
  assert.equal(getChatOwnMessageReceiptState(message, {}), "sent")
  assert.equal(getChatOwnMessageReceiptState(message, { deliveredUpTo: { sentAt: T1, messageId: "m_a" } }), "sent")
  assert.equal(getChatOwnMessageReceiptState(message, { deliveredUpTo: { sentAt: T2, messageId: "m_a" } }), "delivered")
  assert.equal(getChatOwnMessageReceiptState(message, {
    deliveredUpTo: { sentAt: T2, messageId: "m_a" },
    readUpTo: { sentAt: T1, messageId: "m_b" }
  }), "read")
  assert.equal(getChatOwnMessageReceiptState(message, { readUpTo: { sentAt: T2 } }), "read")
})
