import assert from "node:assert/strict"
import test from "node:test"
import { resolveNotificationDestination } from "./notificationRouting"

test("message notifications open the addressed thread", () => {
  assert.deepEqual(resolveNotificationDestination({
    type: "chat.message",
    threadId: " thread_123 ",
    messageId: "message_123"
  }), {
    route: "ChatThread",
    params: { threadId: "thread_123" }
  })
})

test("match and room invite notifications open their actionable hubs", () => {
  assert.deepEqual(resolveNotificationDestination({
    type: "connection.matched",
    miniRoomId: "mini_123"
  }), { route: "Inbox" })
  assert.deepEqual(resolveNotificationDestination({
    type: "mini_room.invite",
    inviteId: "invite_123"
  }), { route: "Lobby" })
  assert.deepEqual(resolveNotificationDestination({
    type: "chat.room_invite",
    threadId: " thread_123 ",
    inviteId: "invite_123"
  }), {
    route: "ChatThread",
    params: { threadId: "thread_123" }
  })
  assert.deepEqual(resolveNotificationDestination({ type: "discovery.like" }), { route: "Lobby" })
  assert.deepEqual(resolveNotificationDestination({ type: "discovery.match", matchId: "match_123" }), { route: "Inbox" })
  assert.deepEqual(resolveNotificationDestination({ type: "discovery.watch_match", profileId: "profile_123" }), { route: "Lobby" })
})

test("malformed or unknown notification data is ignored", () => {
  assert.equal(resolveNotificationDestination({
    type: "chat.message",
    threadId: " "
  }), null)
  assert.equal(resolveNotificationDestination({ type: "marketing.unknown" }), null)
  assert.equal(resolveNotificationDestination(null), null)
})
