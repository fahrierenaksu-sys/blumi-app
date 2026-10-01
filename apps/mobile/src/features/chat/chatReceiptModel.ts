import type { ChatMessage, ChatPartnerReceipts, ChatReceiptCursor } from "@blumi/contracts"
import {
  compareChatMessagePositions,
  getChatOwnMessageReceiptState,
  laterChatReceiptCursor
} from "@blumi/domain"

/**
 * Pure receipt rules for the chat store and timeline (2026-10-01). Cursors use
 * the server's `(sentAt, messageId)` order from @blumi/domain, so the device
 * clock never decides a tick. The server already applied rollout, blocks and
 * the mutual read-receipt setting; the client only merges what it was sent.
 */
export type ChatMessageDeliveryState = "sending" | "failed" | "sent" | "delivered" | "read"

const LOCAL_MESSAGE_PREFIX = "__local_"

/**
 * A thread or message list is the server's current view. Delivery never moves
 * back (a slow list must not undo a newer receipt event); read state follows
 * the list, so a missing `readUpTo` hides it (one person turned it off). A
 * list without `partnerReceipts` (old server, receipts not rolled out) keeps
 * what the client knows.
 */
export function applyReceiptSnapshot(
  current: ChatPartnerReceipts | undefined,
  snapshot: ChatPartnerReceipts | undefined
): ChatPartnerReceipts | undefined {
  if (!snapshot) return current
  return withCursors(
    laterChatReceiptCursor(current?.deliveredUpTo, snapshot.deliveredUpTo),
    snapshot.readUpTo ? laterChatReceiptCursor(current?.readUpTo, snapshot.readUpTo) : undefined
  )
}

/** A `chat.receipt_updated` moves only the cursors it carries, forward only. */
export function applyReceiptEvent(
  current: ChatPartnerReceipts | undefined,
  event: ChatPartnerReceipts
): ChatPartnerReceipts {
  const deliveredUpTo = laterChatReceiptCursor(current?.deliveredUpTo, event.deliveredUpTo)
  const readUpTo = laterChatReceiptCursor(current?.readUpTo, event.readUpTo)
  if (current && deliveredUpTo === current.deliveredUpTo && readUpTo === current.readUpTo) return current
  return withCursors(deliveredUpTo, readUpTo)
}

/**
 * The tick state of one timeline message. Sending and failed are local and
 * win; a confirmed message of mine is sent, delivered or read by the partner
 * cursors. Without receipts (off, old server) it stays "sent": one tick.
 */
export function deriveChatMessageDeliveryState(input: {
  message: ChatMessage
  localState: "sending" | "failed" | "sent"
  isMe: boolean
  receipts?: ChatPartnerReceipts
}): ChatMessageDeliveryState {
  if (!input.isMe || input.localState !== "sent" || isLocalMessage(input.message)) return input.localState
  return getChatOwnMessageReceiptState(input.message, input.receipts)
}

/** The newest server-confirmed message the partner sent, for acks and reads. */
export function findNewestPartnerMessage(
  messages: readonly ChatMessage[],
  currentUserId: string
): ChatMessage | undefined {
  let newest: ChatMessage | undefined
  for (const message of messages) {
    if (message.senderUserId === currentUserId || isLocalMessage(message)) continue
    if (!newest || compareChatMessagePositions(message, newest) > 0) newest = message
  }
  return newest
}

function isLocalMessage(message: ChatMessage): boolean {
  return message.messageId.startsWith(LOCAL_MESSAGE_PREFIX)
}

function withCursors(
  deliveredUpTo: ChatReceiptCursor | undefined,
  readUpTo: ChatReceiptCursor | undefined
): ChatPartnerReceipts {
  return {
    ...(deliveredUpTo ? { deliveredUpTo } : {}),
    ...(readUpTo ? { readUpTo } : {})
  }
}
