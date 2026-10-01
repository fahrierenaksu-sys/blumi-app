/**
 * The app icon badge is the unread message total the app shows (the bottom
 * navigation chat badge). The server sets the same number on each push while
 * the app is closed; while it runs the phone sets it from the chat store.
 * Until the thread list has loaded the phone does not know the total, so it
 * leaves the server's badge alone instead of wiping it to zero. Sign-out and
 * account switch clear it in usePushRegistration's cleanup.
 *
 * No runtime imports: runs under plain Node tests.
 */
export type AppIconBadgeListStatus = "idle" | "loading" | "ready" | "failed"

export function resolveAppIconBadgeCount(input: {
  enabled: boolean
  listStatus: AppIconBadgeListStatus
  totalUnread: number
}): number | null {
  if (!input.enabled || input.listStatus !== "ready") return null
  return Number.isFinite(input.totalUnread) ? Math.max(0, Math.floor(input.totalUnread)) : null
}

export interface AppIconBadgeSync {
  /** Applies a known count once; repeats are skipped. */
  update(count: number | null): void
  /** Leaving the foreground re-applies the latest count even if unchanged. */
  appStateChanged(state: string): void
  dispose(): void
}

export function createAppIconBadgeSync(setBadgeCount: (count: number) => Promise<unknown>,
  reportError: (error: unknown) => void = () => {}): AppIconBadgeSync {
  let latest: number | null = null
  let applied: number | null = null
  let disposed = false
  const apply = (force: boolean): void => {
    if (disposed || latest === null || (!force && latest === applied)) return
    const count = latest
    applied = count
    void setBadgeCount(count).catch((error: unknown) => {
      if (applied === count) applied = null
      reportError(error)
    })
  }
  return {
    update(count) {
      latest = count
      apply(false)
    },
    appStateChanged(state) {
      // A push received in the background may have changed the OS badge.
      if (state === "active") applied = null
      if (state === "background") apply(true)
      else apply(false)
    },
    dispose() { disposed = true }
  }
}
