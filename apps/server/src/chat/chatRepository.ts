import type { ChatMessage, ChatThread } from "@blumi/contracts"
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

export interface ChatRepository {
  listThreads(userId: string): Promise<ChatThread[]>
  listThreadsPage(userId: string, options?: ChatThreadPageOptions): Promise<ChatThreadPage>
  findThread(threadId: string): Promise<ChatThread | null>
  saveThread(thread: ChatThread): Promise<void>
  listMessages(
    threadId: string,
    options?: ChatMessagePageOptions
  ): Promise<ChatMessage[]>
  createMessage(
    message: ChatMessage,
    clientMessageId?: string
  ): Promise<{ message: ChatMessage; created: boolean }>
  updateThreadLastMessage(threadId: string, message: ChatMessage): Promise<void>
  markThreadRead(threadId: string, userId: string, readAt: string): Promise<void>
  claimDeliveries(input: { now: Date; limit: number; leaseMs: number; messageId?: string }): Promise<ChatDeliveryJob[]>
  completeDelivery(messageId: string, leaseToken: string, now: Date): Promise<void>
  retryDelivery(messageId: string, leaseToken: string, availableAt: Date): Promise<void>
}

export interface InMemoryChatStore {
  threads: Map<string, ChatThread>
  messagesByThread: Map<string, ChatMessage[]>
  messagesByClientMessageId: Map<string, ChatMessage>
  deliveryJobs: Map<string, { message: ChatMessage; availableAt: number; attempt: number; leaseToken?: string; completed?: boolean }>
  readAtByParticipant: Map<string, string>
}

export function createInMemoryChatStore(): InMemoryChatStore {
  return {
    threads: new Map(),
    messagesByThread: new Map(),
    messagesByClientMessageId: new Map(),
    deliveryJobs: new Map(),
    readAtByParticipant: new Map()
  }
}

export function createInMemoryChatRepository(
  store: InMemoryChatStore = createInMemoryChatStore()
): ChatRepository {
  return {
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
          const lastReadAt = store.readAtByParticipant.get(`${thread.threadId}\0${userId}`)
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
    async saveThread(thread) {
      store.threads.set(thread.threadId, cloneThread(thread))
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
    async createMessage(message, clientMessageId) {
      const key = clientMessageId
        ? messageIdempotencyKey(message.threadId, message.senderUserId, clientMessageId)
        : undefined
      const existing = key ? store.messagesByClientMessageId.get(key) : undefined
      if (existing) return { message: { ...existing }, created: false }
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
    async markThreadRead(threadId, userId, readAt) {
      const key = `${threadId}\0${userId}`
      const previous = store.readAtByParticipant.get(key)
      if (!previous || Date.parse(previous) < Date.parse(readAt)) store.readAtByParticipant.set(key, readAt)
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
