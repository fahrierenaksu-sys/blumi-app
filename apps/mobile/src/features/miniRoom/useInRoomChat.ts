import type { ChatMessage } from "@blumi/contracts"
import type { FetchThreadMessagesOptions } from "../chat/chatApi"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  applyChatMessageListLoading,
  confirmOptimisticMessage,
  getMessageListCompletionVersion,
  markOptimisticMessageFailed,
  markOptimisticMessageSending,
  useChatThreadStore
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
import { ROOM_CHAT_HISTORY_LIMIT } from "./roomChatHistoryModel"
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
   * Sends a new message, or retries the exact failed identity supplied.
   * A stale or edited explicit retry is refused rather than duplicated.
   */
  sendRoomMessage: (body: string, retryClientMessageId?: string) => boolean
  /** The oldest unresolved failure, for restoring an empty composer. */
  failedRoomMessage: FailedRoomMessage | null
  failedRoomMessages: readonly FailedRoomMessage[]
  newMessages: InRoomChatMessageEvent[]
  consume: (messageId: string) => void
  consumeMany: (messageIds: readonly string[]) => void
}

/** Stable empty list while the room has no chat thread (an effect dependency). */
const NO_THREAD_MESSAGES: ChatMessage[] = []

/** How long a room message may stay "sending" without the server's acknowledgement. */
export const ROOM_MESSAGE_ACK_TIMEOUT_MS = 15_000

interface InFlightRoomMessage {
  body: string
  timer: ReturnType<typeof setTimeout>
}

