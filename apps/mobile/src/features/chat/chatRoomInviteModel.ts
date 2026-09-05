import type { ChatMessage } from "@blumi/contracts"

export type ChatRoomInviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"

export interface ChatRoomInviteTimelineItem {
  kind: "room_invite"
  inviteId: string
  threadId: string
  senderUserId: string
  recipientUserId: string
  createdAt: string
  status: ChatRoomInviteStatus
  expiresAt?: string
  roomSessionId?: string
}

export interface ChatTextTimelineItem {
  kind: "message"
  message: ChatMessage
  createdAt: string
}

export type ChatTimelineItem = ChatTextTimelineItem | ChatRoomInviteTimelineItem

export type ChatMessageGroupPosition = "single" | "first" | "middle" | "last"

export type ChatRoomInviteAction =
  | { type: "create"; threadId: string }
  | { type: "accept"; inviteId: string }
  | { type: "decline"; inviteId: string }
  | { type: "cancel"; inviteId: string }
  | { type: "open_room"; inviteId: string; roomSessionId: string }

export type ChatLocale = "en" | "tr"

/**
 * Navigation can supply this surface while transport and realtime ownership
 * stays outside the chat presentation layer.
 */
export interface ChatRoomInviteSurface {
  roomInvites?: readonly ChatRoomInviteTimelineItem[]
  onRoomInviteAction?: (action: ChatRoomInviteAction) => Promise<void>
  locale?: ChatLocale
}

export interface RoomInvitePresentation {
  title: string
  detail: string
  statusLabel: string
  primaryActionLabel?: string
  secondaryActionLabel?: string
}

const LEGACY_ROOM_INVITE_SENTINEL = "__room_invite__"

export function isLegacyRoomInviteSentinel(body: string): boolean {
  return body.trim() === LEGACY_ROOM_INVITE_SENTINEL
}

export function buildChatTimeline(
  messages: readonly ChatMessage[],
  roomInvites: readonly ChatRoomInviteTimelineItem[]
): ChatTimelineItem[] {
  const messageItems = messages
    .filter((message) => !isLegacyRoomInviteSentinel(message.body))
    .map((message): ChatTextTimelineItem => ({
      kind: "message",
      message,
      createdAt: message.sentAt
    }))

  const invitesById = new Map<string, ChatRoomInviteTimelineItem>()
  for (const invite of roomInvites) {
    invitesById.set(invite.inviteId, invite)
  }

  return [...messageItems, ...invitesById.values()].sort((a, b) => {
    const timeDifference = toTimestamp(a.createdAt) - toTimestamp(b.createdAt)
    if (timeDifference !== 0) return timeDifference
    return getChatTimelineItemKey(a).localeCompare(getChatTimelineItemKey(b))
  })
}

export function getChatTimelineItemKey(item: ChatTimelineItem): string {
  return item.kind === "message"
    ? `message:${item.message.messageId}`
    : `room-invite:${item.inviteId}`
}

export function getChatMessageGroupPosition(
  timeline: readonly ChatTimelineItem[],
  index: number
): ChatMessageGroupPosition {
  const item = timeline[index]
  if (!item || item.kind !== "message") return "single"

  const belongsToSameGroup = (candidate: ChatTimelineItem | undefined): boolean => {
    if (!candidate || candidate.kind !== "message") return false
    if (candidate.message.senderUserId !== item.message.senderUserId) return false
    return new Date(candidate.createdAt).toDateString() === new Date(item.createdAt).toDateString()
  }

  const hasPrevious = belongsToSameGroup(timeline[index - 1])
  const hasNext = belongsToSameGroup(timeline[index + 1])

  if (hasPrevious && hasNext) return "middle"
  if (hasNext) return "first"
  if (hasPrevious) return "last"
  return "single"
}

export function getRoomInviteActions(
  invite: ChatRoomInviteTimelineItem,
  currentUserId: string
): ChatRoomInviteAction[] {
  const isSender = invite.senderUserId === currentUserId
  const isRecipient = invite.recipientUserId === currentUserId

  if (!isSender && !isRecipient) return []

  if (invite.status === "pending") {
    if (isRecipient) {
      return [
        { type: "accept", inviteId: invite.inviteId },
        { type: "decline", inviteId: invite.inviteId }
      ]
    }
    return [{ type: "cancel", inviteId: invite.inviteId }]
  }

  if (invite.status === "accepted" && invite.roomSessionId) {
    return [
      {
        type: "open_room",
        inviteId: invite.inviteId,
        roomSessionId: invite.roomSessionId
      }
    ]
  }

  return []
}

