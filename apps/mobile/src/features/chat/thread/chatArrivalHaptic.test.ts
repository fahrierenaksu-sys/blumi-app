import assert from "node:assert/strict"
import test from "node:test"
import type { ChatTimelineItem } from "../chatRoomInviteModel"
import { shouldTapForIncomingArrival } from "./chatArrivalHaptic"

// The arrival tap never interrupts someone who is typing.

function message(senderUserId: string): ChatTimelineItem {
  return {
    kind: "message",
    createdAt: "2026-10-02T10:00:00.000Z",
    message: { messageId: `m-${senderUserId}`, senderUserId, body: "hi" }
  } as unknown as ChatTimelineItem
}

test("the partner's message taps softly only while I am reading, once per update", () => {
  const base = { currentUserId: "me", composerFocused: false, screenFocused: true }
  assert.equal(shouldTapForIncomingArrival({ ...base, arrivedItems: [message("partner"), message("partner")] }), true)
  assert.equal(shouldTapForIncomingArrival({ ...base, composerFocused: true, arrivedItems: [message("partner")] }), false, "typing: no tap")
  assert.equal(shouldTapForIncomingArrival({ ...base, screenFocused: false, arrivedItems: [message("partner")] }), false)
  assert.equal(shouldTapForIncomingArrival({ ...base, arrivedItems: [message("me")] }), false, "my own send has its own haptic")
  assert.equal(shouldTapForIncomingArrival({ ...base, arrivedItems: [] }), false)
})
