import { randomUUID } from "node:crypto"
import type { ChatMessage, ChatReceiptCursor, ChatThread } from "@blumi/contracts"
import {
  cloneChatParticipant,
  createInMemoryChatRepository,
  type ChatMessagePageOptions,
  type ChatThreadMembers,
  type ChatThreadPage,
  type ChatRepository,
  type TestPersona
} from "./chatRepository"
import { PublicRequestError } from "../errors/publicRequestError"
import {
  assertPublicTextAllowed,
  containsControlCharacters
} from "../safety/publicTextFilter"
import { normalizeThreadPage, type ChatThreadPageOptions } from "./chatThreadPagination"

const MAX_MESSAGE_LENGTH = 500
const DEFAULT_MESSAGE_PAGE_LIMIT = 50
const MAX_MESSAGE_PAGE_LIMIT = 100
const CONVERSATION_NOT_AVAILABLE = "That conversation is not available."
// A thread page read tops up past hidden (blocked) threads so pages stay full
// and the cursor exact; this bounds the extra rounds for a user with many blocks.
const MAX_THREAD_PAGE_ROUNDS = 5

export interface ChatService {
  repository: ChatRepository
  listThreads(userId: string): Promise<ChatThread[]>
  listThreadsPage(userId: string, options?: ChatThreadPageOptions): Promise<ChatThreadPage>
  listMessages(
    userId: string,
    threadId: string,
    options?: Partial<ChatMessagePageOptions>
  ): Promise<ChatMessage[]>
  findIdempotentMessage(
    userId: string,
    threadId: string,
    body: string,
    clientMessageId: string
  ): Promise<ChatMessage | null>
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
  /**
   * `sendMessageIdempotently` for a thread the caller already loaded (the
   * delivery service), so the send path reads the thread once. Participants
   * never change after creation, which makes the loaded copy authoritative.
   */
  sendMessageInThread(
    thread: ChatThreadMembers,
    userId: string,
    body: string,
    clientMessageId?: string,
    now?: Date
  ): Promise<{ message: ChatMessage; created: boolean }>
  /**
   * The send as one repository statement (participant, block, idempotency,
   * preview and leased outbox job). Answers `stepwise` when the caller must
   * take the stepwise path instead: invalid input (so its errors keep their
   * precedence behind the conversation and block checks) or a concurrent
   * first send of the same client message ID.
   */
  sendMessageChecked(input: {
    userId: string
    threadId: string
    body: string
    clientMessageId?: string
    leaseMs: number
    now?: Date
  }): Promise<ChatCheckedSend>
  createThread(input: CreateThreadInput, now?: Date): Promise<ChatThread>
  /** Unread partner messages in the threads `userId` can see (blocked pairs are hidden). */
  countUnreadMessages(userId: string): Promise<number>
  /**
   * Moves the reader's cursor forward: to `upToMessageId` (a partner message
   * in this thread) or, without it, to `now`. `readUpTo` is the receipt
   * cursor when receipts are stored and it moved.
   */
  markThreadRead(
    userId: string,
    threadId: string,
    now?: Date,
    options?: { upToMessageId?: string }
  ): Promise<ChatMarkReadResult>
}

export type ChatCheckedSend =
  | { kind: "stepwise" }
  | { kind: "blocked" }
  /** A committed retry while blocked: answered, never delivered again. */
  | { kind: "answered"; message: ChatMessage }
  | {
      kind: "sent"
      message: ChatMessage
      created: boolean
      members: ChatThreadMembers
      /** The leased outbox job of a created message; a retry is dispatched by claim. */
      job?: { leaseToken: string; attempt: number }
      recipientPersonas?: TestPersona[]
    }

export interface ChatMarkReadResult {
  readAt: string
  readUpTo?: ChatReceiptCursor
  participantUserIds: [string, string]
}

export interface CreateThreadInput {
  threadId?: string
  miniRoomId: string
  participantUserIds: [string, string]
  participants: ChatThread["participants"]
}

export class ChatMessageIdempotencyConflictError extends PublicRequestError {
  readonly code = "CHAT_MESSAGE_IDEMPOTENCY_CONFLICT"

  constructor() {
    super("This message ID was already used with different content.")
    this.name = "ChatMessageIdempotencyConflictError"
  }
}

/** A read cursor must name a message the partner sent in this thread. */
export class ChatReadCursorError extends PublicRequestError {
  readonly code = "CHAT_READ_CURSOR_INVALID"

