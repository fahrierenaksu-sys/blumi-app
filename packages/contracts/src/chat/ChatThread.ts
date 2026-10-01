import type { CompleteAvatarSelection } from "../avatar/AvatarSelection";

export interface ChatParticipantSummary {
  userId: string;
  displayName?: string;
  /** Available only to the two members of an authorized mutual chat. */
  avatar?: CompleteAvatarSelection;
}

export interface ChatMessage {
  messageId: string;
  threadId: string;
  senderUserId: string;
  body: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  editedAt?: string;
}

/**
 * A position in one thread's server order `(sentAt, messageId)` (2026-10-01).
 * It covers every message that sorts at or before it. Without `messageId` it
 * covers every message sent at or before `sentAt` (a read marker written by
 * a client that did not name a message).
 */
export interface ChatReceiptCursor {
  sentAt: string;
  messageId?: string;
}

/**
 * Viewer-specific receipt projection: how far the conversation partner has
 * received (`deliveredUpTo`) and read (`readUpTo`) this thread. The server
 * sends it only while receipts are enabled for both people, and `readUpTo`
 * only while both of them turned read receipts on. In a thread or message
 * list, a missing `readUpTo` means the read state is not visible (clear it);
 * clients that predate the field ignore it.
 */
export interface ChatPartnerReceipts {
  deliveredUpTo?: ChatReceiptCursor;
  readUpTo?: ChatReceiptCursor;
}

export interface ChatThread {
  threadId: string;
  miniRoomId: string;
  participantUserIds: [string, string];
  participants: [ChatParticipantSummary, ChatParticipantSummary];
  createdAt: string;
  lastMessage?: ChatMessage;
  /** Viewer-specific unread projection from the server read cursor. */
  unreadCount?: number;
  lastReadAt?: string;
  partnerReceipts?: ChatPartnerReceipts;
}

export interface ChatThreadList {
  userId: string;
  threads: ChatThread[];
  nextCursor?: string | null;
  append?: boolean;
}

export interface ChatThreadRead { userId: string; threadId: string; readAt: string; }

export interface ChatMessageList {
  userId: string;
  threadId: string;
  messages: ChatMessage[];
  partnerReceipts?: ChatPartnerReceipts;
}

/**
 * `chat.receipt_updated` (2026-10-01): `userId`'s cursor in the thread moved.
 * Sent only to the other participant. A missing field did not change or is
 * not disclosed to this recipient.
 */
export interface ChatReceiptUpdated {
  threadId: string;
  userId: string;
  participantUserIds: [string, string];
  deliveredUpTo?: ChatReceiptCursor;
  readUpTo?: ChatReceiptCursor;
}

/**
 * `chat.ack_delivered` (2026-10-01): the sending device holds every partner
 * message up to and including `upToMessageId`. Cumulative, so a dropped ack
 * is covered by the next one.
 */
export interface ChatAckDeliveredCommand {
  threadId: string;
  upToMessageId: string;
}

/** Per-account chat privacy settings. Read receipts are off by default. */
export interface ChatPreferences {
  readReceiptsEnabled: boolean;
}

export interface ChatListThreadsCommand { cursor?: string; limit?: number; }

export interface ChatListMessagesCommand {
  threadId: string;
}

export interface ChatSendMessageCommand {
  threadId: string;
  body: string;
  /**
   * Optional retry id (2026-09-30). The server deduplicates by it, like the
   * HTTP send, and acknowledges to the requesting socket with the same id.
   */
  clientMessageId?: string;
}

/** A received message; `clientMessageId` only on the sender's own acknowledgement. */
export type ChatMessageReceived = ChatMessage & { clientMessageId?: string };
