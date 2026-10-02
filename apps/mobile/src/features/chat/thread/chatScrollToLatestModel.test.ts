import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import { getGluedFooterLift } from "../../../ui/keyboardGlueModel"
import {
  CHAT_SCROLL_TO_LATEST_THRESHOLD,
  formatScrollToLatestCount,
  getChatLatestScrollOffset,
  getChatNewestEdgeInset,
  isChatScrolledAwayFromLatest,
  isGluedKeyboardSettled,
  resolveChatNewestEdgeChange,
  resolveChatScrolledAway
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

test("the pill holds while the keyboard moves and does not flicker around the threshold", () => {
  const settled = { newestEdgeInset: 0, keyboardSettled: true }
  // Leaving and coming back use different lines.
  assert.equal(resolveChatScrolledAway({ ...settled, wasAway: false, offsetY: CHAT_SCROLL_TO_LATEST_THRESHOLD + 1 }), true)
  assert.equal(resolveChatScrolledAway({ ...settled, wasAway: true, offsetY: CHAT_SCROLL_TO_LATEST_THRESHOLD - 1 }), true)
  assert.equal(resolveChatScrolledAway({ ...settled, wasAway: true, offsetY: 0 }), false)
  assert.equal(resolveChatScrolledAway({ ...settled, wasAway: false, offsetY: 0 }), false)
  // Keyboard opening: the inset is already 302 while the list has not yet
  // been lifted (offset 0). Nothing changes until the keyboard settles.
  for (const wasAway of [false, true]) {
    assert.equal(resolveChatScrolledAway({ wasAway, offsetY: 0, newestEdgeInset: 302, keyboardSettled: false }), wasAway)
  }
  assert.equal(resolveChatScrolledAway({ wasAway: false, offsetY: -302, newestEdgeInset: 302, keyboardSettled: true }), false)
  assert.equal(isGluedKeyboardSettled(0), true)
  assert.equal(isGluedKeyboardSettled(1), true)
  assert.equal(isGluedKeyboardSettled(0.5), false)
})

test("my own new message is always followed, even from history, and is never counted", () => {
  const newestFirst = [message("mine", "me"), message("c", "you"), message("b", "you")]
  for (const isAway of [false, true]) {
    assert.deepEqual(
      resolveChatNewestEdgeChange({ previousNewestKey: "message:b", newestFirst, currentUserId: "me", isAway }),
      { follow: true, unseenIncoming: 0 }
    )
  }
})

test("a reader at the newest message keeps following partner messages", () => {
  const newestFirst = [message("c", "you"), message("b", "you"), message("a", "me")]
  assert.deepEqual(
    resolveChatNewestEdgeChange({ previousNewestKey: "message:a", newestFirst, currentUserId: "me", isAway: false }),
    { follow: true, unseenIncoming: 0 }
  )
})

test("a reader up in history stays there and new partner messages are counted", () => {
  const newestFirst = [message("c", "you"), message("b", "you"), message("a", "me")]
  assert.deepEqual(
    resolveChatNewestEdgeChange({ previousNewestKey: "message:a", newestFirst, currentUserId: "me", isAway: true }),
    { follow: false, unseenIncoming: 2 }
  )
})

test("an unchanged newest row, the first render and a replaced history never count", () => {
  const newestFirst = [message("c", "you"), message("b", "me")]
  const base = { newestFirst, currentUserId: "me" }
  const none = { follow: false, unseenIncoming: 0 }
  assert.deepEqual(resolveChatNewestEdgeChange({ ...base, previousNewestKey: "message:c", isAway: false }), none)
  assert.deepEqual(resolveChatNewestEdgeChange({ ...base, previousNewestKey: null, isAway: false }), none)
  assert.deepEqual(resolveChatNewestEdgeChange({ ...base, newestFirst: [], previousNewestKey: "message:c", isAway: false }), none)
  // A replaced history: an old own row in it does not pull a reader out of history,
  // and a reader who was at the newest message stays there.
  assert.deepEqual(resolveChatNewestEdgeChange({ ...base, previousNewestKey: "message:gone", isAway: true }), none)
  assert.deepEqual(
    resolveChatNewestEdgeChange({ ...base, previousNewestKey: "message:gone", isAway: false }),
    { follow: true, unseenIncoming: 0 }
  )
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

test("the list is clipped exactly where the glued composer starts, open, closed and in between", () => {
  // The composer rises by the keyboard minus the safe-area padding it already
  // had; the newest message is lifted by the same amount, so it rests on the
  // composer and no row shows through the composer.
  assert.equal(getGluedFooterLift(-336, 1, 34), getChatNewestEdgeInset(-336, 34))
  assert.equal(getGluedFooterLift(0, 0, 34), 0)
  assert.equal(getGluedFooterLift(336, 1, 34), 302, "the sign of the keyboard translation is ignored")
  let previous = 0
  for (let step = 0; step <= 10; step += 1) {
    const progress = step / 10
    const lift = getGluedFooterLift(-336 * progress, progress, 34)
    assert.ok(lift >= previous, "the clip rises steadily with the keyboard")
    previous = lift
  }
})
