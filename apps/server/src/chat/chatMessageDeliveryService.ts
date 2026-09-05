import type { ChatMessage } from "@blumi/contracts"
import type { ChatService } from "./chatService"
import type { NotificationService } from "../notifications/notificationService"
import type { ConnectionManager } from "../realtime/connectionManager"
import type { SafetyService } from "../safety/safetyService"
import { PublicRequestError } from "../errors/publicRequestError"
import type { ChatDeliveryJob } from "./chatRepository"

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
}): ChatMessageDeliveryService {
  const {
    chatService,
    safetyService,
    connectionManager,
    notificationService
  } = options

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
        throw new ChatDeliveryBlockedError(
          "That conversation is not available anymore."
        )
      }

      const delivery = await chatService.sendMessageIdempotently(
        input.senderUserId,
        input.threadId,
        input.body,
        input.clientMessageId
      )
      // A crash or failure after persistence must not erase the delivery intent.
      // The periodic worker also picks up this durable job after restart.
      try { await dispatchDue(new Date(), delivery.message.messageId) }
      catch (error) { options.reportError?.(error) }
      return delivery
    }
  }

  async function dispatchDue(now: Date, messageId?: string): Promise<void> {
    const jobs = await chatService.repository.claimDeliveries({ now, limit: 50, leaseMs: 30_000, messageId })
    await Promise.all(jobs.map((job) => dispatchJob(job, now)))
  }

  async function dispatchJob(job: ChatDeliveryJob, now: Date): Promise<void> {
    const { message, leaseToken } = job
    try {
      const thread = await chatService.repository.findThread(message.threadId)
      if (!thread || !thread.participantUserIds.includes(message.senderUserId)) {
        await chatService.repository.completeDelivery(message.messageId, leaseToken, now)
        return
      }
      const recipients = thread.participantUserIds.filter((id) => id !== message.senderUserId)
      const blocked = await Promise.all(recipients.map((id) => safetyService.hasBlockBetween(message.senderUserId, id)))
      if (!blocked.some(Boolean)) {
        await connectionManager.sendToUsersDurably(thread.participantUserIds, { type: "chat.message_received", payload: message })
        await Promise.all(recipients.map(async (userId) => {
          if (connectionManager.hasUserConnections(userId)) return
          await notificationService.sendPushToUser(userId, {
            title: "Blumi", body: "You have a new message.",
            data: { type: "chat.message", threadId: message.threadId, messageId: message.messageId }
          })
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
