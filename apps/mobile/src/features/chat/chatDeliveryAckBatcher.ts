import type { ChatAckDeliveredCommand, ChatMessage } from "@blumi/contracts"
import { compareChatMessagePositions, type ChatMessagePosition } from "@blumi/domain"

/** Collects a burst of incoming messages into one ack per thread. */
export const CHAT_DELIVERY_ACK_DELAY_MS = 400

export interface ChatDeliveryAckBatcher {
  /** A partner message reached this device (realtime or a socket list). */
  note(message: ChatMessage): void
  dispose(): void
}

/**
 * Debounced, cumulative `chat.ack_delivered` (owner decision 2026-10-01: the
 * delivery ACK travels over the WebSocket). One ack per thread names the
 * newest partner message; positions already acknowledged are skipped. Only a
 * foreground app with receipts enabled acknowledges (`isActive`); a window
 * that closes in the background is dropped, because loading history over
 * HTTP on return counts as delivery anyway. Timers are injected for tests.
 */
export function createChatDeliveryAckBatcher(options: {
  /** Returns false when the socket could not take the event. */
  send: (ack: ChatAckDeliveredCommand) => boolean
  isActive: () => boolean
  delayMs?: number
  schedule?: (callback: () => void, delayMs: number) => unknown
  cancel?: (handle: unknown) => void
}): ChatDeliveryAckBatcher {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const pending = new Map<string, ChatMessagePosition>()
  const acknowledged = new Map<string, ChatMessagePosition>()
  let timer: unknown
  let disposed = false

  const isNewer = (threadId: string, position: ChatMessagePosition, known: Map<string, ChatMessagePosition>) => {
    const previous = known.get(threadId)
    return !previous || compareChatMessagePositions(position, previous) > 0
  }

  const flush = () => {
    timer = undefined
    const batch = [...pending]
    pending.clear()
    if (!options.isActive()) return
    for (const [threadId, position] of batch) {
      if (!isNewer(threadId, position, acknowledged)) continue
      if (options.send({ threadId, upToMessageId: position.messageId })) acknowledged.set(threadId, position)
    }
  }

  return {
    note(message) {
      if (disposed || !options.isActive()) return
      const position = { sentAt: message.sentAt, messageId: message.messageId }
      if (!isNewer(message.threadId, position, acknowledged) || !isNewer(message.threadId, position, pending)) return
      pending.set(message.threadId, position)
      timer ??= schedule(flush, options.delayMs ?? CHAT_DELIVERY_ACK_DELAY_MS)
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
