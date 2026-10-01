import type { ChatMessage, ChatPreferences, ChatReceiptCursor, ChatThread } from "@blumi/contracts"
import { compareChatMessagePositions } from "@blumi/domain"
import { randomUUID } from "node:crypto"
import { encodeThreadCursor, normalizeThreadPage, type ChatThreadPageOptions } from "./chatThreadPagination"

export interface ChatThreadPage { threads: ChatThread[]; nextCursor: string | null }

export interface ChatDeliveryJob {
  message: ChatMessage
  leaseToken: string
  attempt: number
}

export interface ChatMessagePageOptions {
  beforeMessageId?: string
  limit: number
}

export interface ChatMessageCreateResult {
  message: ChatMessage
  created: boolean
  idempotencyConflict?: true
}

export interface TestPersona {
  userId: string
  greeting: string
  replies: string[]
}

/** One participant's receipt cursors and privacy setting in one thread. */
export interface ChatReceiptParticipant {
  threadId: string
  userId: string
  deliveredUpTo?: ChatReceiptCursor
  readUpTo?: ChatReceiptCursor
  readReceiptsEnabled: boolean
}

export interface ChatDeliveredAdvance {
  partnerUserId: string
  deliveredUpTo: ChatReceiptCursor
}

export type ChatReadTarget =
  | { readAt: string; upToMessageId?: undefined }
  | { upToMessageId: string; readAt?: undefined }

export interface ChatReadAdvance {
  /** The stored unread cursor afterwards (what `chat.thread_read` reports). */
  readAt: string
  /** The receipt read cursor, only when receipts are supported and it moved. */
  readUpTo?: ChatReceiptCursor
}

export const DEFAULT_CHAT_PREFERENCES: Readonly<ChatPreferences> = Object.freeze({
  readReceiptsEnabled: false
})

export interface ChatRepository {
  findTestPersona(userId: string): Promise<TestPersona | null>
  listThreads(userId: string): Promise<ChatThread[]>
  listThreadsPage(userId: string, options?: ChatThreadPageOptions): Promise<ChatThreadPage>
  findThread(threadId: string): Promise<ChatThread | null>
  findExistingThreadIds(threadIds: readonly string[]): Promise<Set<string>>
  saveThread(thread: ChatThread): Promise<void>
  listMessages(
    threadId: string,
    options?: ChatMessagePageOptions
  ): Promise<ChatMessage[]>
  findMessageByClientMessageId(
    threadId: string,
    senderUserId: string,
    clientMessageId: string
  ): Promise<ChatMessage | null>
  createMessage(
    message: ChatMessage,
    clientMessageId?: string
  ): Promise<ChatMessageCreateResult>
  updateThreadLastMessage(threadId: string, message: ChatMessage): Promise<void>
  /**
   * Moves the reader's unread cursor forward, never back. With
   * `upToMessageId` the cursor is that partner message's position; null
   * means the message is not the partner's in this thread (or the user is
   * not a participant). Works before migration 070; `readUpTo` is reported
   * only after it.
   */
  advanceReadCursor(input: { threadId: string; userId: string } & ChatReadTarget): Promise<ChatReadAdvance | null>
  claimDeliveries(input: { now: Date; limit: number; leaseMs: number; messageId?: string }): Promise<ChatDeliveryJob[]>
  completeDelivery(messageId: string, leaseToken: string, now: Date): Promise<void>
  retryDelivery(messageId: string, leaseToken: string, availableAt: Date): Promise<void>
  /**
   * False until migration 070 is applied. Before that the receipt methods
   * below touch no 070 object and answer null, [] or the defaults.
   */
  supportsReceipts(): Promise<boolean>
  /**
   * Moves `userId`'s delivery cursor to the partner message `upToMessageId`
   * when that is later (atomic, monotonic). Null when nothing moved.
   */
  advanceDeliveredCursor(input: { threadId: string; userId: string; upToMessageId: string }): Promise<ChatDeliveredAdvance | null>
  /** Both participants of each thread with their cursors and read-receipt setting. */
  listReceiptParticipants(threadIds: readonly string[]): Promise<ChatReceiptParticipant[]>
  getChatPreferences(userId: string): Promise<ChatPreferences>
  saveChatPreferences(userId: string, preferences: ChatPreferences, now: Date): Promise<ChatPreferences>
}

