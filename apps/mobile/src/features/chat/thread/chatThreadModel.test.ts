import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import {
  getChatTimelineItemKey,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"
import { CHAT_COPY } from "./chatThreadCopy"
import {
  buildChatTimelineRowModels,
  formatDateSeparator,
  formatMessageTime,
  getChatTimelineRowModel,
  getRoomInviteActionKey,
  getRoomInviteComposerState,
  isChatTimelineRowInviteBusy,
  normalizeOutgoingChatBody,
  selectChatPartnerSummary,
  type LocalChatMessageDeliveryState,
  type ChatTimelineRowModels
} from "./chatThreadModel"
import {
  addOptimisticMessage,
  applyChatMessageReceived,
  confirmOptimisticMessage,
  getMessageDeliveryState,
  getMessages,
  resetChatStore
} from "../chatStore"

function messageItem(index: number): ChatTimelineItem {
  const sentAt = new Date(Date.UTC(2026, 6, 21, 9, 0, index)).toISOString()
  return {
    kind: "message",
    createdAt: sentAt,
    message: { messageId: `m${index}`, threadId: "t", senderUserId: index % 3 === 0 ? "me" : "you", body: `b${index}`, sentAt }
  }
}

test("loading an earlier page keeps the row models of every already shown row (CHT-12)", () => {
  const context = { currentUserId: "me", getMessageDeliveryState: () => "sent" as const, locale: "en" as const, now: new Date("2026-07-21T12:00:00Z") }
  const shown = Array.from({ length: 30 }, (_, index) => messageItem(index + 20))
  const before = buildChatTimelineRowModels(shown, context)
  const earlier = Array.from({ length: 20 }, (_, index) => messageItem(index))
  const after = buildChatTimelineRowModels([...earlier, ...shown], context, before)
  const reused = shown.filter((item) => after.get(getChatTimelineItemKey(item)) === before.get(getChatTimelineItemKey(item)))
  // Only the formerly oldest row may change (it gains a neighbour and loses its day separator).
  assert.ok(reused.length >= 29, `${reused.length} of 30 rows kept their model (was 0)`)
})

test("an invitation action marks only that invitation's row busy (CHT-13)", () => {
  const invite: ChatTimelineItem = {
    kind: "room_invite", inviteId: "inv1", threadId: "t", senderUserId: "you", recipientUserId: "me",
    createdAt: "2026-07-21T09:00:00.000Z", status: "pending"
  }
  const rows = [messageItem(1), invite, messageItem(2)]
  const action = getRoomInviteActionKey({ type: "accept", inviteId: "inv1" })
  const busyBefore = rows.map((item) => isChatTimelineRowInviteBusy(item, null))
  const busyAfter = rows.map((item) => isChatTimelineRowInviteBusy(item, action))
  assert.deepEqual(busyBefore, [false, false, false])
  assert.deepEqual(busyAfter, [false, true, false], "message rows keep equal props, so memoised rows skip")
})

test("outgoing chat bodies match the server's stored form so the optimistic bubble reconciles", () => {
  assert.equal(normalizeOutgoingChatBody("  hello\n\n  world\t "), "hello world")
  assert.equal(normalizeOutgoingChatBody("a\r\nb  c"), "a b c")
  assert.equal(normalizeOutgoingChatBody(" \n\t "), "")
  assert.equal(normalizeOutgoingChatBody("single"), "single")

  // The server stores "line one line two". A normalized optimistic body is
  // replaced by the realtime echo and then confirmed by the HTTP ACK, leaving
  // exactly one delivered bubble.
  resetChatStore()
  const serverMessage: ChatMessage = {
    messageId: "message_server_1",
    threadId: "thread_normalized",
    senderUserId: "user_local",
    body: "line one line two",
    sentAt: "2026-09-30T10:00:00.000Z"
  }
  const pending = addOptimisticMessage({
    threadId: "thread_normalized",
    senderUserId: "user_local",
    body: normalizeOutgoingChatBody("line one\nline two"),
    trackDelivery: true
  })
  applyChatMessageReceived(serverMessage, { localUserId: "user_local" })
  confirmOptimisticMessage(pending.clientMessageId, serverMessage, "user_local")
  const delivered = getMessages("thread_normalized")
  assert.deepEqual(delivered.map((entry) => entry.messageId), ["message_server_1"])
  assert.equal(getMessageDeliveryState(pending.localMessageId), "sent")

  // Regression: the raw multi-line draft (the old behaviour) never reconciles,
  // leaving a second bubble stuck in "sending" beside the delivered message.
  resetChatStore()
  const raw = addOptimisticMessage({
    threadId: "thread_normalized",
    senderUserId: "user_local",
    body: "line one\nline two",
    trackDelivery: true
  })
  applyChatMessageReceived(serverMessage, { localUserId: "user_local" })
  confirmOptimisticMessage(raw.clientMessageId, serverMessage, "user_local")
  assert.equal(getMessages("thread_normalized").length, 2)
  assert.equal(getMessageDeliveryState(raw.localMessageId), "sending")
  resetChatStore()
})

function message(
  messageId: string,
  senderUserId: string,
  sentAt: string
): ChatTimelineItem {
  return {
    kind: "message",
    createdAt: sentAt,
    message: {
      messageId,
      threadId: "thread_one",
      senderUserId,
      body: messageId,
      sentAt
    } as ChatMessage
  }
}

const invite: ChatRoomInviteTimelineItem = {
  kind: "room_invite",
  inviteId: "invite_one",
  threadId: "thread_one",
  senderUserId: "user_one",
  recipientUserId: "user_two",
  createdAt: "2026-07-21T10:01:00.000Z",
  status: "pending",
  expiresAt: "2026-07-21T10:11:00.000Z"
}

test("message time renders local hours and minutes and hides invalid dates", () => {
  const local = new Date(2026, 6, 21, 9, 5)
  assert.equal(formatMessageTime(local.toISOString()), "09:05")
  assert.equal(formatMessageTime(new Date(2026, 6, 21, 23, 59).toISOString()), "23:59")
  assert.equal(formatMessageTime("not-a-date"), "")
})

test("date separators say today and yesterday in both locales, else a short date", () => {
  const now = new Date(2026, 6, 21, 12, 0)
  const earlierToday = new Date(2026, 6, 21, 0, 1)
  const yesterday = new Date(2026, 6, 20, 23, 59)
  const older = new Date(2026, 6, 3, 8, 0)

  assert.equal(formatDateSeparator(earlierToday, "en", now), "Today")
  assert.equal(formatDateSeparator(earlierToday, "tr", now), "Bugün")
  assert.equal(formatDateSeparator(yesterday, "en", now), "Yesterday")
  assert.equal(formatDateSeparator(yesterday, "tr", now), "Dün")
  assert.equal(
    formatDateSeparator(older, "en", now),
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(older)
  )
  assert.equal(
    formatDateSeparator(older, "tr", now),
    new Intl.DateTimeFormat("tr-TR", { month: "short", day: "numeric" }).format(older)
  )
})

test("date separators default to the current clock", () => {
  assert.equal(formatDateSeparator(new Date(), "en"), "Today")
})

test("room invite action keys are stable per action and invite", () => {
  assert.equal(getRoomInviteActionKey({ type: "create", threadId: "thread_one" }), "create:thread_one")
  assert.equal(getRoomInviteActionKey({ type: "accept", inviteId: "invite_one" }), "accept:invite_one")
  assert.equal(getRoomInviteActionKey({ type: "decline", inviteId: "invite_one" }), "decline:invite_one")
  assert.equal(getRoomInviteActionKey({ type: "cancel", inviteId: "invite_one" }), "cancel:invite_one")
  assert.equal(
    getRoomInviteActionKey({ type: "open_room", inviteId: "invite_one", roomSessionId: "room_9" }),
    "open_room:invite_one:room_9"
  )
})

test("partner summary prefers the other participant, then the first, then none", () => {
  const me = { userId: "user_one", displayName: "Me" }
  const them = { userId: "user_two", displayName: "Them" }
  assert.equal(selectChatPartnerSummary(null, "user_one"), null)
  assert.equal(
    selectChatPartnerSummary({ participants: [me, them] } as never, "user_one"),
    them
  )
  assert.equal(
    selectChatPartnerSummary({ participants: [me] } as never, "user_one"),
    me
  )
  assert.equal(selectChatPartnerSummary({ participants: [] } as never, "user_one"), null)
})

function rowModel(
  timeline: readonly ChatTimelineItem[],
  index: number,
  deliveryStates: Record<string, LocalChatMessageDeliveryState> = {},
  locale: "en" | "tr" = "en"
) {
  const newestFirst = [...timeline].reverse()
  const lookups: string[] = []
  const model = getChatTimelineRowModel({
    item: newestFirst[index]!,
    index,
    timeline,
    currentUserId: "user_one",
    getMessageDeliveryState: (messageId) => {
      lookups.push(messageId)
      return deliveryStates[messageId] ?? "sent"
    },
    locale,
    now: new Date(2026, 6, 21, 12, 0)
  })
  return { model, lookups }
}

test("inverted rows map back to chronological order for grouping and dates", () => {
  const timeline = [
    message("m1", "user_one", new Date(2026, 6, 20, 9, 0).toISOString()),
    message("m2", "user_one", new Date(2026, 6, 21, 9, 0).toISOString()),
    message("m3", "user_one", new Date(2026, 6, 21, 9, 1).toISOString()),
    message("m4", "user_two", new Date(2026, 6, 21, 9, 2).toISOString())
  ]

  const newest = rowModel(timeline, 0).model
  assert.equal(newest.chronologicalIndex, 3)
  assert.equal(newest.isMe, false)
  assert.equal(newest.groupPosition, "single")
  assert.equal(newest.closesGroup, true)
  assert.equal(newest.dateLabel, null)

  const groupEnd = rowModel(timeline, 1).model
  assert.equal(groupEnd.chronologicalIndex, 2)
  assert.equal(groupEnd.isMe, true)
  assert.equal(groupEnd.groupPosition, "last")
  assert.equal(groupEnd.closesGroup, true)

  const groupStart = rowModel(timeline, 2).model
  assert.equal(groupStart.groupPosition, "first")
  assert.equal(groupStart.closesGroup, false)
  assert.equal(groupStart.dateLabel, "Today")

  const oldest = rowModel(timeline, 3, {}, "tr").model
  assert.equal(oldest.chronologicalIndex, 0)
  assert.equal(oldest.dateLabel, "Dün", "the first chronological row always carries a date")
})

test("message rows read their own delivery state; invitations never do", () => {
  const timeline: ChatTimelineItem[] = [
    message("m1", "user_one", new Date(2026, 6, 21, 9, 0).toISOString()),
    invite
  ]

  const inviteRow = rowModel(timeline, 0, { m1: "failed" })
  assert.equal(inviteRow.model.isRoomInvite, true)
  assert.equal(inviteRow.model.isMe, true, "invite ownership comes from senderUserId")
  assert.equal(inviteRow.model.deliveryState, "sent")
  assert.equal(inviteRow.model.groupPosition, "single")
  assert.deepEqual(inviteRow.lookups, [])

  const messageRow = rowModel(timeline, 1, { m1: "sending" })
  assert.equal(messageRow.model.isRoomInvite, false)
  assert.equal(messageRow.model.deliveryState, "sending")
  assert.deepEqual(messageRow.lookups, ["m1"])
})

const ROW_NOW = new Date(2026, 6, 21, 12, 0)

function rowModels(
  timeline: readonly ChatTimelineItem[],
  deliveryStates: Record<string, LocalChatMessageDeliveryState> = {},
  previous?: ChatTimelineRowModels | null
) {
  return buildChatTimelineRowModels(
    timeline,
    {
      currentUserId: "user_one",
      getMessageDeliveryState: (messageId) => deliveryStates[messageId] ?? "sent",
      locale: "en",
      now: ROW_NOW
    },
    previous
  )
}

// buildChatTimeline wraps every message in a new timeline item on each store
// change and passes invitation items through; the message objects are stable.
const rewrap = (timeline: readonly ChatTimelineItem[]): ChatTimelineItem[] =>
  timeline.map((item) => item.kind === "message" ? { ...item } : item)

const conversation = (): ChatTimelineItem[] => [
  message("m1", "user_one", new Date(2026, 6, 20, 9, 0).toISOString()),
  message("m2", "user_one", new Date(2026, 6, 21, 9, 0).toISOString()),
  message("m3", "user_one", new Date(2026, 6, 21, 9, 1).toISOString()),
  invite,
  message("m4", "user_two", new Date(2026, 6, 21, 10, 2).toISOString())
]

test("row models are built once per timeline item with the inverted-list presentation", () => {
  const timeline = conversation()
  const models = rowModels(timeline, { m3: "failed" })

  assert.deepEqual([...models.keys()], [
    "message:m1",
    "message:m2",
    "message:m3",
    "room-invite:invite_one",
    "message:m4"
  ])
  const newestFirst = [...timeline].reverse()
  newestFirst.forEach((item, index) => {
    const entry = models.get(getChatTimelineItemKey(item))
    assert.equal(entry?.item, item)
    assert.deepEqual(entry?.row, rowModel(timeline, index, { m3: "failed" }).model)
  })
  assert.equal(models.get("message:m3")?.row.deliveryState, "failed")
  assert.deepEqual(rowModels(timeline, { m3: "failed" }), models, "same input, same output")
})

test("an unchanged timeline reuses the previous models and map", () => {
  const timeline = conversation()
  const first = rowModels(timeline)
  const again = rowModels(rewrap(timeline), {}, first)

  assert.equal(again, first, "nothing changed, so the list keeps the same map")
  assert.equal(rowModels(timeline, {}, null).size, first.size)
})

test("a delivery change replaces only that message's row model", () => {
  const timeline = conversation()
  const before = rowModels(timeline, { m3: "sending" })
  const after = rowModels(rewrap(timeline), { m3: "failed" }, before)

  assert.notEqual(after, before)
  assert.notEqual(after.get("message:m3"), before.get("message:m3"))
  assert.equal(after.get("message:m3")?.row.deliveryState, "failed")
  for (const key of ["message:m1", "message:m2", "room-invite:invite_one", "message:m4"]) {
    assert.equal(after.get(key), before.get(key), `${key} keeps its model`)
  }
})

test("an edited or appended message replaces only the rows whose presentation changed", () => {
  const timeline = conversation()
  const before = rowModels(timeline)

  const edited = timeline.map((item) => item.kind === "message" && item.message.messageId === "m2"
    ? { ...item, message: { ...item.message, body: "edited" } }
    : item.kind === "message" ? { ...item } : item)
  const afterEdit = rowModels(edited, {}, before)
  assert.notEqual(afterEdit.get("message:m2"), before.get("message:m2"))
  const editedItem = afterEdit.get("message:m2")?.item
  assert.equal(editedItem?.kind === "message" ? editedItem.message.body : null, "edited")
  for (const key of ["message:m1", "message:m3", "room-invite:invite_one", "message:m4"]) {
    assert.equal(afterEdit.get(key), before.get(key), `${key} keeps its model after an edit`)
  }

  // A reply from the same sender turns the previous newest bubble from a
  // closing "single" into a group "first"; every older row is untouched.
  const appended = [
    ...rewrap(timeline),
    message("m5", "user_two", new Date(2026, 6, 21, 10, 3).toISOString())
  ]
  const afterAppend = rowModels(appended, {}, before)
  assert.equal(afterAppend.size, before.size + 1)
  assert.equal(afterAppend.get("message:m5")?.row.groupPosition, "last")
  assert.notEqual(afterAppend.get("message:m4"), before.get("message:m4"))
  assert.equal(afterAppend.get("message:m4")?.row.groupPosition, "first")
  for (const key of ["message:m1", "message:m2", "message:m3", "room-invite:invite_one"]) {
    assert.equal(afterAppend.get(key), before.get(key), `${key} keeps its model after an append`)
  }
})

test("removed rows are dropped and a locale change rebuilds date labels", () => {
  const timeline = conversation()
  const before = rowModels(timeline)
  const trimmed = rowModels(rewrap(timeline.slice(0, 3)), {}, before)
  assert.deepEqual([...trimmed.keys()], ["message:m1", "message:m2", "message:m3"])

  const turkish = buildChatTimelineRowModels(
    timeline,
    { currentUserId: "user_one", getMessageDeliveryState: () => "sent", locale: "tr", now: ROW_NOW },
    before
  )
  assert.equal(turkish.get("message:m1")?.row.dateLabel, "Dün")
  assert.notEqual(turkish.get("message:m1"), before.get("message:m1"))
})

test("partner receipts advance my rows to delivered and read; only changed rows get new models", () => {
  const timeline = conversation()
  const sentAt = (key: string) => (timeline.find((item) =>
    item.kind === "message" && item.message.messageId === key) as Extract<ChatTimelineItem, { kind: "message" }>).message.sentAt
  const context = { currentUserId: "user_one", getMessageDeliveryState: () => "sent" as const, locale: "en" as const, now: ROW_NOW }
  const before = buildChatTimelineRowModels(timeline, context)
  assert.equal(before.get("message:m2")?.row.deliveryState, "sent", "no receipts: one tick")

  const delivered = buildChatTimelineRowModels(timeline, {
    ...context,
    partnerReceipts: { deliveredUpTo: { sentAt: sentAt("m2"), messageId: "m2" } }
  }, before)
  assert.equal(delivered.get("message:m1")?.row.deliveryState, "delivered")
  assert.equal(delivered.get("message:m2")?.row.deliveryState, "delivered")
  assert.equal(delivered.get("message:m3")?.row.deliveryState, "sent")
  assert.equal(delivered.get("message:m4")?.row.deliveryState, "sent", "the partner's message has no ticks")
  assert.equal(delivered.get("message:m4"), before.get("message:m4"), "an unaffected row keeps its model")

  const read = buildChatTimelineRowModels(timeline, {
    ...context,
    getMessageDeliveryState: (messageId: string) => messageId === "m3" ? "failed" as const : "sent" as const,
    partnerReceipts: {
      deliveredUpTo: { sentAt: sentAt("m3"), messageId: "m3" },
      readUpTo: { sentAt: sentAt("m1"), messageId: "m1" }
    }
  }, delivered)
  assert.equal(read.get("message:m1")?.row.deliveryState, "read")
  assert.equal(read.get("message:m2")?.row.deliveryState, "delivered")
  assert.equal(read.get("message:m3")?.row.deliveryState, "failed", "a local failure is never hidden by a receipt")
})

function composerState(overrides: Partial<Parameters<typeof getRoomInviteComposerState>[0]> = {}) {
  return getRoomInviteComposerState({
    resolvedThreadId: "thread_one",
    isPendingThread: false,
    hasRoomInviteHandler: true,
    threadRoomInvites: [],
    activeRoomInviteAction: null,
    chatCopy: CHAT_COPY.en,
    ...overrides
  })
}

test("room invite entry is enabled only for a ready thread without a pending invite", () => {
  const ready = composerState()
  assert.equal(ready.canCreateRoomInvite, true)
  assert.deepEqual(ready.createRoomInviteAction, { type: "create", threadId: "thread_one" })
  assert.equal(ready.isCreatingRoomInvite, false)
  assert.equal(ready.roomInviteDisabledReason, null)
})

test("room invite disabled reasons follow conversation, pending, then handler order", () => {
  const pendingThread = composerState({ isPendingThread: true, threadRoomInvites: [invite], hasRoomInviteHandler: false })
  assert.equal(pendingThread.canCreateRoomInvite, false)
  assert.equal(pendingThread.roomInviteDisabledReason, CHAT_COPY.en.roomInviteConversationReason)

  const noThread = composerState({ resolvedThreadId: undefined })
  assert.equal(noThread.canCreateRoomInvite, false)
  assert.equal(noThread.createRoomInviteAction, null)
  assert.equal(noThread.isCreatingRoomInvite, false)
  assert.equal(noThread.roomInviteDisabledReason, CHAT_COPY.en.roomInviteConversationReason)

  const pendingInvite = composerState({ threadRoomInvites: [invite], hasRoomInviteHandler: false })
  assert.equal(pendingInvite.canCreateRoomInvite, false)
  assert.equal(pendingInvite.roomInviteDisabledReason, CHAT_COPY.en.roomInvitePendingReason)

  const acceptedInvite = composerState({ threadRoomInvites: [{ ...invite, status: "accepted" }] })
  assert.equal(acceptedInvite.canCreateRoomInvite, true)

  const noHandler = composerState({ hasRoomInviteHandler: false, chatCopy: CHAT_COPY.tr })
  assert.equal(noHandler.canCreateRoomInvite, false)
  assert.equal(noHandler.roomInviteDisabledReason, CHAT_COPY.tr.roomInviteUnavailableReason)
})

test("the create action is busy only while its own action key is active", () => {
  assert.equal(composerState({ activeRoomInviteAction: "create:thread_one" }).isCreatingRoomInvite, true)
  assert.equal(composerState({ activeRoomInviteAction: "accept:invite_one" }).isCreatingRoomInvite, false)
  assert.equal(composerState({ activeRoomInviteAction: "create:thread_two" }).isCreatingRoomInvite, false)
})
