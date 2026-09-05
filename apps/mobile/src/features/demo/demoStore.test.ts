import assert from "node:assert/strict"
import test from "node:test"
import {
  createDemoRoomInvite,
  demoLike,
  demoRoomInviteAction,
  getDemoRoomInvites,
  resetDemoDeck
} from "./demoStore"

const currentUser = {
  userId: "demo-test-me",
  displayName: "Test user"
}

test("demo bots create deterministic matches, messages, and inbound room invites", async () => {
  resetDemoDeck()

  const result = demoLike("demo-user-001", currentUser)

  assert.equal(result.matched, true)
  assert.equal(result.profile?.displayName, "Defne Yıldız")

  await new Promise((resolve) => setTimeout(resolve, 2_900))

  const invite = getDemoRoomInvites().find(
    (candidate) => candidate.threadId === "demo-thread-demo-user-001"
  )
  assert.equal(invite?.senderUserId, "demo-user-001")
  assert.equal(invite?.recipientUserId, currentUser.userId)
  assert.equal(invite?.status, "pending")

  resetDemoDeck()
})

test("demo users can send and decide room invites without a production API", () => {
  resetDemoDeck()

  const invite = createDemoRoomInvite(
    "demo-thread-demo-user-003",
    currentUser
  )
  assert.equal(invite.status, "pending")
  assert.equal(invite.senderUserId, currentUser.userId)
  assert.equal(invite.recipientUserId, "demo-user-003")

  const cancelled = demoRoomInviteAction(
    { type: "cancel", inviteId: invite.inviteId },
    currentUser
  )
  assert.equal(cancelled?.status, "cancelled")

  resetDemoDeck()
})
