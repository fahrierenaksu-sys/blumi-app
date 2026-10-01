import type { ChatAckDeliveredCommand, ChatMessage } from "@blumi/contracts"
import { compareChatMessagePositions, type ChatMessagePosition } from "@blumi/domain"

/** Collects a burst of incoming messages into one ack per thread. */
export const CHAT_DELIVERY_ACK_DELAY_MS = 400
/**
 * Acks per flush. The server admits receipts per socket; servers before
 * 2026-10-01 kept two in flight and dropped the rest of a burst silently, so
 * a larger batch goes out in paced windows instead.
 */
export const CHAT_DELIVERY_ACK_MAX_PER_FLUSH = 2
/** 2 acks per 750 ms stays under the older 30-per-10-s receipt window. */
export const CHAT_DELIVERY_ACK_PACING_MS = 750
/**
 * Acks sent this long before a socket drop may have died with it; they are
 * re-sent after the reconnect. Older ones were followed by live heartbeats.
 */
export const CHAT_DELIVERY_ACK_RESEND_WINDOW_MS = 30_000

export interface ChatDeliveryAckBatcher {
  /** A partner message reached this device (realtime or a socket list). */
  note(message: ChatMessage): void
  /** The global socket's connected state; a reconnect re-sends recent acks. */
  noteConnection(connected: boolean): void
  dispose(): void
}

interface SentAck {
  position: ChatMessagePosition
  sentAt: number
}

/**
 * Debounced, cumulative `chat.ack_delivered` (owner decision 2026-10-01: the
 * delivery ACK travels over the WebSocket). One ack per thread names the
 * newest partner message; positions already acknowledged are skipped. Only a
 * foreground app with receipts enabled acknowledges (`isActive`); a window
 * that closes in the background is dropped, because loading history over
 * HTTP on return counts as delivery anyway.
 *
 * Nothing the server may not have received is forgotten: a burst is paced
 * (`CHAT_DELIVERY_ACK_MAX_PER_FLUSH`), an ack the socket refused stays
 * pending until the next connect, and acks sent shortly before a drop are
 * repeated after the reconnect (acks are cumulative and idempotent). Timers
 * and the clock are injected for tests.
 */
export function createChatDeliveryAckBatcher(options: {
  /** Returns false when the socket could not take the event. */
  send: (ack: ChatAckDeliveredCommand) => boolean
  isActive: () => boolean
  delayMs?: number
  pacingMs?: number
  maxPerFlush?: number
  now?: () => number
  schedule?: (callback: () => void, delayMs: number) => unknown
  cancel?: (handle: unknown) => void
}): ChatDeliveryAckBatcher {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const now = options.now ?? Date.now
  const maxPerFlush = options.maxPerFlush ?? CHAT_DELIVERY_ACK_MAX_PER_FLUSH
  const pending = new Map<string, ChatMessagePosition>()
  const acknowledged = new Map<string, SentAck>()
  let timer: unknown
  let disposed = false
  let connected: boolean | undefined
  let droppedAt: number | undefined

  const isNewer = (position: ChatMessagePosition, previous: ChatMessagePosition | undefined) =>
    !previous || compareChatMessagePositions(position, previous) > 0

  const scheduleFlush = (delayMs: number) => {
    if (disposed || timer !== undefined || pending.size === 0) return
    timer = schedule(flush, delayMs)
  }

  function flush() {
    timer = undefined
    if (!options.isActive()) {
      pending.clear()
      return
    }
    let sentCount = 0
    for (const [threadId, position] of [...pending]) {
      if (sentCount >= maxPerFlush) break
      if (!isNewer(position, acknowledged.get(threadId)?.position)) {
        pending.delete(threadId)
        continue
      }
      // A refused send means the socket is down: keep the rest for the
      // reconnect instead of retrying on a timer.
      if (!options.send({ threadId, upToMessageId: position.messageId })) return
      pending.delete(threadId)
      acknowledged.set(threadId, { position, sentAt: now() })
      sentCount += 1
    }
    scheduleFlush(options.pacingMs ?? CHAT_DELIVERY_ACK_PACING_MS)
  }

  return {
    note(message) {
      if (disposed || !options.isActive()) return
      const position = { sentAt: message.sentAt, messageId: message.messageId }
      if (!isNewer(position, acknowledged.get(message.threadId)?.position)) return
      if (isNewer(position, pending.get(message.threadId))) pending.set(message.threadId, position)
      scheduleFlush(options.delayMs ?? CHAT_DELIVERY_ACK_DELAY_MS)
    },
    noteConnection(isConnected) {
      if (disposed || connected === isConnected) return
      const wasConnected = connected
      connected = isConnected
      if (!isConnected) {
        if (wasConnected) droppedAt = now()
        return
      }
      if (droppedAt !== undefined) {
        const resendAfter = droppedAt - CHAT_DELIVERY_ACK_RESEND_WINDOW_MS
        for (const [threadId, sent] of [...acknowledged]) {
          if (sent.sentAt < resendAfter) continue
          acknowledged.delete(threadId)
          if (isNewer(sent.position, pending.get(threadId))) pending.set(threadId, sent.position)
        }
        droppedAt = undefined
      }
      scheduleFlush(options.delayMs ?? CHAT_DELIVERY_ACK_DELAY_MS)
    },
    dispose() {
      disposed = true
      if (timer !== undefined) cancel(timer)
      timer = undefined
      pending.clear()
      acknowledged.clear()
    }
  }
}
