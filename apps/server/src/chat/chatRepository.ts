import type { ChatMessage, ChatPreferences, ChatReceiptCursor, ChatThread } from "@blumi/contracts"
import { compareChatMessagePositions } from "@blumi/domain"
import { randomUUID } from "node:crypto"
import { encodeThreadCursor, normalizeThreadPage, type ChatThreadPageOptions } from "./chatThreadPagination"
import { withCurrentIdentity, type ChatParticipantProfileSource } from "./chatParticipantIdentity"

export interface ChatThreadPage { threads: ChatThread[]; nextCursor: string | null }

/** Lease token of a dead-lettered outbox job (completed_at is set too). */
export const CHAT_DELIVERY_DEAD_LETTER = "dead-letter"

export interface ChatDeliveryJob {
  message: ChatMessage
  leaseToken: string
  attempt: number
}

export interface ChatMessagePageOptions {
  beforeMessageId?: string
  limit: number
  /**
   * The reader. After migration 071, messages at or before the reader's
   * "delete chat for me" point (`hidden_through`) are left out.
   */
  viewerUserId?: string
}

export interface ChatHideTarget {
  threadId: string
  userId: string
  /** A message of this thread (either sender); default: the newest one. */
  throughMessageId?: string
}

export interface ChatHideResult {
  /** The stored hide point afterwards (never moves back). */
  hiddenThrough: string
  /** The stored unread cursor afterwards: hidden messages are never unread. */
  readAt: string
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

/** The part of a thread a send needs: participants never change after creation. */
export type ChatThreadMembers = Pick<ChatThread, "threadId" | "participantUserIds">

/** Block lookups the in-memory store consults; PostgreSQL reads blumi_safety_blocks. */
export interface ChatRepositoryBlockSource {
  hasBlockBetween(userAId: string, userBId: string): Promise<boolean>
}

export interface ChatCheckedSendInput {
  /** Already normalized (body) and with its final id and time. */
  message: ChatMessage
  /** Already normalized. */
  clientMessageId?: string
  /** A created message's outbox job is leased to the caller until then. */
  leaseUntil: Date
}

/**
 * The outcome of `sendMessageChecked`, decided atomically with the write:
 * - `unavailable`: no such thread, or the sender is not a participant.
 * - `blocked`: a block exists between the sender and another participant;
 *   nothing was written. `retryOf` is the sender's committed message with
 *   the same client message ID, if any.
 * - `created`: the message, its thread preview and its outbox job were
 *   written. The job is leased to the caller (`job`) unless an earlier
 *   message of the thread is still undelivered: then it waits unleased for
 *   a claim, which takes a thread's jobs in message order. `recipientPersonas`
 *   are the other participants' test personas (the delivery replies for them).
 * - `retried`: the client message ID was used before; the stored message is
 *   returned (`idempotencyConflict` when its body differs). A same-body retry
 *   repairs the preview and outbox exactly like `createMessage`.
 * - `raced`: a concurrent send with the same client message ID committed
 *   first, after this statement's snapshot; the caller retries stepwise.
 */
export type ChatCheckedSendResult =
  | { outcome: "unavailable" }
  | { outcome: "blocked"; retryOf?: ChatMessage }
  | {
      outcome: "created"
      message: ChatMessage
      participantUserIds: [string, string]
      job?: { leaseToken: string; attempt: number }
      recipientPersonas: TestPersona[]
    }
  | { outcome: "retried"; message: ChatMessage; participantUserIds: [string, string]; idempotencyConflict?: true }
  | { outcome: "raced" }

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
  /**
   * Everyone `userId` has a chat with, once each, in no guaranteed order
   * (one indexed read; blocks are the caller's to filter).
   */
  listChatPartnerUserIds(userId: string): Promise<string[]>
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
  /** One stored message of a thread (a push reads its sender and text at send time). */
  findMessage(threadId: string, messageId: string): Promise<ChatMessage | null>
  createMessage(
    message: ChatMessage,
    clientMessageId?: string
  ): Promise<ChatMessageCreateResult>
  /**
   * The whole send in one database round trip (2026-10-01): thread and
   * participant check, block check, idempotent insert, thread preview and
   * the outbox job, leased to the caller so its inline delivery needs no
   * claim. A thread whose participant rows are not exactly two throws, like
   * `findThread`.
   */
  sendMessageChecked(input: ChatCheckedSendInput): Promise<ChatCheckedSendResult>
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
  /** Extends a lease the caller still holds; false when it was lost (another dispatcher owns the job). */
  renewDeliveryLease(messageId: string, leaseToken: string, leaseUntil: Date): Promise<boolean>
  /**
   * Releases a held job until `availableAt`. `refundAttempt` gives back the
   * attempt its claim counted: a transient infrastructure failure (a busy
   * pool, a pooler refusal) is not the message's fault and must not move it
   * toward the dead letter.
   */
  retryDelivery(messageId: string, leaseToken: string, availableAt: Date, options?: { refundAttempt?: boolean }): Promise<void>
  /**
   * Gives up on a job the caller still leases: it becomes terminal like a
   * completed job (completed_at, no schema change) and is marked with the
   * lease token CHAT_DELIVERY_DEAD_LETTER, so later messages of the thread
   * are no longer held behind it. The message itself stays stored.
   */
  deadLetterDelivery(messageId: string, leaseToken: string, now: Date): Promise<void>
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
  /**
   * Unread partner messages per sender across `userId`'s threads, with the
   * same rule as `listThreadsPage().unreadCount` (after the reader's cursor).
   * Senders with nothing unread are left out. Feeds the push badge.
   */
  countUnreadMessagesBySender(userId: string): Promise<Array<{ senderUserId: string; unreadCount: number }>>
  saveChatPreferences(userId: string, preferences: ChatPreferences, now: Date): Promise<ChatPreferences>
  /**
   * False until migration 071 is applied. Before that no query names
   * `hidden_through`: thread lists carry no `hiddenThrough`, history shows
   * everything, and
   * `hideThreadForParticipant` must not be called.
   */
  supportsHide(): Promise<boolean>
  /**
   * "Delete chat for me": hides the thread from `userId` through the target
   * message's time (default: its newest message, or its creation when it has
   * none) and moves the unread cursor there. Both only move forward. The
   * thread stays in `userId`'s list with `hiddenThrough`, so links, room
   * invites and room chat still find it, and the app hides the row until a
   * later message arrives; their history starts after the hide point. The
   * partner sees no change.
   * Null when `userId` is not a participant or the message is not in this
   * thread. Throws before migration 071.
   */
  hideThreadForParticipant(input: ChatHideTarget): Promise<ChatHideResult | null>
}

