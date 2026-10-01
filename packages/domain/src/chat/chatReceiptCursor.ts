import type { ChatPartnerReceipts, ChatReceiptCursor } from "@blumi/contracts"

/**
 * Receipt cursors follow the server's message order `(sentAt, messageId)`
 * (owner decision 2026-10-01). Message ids are compared by code unit, which
 * matches PostgreSQL's row comparison for the server-generated ASCII ids.
 */
export interface ChatMessagePosition {
  sentAt: string
  messageId: string
}

export type ChatOwnMessageReceiptState = "sent" | "delivered" | "read"

export function compareChatMessagePositions(
  left: ChatMessagePosition,
  right: ChatMessagePosition
): number {
  const byTime = Date.parse(left.sentAt) - Date.parse(right.sentAt)
  if (byTime !== 0) return byTime
  return compareIds(left.messageId, right.messageId)
}

/** True when `message` sorts at or before `cursor`; an invalid date never counts. */
export function isChatMessageCoveredByCursor(
  message: ChatMessagePosition,
  cursor: ChatReceiptCursor | undefined
): boolean {
  if (!cursor) return false
  const messageTime = Date.parse(message.sentAt)
  const cursorTime = Date.parse(cursor.sentAt)
  if (!Number.isFinite(messageTime) || !Number.isFinite(cursorTime)) return false
  if (messageTime !== cursorTime) return messageTime < cursorTime
  // A cursor without a message id covers the whole instant.
  return cursor.messageId === undefined || compareIds(message.messageId, cursor.messageId) <= 0
}

/** The cursor that covers more; `undefined` and invalid dates lose. */
export function laterChatReceiptCursor(
  left: ChatReceiptCursor | undefined,
  right: ChatReceiptCursor | undefined
): ChatReceiptCursor | undefined {
  if (!isValidCursor(left)) return isValidCursor(right) ? right : undefined
  if (!isValidCursor(right)) return left
  const byTime = Date.parse(left.sentAt) - Date.parse(right.sentAt)
  if (byTime !== 0) return byTime > 0 ? left : right
  if (left.messageId === undefined) return left
  if (right.messageId === undefined) return right
  return compareIds(left.messageId, right.messageId) >= 0 ? left : right
}

/**
 * Receipt state of a message the viewer sent. Reading implies delivery, so a
 * read cursor ahead of the delivery cursor still yields "read".
 */
export function getChatOwnMessageReceiptState(
  message: ChatMessagePosition,
  receipts: ChatPartnerReceipts | undefined
): ChatOwnMessageReceiptState {
  if (isChatMessageCoveredByCursor(message, receipts?.readUpTo)) return "read"
  if (isChatMessageCoveredByCursor(message, receipts?.deliveredUpTo)) return "delivered"
  return "sent"
}

function isValidCursor(cursor: ChatReceiptCursor | undefined): cursor is ChatReceiptCursor {
  return cursor !== undefined && Number.isFinite(Date.parse(cursor.sentAt))
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
