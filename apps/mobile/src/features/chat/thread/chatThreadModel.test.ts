import assert from "node:assert/strict"
import test from "node:test"
import type { ChatMessage } from "@blumi/contracts"
import type {
  ChatRoomInviteTimelineItem,
  ChatTimelineItem
} from "../chatRoomInviteModel"
import { CHAT_COPY } from "./chatThreadCopy"
import {
  formatDateSeparator,
  formatMessageTime,
  getChatTimelineRowModel,
  getRoomInviteActionKey,
  getRoomInviteComposerState,
  selectChatPartnerSummary,
  type ChatMessageDeliveryState
} from "./chatThreadModel"

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
  deliveryStates: Record<string, ChatMessageDeliveryState> = {},
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
