import type { PushNotification } from "./pushProvider"
import type { PushLocale } from "./pushMessagePolicy"

/**
 * The recipient's app language as recorded with their terms acceptance at
 * registration (`en` or `tr`). Later in-app language changes are not stored
 * server-side, so this is the best signal the server has without a migration.
 */
export function createRecipientLocaleResolver(accounts: {
  findAccountByUserId(userId: string): Promise<{ acceptedTerms?: { locale: PushLocale } } | null>
}): (userId: string) => Promise<PushLocale | undefined> {
  return async (userId) => {
    const locale = (await accounts.findAccountByUserId(userId))?.acceptedTerms?.locale
    return locale === "tr" || locale === "en" ? locale : undefined
  }
}

export interface NotificationRelevanceDependencies {
  /** False for banned, suspended or deleted accounts. */
  isUserAllowed(userId: string, now: Date): Promise<boolean>
  hasBlockBetween(userAId: string, userBId: string): Promise<boolean>
  findThread(threadId: string): Promise<{ participantUserIds: readonly string[] } | null>
  findRoomInvite(inviteId: string): Promise<{
    status: string
    expiresAt?: string
    senderUserId: string
    recipientUserId: string
  } | null>
  /**
   * Whether `userId` still has unread messages from any of `senderUserIds`.
   * False means every message from them was read, so a chat message push
   * would announce something already seen (the conversation was open).
   */
  hasUnreadMessagesFrom?(userId: string, senderUserIds: readonly string[]): Promise<boolean>
}

/**
 * A chat message push waits this long before its first send. The open chat
 * marks a message read about half a second after it arrives over the socket;
 * the outbox worker runs every second. Together this keeps a push from ever
 * reaching the phone of someone who is looking at that conversation.
 */
export const CHAT_MESSAGE_PUSH_HOLD_MS = 1_500

/**
 * Production wiring for the notification service. `services` is read lazily
 * because the notification service is created before the services it asks.
 */
export function createNotificationDeliveryHooks(services: () => {
  authService: {
    repository: Parameters<typeof createRecipientLocaleResolver>[0]
    isRealtimeUserAllowed(userId: string, now?: Date): Promise<boolean>
  }
  chatService: {
    repository: Pick<NotificationRelevanceDependencies, "findThread"> & {
      countUnreadMessagesBySender(userId: string): Promise<Array<{ senderUserId: string; unreadCount: number }>>
    }
    countUnreadMessages(userId: string): Promise<number>
  }
  safetyService: Pick<NotificationRelevanceDependencies, "hasBlockBetween">
  miniRoomService: { repository: { findInvite: NotificationRelevanceDependencies["findRoomInvite"] } }
}): {
  resolveRecipientLocale: (userId: string) => Promise<PushLocale | undefined>
  resolveRecipientBadge: (userId: string) => Promise<number>
  isDeliveryCurrent: ReturnType<typeof createNotificationRelevanceCheck>
  chatMessagePushHoldMs: number
} {
  return {
    chatMessagePushHoldMs: CHAT_MESSAGE_PUSH_HOLD_MS,
    resolveRecipientLocale: (userId) => createRecipientLocaleResolver(services().authService.repository)(userId),
    resolveRecipientBadge: (userId) => services().chatService.countUnreadMessages(userId),
    isDeliveryCurrent: createNotificationRelevanceCheck({
      isUserAllowed: (userId, now) => services().authService.isRealtimeUserAllowed(userId, now),
      hasBlockBetween: (userAId, userBId) => services().safetyService.hasBlockBetween(userAId, userBId),
      findThread: (threadId) => services().chatService.repository.findThread(threadId),
      findRoomInvite: (inviteId) => services().miniRoomService.repository.findInvite(inviteId),
      hasUnreadMessagesFrom: async (userId, senderUserIds) => {
        const counts = await services().chatService.repository.countUnreadMessagesBySender(userId)
        return counts.some((entry) => entry.unreadCount > 0 && senderUserIds.includes(entry.senderUserId))
      }
    })
  }
}

/**
 * Whether a queued push still describes something the recipient can act on.
 * Checked right before each provider attempt, so a block, ban, deletion or an
 * answered invite also stops retries that were queued before it happened.
 */
export function createNotificationRelevanceCheck(
  dependencies: NotificationRelevanceDependencies
): (delivery: { userId: string; notification: PushNotification }, now: Date) => Promise<boolean> {
  const notBlockedWith = async (userId: string, otherUserId: string | undefined) =>
    !otherUserId || otherUserId === userId || !(await dependencies.hasBlockBetween(userId, otherUserId))

  return async ({ userId, notification }, now) => {
    if (!(await dependencies.isUserAllowed(userId, now))) return false
    const data = notification.data ?? {}
    switch (data.type) {
      case "chat.message":
      case "chat.room_invite": {
        if (data.threadId) {
          const thread = await dependencies.findThread(data.threadId)
          if (!thread?.participantUserIds.includes(userId)) return false
          const partners = thread.participantUserIds.filter((id) => id !== userId)
          const clear = await Promise.all(partners.map((partnerId) => notBlockedWith(userId, partnerId)))
          if (!clear.every(Boolean)) return false
          // Read already (the conversation was open): the banner would only repeat it.
          if (data.type === "chat.message" && dependencies.hasUnreadMessagesFrom &&
            !(await dependencies.hasUnreadMessagesFrom(userId, partners))) return false
        }
        if (data.type === "chat.room_invite" && data.inviteId) {
          const invite = await dependencies.findRoomInvite(data.inviteId)
          if (!invite || invite.recipientUserId !== userId || invite.status !== "pending") return false
          if (invite.expiresAt && Date.parse(invite.expiresAt) <= now.getTime()) return false
          return notBlockedWith(userId, invite.senderUserId)
        }
        return true
      }
      case "discovery.like":
        return notBlockedWith(userId, data.sourceUserId)
      case "discovery.match":
        return notBlockedWith(userId, data.partnerUserId)
      case "discovery.watch_match":
        return notBlockedWith(userId, data.profileId)
      default:
        return true
    }
  }
}
