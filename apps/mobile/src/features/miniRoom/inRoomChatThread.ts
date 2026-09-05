import type { ChatMessage, ChatThread } from "@blumi/contracts"

const ROOM_INVITE_SENTINEL = "__room_invite__"

export function findLastCanonicalRoomChatMessage(
  messages: readonly ChatMessage[],
  atOrBeforeTimestamp = Number.POSITIVE_INFINITY
): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const sentAt = message ? Date.parse(message.sentAt) : Number.NaN
    if (
      message &&
      message.body.trim() !== ROOM_INVITE_SENTINEL &&
      Number.isFinite(sentAt) &&
      sentAt <= atOrBeforeTimestamp
    ) {
      return message
    }
  }
  return undefined
}

export function shouldRenderIncomingRoomChatMessage(input: {
  senderUserId: string
  localUserId: string
  body: string
  sentAt: string
  baselineTimestamp: number
}): boolean {
  if (input.senderUserId === input.localUserId) return false
  if (input.body.trim() === ROOM_INVITE_SENTINEL) return false

  const sentAtMs = Date.parse(input.sentAt)
  return Number.isFinite(sentAtMs) && sentAtMs >= input.baselineTimestamp - 250
}

export function findCanonicalRoomChatThread(input: {
  threads: readonly ChatThread[]
  sourceThreadId: string | undefined
  localUserId: string
  partnerUserId: string
}): ChatThread | undefined {
  const { threads, sourceThreadId, localUserId, partnerUserId } = input
  if (!sourceThreadId) return undefined

  const thread = threads.find((entry) => entry.threadId === sourceThreadId)
  if (!thread) return undefined
  if (
    !thread.participantUserIds.includes(localUserId) ||
    !thread.participantUserIds.includes(partnerUserId)
  ) {
    return undefined
  }
  return thread
}
