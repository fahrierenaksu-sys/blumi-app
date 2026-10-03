import type { ChatMessage } from "@blumi/contracts"
import { useCallback, useEffect, useRef, useState } from "react"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import { hapticSelection } from "../../../ui/haptics"
import type { SessionMode } from "../../session/sessionModel"
import type { FetchThreadMessagesOptions } from "../chatApi"
import type {
  addOptimisticMessage as AddOptimisticMessage,
  getRetryableMessage as GetRetryableMessage,
  markOptimisticMessageSending as MarkOptimisticMessageSending
} from "../chatStore"
import { normalizeOutgoingChatBody } from "./chatThreadModel"
import { CHAT_INITIAL_HISTORY_LIMIT } from "../chatHistoryPolicy"

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
  oldestVisibleMessageId = messages[0]?.messageId,
  hasOlderCachedRows = false,
  invitePagingCursor = null,
  cachedEarlierInviteIds = [],
  requestOlderRoomInvites,
  canLoadEarlier = true,
  getHistoryPageMessageIds,
  onEarlierLoaded,
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
  oldestVisibleMessageId?: string | null
  hasOlderCachedRows?: boolean
  invitePagingCursor?: string | null
  cachedEarlierInviteIds?: readonly string[]
  requestOlderRoomInvites?: (threadId: string, before: string) => Promise<readonly string[]>
  canLoadEarlier?: boolean
  getHistoryPageMessageIds?: (threadId: string, before: string) => readonly string[] | undefined
  onEarlierLoaded?: (rowCount?: number, confirmedPageIds?: readonly string[], confirmedInviteIds?: readonly string[]) => void
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
  const [loadingScope, setLoadingScope] = useState<number | null>(null)
  const earlierRequest = useRef<{ threadId: string; userId: string; generation: number } | null>(null)
  const currentScope = useRef({ resolvedThreadId, currentUserId, generation: 0 })
  if (currentScope.current.resolvedThreadId !== resolvedThreadId || currentScope.current.currentUserId !== currentUserId) {
    currentScope.current = { resolvedThreadId, currentUserId, generation: currentScope.current.generation + 1 }
  }
  const scopeGeneration = currentScope.current.generation
  const currentPaging = useRef({ canLoadEarlier, hasOlderCachedRows, oldestVisibleMessageId, cachedEarlierInviteIds })
  currentPaging.current = { canLoadEarlier, hasOlderCachedRows, oldestVisibleMessageId, cachedEarlierInviteIds }
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const isLoadingEarlier = loadingScope === scopeGeneration

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
    hapticSelection()
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
    const before = oldestVisibleMessageId
    if (!mounted.current || !canLoadEarlier || !currentPaging.current.canLoadEarlier ||
      currentPaging.current.oldestVisibleMessageId !== before ||
      !resolvedThreadId || !currentUserId || currentScope.current.generation !== scopeGeneration ||
      earlierRequest.current?.generation === scopeGeneration) {
      return
    }
    if (!before && !invitePagingCursor) {
      if (hasOlderCachedRows && currentPaging.current.hasOlderCachedRows) onEarlierLoaded?.(CHAT_INITIAL_HISTORY_LIMIT)
      return
    }
    const canRequestMessages = !!before && !!requestMessages && !!getHistoryPageMessageIds
    const canRequestInvites = !!invitePagingCursor && !!requestOlderRoomInvites
    if (!canRequestMessages && !canRequestInvites) return
    const request = { threadId: resolvedThreadId, userId: currentUserId, generation: scopeGeneration }
    earlierRequest.current = request
    setLoadingScope(scopeGeneration)
    try {
      const [messageResult, inviteResult] = await Promise.allSettled([
        canRequestMessages ? requestMessages!(resolvedThreadId, { before: before!, limit: CHAT_INITIAL_HISTORY_LIMIT }) : Promise.resolve(),
        canRequestInvites ? requestOlderRoomInvites!(resolvedThreadId, invitePagingCursor!) : Promise.resolve([] as readonly string[])
      ])
      if (mounted.current && currentScope.current.generation === scopeGeneration && currentPaging.current.canLoadEarlier) {
        const messageIds = canRequestMessages && messageResult.status === "fulfilled" && currentPaging.current.oldestVisibleMessageId === before
          ? getHistoryPageMessageIds!(resolvedThreadId, before!) ?? [] : []
        const inviteIds = [...new Set([...currentPaging.current.cachedEarlierInviteIds, ...inviteResult.status === "fulfilled" ? inviteResult.value : []])]
        if (messageIds.length || inviteIds.length) onEarlierLoaded?.(CHAT_INITIAL_HISTORY_LIMIT, messageIds, inviteIds)
      }
    } catch {
      // The coordinator publishes the retryable failure; do not reveal a
      // disconnected older cache segment or reject a native press handler.
    } finally {
      if (earlierRequest.current === request) {
        earlierRequest.current = null
        if (mounted.current) setLoadingScope(null)
      }
    }
  }, [
    oldestVisibleMessageId,
    hasOlderCachedRows,
    invitePagingCursor,
    requestOlderRoomInvites,
    canLoadEarlier,
    getHistoryPageMessageIds,
    onEarlierLoaded,
    currentUserId,
    resolvedThreadId,
    requestMessages,
    scopeGeneration
  ])

  return { handleSend, handleRetry, handleLoadEarlier, isLoadingEarlier }
}
