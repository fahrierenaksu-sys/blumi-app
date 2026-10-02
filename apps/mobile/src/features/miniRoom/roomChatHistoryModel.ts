import type { ChatMessage } from "@blumi/contracts"
import { isRoomInviteSentinel } from "./inRoomChatThread"

export type RoomChatDelivery = "sent" | "sending" | "failed"

export interface RoomChatHistoryItem {
  id: string
  body: string
  mine: boolean
  delivery: RoomChatDelivery
  /** Original durable-message time; absent in older presentation fixtures. */
  sentAt?: string
  /** Legacy sender grouping, retained for existing presentation consumers. */
  showMeta: boolean
}

export type RoomChatHistoryStatus = "unavailable" | "loading" | "failed" | "ready"

export type RoomChatListStatus = "idle" | "loading" | "ready" | "failed"

/** The room shows the recent durable conversation; older text stays in the chat thread. */
export const ROOM_CHAT_HISTORY_LIMIT = 60

/**
 * The shared room's chat history from the durable thread, newest first (for
 * an inverted list). Invitation sentinels never appear as text; local echoes
 * carry their delivery state so a failed send is visible in place.
 */
export function selectRoomChatHistory(input: {
  messages: readonly ChatMessage[]
  localUserId: string
  deliveryOf: (messageId: string) => RoomChatDelivery
  limit?: number
}): RoomChatHistoryItem[] {
  const limit = input.limit ?? ROOM_CHAT_HISTORY_LIMIT
  const newestFirst: Omit<RoomChatHistoryItem, "showMeta">[] = []
  for (let index = input.messages.length - 1; index >= 0 && newestFirst.length < limit; index -= 1) {
    const message = input.messages[index]
    if (!message || isRoomInviteSentinel(message.body) || message.body.trim().length === 0) continue
    newestFirst.push({
      id: message.messageId,
      body: message.body,
      mine: message.senderUserId === input.localUserId,
      sentAt: message.sentAt,
      delivery: input.deliveryOf(message.messageId)
    })
  }
  return newestFirst.map((item, index) => {
    const newer = newestFirst[index - 1]
    return {
      ...item,
      showMeta: item.delivery !== "sent" || !newer || newer.mine !== item.mine
    }
  })
}

/** Device-local clock time; invalid or absent source times never become invented timestamps. */
export function formatRoomChatTime(sentAt?: string): string | null {
  if (!sentAt) return null
  const timestamp = new Date(sentAt)
  if (!Number.isFinite(timestamp.getTime())) return null
  return `${String(timestamp.getHours()).padStart(2, "0")}:${String(timestamp.getMinutes()).padStart(2, "0")}`
}

export function resolveRoomChatHistoryStatus(input: {
  hasThread: boolean
  listStatus: RoomChatListStatus
  itemCount: number
}): RoomChatHistoryStatus {
  if (!input.hasThread) return "unavailable"
  if (input.itemCount > 0) return "ready"
  if (input.listStatus === "failed") return "failed"
  if (input.listStatus === "ready") return "ready"
  return "loading"
}
