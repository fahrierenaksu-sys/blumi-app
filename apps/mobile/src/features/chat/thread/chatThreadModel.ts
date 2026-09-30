import type { ChatThread } from "@blumi/contracts"
import {
  getChatMessageGroupPosition,
  type ChatLocale,
  type ChatMessageGroupPosition,
  type ChatRoomInviteAction,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"
import { CHAT_COPY, type ChatThreadCopy } from "./chatThreadCopy"

export type ChatMessageDeliveryState = "sending" | "failed" | "sent"

export function formatMessageTime(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ""
  const hours = d.getHours().toString().padStart(2, "0")
  const mins = d.getMinutes().toString().padStart(2, "0")
  return `${hours}:${mins}`
}

export function formatDateSeparator(
  date: Date,
  locale: ChatLocale,
  now: Date = new Date()
): string {
  const today = now.toDateString()
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString()
  const ds = date.toDateString()
  if (ds === today) return CHAT_COPY[locale].today
  if (ds === yesterday) return CHAT_COPY[locale].yesterday
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    month: "short",
    day: "numeric"
  }).format(date)
}

export function getRoomInviteActionKey(action: ChatRoomInviteAction): string {
  switch (action.type) {
    case "create":
      return `create:${action.threadId}`
    case "open_room":
      return `${action.type}:${action.inviteId}:${action.roomSessionId}`
    default:
      return `${action.type}:${action.inviteId}`
  }
}

export type ChatPartnerSummary = ChatThread["participants"][number]

export function selectChatPartnerSummary(
  thread: ChatThread | null | undefined,
  currentUserId: string
): ChatPartnerSummary | null {
  if (!thread) return null
  return (
    thread.participants.find((p) => p.userId !== currentUserId) ??
    thread.participants[0] ??
    null
  )
}

export interface ChatTimelineRowModel {
  chronologicalIndex: number
  isRoomInvite: boolean
  isMe: boolean
  deliveryState: ChatMessageDeliveryState
  groupPosition: ChatMessageGroupPosition
  closesGroup: boolean
  dateLabel: string | null
}

/**
 * Presentation for one row of the inverted (newest-first) list. The
 * chronological timeline remains the authority for grouping and dates.
 */
export function getChatTimelineRowModel({
  item,
  index,
  timeline,
  currentUserId,
  getMessageDeliveryState,
  locale,
  now
}: {
  item: ChatTimelineItem
  index: number
  timeline: readonly ChatTimelineItem[]
  currentUserId: string
  getMessageDeliveryState: (messageId: string) => ChatMessageDeliveryState
  locale: ChatLocale
  now?: Date
}): ChatTimelineRowModel {
  const chronologicalIndex = timeline.length - 1 - index
  const isRoomInvite = item.kind === "room_invite"
  const isMe = isRoomInvite
    ? item.senderUserId === currentUserId
    : item.message.senderUserId === currentUserId
  const deliveryState = item.kind === "message"
    ? getMessageDeliveryState(item.message.messageId)
    : "sent"
  const groupPosition = item.kind === "message"
    ? getChatMessageGroupPosition(timeline, chronologicalIndex)
    : "single"
  const closesGroup = groupPosition === "single" || groupPosition === "last"

  // Day separator
  const itemDate = new Date(item.createdAt)
  const previousItem = chronologicalIndex > 0 ? timeline[chronologicalIndex - 1] : null
  const prevDate = previousItem ? new Date(previousItem.createdAt) : null
  const showDateSep =
    !prevDate ||
    itemDate.toDateString() !== prevDate.toDateString()
  const dateLabel = showDateSep ? formatDateSeparator(itemDate, locale, now) : null

  return {
    chronologicalIndex,
    isRoomInvite,
    isMe,
    deliveryState,
    groupPosition,
    closesGroup,
    dateLabel
  }
}

export interface RoomInviteComposerState {
  canCreateRoomInvite: boolean
  createRoomInviteAction: { type: "create"; threadId: string } | null
  isCreatingRoomInvite: boolean
  roomInviteDisabledReason: string | null
}

export function getRoomInviteComposerState({
  resolvedThreadId,
  isPendingThread,
  hasRoomInviteHandler,
  threadRoomInvites,
  activeRoomInviteAction,
  chatCopy
}: {
  resolvedThreadId: string | undefined
  isPendingThread: boolean
  hasRoomInviteHandler: boolean
  threadRoomInvites: readonly ChatRoomInviteTimelineItem[]
  activeRoomInviteAction: string | null
  chatCopy: ChatThreadCopy
}): RoomInviteComposerState {
  const canCreateRoomInvite = Boolean(
    resolvedThreadId &&
      !isPendingThread &&
      hasRoomInviteHandler &&
      !threadRoomInvites.some((invite) => invite.status === "pending")
  )
  const createRoomInviteAction = resolvedThreadId
    ? { type: "create" as const, threadId: resolvedThreadId }
    : null
  const isCreatingRoomInvite = createRoomInviteAction
    ? activeRoomInviteAction === getRoomInviteActionKey(createRoomInviteAction)
    : false
  const roomInviteDisabledReason = isPendingThread || !resolvedThreadId
    ? chatCopy.roomInviteConversationReason
    : threadRoomInvites.some((invite) => invite.status === "pending")
      ? chatCopy.roomInvitePendingReason
      : !hasRoomInviteHandler
        ? chatCopy.roomInviteUnavailableReason
        : null

  return {
    canCreateRoomInvite,
    createRoomInviteAction,
    isCreatingRoomInvite,
    roomInviteDisabledReason
  }
}
