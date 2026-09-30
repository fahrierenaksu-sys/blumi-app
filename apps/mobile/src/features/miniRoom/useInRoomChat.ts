import type { ChatMessage } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  applyChatMessageListLoading,
  confirmOptimisticMessage,
  getMessageListCompletionVersion,
  markOptimisticMessageFailed,
  markOptimisticMessageSending,
  useChatStore
} from "../chat/chatStore"
import { normalizeOutgoingChatBody } from "../chat/thread/chatThreadModel"
import {
  getGlobalStatus,
  subscribeToStatus,
  useGlobalRealtime,
  useGlobalRealtimeEvents
} from "../realtime/globalRealtimeProvider"
import { createReconnectTransitionTracker, type ServerEvent } from "@blumi/realtime-client"
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

export interface FailedRoomMessage {
  clientMessageId: string
  body: string
}

export interface UseInRoomChatResult {
  threadId: string | undefined
  canSend: boolean
  /**
   * Sends over the room socket. Sending the text of the latest failed
   * message again is its retry and reuses that message's clientMessageId.
   */
  sendRoomMessage: (body: string) => boolean
  /** The latest room message that was not acknowledged, until retried. */
  failedRoomMessage: FailedRoomMessage | null
  newMessages: InRoomChatMessageEvent[]
  consume: (messageId: string) => void
}

/** How long a room message may stay "sending" without the server's acknowledgement. */
export const ROOM_MESSAGE_ACK_TIMEOUT_MS = 15_000

interface InFlightRoomMessage {
  body: string
  timer: ReturnType<typeof setTimeout>
}

function createRoomClientMessageId(): string {
  return `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
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
  const inFlightRef = useRef<Map<string, InFlightRoomMessage>>(new Map())
  const failedRef = useRef<(FailedRoomMessage & { threadId: string }) | null>(null)
  const [failedRoomMessage, setFailedRoomMessage] = useState<FailedRoomMessage | null>(null)

  const failRoomMessage = useCallback((clientMessageId: string): void => {
    const inFlight = inFlightRef.current.get(clientMessageId)
    if (!inFlight) return
    clearTimeout(inFlight.timer)
    inFlightRef.current.delete(clientMessageId)
    markOptimisticMessageFailed(clientMessageId)
    if (!threadId) return
    failedRef.current = { clientMessageId, body: inFlight.body, threadId }
    setFailedRoomMessage({ clientMessageId, body: inFlight.body })
  }, [threadId])

  const settleRoomMessage = useCallback((clientMessageId: string, message: ChatMessage): void => {
    const inFlight = inFlightRef.current.get(clientMessageId)
    if (inFlight) clearTimeout(inFlight.timer)
    inFlightRef.current.delete(clientMessageId)
    // A late acknowledgement after a timeout still settles the bubble as sent.
    confirmOptimisticMessage(clientMessageId, message, localUserId)
    if (failedRef.current?.clientMessageId === clientMessageId) {
      failedRef.current = null
      setFailedRoomMessage(null)
    }
  }, [localUserId])

  // A closed socket loses unacknowledged frames: fail them now instead of
  // leaving "sending" bubbles. Leaving the room fails what is still open.
  useEffect(() => {
    const inFlight = inFlightRef.current
    const unsubscribe = subscribeToStatus((status) => {
      if (status === "connected") return
      for (const clientMessageId of [...inFlight.keys()]) failRoomMessage(clientMessageId)
    })
    return () => {
      unsubscribe()
      for (const clientMessageId of [...inFlight.keys()]) failRoomMessage(clientMessageId)
    }
  }, [failRoomMessage])

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
      if (event.type === "realtime.error") {
        if (event.payload.code === "CHAT_MESSAGE_NOT_SENT" && event.payload.clientMessageId) {
          failRoomMessage(event.payload.clientMessageId)
        }
        return
      }
      if (event.type !== "chat.message_received") return
      const { clientMessageId, ...message } = event.payload
      if (clientMessageId && message.senderUserId === localUserId) {
        settleRoomMessage(clientMessageId, message)
      }
      handleIncoming(message)
    },
    [failRoomMessage, handleIncoming, localUserId, settleRoomMessage]
  )
  useGlobalRealtimeEvents(handleServerEvent)

  const consume = useCallback((messageId: string) => {
    setPendingEvents((current) => current.filter((entry) => entry.messageId !== messageId))
  }, [])

  const sendRoomMessage = useCallback(
    (body: string): boolean => {
      const trimmed = normalizeOutgoingChatBody(body)
      if (!trimmed) return false
      if (!threadId) return false
      if (connectionStatus !== "connected") return false
      const retry = failedRef.current?.threadId === threadId && failedRef.current.body === trimmed
        ? failedRef.current
        : null
      const clientMessageId = retry?.clientMessageId ?? createRoomClientMessageId()
      // The rendered status can lag a socket that has just closed. A refused
      // frame must not leave an optimistic bubble that never resolves.
      const sent = send({
        type: "chat.send_message",
        payload: { threadId, body: trimmed, clientMessageId }
      })
      if (!sent) return false
      if (retry) {
        failedRef.current = null
        setFailedRoomMessage(null)
        markOptimisticMessageSending(clientMessageId)
      } else {
        addOptimisticMessage({
          threadId,
          senderUserId: localUserId,
          body: trimmed,
          clientMessageId,
          trackDelivery: true
        })
      }
      inFlightRef.current.set(clientMessageId, {
        body: trimmed,
        timer: setTimeout(() => failRoomMessage(clientMessageId), ROOM_MESSAGE_ACK_TIMEOUT_MS)
      })
      return true
    },
    [addOptimisticMessage, connectionStatus, failRoomMessage, localUserId, send, threadId]
  )

  return {
    threadId,
    canSend: Boolean(threadId) && connectionStatus === "connected",
    sendRoomMessage,
    failedRoomMessage,
    newMessages: pendingEvents,
    consume
  }
}
