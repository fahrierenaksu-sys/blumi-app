import type { NotificationService } from "./notificationService"

const DEFAULT_INTERVAL_MS = 1_000

export interface NotificationOutboxWorker {
  stop(): Promise<void>
}

/**
 * A deliberately small process worker: PostgreSQL owns the queue and leasing,
 * so several HTTP/realtime instances may run this safely.  Failures remain in
 * the durable outbox for the next interval rather than being silently lost.
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
  const run = () => {
    if (stopped || running) return
    running = options.notificationService.dispatchDue()
      .catch((error) => { options.reportError?.(error) })
      .finally(() => { running = null })
  }
  const timer = setInterval(() => { void run() }, intervalMs)
  timer.unref()
  void run()
  return {
    async stop() {
      stopped = true
      clearInterval(timer)
      await running
    }
  }
}
