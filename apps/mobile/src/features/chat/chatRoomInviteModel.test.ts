import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import {
  buildChatTimeline,
  getChatMessageGroupPosition,
  getRoomInviteCreateLabel,
  getRoomInviteActions,
  getRoomInvitePresentation,
  isLegacyRoomInviteSentinel,
  type ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"

const baseInvite: ChatRoomInviteTimelineItem = {
  kind: "room_invite",
  inviteId: "invite_one",
  threadId: "thread_one",
  senderUserId: "user_one",
  recipientUserId: "user_two",
  createdAt: "2026-07-21T10:01:00.000Z",
  status: "pending",
  expiresAt: "2026-07-21T10:11:00.000Z"
}

test("timeline removes the legacy invite sentinel and keeps durable invite cards ordered", () => {
  const messages: ChatMessage[] = [
    {
      messageId: "message_one",
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "Want to keep talking?",
      sentAt: "2026-07-21T10:00:00.000Z"
    },
    {
      messageId: "message_legacy",
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "__room_invite__",
      sentAt: "2026-07-21T10:00:30.000Z"
    }
  ]

  const timeline = buildChatTimeline(messages, [baseInvite])

  assert.deepEqual(
    timeline.map((item) => item.kind === "message" ? item.message.messageId : item.inviteId),
    ["message_one", "invite_one"]
  )
  assert.equal(isLegacyRoomInviteSentinel(" __room_invite__ "), true)
  assert.equal(isLegacyRoomInviteSentinel("__room_invite__ please"), false)
})

test("pending room invites give recipients a consent choice and senders a cancellation choice", () => {
  assert.deepEqual(
    getRoomInviteActions(baseInvite, "user_two"),
    [
      { type: "accept", inviteId: "invite_one" },
      { type: "decline", inviteId: "invite_one" }
    ]
  )
  assert.deepEqual(
    getRoomInviteActions(baseInvite, "user_one"),
    [{ type: "cancel", inviteId: "invite_one" }]
  )
})

test("room invite presentation is localised and only accepted invites can open a room", () => {
  const acceptedInvite: ChatRoomInviteTimelineItem = {
    ...baseInvite,
    status: "accepted",
    roomSessionId: "session_one"
  }

  assert.deepEqual(
    getRoomInviteActions(acceptedInvite, "user_one"),
    [{ type: "open_room", inviteId: "invite_one", roomSessionId: "session_one" }]
  )
  assert.deepEqual(getRoomInviteActions({ ...baseInvite, status: "expired" }, "user_two"), [])

  assert.deepEqual(
    getRoomInvitePresentation(baseInvite, "user_two", "tr"),
    {
      title: "Blumi Room daveti",
      detail: "Seni odaya davet etti.",
      statusLabel: "Yanıt vermen gerekiyor",
      primaryActionLabel: "Kabul et",
      secondaryActionLabel: "Şimdi değil"
    }
  )
  assert.equal(
    getRoomInvitePresentation({ ...baseInvite, status: "cancelled" }, "user_two", "en").statusLabel,
    "Invitation cancelled"
  )
  assert.equal(getRoomInviteCreateLabel("tr"), "Blumi Room'a davet et")
})

test("terminal invitation states cannot produce a room action", () => {
  const terminalStates = ["declined", "expired", "cancelled"] as const

  for (const status of terminalStates) {
    const invite = { ...baseInvite, status }
    assert.deepEqual(getRoomInviteActions(invite, "user_one"), [])
  }

  assert.equal(
    getRoomInvitePresentation({ ...baseInvite, status: "declined" }, "user_one", "en").statusLabel,
    "Invitation declined"
  )
  assert.equal(
    getRoomInvitePresentation({ ...baseInvite, status: "expired" }, "user_one", "en").statusLabel,
    "Invitation expired"
  )
})

test("consecutive messages from the same sender form WhatsApp-style groups", () => {
  const messages: ChatMessage[] = [
    {
      messageId: "message_one",
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "First",
      sentAt: "2026-07-21T10:00:00.000Z"
    },
    {
      messageId: "message_two",
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "Second",
      sentAt: "2026-07-21T10:00:10.000Z"
    },
    {
      messageId: "message_three",
      threadId: "thread_one",
      senderUserId: "user_one",
      body: "Third",
      sentAt: "2026-07-21T10:00:20.000Z"
    },
    {
      messageId: "message_four",
      threadId: "thread_one",
      senderUserId: "user_two",
      body: "Reply",
      sentAt: "2026-07-21T10:00:30.000Z"
    }
  ]
  const timeline = buildChatTimeline(messages, [])

  assert.equal(getChatMessageGroupPosition(timeline, 0), "first")
  assert.equal(getChatMessageGroupPosition(timeline, 1), "middle")
  assert.equal(getChatMessageGroupPosition(timeline, 2), "last")
  assert.equal(getChatMessageGroupPosition(timeline, 3), "single")
})

test("room invites and day changes break message groups", () => {
  const firstMessage: ChatMessage = {
    messageId: "message_before_invite",
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "Before",
    sentAt: "2026-07-21T23:59:00.000Z"
  }
  const secondMessage: ChatMessage = {
    messageId: "message_after_invite",
    threadId: "thread_one",
    senderUserId: "user_one",
    body: "After",
    sentAt: "2026-07-22T00:01:00.000Z"
  }
  const invite = {
    ...baseInvite,
    createdAt: "2026-07-22T00:00:00.000Z"
  }
  const timeline = buildChatTimeline([firstMessage, secondMessage], [invite])

  assert.equal(getChatMessageGroupPosition(timeline, 0), "single")
  assert.equal(getChatMessageGroupPosition(timeline, 1), "single")
  assert.equal(getChatMessageGroupPosition(timeline, 2), "single")
})