export function getRoomInvitePresentation(
  invite: ChatRoomInviteTimelineItem,
  currentUserId: string,
  locale: ChatLocale
): RoomInvitePresentation {
  const isSender = invite.senderUserId === currentUserId
  const copy = ROOM_INVITE_COPY[locale]
  const actions = getRoomInviteActions(invite, currentUserId)

  return {
    title: copy.title,
    detail: getInviteDetail(invite.status, isSender, copy),
    statusLabel: getInviteStatusLabel(invite.status, isSender, copy),
    primaryActionLabel: actions[0]
      ? getRoomInviteActionLabel(actions[0], copy)
      : undefined,
    secondaryActionLabel: actions[1]
      ? getRoomInviteActionLabel(actions[1], copy)
      : undefined
  }
}

export function getRoomInviteActionLabel(
  action: ChatRoomInviteAction,
  copy: RoomInviteCopy = ROOM_INVITE_COPY.en
): string {
  switch (action.type) {
    case "create":
      return copy.create
    case "accept":
      return copy.accept
    case "decline":
      return copy.decline
    case "cancel":
      return copy.cancel
    case "open_room":
      return copy.openRoom
  }
}

export function getRoomInviteCreateLabel(locale: ChatLocale): string {
  return ROOM_INVITE_COPY[locale].create
}

interface RoomInviteCopy {
  title: string
  create: string
  accept: string
  decline: string
  cancel: string
  openRoom: string
  inviteSent: string
  inviteReceived: string
  awaitingReply: string
  yourReplyNeeded: string
  inviteAccepted: string
  invitationDeclined: string
  invitationExpired: string
  invitationCancelled: string
}

const ROOM_INVITE_COPY: Record<ChatLocale, RoomInviteCopy> = {
  en: {
    title: "Blumi Room invitation",
    create: "Invite to Blumi Room",
    accept: "Accept",
    decline: "Not now",
    cancel: "Cancel invitation",
    openRoom: "Enter Blumi Room",
    inviteSent: "You invited them to Blumi Room.",
    inviteReceived: "They invited you to Blumi Room.",
    awaitingReply: "Waiting for their reply",
    yourReplyNeeded: "Your reply is needed",
    inviteAccepted: "Invitation accepted",
    invitationDeclined: "Invitation declined",
    invitationExpired: "Invitation expired",
    invitationCancelled: "Invitation cancelled"
  },
  tr: {
    title: "Blumi Room daveti",
    create: "Blumi Room'a davet et",
    accept: "Kabul et",
    decline: "Şimdi değil",
    cancel: "Daveti iptal et",
    openRoom: "Blumi Room'a gir",
    inviteSent: "Onu Blumi Room'a davet ettin.",
    inviteReceived: "Seni odaya davet etti.",
    awaitingReply: "Yanıtını bekliyor",
    yourReplyNeeded: "Yanıt vermen gerekiyor",
    inviteAccepted: "Davet kabul edildi",
    invitationDeclined: "Davet reddedildi",
    invitationExpired: "Davetin süresi doldu",
    invitationCancelled: "Davet iptal edildi"
  }
}

function getInviteDetail(
  status: ChatRoomInviteStatus,
  isSender: boolean,
  copy: RoomInviteCopy
): string {
  if (status === "pending") {
    return isSender ? copy.inviteSent : copy.inviteReceived
  }
  return isSender ? copy.inviteSent : copy.inviteReceived
}

function getInviteStatusLabel(
  status: ChatRoomInviteStatus,
  isSender: boolean,
  copy: RoomInviteCopy
): string {
  switch (status) {
    case "pending":
      return isSender ? copy.awaitingReply : copy.yourReplyNeeded
    case "accepted":
      return copy.inviteAccepted
    case "declined":
      return copy.invitationDeclined
    case "expired":
      return copy.invitationExpired
    case "cancelled":
      return copy.invitationCancelled
  }
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}
