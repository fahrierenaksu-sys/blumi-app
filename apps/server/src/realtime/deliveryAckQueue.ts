import type { ChatAckDeliveredCommand } from "@blumi/contracts"

/**
 * `chat.ack_delivered` processing (2026-10-01).
 *
 * Acks are cumulative per thread, so only the newest one of each thread
 * matters. The client flushes one ack per thread in a burst; the previous
 * admission kept two in flight per socket and dropped the rest, so every
 * thread after the second lost its ✓✓ until a newer message arrived.
 *
 * Each socket now keeps a small map, thread → newest ack, and processes it
 * one entry at a time in arrival order. A newer ack for a waiting thread
 * replaces the older one (latest wins). Processing is limited per user
 * (`processingLimit` per `windowMs`, all of the user's sockets together); over
 * the limit the waiting acks stay in the map and resume when the window rolls,
 * so the last ack of a thread is delayed, never silently dropped. The map is
 * bounded per socket; a socket that names more waiting threads than that is
 * not a real client, and the phone re-sends on its next reconnect.
 */
export const DELIVERY_ACK_PROCESSING_LIMIT = 30
export const DELIVERY_ACK_WINDOW_MS = 10_000
export const MAX_WAITING_ACK_THREADS_PER_CONNECTION = 256

export type DeliveryAckEnqueueResult = "queued" | "coalesced" | "full"

export interface DeliveryAckQueue {
  enqueue(input: { connectionId: string; userId: string; ack: ChatAckDeliveredCommand }): DeliveryAckEnqueueResult
  forgetConnection(connectionId: string): void
  purgeExpired(now?: number): void
  close(): void
}

interface ConnectionQueue {
  userId: string
  waiting: Map<string, ChatAckDeliveredCommand>
  draining: boolean
  resumeTimer?: unknown
}

export function createDeliveryAckQueue(options: {
  run(connectionId: string, ack: ChatAckDeliveredCommand): Promise<void>
  processingLimit?: number
  windowMs?: number
  maxThreadsPerConnection?: number
  now?: () => number
  schedule?: (callback: () => void, delayMs: number) => unknown
  cancel?: (handle: unknown) => void
}): DeliveryAckQueue {
  const processingLimit = options.processingLimit ?? DELIVERY_ACK_PROCESSING_LIMIT
  const windowMs = options.windowMs ?? DELIVERY_ACK_WINDOW_MS
  const maxThreads = options.maxThreadsPerConnection ?? MAX_WAITING_ACK_THREADS_PER_CONNECTION
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? ((callback, delayMs) => {
    const timer = setTimeout(callback, delayMs)
    timer.unref?.()
    return timer
  })
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const connections = new Map<string, ConnectionQueue>()
  const userWindows = new Map<string, { startedAt: number; count: number }>()
  let closed = false

  /** Takes one processing slot of the user's window, or returns the wait in ms. */
  function takeSlot(userId: string): number {
    const at = now()
    let window = userWindows.get(userId)
    if (!window || window.startedAt + windowMs <= at) {
      window = { startedAt: at, count: 0 }
      userWindows.set(userId, window)
    }
    if (window.count >= processingLimit) return window.startedAt + windowMs - at
    window.count += 1
    return 0
  }

  async function drain(connectionId: string, queue: ConnectionQueue): Promise<void> {
    queue.draining = true
    try {
      while (!closed && connections.get(connectionId) === queue) {
        const next = queue.waiting.entries().next()
        if (next.done) return
        const waitMs = takeSlot(queue.userId)
        if (waitMs > 0) {
          queue.resumeTimer = schedule(() => {
            queue.resumeTimer = undefined
            if (connections.get(connectionId) === queue && !queue.draining) void drain(connectionId, queue)
          }, waitMs)
          return
        }
        const [threadId, ack] = next.value
        queue.waiting.delete(threadId)
        try {
          await options.run(connectionId, ack)
        } catch {
          // Processing never throws by contract; a failure must not stop the queue.
        }
      }
    } finally {
      queue.draining = false
    }
  }

  function forgetConnection(connectionId: string): void {
    const queue = connections.get(connectionId)
    if (!queue) return
    if (queue.resumeTimer !== undefined) cancel(queue.resumeTimer)
    queue.resumeTimer = undefined
    queue.waiting.clear()
    connections.delete(connectionId)
  }

  return {
    enqueue({ connectionId, userId, ack }) {
      if (closed) return "full"
      let queue = connections.get(connectionId)
      if (!queue) {
        queue = { userId, waiting: new Map(), draining: false }
        connections.set(connectionId, queue)
      }
      const coalesced = queue.waiting.has(ack.threadId)
      if (!coalesced && queue.waiting.size >= maxThreads) return "full"
      queue.waiting.set(ack.threadId, { threadId: ack.threadId, upToMessageId: ack.upToMessageId })
      if (!queue.draining && queue.resumeTimer === undefined) void drain(connectionId, queue)
      return coalesced ? "coalesced" : "queued"
    },
    forgetConnection,
    purgeExpired(at = now()) {
      // A user's window outlives their sockets until it expires, so a
      // reconnect cannot reset the processing budget.
      for (const [userId, window] of userWindows) {
        if (window.startedAt + windowMs <= at) userWindows.delete(userId)
      }
    },
    close() {
      closed = true
      for (const connectionId of [...connections.keys()]) forgetConnection(connectionId)
      userWindows.clear()
    }
  }
}
