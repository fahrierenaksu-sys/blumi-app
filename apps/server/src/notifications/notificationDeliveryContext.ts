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
}

/**
 * Production wiring for the notification service. `services` is read lazily
 * because the notification service is created before the services it asks.
 */
export function createNotificationDeliveryHooks(services: () => {
  authService: {
    repository: Parameters<typeof createRecipientLocaleResolver>[0]
    isRealtimeUserAllowed(userId: string, now?: Date): Promise<boolean>
  }
  chatService: { repository: Pick<NotificationRelevanceDependencies, "findThread"> }
  safetyService: Pick<NotificationRelevanceDependencies, "hasBlockBetween">
  miniRoomService: { repository: { findInvite: NotificationRelevanceDependencies["findRoomInvite"] } }
}): {
  resolveRecipientLocale: (userId: string) => Promise<PushLocale | undefined>
  isDeliveryCurrent: ReturnType<typeof createNotificationRelevanceCheck>
} {
  return {
    resolveRecipientLocale: (userId) => createRecipientLocaleResolver(services().authService.repository)(userId),
    isDeliveryCurrent: createNotificationRelevanceCheck({
      isUserAllowed: (userId, now) => services().authService.isRealtimeUserAllowed(userId, now),
      hasBlockBetween: (userAId, userBId) => services().safetyService.hasBlockBetween(userAId, userBId),
      findThread: (threadId) => services().chatService.repository.findThread(threadId),
      findRoomInvite: (inviteId) => services().miniRoomService.repository.findInvite(inviteId)
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
