import type { NotificationService } from "./notificationService"

const DEFAULT_INTERVAL_MS = 1_000

export interface NotificationOutboxWorker {
  stop(): Promise<void>
}

/**
 * A deliberately small process worker: PostgreSQL owns the queue and leasing,
 * so several HTTP/realtime instances may run this safely.  Failures remain in
 * the durable outbox for the next interval rather than being silently lost.
 * A newly queued push wakes it at once; the interval is the fallback that
 * picks up retries and work queued by another instance.
 */
export function startNotificationOutboxWorker(options: {
  notificationService: NotificationService
  intervalMs?: number
  reportError?: (error: unknown) => void
}): NotificationOutboxWorker {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 250) {
    throw new Error("Notification outbox worker interval must be at least 250ms.")
  }
  let stopped = false
  let running: Promise<void> | null = null
  // A wake-up during a cycle may arrive after that cycle claimed its batch,
  // so it owes exactly one follow-up cycle.
  let wakePending = false
  const run = () => {
    if (stopped || running) return
    wakePending = false
    running = options.notificationService.dispatchDue()
      .catch((error) => { options.reportError?.(error) })
      .finally(() => {
        running = null
        if (wakePending) run()
      })
  }
  const wake = () => {
    if (stopped) return
    if (running) wakePending = true
    else run()
  }
  const unsubscribe = options.notificationService.onDeliveriesQueued?.(wake)
  const timer = setInterval(() => { void run() }, intervalMs)
  timer.unref()
  void run()
  return {
    async stop() {
      stopped = true
      unsubscribe?.()
      clearInterval(timer)
      await running
    }
  }
}
