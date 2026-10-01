import type { PushNotification } from "./pushProvider"

/** A badge lookup must never hold a push back for long. */
const DEFAULT_BADGE_TIMEOUT_MS = 2_000
/** iOS shows any number; anything this large is a counting error, not a badge. */
const MAX_BADGE = 99_999

/**
 * Resolves the iOS app icon badge for a recipient at dispatch: the unread
 * message total the app itself shows (one cheap query). A failed, slow or
 * nonsensical answer leaves the badge out, so iOS keeps the current one and
 * the push is still sent.
 */
export function createPushBadgeResolver(
  countUnread: ((userId: string) => Promise<number | undefined>) | undefined,
  options: { timeoutMs?: number } = {}
): (userId: string) => Promise<number | undefined> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BADGE_TIMEOUT_MS
  return async (userId) => {
    if (!countUnread) return undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const count = await Promise.race([
        countUnread(userId),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs) })
      ])
      return Number.isSafeInteger(count) && count! >= 0 ? Math.min(count!, MAX_BADGE) : undefined
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }
}

export function withPushBadge(notification: PushNotification, badge: number | undefined): PushNotification {
  if (badge === undefined) return notification
  return { ...notification, delivery: { ...notification.delivery, badge } }
}
