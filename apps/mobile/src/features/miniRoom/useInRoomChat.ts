import type { ChatMessage } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  applyChatMessageListLoading,
  getMessageListCompletionVersion,
  useChatStore
} from "../chat/chatStore"
import {
  getGlobalStatus,
  subscribeToStatus,
  useGlobalRealtime,
  useGlobalRealtimeEvents
} from "../realtime/globalRealtimeProvider"
import { createReconnectTransitionTracker } from "../realtime/reconnectTransitionTracker"
import type { ServerEvent } from "@blumi/realtime-client"
import {
  findLastCanonicalRoomChatMessage,
  findCanonicalRoomChatThread,
  findMissedCanonicalRoomChatMessages,
  shouldRenderIncomingRoomChatMessage
} from "./inRoomChatThread"
import {
  advanceRoomEntryReplayGate,
  createRoomEntryReplayGate
} from "./roomEntryReplayGate"

export interface InRoomChatMessageEvent {
  messageId: string
  senderUserId: string
  body: string
  sentAt: number
}

export interface UseInRoomChatResult {
  threadId: string | undefined
  canSend: boolean
  sendRoomMessage: (body: string) => boolean
  newMessages: InRoomChatMessageEvent[]
  consume: (messageId: string) => void
}

/**
 * Bridges the real chat thread for this miniRoom into the scene.
 * Emits only NEW messages (after mount) as events so the scene can
 * render them as avatar-anchored speech bubbles — not as a thread list.
 */
