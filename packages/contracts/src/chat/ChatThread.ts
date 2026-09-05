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
}

export interface ChatListThreadsCommand { cursor?: string; limit?: number; }

export interface ChatListMessagesCommand {
  threadId: string;
}

export interface ChatSendMessageCommand {
  threadId: string;
  body: string;
}
