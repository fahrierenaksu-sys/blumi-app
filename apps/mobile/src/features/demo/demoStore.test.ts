import assert from "node:assert/strict"
import test from "node:test"
import {
  createDemoRoomInvite,
  demoLike,
  demoSendMessage,
  getDemoMessages,
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

test("matched demo characters reply to a local conversation without a production API", async () => {
  resetDemoDeck()
  assert.equal(demoLike("demo-user-009", currentUser).matched, true)

  const threadId = "demo-thread-demo-user-009"
  const sent = demoSendMessage(threadId, currentUser.userId, "Merhaba", "client_message_123")
  assert.equal(sent.senderUserId, currentUser.userId)
  assert.equal(demoSendMessage(threadId, currentUser.userId, "Merhaba", "client_message_123").messageId, sent.messageId)
  assert.equal(getDemoMessages(threadId).filter((message) => message.senderUserId === currentUser.userId).length, 1)

  await new Promise((resolve) => setTimeout(resolve, 1_650))
  assert.ok(getDemoMessages(threadId).some((message) => message.senderUserId === "demo-user-009"))
  resetDemoDeck()
})
