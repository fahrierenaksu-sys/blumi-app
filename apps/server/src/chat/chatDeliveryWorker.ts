import type { ChatMessageDeliveryService } from "./chatMessageDeliveryService"

export function startChatDeliveryWorker(options: {
  deliveryService: ChatMessageDeliveryService
  intervalMs?: number
  reportError?: (error: unknown) => void
}): { stop(): Promise<void> } {
  const intervalMs = options.intervalMs ?? 1000
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 250) throw new Error("Chat delivery interval must be at least 250ms.")
  let stopped = false
  let running: Promise<void> | undefined
  const run = () => {
    if (stopped || running) return
    running = Promise.resolve().then(() => options.deliveryService.dispatchDue())
      .catch((error) => { options.reportError?.(error) })
      .finally(() => { running = undefined })
  }
  const timer = setInterval(run, intervalMs)
  timer.unref()
  run()
  return { async stop() {
    stopped = true
    clearInterval(timer)
    await running
  } }
}