export function useInRoomChat(options: {
  miniRoomId: string
  sourceThreadId: string | undefined
  localUserId: string
  partnerUserId: string
}): UseInRoomChatResult {
  const { localUserId, partnerUserId, sourceThreadId } = options
  const { threads, getMessages, getMessageListState, addOptimisticMessage } = useChatStore()
  const { connectionStatus, send } = useGlobalRealtime()

  const thread = useMemo(
    () => findCanonicalRoomChatThread({
      threads,
      sourceThreadId,
      localUserId,
      partnerUserId
    }),
    [localUserId, partnerUserId, sourceThreadId, threads]
  )

  const threadId = thread?.threadId
  const requestedRef = useRef<string | null>(null)
  const baselineRef = useRef<number>(Date.now())
  const seenRef = useRef<Set<string>>(new Set())
  const replayedEntryThreadRef = useRef<string | null>(null)
  const replayGateRef = useRef(createRoomEntryReplayGate())
  const bufferedNewEventsRef = useRef<InRoomChatMessageEvent[]>([])
  const reconnectSnapshotPendingRef = useRef(false)
  const reconnectCompletionBaselineRef = useRef(0)
  const [pendingEvents, setPendingEvents] = useState<InRoomChatMessageEvent[]>([])

  useEffect(() => {
    if (!threadId) return
    if (connectionStatus !== "connected") return
    if (requestedRef.current === threadId) return
    requestedRef.current = threadId
    baselineRef.current = Date.now()
    replayedEntryThreadRef.current = null
    replayGateRef.current = advanceRoomEntryReplayGate(
      replayGateRef.current,
      "requested"
    )
    bufferedNewEventsRef.current = []
    seenRef.current = new Set()
    setPendingEvents([])

    for (const message of getMessages(threadId)) {
      seenRef.current.add(message.messageId)
    }

    applyChatMessageListLoading(threadId)
    send({
      type: "chat.list_messages",
      payload: { threadId }
    })
  }, [connectionStatus, getMessages, send, threadId])

  useEffect(() => {
    const isReconnect = createReconnectTransitionTracker(getGlobalStatus())
    reconnectSnapshotPendingRef.current = false
    reconnectCompletionBaselineRef.current = threadId
      ? getMessageListCompletionVersion(threadId)
      : 0
    return subscribeToStatus((status) => {
      if (!isReconnect(status)) return
      reconnectSnapshotPendingRef.current = true
      reconnectCompletionBaselineRef.current = threadId
        ? getMessageListCompletionVersion(threadId)
        : 0
    })
  }, [localUserId, threadId])

  const messageListState = threadId ? getMessageListState(threadId) : { status: "idle" as const }
  const messageListCompletionVersion = threadId
    ? getMessageListCompletionVersion(threadId)
    : 0
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  const canonicalMessages = threadId ? getMessages(threadId) : []

  useEffect(() => {
    if (!threadId) return
    if (messageListState.status === "loading") {
      replayGateRef.current = advanceRoomEntryReplayGate(
        replayGateRef.current,
        "loading"
      )
      return
    }
    if (messageListState.status !== "ready") return
    replayGateRef.current = advanceRoomEntryReplayGate(
      replayGateRef.current,
      "ready"
    )
    if (!replayGateRef.current.canReplay) return
    if (replayedEntryThreadRef.current === threadId) return
    replayedEntryThreadRef.current = threadId
    replayGateRef.current = advanceRoomEntryReplayGate(
      replayGateRef.current,
      "replayed"
    )
    const lastMessage = findLastCanonicalRoomChatMessage(
      canonicalMessages,
      baselineRef.current
    )
    const initialEvent = lastMessage
      ? {
        messageId: lastMessage.messageId,
        senderUserId: lastMessage.senderUserId,
        body: lastMessage.body,
        sentAt: Date.parse(lastMessage.sentAt)
      }
      : undefined
    if (lastMessage) seenRef.current.add(lastMessage.messageId)
    const buffered = bufferedNewEventsRef.current.filter(
      (event) => event.messageId !== initialEvent?.messageId
    )
    bufferedNewEventsRef.current = []
    for (const message of canonicalMessages) {
      seenRef.current.add(message.messageId)
    }
    setPendingEvents((current) => [
      ...current,
      ...(initialEvent ? [initialEvent] : []),
      ...buffered
    ])
  }, [canonicalMessages, messageListState.status, threadId])

  useEffect(() => {
    if (!threadId || !reconnectSnapshotPendingRef.current) return
    if (messageListCompletionVersion <= reconnectCompletionBaselineRef.current) return
    if (messageListState.status === "failed") {
      reconnectSnapshotPendingRef.current = false
      return
    }
    if (messageListState.status !== "ready") return

    const missedMessages = findMissedCanonicalRoomChatMessages({
      messages: canonicalMessages,
      baselineTimestamp: baselineRef.current,
      localUserId,
      alreadySeenMessageIds: seenRef.current
    })
    const missedEvents = missedMessages.map((message) => ({
      messageId: message.messageId,
      senderUserId: message.senderUserId,
      body: message.body,
      sentAt: Date.parse(message.sentAt)
    }))
    for (const message of missedMessages) {
      seenRef.current.add(message.messageId)
    }
    if (missedEvents.length > 0) {
      setPendingEvents((current) => {
        const pendingIds = new Set(current.map((event) => event.messageId))
        return [
          ...current,
          ...missedEvents.filter((event) => !pendingIds.has(event.messageId))
        ]
      })
    }
    reconnectSnapshotPendingRef.current = false
  }, [canonicalMessages, localUserId, messageListCompletionVersion, messageListState.status, threadId])

  const handleIncoming = useCallback(
    (message: ChatMessage) => {
      if (!threadId || message.threadId !== threadId) return
      if (seenRef.current.has(message.messageId)) return
      seenRef.current.add(message.messageId)
      if (!shouldRenderIncomingRoomChatMessage({
        senderUserId: message.senderUserId,
        localUserId,
        body: message.body,
        sentAt: message.sentAt,
        baselineTimestamp: baselineRef.current
      })) {
        return
      }
      const sentAtMs = Date.parse(message.sentAt)
      const event = {
        messageId: message.messageId,
        senderUserId: message.senderUserId,
        body: message.body,
        sentAt: sentAtMs
      }
      if (replayedEntryThreadRef.current !== threadId) {
        bufferedNewEventsRef.current.push(event)
        return
      }
      setPendingEvents((current) => [...current, event])
    },
    [localUserId, threadId]
  )

  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      if (event.type !== "chat.message_received") return
      handleIncoming(event.payload)
    },
    [handleIncoming]
  )
  useGlobalRealtimeEvents(handleServerEvent)

  const consume = useCallback((messageId: string) => {
    setPendingEvents((current) => current.filter((entry) => entry.messageId !== messageId))
  }, [])

  const sendRoomMessage = useCallback(
    (body: string): boolean => {
      const trimmed = body.trim()
      if (!trimmed) return false
      if (!threadId) return false
      if (connectionStatus !== "connected") return false
      // The rendered status can lag a socket that has just closed. A refused
      // frame must not leave an optimistic bubble that never resolves.
      const sent = send({
        type: "chat.send_message",
        payload: { threadId, body: trimmed }
      })
      if (!sent) return false
      addOptimisticMessage({
        threadId,
        senderUserId: localUserId,
        body: trimmed
      })
      return true
    },
    [addOptimisticMessage, connectionStatus, localUserId, send, threadId]
  )

  return {
    threadId,
    canSend: Boolean(threadId) && connectionStatus === "connected",
    sendRoomMessage,
    newMessages: pendingEvents,
    consume
  }
}
