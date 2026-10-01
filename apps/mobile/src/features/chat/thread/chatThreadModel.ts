import type { ChatPartnerReceipts, ChatThread } from "@blumi/contracts"
import {
  getChatMessageGroupPosition,
  getChatTimelineItemKey,
  type ChatLocale,
  type ChatMessageGroupPosition,
  type ChatRoomInviteAction,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"
import { deriveChatMessageDeliveryState, type ChatMessageDeliveryState } from "../chatReceiptModel"
import { CHAT_COPY, type ChatThreadCopy } from "./chatThreadCopy"

export type { ChatMessageDeliveryState }
/** What the device itself knows about one of my messages. */
export type LocalChatMessageDeliveryState = "sending" | "failed" | "sent"

/**
 * Mirrors the server's message normalization (trim, then collapse every
 * whitespace run to one space). The optimistic bubble must hold exactly the
 * body the server stores: realtime echoes and HTTP acknowledgements are
 * reconciled by body, so a multi-line draft otherwise left a duplicate bubble
 * stuck in "sending" next to the delivered message.
 */
export function normalizeOutgoingChatBody(body: string): string {
  return body.trim().replace(/\s+/g, " ")
}

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
  partnerReceipts,
  locale,
  now
}: {
  item: ChatTimelineItem
  index: number
  timeline: readonly ChatTimelineItem[]
  currentUserId: string
  getMessageDeliveryState: (messageId: string) => LocalChatMessageDeliveryState
  /** The partner's cursors; undefined while receipts are off. */
  partnerReceipts?: ChatPartnerReceipts
  locale: ChatLocale
  now?: Date
}): ChatTimelineRowModel {
  const chronologicalIndex = timeline.length - 1 - index
  const isRoomInvite = item.kind === "room_invite"
  const isMe = isRoomInvite
    ? item.senderUserId === currentUserId
    : item.message.senderUserId === currentUserId
  const deliveryState = item.kind === "message"
    ? deriveChatMessageDeliveryState({
        message: item.message,
        localState: getMessageDeliveryState(item.message.messageId),
        isMe,
        receipts: partnerReceipts
      })
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

export interface ChatTimelineRowEntry {
  item: ChatTimelineItem
  row: ChatTimelineRowModel
}

/** Row presentation keyed by `getChatTimelineItemKey`, in chronological order. */
export type ChatTimelineRowModels = ReadonlyMap<string, ChatTimelineRowEntry>

export interface ChatTimelineRowModelContext {
  currentUserId: string
  getMessageDeliveryState: (messageId: string) => LocalChatMessageDeliveryState
  partnerReceipts?: ChatPartnerReceipts
  locale: ChatLocale
  now?: Date
}

function isSameTimelineSource(left: ChatTimelineItem, right: ChatTimelineItem): boolean {
  if (left === right) return true
  // buildChatTimeline wraps each message in a new item on every store change;
  // the message object itself only changes when its content does.
  return left.kind === "message" && right.kind === "message" &&
    left.message === right.message && left.createdAt === right.createdAt
}

// `chronologicalIndex` is left out on purpose: an earlier page shifts every
// index, and no row renders it, so comparing it re-rendered every row on
// "load earlier" (CHT-12). A reused entry may carry an older index.
function isSameRowModel(left: ChatTimelineRowModel, right: ChatTimelineRowModel): boolean {
  return left.isRoomInvite === right.isRoomInvite &&
    left.isMe === right.isMe &&
    left.deliveryState === right.deliveryState &&
    left.groupPosition === right.groupPosition &&
    left.closesGroup === right.closesGroup &&
    left.dateLabel === right.dateLabel
}

/**
 * Presentation for every row in one pass. When `previous` is given, an entry
 * whose source and presentation are unchanged keeps its previous object, and a
 * fully unchanged timeline returns `previous` itself, so memoised rows (and the
 * list's renderItem) only update where something visible changed.
 */
export function buildChatTimelineRowModels(
  timeline: readonly ChatTimelineItem[],
  context: ChatTimelineRowModelContext,
  previous?: ChatTimelineRowModels | null
): ChatTimelineRowModels {
  const models = new Map<string, ChatTimelineRowEntry>()
  let reusedAll = previous?.size === timeline.length

  timeline.forEach((item, chronologicalIndex) => {
    const key = getChatTimelineItemKey(item)
    const row = getChatTimelineRowModel({
      ...context,
      item,
      index: timeline.length - 1 - chronologicalIndex,
      timeline
    })
    const earlier = previous?.get(key)
    if (earlier && isSameTimelineSource(earlier.item, item) && isSameRowModel(earlier.row, row)) {
      models.set(key, earlier)
      return
    }
    reusedAll = false
    models.set(key, { item, row })
  })

  return reusedAll && previous ? previous : models
}

/**
 * Whether a row's invitation action is running. Rows get this boolean instead
 * of the active action key, so starting an action re-renders only the
 * invitation it belongs to (CHT-13).
 */
export function isChatTimelineRowInviteBusy(
  item: ChatTimelineItem,
  activeRoomInviteAction: string | null
): boolean {
  return item.kind === "room_invite" &&
    activeRoomInviteAction !== null &&
    activeRoomInviteAction.includes(item.inviteId)
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
