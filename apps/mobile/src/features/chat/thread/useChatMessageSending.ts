import type { ChatMessage } from "@blumi/contracts"
import { useCallback, useState } from "react"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import { hapticLight } from "../../../ui/haptics"
import type { SessionMode } from "../../session/sessionModel"
import type { FetchThreadMessagesOptions } from "../chatApi"
import type {
  addOptimisticMessage as AddOptimisticMessage,
  getRetryableMessage as GetRetryableMessage,
  markOptimisticMessageSending as MarkOptimisticMessageSending
} from "../chatStore"
import { normalizeOutgoingChatBody } from "./chatThreadModel"

/**
 * Optimistic send, idempotent retry and history paging for one thread.
 *
 * Send publishes the optimistic row before the request starts and never
 * waits for the ACK; the store owns delivery state. Retry reuses the
 * original client message id so the server can deduplicate.
 */
export function useChatMessageSending({
  resolvedThreadId,
  currentUserId,
  sessionMode,
  messages,
  sendChatMessage,
  requestMessages,
  addOptimisticMessage,
  getRetryableMessage,
  markOptimisticMessageSending
}: {
  resolvedThreadId: string | undefined
  currentUserId: string
  sessionMode: SessionMode
  messages: readonly ChatMessage[]
  sendChatMessage:
    | ((threadId: string, body: string, clientMessageId: string) => Promise<void>)
    | undefined
  requestMessages:
    | ((threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>)
    | undefined
  addOptimisticMessage: typeof AddOptimisticMessage
  getRetryableMessage: typeof GetRetryableMessage
  markOptimisticMessageSending: typeof MarkOptimisticMessageSending
}) {
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false)

  const handleSend = useCallback((draft: string): boolean => {
    const body = normalizeOutgoingChatBody(draft)
    if (!body || !resolvedThreadId || !currentUserId || !sendChatMessage) return false

    const pending = addOptimisticMessage({
      threadId: resolvedThreadId,
      senderUserId: currentUserId,
      body,
      trackDelivery: sessionMode === "production"
    })

    void sendChatMessage(resolvedThreadId, body, pending.clientMessageId).catch(() => undefined)
    captureProductEvent("chat_message_sent", {
      mode: sessionMode,
      kind: "text"
    })
    hapticLight()
    return true
  }, [addOptimisticMessage, currentUserId, sendChatMessage, resolvedThreadId, sessionMode])

  const handleRetry = useCallback((messageId: string): void => {
    const retryable = getRetryableMessage(messageId)
    if (!retryable || !sendChatMessage) return
    markOptimisticMessageSending(retryable.clientMessageId)
    void sendChatMessage(
      retryable.threadId,
      retryable.body,
      retryable.clientMessageId
    ).catch(() => undefined)
  }, [getRetryableMessage, markOptimisticMessageSending, sendChatMessage])

  const handleLoadEarlier = useCallback(async (): Promise<void> => {
    const before = messages[0]?.messageId
    if (!requestMessages || !resolvedThreadId || !before || isLoadingEarlier) {
      return
    }
    setIsLoadingEarlier(true)
    try {
      await requestMessages(resolvedThreadId, { before, limit: 20 })
    } finally {
      setIsLoadingEarlier(false)
    }
  }, [
    isLoadingEarlier,
    messages,
    resolvedThreadId,
    requestMessages
  ])

  return { handleSend, handleRetry, handleLoadEarlier, isLoadingEarlier }
}
