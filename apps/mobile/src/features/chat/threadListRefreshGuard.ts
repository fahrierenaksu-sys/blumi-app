/** Prevent an older HTTP snapshot from replacing a newer realtime thread list. */
export function createThreadListRefreshGuard() {
  let revision = 0
  return {
    beginHttpRefresh: (): number => ++revision,
    observeAuthoritativeThreadChange: (): void => { revision += 1 },
    isCurrentHttpRefresh: (requestRevision: number): boolean => requestRevision === revision
  }
}

/** Reconciliation repairs historical missing threads; it is not the Inbox read path. */
export function createMatchThreadSyncGate(intervalMs = 60_000) {
  let previousSession = ""
  let lastStartedAt = Number.NEGATIVE_INFINITY
  return {
    shouldStart(sessionKey: string, now: number): boolean {
      if (previousSession === sessionKey && now - lastStartedAt < intervalMs) return false
      previousSession = sessionKey
      lastStartedAt = now
      return true
    }
  }
}