interface InMemoryParticipantCursors {
  readAt?: string
  readMessageId?: string
  deliveredUpTo?: ChatReceiptCursor
}

export interface InMemoryChatStore {
  threads: Map<string, ChatThread>
  messagesByThread: Map<string, ChatMessage[]>
  messagesByClientMessageId: Map<string, ChatMessage>
  deliveryJobs: Map<string, { message: ChatMessage; availableAt: number; attempt: number; leaseToken?: string; completed?: boolean }>
  cursorsByParticipant: Map<string, InMemoryParticipantCursors>
  preferencesByUser: Map<string, ChatPreferences>
}

export function createInMemoryChatStore(): InMemoryChatStore {
  return {
    threads: new Map(),
    messagesByThread: new Map(),
    messagesByClientMessageId: new Map(),
    deliveryJobs: new Map(),
    cursorsByParticipant: new Map(),
    preferencesByUser: new Map()
  }
}

export function createInMemoryChatRepository(
  store: InMemoryChatStore = createInMemoryChatStore(),
  options: { receiptsSupported?: boolean } = {}
): ChatRepository {
  const receiptsSupported = options.receiptsSupported ?? true
  const cursorKey = (threadId: string, userId: string) => `${threadId}\0${userId}`
  const cursorsOf = (threadId: string, userId: string): InMemoryParticipantCursors =>
    store.cursorsByParticipant.get(cursorKey(threadId, userId)) ?? {}
  const isParticipant = (threadId: string, userId: string) =>
    store.threads.get(threadId)?.participantUserIds.includes(userId) === true
  const findPartnerMessage = (threadId: string, userId: string, messageId: string) =>
    (store.messagesByThread.get(threadId) ?? []).find((message) =>
      message.messageId === messageId && message.senderUserId !== userId)
  return {
    async findTestPersona() { return null },
    async listThreads(userId) {
      return (await this.listThreadsPage(userId)).threads
    },
    async listThreadsPage(userId, options) {
      const { limit, cursor } = normalizeThreadPage(userId, options)
      const candidates = [...store.threads.values()]
        .filter((thread) => thread.participantUserIds.includes(userId))
        .filter((thread) => !cursor || Date.parse(thread.createdAt) < Date.parse(cursor.createdAt) ||
          (Date.parse(thread.createdAt) === Date.parse(cursor.createdAt) && thread.threadId < cursor.threadId))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.threadId.localeCompare(a.threadId))
        .slice(0, limit + 1)
      const threads = candidates.slice(0, limit).map((thread) => {
          const lastReadAt = cursorsOf(thread.threadId, userId).readAt
          const unreadCount = (store.messagesByThread.get(thread.threadId) ?? [])
            .filter((message) => message.senderUserId !== userId && Date.parse(message.sentAt) > (lastReadAt ? Date.parse(lastReadAt) : -Infinity)).length
          return { ...cloneThread(thread), unreadCount, ...(lastReadAt ? { lastReadAt } : {}) }
        })
      const last = threads.at(-1)
      return { threads, nextCursor: candidates.length > limit && last ? encodeThreadCursor({ userId, createdAt: last.createdAt, threadId: last.threadId }) : null }
    },
    async findThread(threadId) {
      const thread = store.threads.get(threadId)
      return thread ? cloneThread(thread) : null
    },
    async findExistingThreadIds(threadIds) {
      return new Set(threadIds.filter((id) => store.threads.has(id)))
    },
    async saveThread(thread) {
      if (!store.threads.has(thread.threadId)) store.threads.set(thread.threadId, cloneThread(thread))
    },
    async listMessages(threadId, options) {
      const sorted = [...(store.messagesByThread.get(threadId) ?? [])]
        .sort(compareChatMessagesAscending)
      const beforeMessage = options?.beforeMessageId
        ? sorted.find((message) => message.messageId === options.beforeMessageId)
        : undefined
      const filtered = beforeMessage
        ? sorted.filter(
            (message) =>
              compareChatMessagesAscending(message, beforeMessage) < 0
          )
        : sorted
      const limited = options ? filtered.slice(-options.limit) : filtered
      return limited.map((message) => ({ ...message }))
    },
    async findMessageByClientMessageId(threadId, senderUserId, clientMessageId) {
      const key = messageIdempotencyKey(threadId, senderUserId, clientMessageId)
      const message = store.messagesByClientMessageId.get(key)
      return message ? { ...message } : null
    },
    async createMessage(message, clientMessageId) {
      const key = clientMessageId
        ? messageIdempotencyKey(message.threadId, message.senderUserId, clientMessageId)
        : undefined
      const existing = key ? store.messagesByClientMessageId.get(key) : undefined
      if (existing) {
        return {
          message: { ...existing },
          created: false,
          ...(existing.body !== message.body ? { idempotencyConflict: true as const } : {})
        }
      }
      const thread = store.threads.get(message.threadId)
      if (!thread) throw new Error("Chat thread is missing.")
      const messages = store.messagesByThread.get(message.threadId) ?? []
      store.messagesByThread.set(message.threadId, [
        ...messages.map((existing) => ({ ...existing })),
        { ...message }
      ])
      if (key) store.messagesByClientMessageId.set(key, { ...message })
      if (!thread.lastMessage || compareChatMessagesAscending(thread.lastMessage, message) <= 0) {
        store.threads.set(message.threadId, { ...cloneThread(thread), lastMessage: { ...message } })
      }
      store.deliveryJobs.set(message.messageId, {
        message: { ...message }, availableAt: Date.now(), attempt: 0
      })
      return { message: { ...message }, created: true }
    },
    async updateThreadLastMessage(threadId, message) {
      const thread = store.threads.get(threadId)
      if (!thread) return
      const currentSentAt = thread.lastMessage?.sentAt
      if (currentSentAt && Date.parse(currentSentAt) > Date.parse(message.sentAt)) return
      store.threads.set(threadId, {
        ...cloneThread(thread),
        lastMessage: { ...message }
      })
    },
    async advanceReadCursor(input) {
      if (!isParticipant(input.threadId, input.userId)) return null
      const target = input.upToMessageId === undefined
        ? { sentAt: input.readAt, messageId: undefined }
        : findPartnerMessage(input.threadId, input.userId, input.upToMessageId)
      if (!target) return null
      const key = cursorKey(input.threadId, input.userId)
      const current = cursorsOf(input.threadId, input.userId)
      const previousTime = current.readAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(current.readAt)
      const targetTime = Date.parse(target.sentAt)
      if (!receiptsSupported) {
        // Before 070 only the unread cursor exists: GREATEST(last_read_at, target).
        if (targetTime > previousTime) store.cursorsByParticipant.set(key, { ...current, readAt: target.sentAt })
        return { readAt: cursorsOf(input.threadId, input.userId).readAt! }
      }
      const advances = targetTime > previousTime || (targetTime === previousTime && current.readMessageId !== undefined &&
        (target.messageId === undefined || current.readMessageId < target.messageId))
      if (!advances) return { readAt: current.readAt! }
      store.cursorsByParticipant.set(key, { ...current, readAt: target.sentAt, readMessageId: target.messageId })
      return {
        readAt: target.sentAt,
        readUpTo: target.messageId === undefined
          ? { sentAt: target.sentAt }
          : { sentAt: target.sentAt, messageId: target.messageId }
      }
    },
    async claimDeliveries({ now, limit, leaseMs, messageId }) {
      const jobs = [...store.deliveryJobs.values()]
        .filter((job) => !job.completed && job.availableAt <= now.getTime() && (!messageId || job.message.messageId === messageId))
        .sort((left, right) => left.availableAt - right.availableAt)
        .slice(0, limit)
      return jobs.map((job) => {
        const next = { ...job, leaseToken: randomUUID(), attempt: job.attempt + 1, availableAt: now.getTime() + leaseMs }
        store.deliveryJobs.set(job.message.messageId, next)
        return { message: { ...next.message }, leaseToken: next.leaseToken, attempt: next.attempt }
      })
    },
    async completeDelivery(messageId, leaseToken) {
      const job = store.deliveryJobs.get(messageId)
      if (job?.leaseToken === leaseToken) store.deliveryJobs.set(messageId, { ...job, completed: true })
    },
    async retryDelivery(messageId, leaseToken, availableAt) {
      const job = store.deliveryJobs.get(messageId)
      if (job?.leaseToken === leaseToken) store.deliveryJobs.set(messageId, { ...job, availableAt: availableAt.getTime(), leaseToken: undefined })
    },
    async supportsReceipts() {
      return receiptsSupported
    },
    async advanceDeliveredCursor({ threadId, userId, upToMessageId }) {
      if (!receiptsSupported || !isParticipant(threadId, userId)) return null
      const target = findPartnerMessage(threadId, userId, upToMessageId)
      if (!target) return null
      const current = cursorsOf(threadId, userId)
      const previous = current.deliveredUpTo
      if (previous?.messageId !== undefined && compareChatMessagePositions(
        { sentAt: previous.sentAt, messageId: previous.messageId }, target) >= 0) return null
      const deliveredUpTo = { sentAt: target.sentAt, messageId: target.messageId }
      store.cursorsByParticipant.set(cursorKey(threadId, userId), { ...current, deliveredUpTo })
      return {
        partnerUserId: target.senderUserId,
        deliveredUpTo: { ...deliveredUpTo }
      }
    },
    async listReceiptParticipants(threadIds) {
      if (!receiptsSupported) return []
      return [...new Set(threadIds)].flatMap((threadId) => {
        const thread = store.threads.get(threadId)
        if (!thread) return []
        return thread.participantUserIds.map((userId): ChatReceiptParticipant => {
          const cursors = cursorsOf(threadId, userId)
          return {
            threadId,
            userId,
            ...(cursors.deliveredUpTo ? { deliveredUpTo: { ...cursors.deliveredUpTo } } : {}),
            ...(cursors.readAt
              ? { readUpTo: cursors.readMessageId === undefined
                  ? { sentAt: cursors.readAt }
                  : { sentAt: cursors.readAt, messageId: cursors.readMessageId } }
              : {}),
            readReceiptsEnabled: store.preferencesByUser.get(userId)?.readReceiptsEnabled ?? false
          }
        })
      })
    },
    async getChatPreferences(userId) {
      if (!receiptsSupported) return { ...DEFAULT_CHAT_PREFERENCES }
      return { ...(store.preferencesByUser.get(userId) ?? DEFAULT_CHAT_PREFERENCES) }
    },
    async saveChatPreferences(userId, preferences) {
      if (!receiptsSupported) throw new Error("Chat preferences need migration 070.")
      const saved = { readReceiptsEnabled: preferences.readReceiptsEnabled }
      store.preferencesByUser.set(userId, saved)
      return { ...saved }
    }
  }
}

function compareChatMessagesAscending(a: ChatMessage, b: ChatMessage): number {
  const timeDifference = Date.parse(a.sentAt) - Date.parse(b.sentAt)
  return timeDifference || a.messageId.localeCompare(b.messageId)
}

function messageIdempotencyKey(threadId: string, senderUserId: string, clientMessageId: string): string {
  return `${threadId}\u0000${senderUserId}\u0000${clientMessageId}`
}

export function cloneThread(thread: ChatThread): ChatThread {
  return {
    ...thread,
    participantUserIds: [...thread.participantUserIds] as [string, string],
    participants: [
      cloneChatParticipant(thread.participants[0]),
      cloneChatParticipant(thread.participants[1])
    ],
    lastMessage: thread.lastMessage ? { ...thread.lastMessage } : undefined
  }
}

export function cloneChatParticipant(
  participant: ChatThread["participants"][number]
): ChatThread["participants"][number] {
  return {
    ...participant,
    ...(participant.avatar
      ? {
          avatar: {
            ...participant.avatar,
            loadout: {
              ...participant.avatar.loadout,
              accessoryIds: [...participant.avatar.loadout.accessoryIds]
            }
          }
        }
      : {})
  }
}
