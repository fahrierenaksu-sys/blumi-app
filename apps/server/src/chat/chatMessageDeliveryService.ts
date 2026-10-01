import type { ChatMessage, ChatThread } from "@blumi/contracts"
import type { ChatService } from "./chatService"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { SafetyService } from "../safety/safetyService"
import { PublicRequestError } from "../errors/publicRequestError"
import type { ChatDeliveryJob } from "./chatRepository"
import { createChatLatencyDiagnostics, type ChatPhaseMeasure } from "./chatLatencyDiagnostics"

export class ChatDeliveryBlockedError extends PublicRequestError {}

export interface ChatMessageDeliveryService {
  dispatchDue(now?: Date): Promise<void>
  sendMessage(input: {
    senderUserId: string
    senderDisplayName?: string
    threadId: string
    body: string
    clientMessageId?: string
  }): Promise<{ message: ChatMessage; created: boolean }>
}

export function createChatMessageDeliveryService(options: {
  chatService: ChatService
  safetyService: SafetyService
  connectionManager: ConnectionManager
  notificationService: NotificationService
  reportError?: (error: unknown) => void
  measure?: ChatPhaseMeasure
}): ChatMessageDeliveryService {
  const {
    chatService,
    safetyService,
    connectionManager,
    notificationService
  } = options
  const measure = options.measure ?? createChatLatencyDiagnostics({
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    enabled: process.env.BLUMI_CHAT_LATENCY_DIAGNOSTICS === "1"
  })

  const dispatchPostPersistEffects = async (
    message: ChatMessage,
    thread: ChatThread,
    recipientUserIds: string[]
  ): Promise<void> => {
    const threadId = thread.threadId
    try {
      await dispatchDue(new Date(), message.messageId, thread)
    } catch (error) {
      options.reportError?.(error)
    }

    for (const recipientUserId of recipientUserIds) {
      try {
        const persona = await chatService.repository.findTestPersona(recipientUserId)
        if (!persona?.replies.length) continue
        const replyIndex = stableReplyIndex(message.messageId, persona.replies.length)
        const reply = await chatService.sendMessageInThread(
          thread,
          persona.userId,
          persona.replies[replyIndex]!,
          `test-persona-reply-${message.messageId}`
        )
        try { await dispatchDue(new Date(), reply.message.messageId, thread) }
        catch (error) { options.reportError?.(error) }
      } catch (error) {
        options.reportError?.(error)
      }
    }
  }

  return {
    async dispatchDue(now = new Date()) { await dispatchDue(now) },
    async sendMessage(input) {
      const thread = await chatService.repository.findThread(input.threadId)
      if (!thread || !thread.participantUserIds.includes(input.senderUserId)) {
        throw new PublicRequestError("That conversation is not available.")
      }

      const recipientUserIds = thread.participantUserIds.filter(
        (userId) => userId !== input.senderUserId
      )
      const blocked = await Promise.all(
        recipientUserIds.map((userId) =>
          safetyService.hasBlockBetween(input.senderUserId, userId)
        )
      )
      if (blocked.some(Boolean)) {
        const committedRetry = input.clientMessageId
          ? await chatService.findIdempotentMessage(
            input.senderUserId,
            input.threadId,
            input.body,
            input.clientMessageId
          )
          : null
        if (committedRetry) return { message: committedRetry, created: false }
        // Same message as a thread the sender is not in: a block hides the
        // thread from both users and must not be revealed by the answer.
        throw new ChatDeliveryBlockedError("That conversation is not available.")
      }

      // The thread read above is reused for persistence and the inline
      // dispatch (participants never change after creation), so a send reads
      // it once instead of three times. The block check at dispatch stays: it
      // guards a block that lands while the message is being persisted.
      const delivery = await measure("persist", () => chatService.sendMessageInThread(
        thread,
        input.senderUserId,
        input.body,
        input.clientMessageId
      ))
      // The persisted message plus durable outbox row is the send ACK. Push/realtime
      // fanout and synthetic test-persona replies must not delay that confirmation.
      // The periodic worker recovers the outbox if this process exits mid-dispatch.
      // Serialized per thread, in persist order, so a slower dispatch of an
      // earlier message is never overtaken by the next one (live order).
      void enqueueThreadDispatch(chatService, thread.threadId, () => dispatchPostPersistEffects(
        delivery.message,
        thread,
        recipientUserIds
      )).catch((error) => options.reportError?.(error))
      return delivery
    }
  }

  async function dispatchDue(now: Date, messageId?: string, knownThread?: ChatThread): Promise<void> {
    const jobs = await chatService.repository.claimDeliveries({ now, limit: 50, leaseMs: 30_000, messageId })
    await Promise.all(jobs.map((job) => dispatchJob(job, now, knownThread)))
  }

  async function dispatchJob(job: ChatDeliveryJob, now: Date, knownThread?: ChatThread): Promise<void> {
    const { message, leaseToken } = job
    try {
      const thread = knownThread?.threadId === message.threadId
        ? knownThread
        : await chatService.repository.findThread(message.threadId)
      if (!thread || !thread.participantUserIds.includes(message.senderUserId)) {
        await chatService.repository.completeDelivery(message.messageId, leaseToken, now)
        return
      }
      const recipients = thread.participantUserIds.filter((id) => id !== message.senderUserId)
      const blocked = await Promise.all(recipients.map((id) => safetyService.hasBlockBetween(message.senderUserId, id)))
      if (!blocked.some(Boolean)) {
        await measure("fanout", () => connectionManager.sendToUsersDurably(thread.participantUserIds, { type: "chat.message_received", payload: message }))
        await Promise.all(recipients.map(async (userId) => {
          await measure("push_enqueue", () => notificationService.sendPushToUser(userId, {
            title: "Blumi", body: "You have a new message.",
            data: { type: "chat.message", threadId: message.threadId, messageId: message.messageId }
          }))
        }))
      }
      await chatService.repository.completeDelivery(message.messageId, leaseToken, now)
    } catch (error) {
      options.reportError?.(error)
      const backoffMs = Math.min(60_000, 1000 * 2 ** Math.min(job.attempt - 1, 6))
      await chatService.repository.retryDelivery(message.messageId, leaseToken, new Date(now.getTime() + backoffMs))
    }
  }
}

/**
 * Inline post-persist dispatch chains, per chat service (the HTTP route and the
 * realtime router each build their own delivery service over the same chat
 * service) and per thread. The outbox worker stays independent: it only
 * recovers jobs this chain did not claim.
 */
const threadDispatchChains = new WeakMap<ChatService, Map<string, Promise<void>>>()

function enqueueThreadDispatch(chatService: ChatService, threadId: string, dispatch: () => Promise<void>): Promise<void> {
  let chains = threadDispatchChains.get(chatService)
  if (!chains) {
    chains = new Map()
    threadDispatchChains.set(chatService, chains)
  }
  const threadChains = chains
  const current = (threadChains.get(threadId) ?? Promise.resolve()).then(dispatch)
  const tail = current.catch(() => undefined)
  threadChains.set(threadId, tail)
  void tail.then(() => {
    if (threadChains.get(threadId) === tail) threadChains.delete(threadId)
  })
  return current
}

function stableReplyIndex(messageId: string, count: number): number {
  let hash = 0
  for (const character of messageId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return hash % count
}
