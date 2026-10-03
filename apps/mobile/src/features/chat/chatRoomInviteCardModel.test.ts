import assert from "node:assert/strict"
import test from "node:test"
import { getRoomInviteCardState } from "./chatRoomInviteCardModel"
import type { ChatRoomInviteTimelineItem } from "./chatRoomInviteModel"

const invite: ChatRoomInviteTimelineItem = {
  kind: "room_invite", inviteId: "invite", threadId: "thread", senderUserId: "sender",
  recipientUserId: "recipient", createdAt: "2026-10-02T00:00:00Z", status: "pending"
}

test("sender waits with a locked entry button and a separate cancellation action", () => {
  const state = getRoomInviteCardState(invite, "sender", "tr")
  assert.equal(state.primaryAction, undefined)
  assert.equal(state.primaryLabel, "Odaya geç")
  assert.equal(state.secondaryAction?.type, "cancel")
  assert.equal(state.doorOpen, false)
})

test("recipient accepts first, and only an accepted server room unlocks entry", () => {
  const pending = getRoomInviteCardState(invite, "recipient", "en")
  assert.equal(pending.primaryAction?.type, "accept")
  assert.equal(pending.secondaryAction?.type, "decline")
  const ready = { ...invite, status: "accepted" as const, roomSessionId: "room" }
  for (const user of ["sender", "recipient"]) {
    const state = getRoomInviteCardState(ready, user, "tr")
    assert.equal(state.primaryAction?.type, "open_room")
    assert.equal(state.doorOpen, true)
    assert.equal(state.secondaryAction, undefined)
  }
  assert.equal(getRoomInviteCardState({ ...ready, roomSessionId: undefined }, "sender", "en").primaryAction, undefined)
})

test("outsiders and terminal invitations never unlock the door or expose actions", () => {
  const outsider = getRoomInviteCardState({ ...invite, status: "accepted", roomSessionId: "room" }, "stranger", "tr")
  assert.equal(outsider.primaryAction, undefined)
  assert.equal(outsider.doorOpen, false)
  for (const status of ["declined", "expired", "cancelled"] as const) {
    const state = getRoomInviteCardState({ ...invite, status }, "recipient", "en")
    assert.equal(state.primaryAction, undefined)
    assert.equal(state.secondaryAction, undefined)
    assert.equal(state.showPrimary, false)
    assert.equal(state.doorOpen, false)
  }
})

test("the sender summary remains historical while accepted entry actions stay available", () => {
  const accepted = { ...invite, status: "accepted" as const, roomSessionId: "room" }
  for (const locale of ["en", "tr"] as const) {
    for (const user of ["sender", "recipient"]) {
      const pending = getRoomInviteCardState(invite, user, locale)
      const ready = getRoomInviteCardState(accepted, user, locale)
      assert.equal(ready.senderLabel, pending.detail)
      assert.notEqual(ready.senderLabel, ready.detail, "the historical summary does not imply the old room is currently ready")
      assert.equal(ready.primaryAction?.type, "open_room", "presentation does not revoke backend-validated room access")
    }
  }
})