function createRoomClientMessageId(): string {
  return `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function hasMessage(messages: readonly ChatMessage[], messageId: string): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.messageId === messageId) return true
  }
  return false
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
  requestMessages: (threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>
}): UseInRoomChatResult {
  const { localUserId, partnerUserId, sourceThreadId, requestMessages } = options
  const chatThread = useChatThreadStore(sourceThreadId)
  const { addOptimisticMessage } = chatThread
  const { connectionStatus, send } = useGlobalRealtime()

  const thread = useMemo(
    () => findCanonicalRoomChatThread({
      threads: chatThread.thread ? [chatThread.thread] : [],
      sourceThreadId,
      localUserId,
      partnerUserId
    }),
    [chatThread.thread, localUserId, partnerUserId, sourceThreadId]
  )

  const threadId = thread?.threadId
  const canonicalMessagesRef = useRef(chatThread.messages)
  canonicalMessagesRef.current = chatThread.messages
  const latestThreadMessageId = chatThread.thread?.lastMessage?.messageId
  const hasRecentHistorySnapshot = useMemo(() => {
    if (!chatThread.historyReady || chatThread.messageListState.status !== "ready" ||
      chatThread.latestHistoryMessageIds === undefined) return false
    return !latestThreadMessageId || hasMessage(chatThread.messages, latestThreadMessageId)
  }, [chatThread.historyReady, chatThread.latestHistoryMessageIds, chatThread.messageListState.status,
    chatThread.messages, latestThreadMessageId])
  const requestedRef = useRef<string | null>(null)
  // History boundaries are server timestamps, never the device's clock.
  const baselineRef = useRef<number>(Number.NEGATIVE_INFINITY)
  const seenRef = useRef<Set<string>>(new Set())
  const replayedEntryThreadRef = useRef<string | null>(null)
  const entrySnapshotEstablishedRef = useRef(false)
  const replayGateRef = useRef(createRoomEntryReplayGate())
  const bufferedNewEventsRef = useRef<InRoomChatMessageEvent[]>([])
  const entryLiveMessageIdsRef = useRef(new Set<string>())
  const reconnectSnapshotPendingRef = useRef(false)
  const reconnectCompletionBaselineRef = useRef(0)
  const [pendingEvents, setPendingEvents] = useState<InRoomChatMessageEvent[]>([])
  const inFlightRef = useRef<Map<string, InFlightRoomMessage>>(new Map())
  const failedRef = useRef(new Map<string, { threadId: string; message: FailedRoomMessage }>())
  const [failedOccurrences, setFailedOccurrences] = useState<readonly {
    threadId: string; message: FailedRoomMessage
  }[]>([])
  const failedRoomMessages = useMemo(() => failedOccurrences
    .filter((failure) => failure.threadId === threadId)
    .map(({ message }) => message), [failedOccurrences, threadId])

  const publishFailures = useCallback(() => {
    setFailedOccurrences([...failedRef.current.values()])
  }, [])

  const failRoomMessage = useCallback((clientMessageId: string): void => {
    const inFlight = inFlightRef.current.get(clientMessageId)
    if (!inFlight) return
    clearTimeout(inFlight.timer)
    inFlightRef.current.delete(clientMessageId)
    markOptimisticMessageFailed(clientMessageId)
    if (!threadId) return
    failedRef.current.set(clientMessageId, {
      threadId,
      message: { clientMessageId, body: inFlight.body }
    })
    publishFailures()
  }, [publishFailures, threadId])

  const settleRoomMessage = useCallback((clientMessageId: string, message: ChatMessage): void => {
    const inFlight = inFlightRef.current.get(clientMessageId)
    const failure = failedRef.current.get(clientMessageId)
    if (inFlight && inFlight.body !== message.body) return
    if (failure && (failure.threadId !== message.threadId || failure.message.body !== message.body)) return
    if (inFlight) clearTimeout(inFlight.timer)
    inFlightRef.current.delete(clientMessageId)
    // A late acknowledgement after a timeout still settles the bubble as sent.
    confirmOptimisticMessage(clientMessageId, message, localUserId)
    if (failedRef.current.delete(clientMessageId)) publishFailures()
  }, [localUserId, publishFailures])

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
    baselineRef.current = Number.NEGATIVE_INFINITY
    replayedEntryThreadRef.current = null
    entrySnapshotEstablishedRef.current = false
    replayGateRef.current = advanceRoomEntryReplayGate(
      replayGateRef.current,
      "requested"
    )
    bufferedNewEventsRef.current = []
    entryLiveMessageIdsRef.current = new Set()
    seenRef.current = new Set()
    setPendingEvents([])

    for (const message of canonicalMessagesRef.current) {
      seenRef.current.add(message.messageId)
      if (!message.messageId.startsWith("__local_")) {
        const sentAt = Date.parse(message.sentAt)
        if (Number.isFinite(sentAt)) baselineRef.current = Math.max(baselineRef.current, sentAt)
      }
    }

    // ChatThread's latest server page is already the MiniRoom's recent
    // snapshot. Reuse it instead of requesting the same thread again.
    if (hasRecentHistorySnapshot) return

    applyChatMessageListLoading(threadId)
    // The chat coordinator supports bounded HTTP history pages and owns the
    // failed-list state and user-facing warning when that request rejects.
    void requestMessages(threadId, { limit: ROOM_CHAT_HISTORY_LIMIT }).catch(() => undefined)
  }, [connectionStatus, hasRecentHistorySnapshot, requestMessages, threadId])

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

  const messageListState = threadId ? chatThread.messageListState : { status: "idle" as const }
  const messageListCompletionVersion = threadId
    ? getMessageListCompletionVersion(threadId)
    : 0
  const canonicalMessages = threadId ? chatThread.messages : NO_THREAD_MESSAGES

  useEffect(() => {
    if (!threadId) return
    if (messageListState.status === "failed" && replayGateRef.current.requested &&
      replayedEntryThreadRef.current !== threadId) {
      // A failed history request must not hold the live stream hostage.
      replayedEntryThreadRef.current = threadId
      replayGateRef.current = advanceRoomEntryReplayGate(replayGateRef.current, "failed")
      const buffered = bufferedNewEventsRef.current
      bufferedNewEventsRef.current = []
      if (buffered.length > 0) setPendingEvents((current) => [...current, ...buffered])
      return
    }
    if (messageListState.status === "loading" && !hasRecentHistorySnapshot) {
      replayGateRef.current = advanceRoomEntryReplayGate(
        replayGateRef.current,
        "loading"
      )
      return
    }
    if (messageListState.status !== "ready" && !hasRecentHistorySnapshot) return
    replayGateRef.current = advanceRoomEntryReplayGate(
      replayGateRef.current,
      "ready"
    )
    if (replayedEntryThreadRef.current === threadId) {
      if (!entrySnapshotEstablishedRef.current) {
        // The first successful page after failed entry establishes the
        // canonical boundary without resurrecting the old entry history.
        for (const message of canonicalMessages) {
          seenRef.current.add(message.messageId)
          if (!message.messageId.startsWith("__local_")) {
            const sentAt = Date.parse(message.sentAt)
            if (Number.isFinite(sentAt)) baselineRef.current = Math.max(baselineRef.current, sentAt)
          }
        }
        entrySnapshotEstablishedRef.current = true
      }
      return
    }
    const canReplayCachedSnapshot = hasRecentHistorySnapshot && replayGateRef.current.requested &&
      !replayGateRef.current.replayed
    if (!replayGateRef.current.canReplay && !canReplayCachedSnapshot) return
    replayedEntryThreadRef.current = threadId
    entrySnapshotEstablishedRef.current = true
    replayGateRef.current = advanceRoomEntryReplayGate(
      replayGateRef.current,
      "replayed"
    )
    const lastMessage = findLastCanonicalRoomChatMessage(
      canonicalMessages.filter((message) => !entryLiveMessageIdsRef.current.has(message.messageId))
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
      if (!message.messageId.startsWith("__local_")) {
        const sentAt = Date.parse(message.sentAt)
        if (Number.isFinite(sentAt)) baselineRef.current = Math.max(baselineRef.current, sentAt)
      }
    }
    setPendingEvents((current) => [
      ...current,
      ...(initialEvent ? [initialEvent] : []),
      ...buffered
    ])
  }, [canonicalMessages, hasRecentHistorySnapshot, messageListState.status, threadId])

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
      if (replayedEntryThreadRef.current !== threadId) entryLiveMessageIdsRef.current.add(message.messageId)
      if (!shouldRenderIncomingRoomChatMessage({
        senderUserId: message.senderUserId,
        localUserId,
        body: message.body,
        sentAt: message.sentAt
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
      const knownFailure = clientMessageId ? failedRef.current.get(clientMessageId) : undefined
      const settlesPreviousThread = knownFailure?.threadId === message.threadId &&
        knownFailure.message.body === message.body
      if (clientMessageId && message.senderUserId === localUserId &&
        (message.threadId === threadId || settlesPreviousThread)) {
        settleRoomMessage(clientMessageId, message)
      }
      handleIncoming(message)
    },
    [failRoomMessage, handleIncoming, localUserId, settleRoomMessage, threadId]
  )
  useGlobalRealtimeEvents(handleServerEvent)

  const consumeMany = useCallback((messageIds: readonly string[]) => {
    if (messageIds.length === 0) return
    const consumed = new Set(messageIds)
    setPendingEvents((current) => {
      const remaining = current.filter((entry) => !consumed.has(entry.messageId))
      return remaining.length === current.length ? current : remaining
    })
  }, [])

  const consume = useCallback((messageId: string) => consumeMany([messageId]), [consumeMany])

  const sendRoomMessage = useCallback(
    (body: string, retryClientMessageId?: string): boolean => {
      const trimmed = normalizeOutgoingChatBody(body)
      if (!trimmed) return false
      if (!threadId) return false
      if (connectionStatus !== "connected") return false
      const isRetry = retryClientMessageId !== undefined
      const retry = isRetry ? failedRef.current.get(retryClientMessageId) : undefined
      if (isRetry && (!retry || retry.threadId !== threadId || retry.message.body !== trimmed)) return false
      const clientMessageId = retry?.message.clientMessageId ?? createRoomClientMessageId()
      // The rendered status can lag a socket that has just closed. A refused
      // frame must not leave an optimistic bubble that never resolves.
      const sent = send({
        type: "chat.send_message",
        payload: { threadId, body: trimmed, clientMessageId }
      })
      if (!sent) return false
      if (retry) {
        failedRef.current.delete(clientMessageId)
        publishFailures()
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
    [addOptimisticMessage, connectionStatus, failRoomMessage, localUserId, publishFailures, send, threadId]
  )

  return {
    threadId,
    canSend: Boolean(threadId) && connectionStatus === "connected",
    sendRoomMessage,
    failedRoomMessage: failedRoomMessages[0] ?? null,
    failedRoomMessages,
    newMessages: pendingEvents,
    consume,
    consumeMany
  }
}
