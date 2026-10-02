import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import {
  CHAT_SCROLL_TO_LATEST_THRESHOLD,
  countNewIncomingAtNewestEdge,
  formatScrollToLatestCount,
  getChatLatestScrollOffset,
  getChatNewestEdgeInset,
  isChatScrolledAwayFromLatest
} from "./chatScrollToLatestModel"

const message = (id: string, sender: string): ChatTimelineItem => ({
  kind: "message",
  createdAt: "2026-07-21T10:00:00.000Z",
  message: { messageId: id, threadId: "t", senderUserId: sender, body: id, sentAt: "2026-07-21T10:00:00.000Z" }
})

test("the pill shows only once the reader is past the threshold from the newest message", () => {
  assert.equal(isChatScrolledAwayFromLatest(0), false)
  assert.equal(isChatScrolledAwayFromLatest(CHAT_SCROLL_TO_LATEST_THRESHOLD), false)
  assert.equal(isChatScrolledAwayFromLatest(CHAT_SCROLL_TO_LATEST_THRESHOLD + 1), true)
})

test("new partner messages at the newest edge are counted; my own and history are not", () => {
  const newestFirst = [message("c", "you"), message("b", "me"), message("a2", "you"), message("a", "you")]
  assert.equal(countNewIncomingAtNewestEdge({ previousNewestKey: "message:a", newestFirst, currentUserId: "me" }), 2)
  assert.equal(countNewIncomingAtNewestEdge({ previousNewestKey: "message:c", newestFirst, currentUserId: "me" }), 0)
  assert.equal(countNewIncomingAtNewestEdge({ previousNewestKey: null, newestFirst, currentUserId: "me" }), 0)
  assert.equal(countNewIncomingAtNewestEdge({ previousNewestKey: "message:gone", newestFirst, currentUserId: "me" }), 0)
})

test("the counter caps its label", () => {
  assert.equal(formatScrollToLatestCount(3), "3")
  assert.equal(formatScrollToLatestCount(120), "99+")
})

test("with the keyboard open the newest message sits above it, not under it", () => {
  // 336 pt keyboard, 34 pt home-indicator padding under the composer.
  const inset = getChatNewestEdgeInset(-336, 34)
  assert.equal(inset, 302)
  assert.equal(getChatNewestEdgeInset(0, 34), 0)
  assert.equal(getChatNewestEdgeInset(20, 34), 0)
  // Returning to the latest scrolls to the lifted newest edge.
  assert.equal(getChatLatestScrollOffset(inset), -302)
  assert.equal(getChatLatestScrollOffset(0), 0)
  // At the lifted newest edge the reader is not "away"; the threshold is
  // measured from that edge.
  assert.equal(isChatScrolledAwayFromLatest(-302, inset), false)
  assert.equal(isChatScrolledAwayFromLatest(-302 + CHAT_SCROLL_TO_LATEST_THRESHOLD, inset), false)
  assert.equal(isChatScrolledAwayFromLatest(-302 + CHAT_SCROLL_TO_LATEST_THRESHOLD + 1, inset), true)
})
