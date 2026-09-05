import { randomUUID } from "node:crypto"
import type { ChatMessage, ChatThread } from "@blumi/contracts"
import {
  cloneChatParticipant,
  createInMemoryChatRepository,
  type ChatMessagePageOptions,
  type ChatThreadPage,
  type ChatRepository
} from "./chatRepository"
import { PublicRequestError } from "../errors/publicRequestError"
import type { ChatThreadPageOptions } from "./chatThreadPagination"

const MAX_MESSAGE_LENGTH = 500
const DEFAULT_MESSAGE_PAGE_LIMIT = 50
const MAX_MESSAGE_PAGE_LIMIT = 100

export interface ChatService {
  repository: ChatRepository
  listThreads(userId: string): Promise<ChatThread[]>
  listThreadsPage(userId: string, options?: ChatThreadPageOptions): Promise<ChatThreadPage>
  listMessages(
    userId: string,
    threadId: string,
    options?: Partial<ChatMessagePageOptions>
  ): Promise<ChatMessage[]>
  sendMessage(
    userId: string,
    threadId: string,
    body: string,
    now?: Date
  ): Promise<ChatMessage>
  sendMessageIdempotently(
    userId: string,
    threadId: string,
    body: string,
    clientMessageId?: string,
    now?: Date
  ): Promise<{ message: ChatMessage; created: boolean }>
  createThread(input: CreateThreadInput, now?: Date): Promise<ChatThread>
  markThreadRead(userId: string, threadId: string, now?: Date): Promise<{ readAt: string }>
}

export interface CreateThreadInput {
  threadId?: string
  miniRoomId: string
  participantUserIds: [string, string]
  participants: ChatThread["participants"]
}

export interface CreateChatServiceOptions {
  repository?: ChatRepository
  idFactory?: () => string
}

export function createChatService(
  options: CreateChatServiceOptions = {}
): ChatService {
  const repository = options.repository ?? createInMemoryChatRepository()
  const idFactory = options.idFactory ?? createMessageId

  return {
    repository,
    async listThreads(userId) {
      return repository.listThreads(userId)
    },
    async listThreadsPage(userId, options) { return repository.listThreadsPage(userId, options) },
    async listMessages(userId, threadId, options = {}) {
      const thread = await getParticipantThread(repository, userId, threadId)
      return repository.listMessages(thread.threadId, normalizePageOptions(options))
    },
    async sendMessage(userId, threadId, body, now = new Date()) {
      return (await sendMessageIdempotently(repository, idFactory, userId, threadId, body, undefined, now)).message
    },
    async sendMessageIdempotently(userId, threadId, body, clientMessageId, now = new Date()) {
      return sendMessageIdempotently(repository, idFactory, userId, threadId, body, clientMessageId, now)
    },
    async createThread(input, now = new Date()) {
      const existing = input.threadId
        ? await repository.findThread(input.threadId)
        : null
      if (existing) return existing

      const thread: ChatThread = {
        threadId: input.threadId ?? `thread_${randomUUID()}`,
        miniRoomId: input.miniRoomId,
        participantUserIds: [...input.participantUserIds] as [string, string],
        participants: [
          cloneChatParticipant(input.participants[0]),
          cloneChatParticipant(input.participants[1])
        ],
        createdAt: now.toISOString()
      }
      await repository.saveThread(thread)
      return thread
    },
    async markThreadRead(userId, threadId, now = new Date()) {
      const thread = await getParticipantThread(repository, userId, threadId)
      const readAt = now.toISOString()
      await repository.markThreadRead(thread.threadId, userId, readAt)
      return { readAt }
    }
  }
}

async function getParticipantThread(
  repository: ChatRepository,
  userId: string,
  threadId: string
): Promise<ChatThread> {
  const thread = await repository.findThread(threadId)
  if (!thread || !thread.participantUserIds.includes(userId)) {
    throw new PublicRequestError("That conversation is not available.")
  }
  return thread
}

function normalizeMessageBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ")
  if (!trimmed) {
    throw new PublicRequestError("Write a message first.")
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new PublicRequestError("Keep messages under 500 characters.")
  }
  return trimmed
}

async function sendMessageIdempotently(
  repository: ChatRepository,
  idFactory: () => string,
  userId: string,
  threadId: string,
  body: string,
  clientMessageId: string | undefined,
  now: Date
): Promise<{ message: ChatMessage; created: boolean }> {
  const thread = await getParticipantThread(repository, userId, threadId)
  const normalizedBody = normalizeMessageBody(body)
  const normalizedClientMessageId = normalizeClientMessageId(clientMessageId)
  const message: ChatMessage = {
    messageId: idFactory(),
    threadId: thread.threadId,
    senderUserId: userId,
    body: normalizedBody,
    sentAt: now.toISOString()
  }
  const persisted = await repository.createMessage(message, normalizedClientMessageId)
  return persisted
}

function normalizeClientMessageId(clientMessageId: string | undefined): string | undefined {
  if (clientMessageId === undefined) return undefined
  const normalized = clientMessageId.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(normalized)) {
    throw new PublicRequestError("Message retry ID is invalid.")
  }
  return normalized
}

function createMessageId(): string {
  return `message_${randomUUID()}`
}

function normalizePageOptions(
  options: Partial<ChatMessagePageOptions>
): ChatMessagePageOptions {
  const requestedLimit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.floor(options.limit)
      : DEFAULT_MESSAGE_PAGE_LIMIT
  return {
    beforeMessageId:
      typeof options.beforeMessageId === "string" && options.beforeMessageId.trim()
        ? options.beforeMessageId.trim()
        : undefined,
    limit: Math.min(Math.max(requestedLimit, 1), MAX_MESSAGE_PAGE_LIMIT)
  }
}