interface InMemoryParticipantCursors {
  /** Unread cursor (last_read_at): unread counts and the push badge. */
  readAt?: string
  /**
   * Read receipt (last_read_message_id with its message's sent_at): moved
   * only by a read that names a partner message the reader was shown.
   */
  readUpTo?: { sentAt: string; messageId: string }
  deliveredUpTo?: ChatReceiptCursor
  /** "Delete chat for me" point (hidden_through, migration 071). */
  hiddenThrough?: string
}

export interface InMemoryChatStore {
  threads: Map<string, ChatThread>
  messagesByThread: Map<string, ChatMessage[]>
  messagesByClientMessageId: Map<string, ChatMessage>
  deliveryJobs: Map<string, { message: ChatMessage; availableAt: number; attempt: number; leaseToken?: string; completed?: boolean; deadLettered?: boolean }>
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
  options: {
    receiptsSupported?: boolean
    hideSupported?: boolean
    blockSource?: ChatRepositoryBlockSource
    /** Accounts' current names and outfits (PostgreSQL joins blumi_accounts instead). */
    profileSource?: ChatParticipantProfileSource
  } = {}
): ChatRepository {
  const receiptsSupported = options.receiptsSupported ?? true
  const hideSupported = options.hideSupported ?? true
  const blockSource = options.blockSource
  const profileSource = options.profileSource
  /** One batched account lookup for every participant of `threads`. */
  const withCurrentParticipants = async <Thread extends ChatThread>(threads: Thread[]): Promise<Thread[]> => {
    if (!profileSource || threads.length === 0) return threads
    const accounts = new Map((await profileSource([...new Set(threads.flatMap((thread) => thread.participantUserIds))]))
      .map((account) => [account.userId, account]))
    return threads.map((thread) => ({
      ...thread,
      participants: thread.participants.map((participant) =>
        withCurrentIdentity(participant, accounts.get(participant.userId))) as ChatThread["participants"]
    }))
  }
  const cursorKey = (threadId: string, userId: string) => `${threadId}\0${userId}`
  const cursorsOf = (threadId: string, userId: string): InMemoryParticipantCursors =>
    store.cursorsByParticipant.get(cursorKey(threadId, userId)) ?? {}
  const isParticipant = (threadId: string, userId: string) =>
    store.threads.get(threadId)?.participantUserIds.includes(userId) === true
  /** Message, preview and outbox job together, synchronously (one SQL statement's worth). */
  const insertMessage = (
    message: ChatMessage,
    key: string | undefined,
    job: { availableAt: number; attempt: number; leaseToken?: string }
  ) => {
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
    store.deliveryJobs.set(message.messageId, { message: { ...message }, ...job })
  }
  /** Whether `message` is after `userId`'s hide point (always, before 071). */
  const isShownTo = (userId: string | undefined, message: Pick<ChatMessage, "threadId" | "sentAt">) => {
    if (!hideSupported || userId === undefined) return true
    const hiddenThrough = cursorsOf(message.threadId, userId).hiddenThrough
    return hiddenThrough === undefined || Date.parse(message.sentAt) > Date.parse(hiddenThrough)
  }
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
      const threads = await withCurrentParticipants(candidates.slice(0, limit).map((thread) => {
          const { readAt: lastReadAt, hiddenThrough } = cursorsOf(thread.threadId, userId)
          const unreadCount = (store.messagesByThread.get(thread.threadId) ?? [])
            .filter((message) => message.senderUserId !== userId && Date.parse(message.sentAt) > (lastReadAt ? Date.parse(lastReadAt) : -Infinity)).length
          return {
            ...cloneThread(thread),
            unreadCount,
            ...(lastReadAt ? { lastReadAt } : {}),
            ...(hideSupported && hiddenThrough ? { hiddenThrough } : {})
          }
        }))
      const last = threads.at(-1)
      return { threads, nextCursor: candidates.length > limit && last ? encodeThreadCursor({ userId, createdAt: last.createdAt, threadId: last.threadId }) : null }
    },
    async findThread(threadId) {
      const thread = store.threads.get(threadId)
      return thread ? (await withCurrentParticipants([cloneThread(thread)]))[0]! : null
    },
    async findExistingThreadIds(threadIds) {
      return new Set(threadIds.filter((id) => store.threads.has(id)))
    },
    async listChatPartnerUserIds(userId) {
      return [...new Set([...store.threads.values()]
        .filter((thread) => thread.participantUserIds.includes(userId))
        .flatMap((thread) => thread.participantUserIds)
        .filter((id) => id !== userId))]
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
      const filtered = (beforeMessage
        ? sorted.filter(
            (message) =>
              compareChatMessagesAscending(message, beforeMessage) < 0
          )
        : sorted).filter((message) => isShownTo(options?.viewerUserId, message))
      const limited = options ? filtered.slice(-options.limit) : filtered
      return limited.map((message) => ({ ...message }))
    },
    async findMessageByClientMessageId(threadId, senderUserId, clientMessageId) {
      const key = messageIdempotencyKey(threadId, senderUserId, clientMessageId)
      const message = store.messagesByClientMessageId.get(key)
      return message ? { ...message } : null
    },
    async findMessage(threadId, messageId) {
      const message = store.messagesByThread.get(threadId)?.find((entry) => entry.messageId === messageId)
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
      insertMessage(message, key, { availableAt: Date.now(), attempt: 0 })
      return { message: { ...message }, created: true }
    },
    async sendMessageChecked({ message, clientMessageId, leaseUntil }) {
      const thread = store.threads.get(message.threadId)
      if (!thread || !thread.participantUserIds.includes(message.senderUserId)) return { outcome: "unavailable" }
      const participantUserIds = [...thread.participantUserIds] as [string, string]
      const partnerUserIds = participantUserIds.filter((userId) => userId !== message.senderUserId)
      const blocked = blockSource
        ? (await Promise.all(partnerUserIds.map((userId) => blockSource.hasBlockBetween(message.senderUserId, userId)))).some(Boolean)
        : false
      // Everything below is synchronous, so it is atomic like the SQL statement.
      const key = clientMessageId
        ? messageIdempotencyKey(message.threadId, message.senderUserId, clientMessageId)
        : undefined
      const prior = key ? store.messagesByClientMessageId.get(key) : undefined
      if (blocked) return prior ? { outcome: "blocked", retryOf: { ...prior } } : { outcome: "blocked" }
      if (prior) {
        return {
          outcome: "retried",
          message: { ...prior },
          participantUserIds,
          ...(prior.body !== message.body ? { idempotencyConflict: true as const } : {})
        }
      }
      // A job behind an undelivered message of the thread is not leased, so
      // it cannot overtake that message (claims keep the thread's order).
      const heldBack = [...store.deliveryJobs.values()].some((job) => !job.completed &&
        job.message.threadId === message.threadId && compareChatMessagePositions(job.message, message) < 0)
      const leaseToken = heldBack ? undefined : randomUUID()
      insertMessage(message, key, leaseToken
        ? { availableAt: leaseUntil.getTime(), attempt: 1, leaseToken }
        : { availableAt: Date.now(), attempt: 0 })
      const personas = await Promise.all(partnerUserIds.map((userId) => this.findTestPersona(userId)))
      return {
        outcome: "created",
        message: { ...message },
        participantUserIds,
        ...(leaseToken ? { job: { leaseToken, attempt: 1 } } : {}),
        recipientPersonas: personas.filter((persona): persona is TestPersona => persona !== null)
      }
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
      // The unread cursor: GREATEST(last_read_at, target), before and after 070.
      const readAt = targetTime > previousTime ? target.sentAt : current.readAt!
      // A read without a message never moves the read receipt: it may cover
      // a message whose sent_at precedes it but which was not shown. A read
      // while the reader has receipts off stores no receipt, so turning them
      // on later never reveals it (RECEIPTS_PRIVACY_DESIGN option A).
      const readerSharesReceipts = store.preferencesByUser.get(input.userId)?.readReceiptsEnabled === true
      if (!receiptsSupported || target.messageId === undefined || !readerSharesReceipts) {
        store.cursorsByParticipant.set(key, { ...current, readAt })
        return { readAt }
      }
      const receipt = { sentAt: target.sentAt, messageId: target.messageId }
      const advances = current.readUpTo === undefined || compareChatMessagePositions(current.readUpTo, receipt) < 0
      store.cursorsByParticipant.set(key, { ...current, readAt, ...(advances ? { readUpTo: receipt } : {}) })
      return advances ? { readAt, readUpTo: { ...receipt } } : { readAt }
    },
    async claimDeliveries({ now, limit, leaseMs, messageId }) {
      const undelivered = [...store.deliveryJobs.values()].filter((job) => !job.completed)
      const holdsBack = (job: (typeof undelivered)[number]) => undelivered.some((earlier) =>
        earlier.message.threadId === job.message.threadId &&
        compareChatMessagePositions(earlier.message, job.message) < 0)
      const jobs = undelivered
        .filter((job) => job.availableAt <= now.getTime() && (!messageId || job.message.messageId === messageId))
        .filter((job) => !holdsBack(job))
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
    async renewDeliveryLease(messageId, leaseToken, leaseUntil) {
      const job = store.deliveryJobs.get(messageId)
      if (job?.leaseToken !== leaseToken || job.completed) return false
      store.deliveryJobs.set(messageId, { ...job, availableAt: leaseUntil.getTime() })
      return true
    },
    async retryDelivery(messageId, leaseToken, availableAt, options) {
      const job = store.deliveryJobs.get(messageId)
      if (job?.leaseToken === leaseToken) store.deliveryJobs.set(messageId, {
        ...job, availableAt: availableAt.getTime(), leaseToken: undefined,
        attempt: options?.refundAttempt ? Math.max(job.attempt - 1, 0) : job.attempt
      })
    },
    async deadLetterDelivery(messageId, leaseToken) {
      const job = store.deliveryJobs.get(messageId)
      if (job?.leaseToken === leaseToken && !job.completed) {
        store.deliveryJobs.set(messageId, { ...job, completed: true, deadLettered: true, leaseToken: CHAT_DELIVERY_DEAD_LETTER })
      }
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
            ...(cursors.readUpTo
              ? { readUpTo: { ...cursors.readUpTo } }
              : {}),
            readReceiptsEnabled: store.preferencesByUser.get(userId)?.readReceiptsEnabled ?? false
          }
        })
      })
    },
    async countUnreadMessagesBySender(userId) {
      const counts = new Map<string, number>()
      for (const thread of store.threads.values()) {
        if (!thread.participantUserIds.includes(userId)) continue
        const readAt = cursorsOf(thread.threadId, userId).readAt
        const after = readAt ? Date.parse(readAt) : Number.NEGATIVE_INFINITY
        for (const message of store.messagesByThread.get(thread.threadId) ?? []) {
          if (message.senderUserId === userId || Date.parse(message.sentAt) <= after) continue
          counts.set(message.senderUserId, (counts.get(message.senderUserId) ?? 0) + 1)
        }
      }
      return [...counts].map(([senderUserId, unreadCount]) => ({ senderUserId, unreadCount }))
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
    },
    async supportsHide() {
      return hideSupported
    },
    async hideThreadForParticipant({ threadId, userId, throughMessageId }) {
      if (!hideSupported) throw new Error("Hiding a chat needs migration 071.")
      const thread = store.threads.get(threadId)
      if (!thread || !thread.participantUserIds.includes(userId)) return null
      const messages = store.messagesByThread.get(threadId) ?? []
      const through = throughMessageId === undefined
        ? latestTime(messages.map((message) => message.sentAt)) ?? thread.createdAt
        : messages.find((message) => message.messageId === throughMessageId)?.sentAt
      if (through === undefined) return null
      const current = cursorsOf(threadId, userId)
      const hiddenThrough = latestTime([current.hiddenThrough, through])!
      const readAt = latestTime([current.readAt, through])!
      store.cursorsByParticipant.set(cursorKey(threadId, userId), { ...current, hiddenThrough, readAt })
      return { hiddenThrough, readAt }
    }
  }
}

/** The latest of the given instants (PostgreSQL GREATEST: missing values are ignored). */
function latestTime(values: ReadonlyArray<string | undefined>): string | undefined {
  let latest: string | undefined
  for (const value of values) {
    if (value !== undefined && (latest === undefined || Date.parse(value) > Date.parse(latest))) latest = value
  }
  return latest
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
