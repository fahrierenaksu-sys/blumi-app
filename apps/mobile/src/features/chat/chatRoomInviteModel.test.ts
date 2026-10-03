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
  getChatInitialRenderCount,
  applyRoomInviteExpiry,
  getNextRoomInviteExpiry,
  getChatTimelineItemKey,
  type ChatRoomInviteTimelineItem
} from "./chatRoomInviteModel"

test("an acknowledged message keeps the row key of its optimistic bubble (CHT-04)", () => {
  const sent = { threadId: "t", senderUserId: "me", body: "hi", sentAt: "2026-07-21T10:00:00.000Z" }
  const local = buildChatTimeline([{ ...sent, messageId: "__local_1" }], [])
  const confirmed = buildChatTimeline(
    [{ ...sent, messageId: "server-1", sentAt: "2026-07-21T10:00:01.000Z" }],
    [],
    (id) => (id === "server-1" ? "__local_1" : id)
  )
  assert.equal(getChatTimelineItemKey(confirmed[0]!), getChatTimelineItemKey(local[0]!))
  assert.equal(getChatTimelineItemKey(buildChatTimeline([{ ...sent, messageId: "other" }], [], (id) => id)[0]!), "message:other")
})

test("canonical message ids order timestamp ties independently from stable optimistic row aliases", () => {
  const sent = { threadId: "t", senderUserId: "me", body: "synthetic", sentAt: "2026-10-03T00:00:00.000Z" }
  const messages = ["z", "b", "a"].map(messageId => ({ ...sent, messageId }))
  const timeline = buildChatTimeline(messages, [], id => id === "z" ? "__local_first" : id === "a" ? "__local_last" : id)
  assert.deepEqual(timeline.map(item => item.kind === "message" && item.message.messageId), ["a", "b", "z"])
  assert.deepEqual(timeline.map(getChatTimelineItemKey), ["message:__local_last", "message:b", "message:__local_first"])
})

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

test("the first chat render covers the viewport instead of only ten short messages", () => {
  for (const height of [568, 667, 844, 874, 956, 1024]) {
    const count = getChatInitialRenderCount(height)
    assert.ok(count > 10)
    assert.ok(count * 44 >= height, "short grouped bubbles must fill the initial viewport")
    assert.ok(count <= 32, "opening must not eagerly mount the entire long conversation")
  }
  assert.equal(getChatInitialRenderCount(Number.NaN), 20)
  assert.equal(getChatInitialRenderCount(0), 20)
})

test("invitation-heavy conversations fill the first viewport without mounting a text-sized batch of scenes", () => {
  const invites = Array.from({ length: 40 }, (_, index) => ({ ...baseInvite, inviteId: `synthetic-invite-${index}` }))
  for (const height of [568, 844, 956, 1024]) {
    const count = getChatInitialRenderCount(height, invites)
    assert.ok(count * 210 >= height, "the initial scene batch must fill the viewport")
    assert.ok(count < getChatInitialRenderCount(height), "invisible heavy scenes must stay outside the initial batch")
  }
  assert.equal(getChatInitialRenderCount(844, invites.slice(0, 1)), 1, "a short history is not padded with nonexistent rows")
})

test("a mixed conversation budgets the actual newest rows while still covering short text bubbles", () => {
  const text = buildChatTimeline(Array.from({ length: 40 }, (_, index) => ({
    messageId: `synthetic-message-${index}`, threadId: "synthetic-thread", senderUserId: "synthetic-sender",
    body: "Synthetic short bubble", sentAt: `2026-10-03T00:00:${String(index).padStart(2, "0")}.000Z`
  })), [])
  const mixed = [text[0]!, baseInvite, ...text.slice(1)]
  const count = getChatInitialRenderCount(844, mixed)
  const minimumHeight = mixed.slice(0, count).reduce((sum, row) => sum + (row.kind === "room_invite" ? 210 : 44), 0)
  assert.ok(minimumHeight >= 844)
  assert.ok(count < getChatInitialRenderCount(844, text))
  assert.equal(getChatInitialRenderCount(844, text), getChatInitialRenderCount(844), "text-only opening coverage is preserved")
})

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

test("a pending invite turns expired on both phones at its expiry, without a server event", () => {
  const pending = { ...baseInvite, status: "pending" as const, expiresAt: "2026-07-21T10:10:00.000Z" }
  const accepted = { ...baseInvite, inviteId: "invite_two", status: "accepted" as const, expiresAt: "2026-07-21T10:05:00.000Z" }
  const before = Date.parse("2026-07-21T10:09:59.000Z")
  const at = Date.parse("2026-07-21T10:10:00.000Z")
  const invites = [pending, accepted]

  assert.equal(applyRoomInviteExpiry(invites, before), invites, "nothing expired keeps the same list")
  const expired = applyRoomInviteExpiry(invites, at)
  assert.equal(expired[0].status, "expired")
  assert.equal(expired[1], accepted, "decided invites never change")
  for (const userId of [baseInvite.senderUserId, baseInvite.recipientUserId]) {
    assert.deepEqual(getRoomInviteActions(expired[0], userId), [], "no accept or cancel on an expired card")
    assert.equal(getRoomInvitePresentation(expired[0], userId, "tr").statusLabel, "Davetin süresi doldu")
  }

  assert.equal(getNextRoomInviteExpiry(invites, before), at)
  assert.equal(getNextRoomInviteExpiry(expired, at), null)
  assert.equal(getNextRoomInviteExpiry([{ ...pending, expiresAt: "not a date" }], before), null)
})

test("CHT-11: a pause longer than five minutes starts a new message group", () => {
  const message = (messageId: string, sentAt: string): ChatMessage => ({
    messageId, threadId: "thread_one", senderUserId: "user_one", body: messageId, sentAt
  })
  const timeline = buildChatTimeline([
    message("morning", "2026-07-21T09:00:00.000Z"),
    message("soon_after", "2026-07-21T09:05:00.000Z"),
    message("hours_later", "2026-07-21T13:00:00.000Z"),
    message("six_minutes_later", "2026-07-21T13:06:00.000Z")
  ], [])
  assert.equal(getChatMessageGroupPosition(timeline, 0), "first")
  assert.equal(getChatMessageGroupPosition(timeline, 1), "last", "exactly five minutes still groups")
  assert.equal(getChatMessageGroupPosition(timeline, 2), "single")
  assert.equal(getChatMessageGroupPosition(timeline, 3), "single")
})