  constructor() {
    super("That message is not available.")
    this.name = "ChatReadCursorError"
  }
}

/**
 * Block lookups the chat service needs; `SafetyService` satisfies it. While a
 * block exists in either direction the pair's thread is hidden from both users
 * (owner decision 2026-09-30). Nothing is deleted, so removing the block
 * restores the thread with its history. Sends are refused by the delivery
 * service, which checks blocks before persisting.
 */
export interface ChatBlockPolicy {
  listBlockedUserIdsBetween(viewerUserId: string, candidateUserIds: readonly string[]): Promise<string[]>
  hasBlockBetween(userAId: string, userBId: string): Promise<boolean>
}

export interface CreateChatServiceOptions {
  repository?: ChatRepository
  idFactory?: () => string
  blockPolicy?: ChatBlockPolicy
}

export function createChatService(
  options: CreateChatServiceOptions = {}
): ChatService {
  const blockPolicy = options.blockPolicy
  const repository = options.repository ?? createInMemoryChatRepository(undefined, { blockSource: blockPolicy })
  const idFactory = options.idFactory ?? createMessageId

  const getVisibleThread = async (userId: string, threadId: string): Promise<ChatThread> => {
    const thread = await getParticipantThread(repository, userId, threadId)
    const partnerUserId = thread.participantUserIds.find((id) => id !== userId)
    if (blockPolicy && partnerUserId && await blockPolicy.hasBlockBetween(userId, partnerUserId)) {
      // Same answer as a thread the caller is not in.
      throw new PublicRequestError(CONVERSATION_NOT_AVAILABLE)
    }
    return thread
  }

  const listVisibleThreadsPage = async (
    userId: string,
    pageOptions?: ChatThreadPageOptions
  ): Promise<ChatThreadPage> => {
    const first = await repository.listThreadsPage(userId, pageOptions)
    if (!blockPolicy) return first
    const { limit } = normalizeThreadPage(userId, pageOptions)
    const threads: ChatThread[] = []
    let page = first
    for (let round = 1; ; round += 1) {
      threads.push(...await withoutBlockedPartners(blockPolicy, userId, page.threads))
      if (!page.nextCursor || threads.length >= limit || round >= MAX_THREAD_PAGE_ROUNDS) {
        return { threads, nextCursor: page.nextCursor }
      }
      page = await repository.listThreadsPage(userId, {
        cursor: page.nextCursor,
        limit: limit - threads.length
      })
    }
  }

  return {
    repository,
    async listThreads(userId) {
      const threads = await repository.listThreads(userId)
      return blockPolicy ? withoutBlockedPartners(blockPolicy, userId, threads) : threads
    },
    async listThreadsPage(userId, options) { return listVisibleThreadsPage(userId, options) },
    async listMessages(userId, threadId, options = {}) {
      const thread = await getVisibleThread(userId, threadId)
      return repository.listMessages(thread.threadId, normalizePageOptions(options))
    },
    async findIdempotentMessage(userId, threadId, body, clientMessageId) {
      const thread = await getParticipantThread(repository, userId, threadId)
      const normalizedClientMessageId = normalizeClientMessageId(clientMessageId)
      if (!normalizedClientMessageId) return null
      const existing = await repository.findMessageByClientMessageId(
        thread.threadId,
        userId,
        normalizedClientMessageId
      )
      if (!existing) return null
      if (existing.body !== normalizeMessageBody(body)) {
        throw new ChatMessageIdempotencyConflictError()
      }
      return existing
    },
    async sendMessage(userId, threadId, body, now = new Date()) {
      return (await sendMessageIdempotently(repository, idFactory, userId, threadId, body, undefined, now)).message
    },
    async sendMessageIdempotently(userId, threadId, body, clientMessageId, now = new Date()) {
      return sendMessageIdempotently(repository, idFactory, userId, threadId, body, clientMessageId, now)
    },
    async sendMessageInThread(thread, userId, body, clientMessageId, now = new Date()) {
      if (!thread.participantUserIds.includes(userId)) {
        throw new PublicRequestError(CONVERSATION_NOT_AVAILABLE)
      }
      return persistMessage(repository, idFactory, thread, userId, body, clientMessageId, now)
    },
    async sendMessageChecked({ userId, threadId, body, clientMessageId, leaseMs, now = new Date() }) {
      let normalizedBody: string
      let normalizedClientMessageId: string | undefined
      try {
        normalizedBody = normalizeMessageBody(body)
        normalizedClientMessageId = normalizeClientMessageId(clientMessageId)
      } catch {
        return { kind: "stepwise" }
      }
      const result = await repository.sendMessageChecked({
        message: { messageId: idFactory(), threadId, senderUserId: userId, body: normalizedBody, sentAt: now.toISOString() },
        ...(normalizedClientMessageId ? { clientMessageId: normalizedClientMessageId } : {}),
        leaseUntil: new Date(now.getTime() + leaseMs)
      })
      switch (result.outcome) {
        case "unavailable":
          throw new PublicRequestError(CONVERSATION_NOT_AVAILABLE)
        case "raced":
          return { kind: "stepwise" }
        case "blocked":
          if (!result.retryOf) return { kind: "blocked" }
          if (result.retryOf.body !== normalizedBody) throw new ChatMessageIdempotencyConflictError()
          return { kind: "answered", message: result.retryOf }
        case "retried":
          if (result.idempotencyConflict) throw new ChatMessageIdempotencyConflictError()
          return { kind: "sent", message: result.message, created: false,
            members: { threadId, participantUserIds: result.participantUserIds } }
        case "created":
          return { kind: "sent", message: result.message, created: true,
            members: { threadId, participantUserIds: result.participantUserIds },
            job: result.job, recipientPersonas: result.recipientPersonas }
      }
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
      return (await repository.findThread(thread.threadId)) ?? thread
    },
    async countUnreadMessages(userId) {
      const counts = await repository.countUnreadMessagesBySender(userId)
      const blocked = blockPolicy && counts.length > 0
        ? new Set(await blockPolicy.listBlockedUserIdsBetween(userId, counts.map((entry) => entry.senderUserId)))
        : new Set<string>()
      return counts.reduce((total, entry) => blocked.has(entry.senderUserId) ? total : total + entry.unreadCount, 0)
    },
    async markThreadRead(userId, threadId, now = new Date(), options = {}) {
      const thread = await getVisibleThread(userId, threadId)
      const upToMessageId = options.upToMessageId?.trim()
      const advanced = await repository.advanceReadCursor(upToMessageId
        ? { threadId: thread.threadId, userId, upToMessageId }
        : { threadId: thread.threadId, userId, readAt: now.toISOString() })
      if (!advanced) {
        if (upToMessageId) throw new ChatReadCursorError()
        throw new PublicRequestError(CONVERSATION_NOT_AVAILABLE)
      }
      return {
        readAt: advanced.readAt,
        ...(advanced.readUpTo ? { readUpTo: advanced.readUpTo } : {}),
        participantUserIds: [...thread.participantUserIds] as [string, string]
      }
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
    throw new PublicRequestError(CONVERSATION_NOT_AVAILABLE)
  }
  return thread
}

/** Drops threads whose partner has a block with `userId`: one batched block query (no N+1). */
async function withoutBlockedPartners(
  blockPolicy: ChatBlockPolicy,
  userId: string,
  threads: ChatThread[]
): Promise<ChatThread[]> {
  const partnerOf = (thread: ChatThread) => thread.participantUserIds.find((id) => id !== userId)
  const partnerUserIds = [...new Set(threads.flatMap((thread) => partnerOf(thread) ?? []))]
  if (partnerUserIds.length === 0) return threads
  const blocked = new Set(await blockPolicy.listBlockedUserIdsBetween(userId, partnerUserIds))
  if (blocked.size === 0) return threads
  return threads.filter((thread) => !blocked.has(partnerOf(thread) ?? ""))
}

function normalizeMessageBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ")
  if (!trimmed) {
    throw new PublicRequestError("Write a message first.")
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new PublicRequestError("Keep messages under 500 characters.")
  }
  if (containsControlCharacters(trimmed)) {
    throw new PublicRequestError("Remove unsupported characters from your message.")
  }
  assertPublicTextAllowed(trimmed)
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
  return persistMessage(repository, idFactory, thread, userId, body, clientMessageId, now)
}

async function persistMessage(
  repository: ChatRepository,
  idFactory: () => string,
  thread: ChatThreadMembers,
  userId: string,
  body: string,
  clientMessageId: string | undefined,
  now: Date
): Promise<{ message: ChatMessage; created: boolean }> {
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
  if (persisted.idempotencyConflict) {
    throw new ChatMessageIdempotencyConflictError()
  }
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
