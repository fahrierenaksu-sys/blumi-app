/**
 * chatStore – single state owner for all mobile chat data.
 *
 * Rules:
 * - Primary data comes from the server (thread_listed, message_listed,
 *   message_received, thread_created).
 * - Optimistic messages are inserted locally on send for instant UX,
 *   then replaced by the server-confirmed version on receipt.
 * - No fake unread counts or delivery/read status.
 * - Exposes a reactive hook for components.
 */

import type {
  ChatMessage,
  ChatMessageList,
  ChatThread,
  ChatThreadList
} from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getMessageListErrorMessageForDisplay,
  getThreadListErrorMessageForDisplay
} from "./chatErrorCopy"

// ─── In-memory store ────────────────────────────────────────
let threadCache: ChatThread[] = []
let messageCache: Map<string, ChatMessage[]> = new Map()
export type ThreadListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "failed"; errorMessage: string }

let threadListState: ThreadListState = { status: "idle" }
export type MessageListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "failed"; errorMessage: string }

let messageListStateByThreadId: Map<string, MessageListState> = new Map()

// Track optimistic message local IDs so we can replace them on server confirmation
const pendingLocalIds: Set<string> = new Set()
type MessageDeliveryState = "sending" | "failed" | "sent"
const deliveryStateByLocalMessageId: Map<string, MessageDeliveryState> = new Map()
const pendingLocalMessageIdByClientMessageId: Map<string, string> = new Map()
let localIdCounter = 0

// Unread message tracking per thread
let unreadCounts: Map<string, number> = new Map()
let readAtByThread: Map<string, string> = new Map()
let summaryLastMessageByThread: Map<string, ChatMessage> = new Map()
let activeThreadId: string | null = null // which thread is currently being viewed

type Listener = () => void
const listeners: Set<Listener> = new Set()

export function subscribeToChatStore(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify(): void {
  for (const l of listeners) l()
}

// ─── Server-event reducers (called from RootNavigator) ──────
export function applyChatThreadListed(payload: ChatThreadList): void {
  const merged = new Map((payload.append ? threadCache : []).map((thread) => [thread.threadId, thread]))
  for (const thread of payload.threads) {
    const previousSummary = summaryLastMessageByThread.get(thread.threadId)
    if (thread.lastMessage && (!previousSummary || compareMessageOrder(thread.lastMessage, previousSummary) > 0)) {
      summaryLastMessageByThread.set(thread.threadId, { ...thread.lastMessage })
    }
    const newerMessages = (messageCache.get(thread.threadId) ?? []).filter((message) =>
      !message.messageId.startsWith("__local_") && (!thread.lastMessage || compareMessageOrder(message, thread.lastMessage) > 0))
    const latestMessage = newerMessages.reduce<ChatMessage | undefined>((latest, message) =>
      !latest || compareMessageOrder(message, latest) > 0 ? message : latest, thread.lastMessage)
    merged.set(thread.threadId, cloneThread({ ...thread, ...(latestMessage ? { lastMessage: latestMessage } : {}) }))
    const currentReadAt = readAtByThread.get(thread.threadId)
    if (thread.lastReadAt && (!currentReadAt || Date.parse(thread.lastReadAt) >= Date.parse(currentReadAt))) readAtByThread.set(thread.threadId, thread.lastReadAt)
    if (thread.unreadCount !== undefined && (!currentReadAt || (thread.lastReadAt && Date.parse(thread.lastReadAt) >= Date.parse(currentReadAt)))) {
      const newlyReceivedUnread = newerMessages.filter((message) => message.senderUserId !== payload.userId &&
        (!thread.lastReadAt || Date.parse(message.sentAt) > Date.parse(thread.lastReadAt))).length
      unreadCounts.set(thread.threadId, activeThreadId === thread.threadId ? 0 : thread.unreadCount + newlyReceivedUnread)
    }
  }
  if (!payload.append) unreadCounts = new Map([...unreadCounts].filter(([threadId]) => merged.has(threadId)))
  threadCache = [...merged.values()].sort(
    (a, b) => (b.lastMessage?.sentAt ? Date.parse(b.lastMessage.sentAt) : 0) -
              (a.lastMessage?.sentAt ? Date.parse(a.lastMessage.sentAt) : 0)
  )
  threadListState = { status: "ready" }
  notify()
}

function compareMessageOrder(left: ChatMessage, right: ChatMessage): number {
  return Date.parse(left.sentAt) - Date.parse(right.sentAt) || left.messageId.localeCompare(right.messageId)
}

export function applyChatThreadRead(payload: { userId: string; threadId: string; readAt: string }): void {
  const previous = readAtByThread.get(payload.threadId)
  if (!Number.isFinite(Date.parse(payload.readAt)) || (previous && Date.parse(previous) >= Date.parse(payload.readAt))) return
  readAtByThread.set(payload.threadId, payload.readAt)
  const thread = threadCache.find((entry) => entry.threadId === payload.threadId)
  // A partial message cache cannot tell how many offline messages remain after
  // this watermark. Keep the last server total until the requested refresh.
  const allKnownMessagesRead = thread?.lastMessage && Date.parse(thread.lastMessage.sentAt) <= Date.parse(payload.readAt)
  const count = allKnownMessagesRead ? 0 : unreadCounts.get(payload.threadId) ?? 0
  unreadCounts.set(payload.threadId, count)
  threadCache = threadCache.map((thread) => thread.threadId === payload.threadId ? { ...thread, unreadCount: count, lastReadAt: payload.readAt } : thread)
  notify()
}

export function applyChatThreadListLoading(): void {
  threadListState = { status: "loading" }
  notify()
}

export function applyChatThreadListFailed(errorMessage: string): void {
  threadListState = {
    status: "failed",
    errorMessage: getThreadListErrorMessageForDisplay(errorMessage)
  }
  notify()
}

export function applyChatThreadCreated(thread: ChatThread): void {
  // Dedupe by threadId, put newest first.
  const filtered = threadCache.filter((t) => t.threadId !== thread.threadId)
  threadCache = [cloneThread(thread), ...filtered].sort(
    (a, b) => (b.lastMessage?.sentAt ? Date.parse(b.lastMessage.sentAt) : 0) -
              (a.lastMessage?.sentAt ? Date.parse(a.lastMessage.sentAt) : 0)
  )
  notify()
}

export function applyChatMessageListed(payload: ChatMessageList): void {
  const existing = messageCache.get(payload.threadId) ?? []
  const byId = new Map<string, ChatMessage>()
  for (const message of existing) {
    byId.set(message.messageId, message)
  }
  for (const message of payload.messages) {
    byId.set(message.messageId, message)
  }
  const sorted = [...byId.values()].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  messageCache.set(payload.threadId, sorted)
  setMessageListState(payload.threadId, { status: "ready" })
  notify()
}

export function applyChatMessageListLoading(threadId: string): void {
  setMessageListState(threadId, { status: "loading" })
  notify()
}

export function applyChatMessageListFailed(
  threadId: string,
  errorMessage: string
): void {
  setMessageListState(threadId, {
    status: "failed",
    errorMessage: getMessageListErrorMessageForDisplay(errorMessage)
  })
  notify()
}

export function applyChatMessageReceived(
  message: ChatMessage,
  options: { localUserId?: string } = {}
): void {
  const existing = messageCache.get(message.threadId) ?? []

  // If we already have this exact message, skip
  if (existing.some((m) => m.messageId === message.messageId)) return

  const pendingEchoId = existing.find(
    (m) =>
      pendingLocalIds.has(m.messageId) &&
      ![...pendingLocalMessageIdByClientMessageId.values()].includes(m.messageId) &&
      m.senderUserId === message.senderUserId
  )?.messageId
  if (pendingEchoId) {
    pendingLocalIds.delete(pendingEchoId)
    deliveryStateByLocalMessageId.delete(pendingEchoId)
  }
  const cleaned = pendingEchoId
    ? existing.filter((m) => m.messageId !== pendingEchoId)
    : existing

  const sorted = [...cleaned, message].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  messageCache.set(message.threadId, sorted)

  // Update lastMessage on thread
  threadCache = threadCache.map((thread) =>
    thread.threadId === message.threadId && (!thread.lastMessage || compareMessageOrder(message, thread.lastMessage) > 0)
      ? { ...thread, lastMessage: message }
      : thread
  ).sort(
    (a, b) => (b.lastMessage?.sentAt ? Date.parse(b.lastMessage.sentAt) : 0) -
              (a.lastMessage?.sentAt ? Date.parse(a.lastMessage.sentAt) : 0)
  )

  // Increment unread count if this thread isn't currently active
  // and the message isn't from local optimistic echo
  if (
    message.threadId !== activeThreadId &&
    (!summaryLastMessageByThread.has(message.threadId) || compareMessageOrder(message, summaryLastMessageByThread.get(message.threadId)!) > 0) &&
    !message.messageId.startsWith("__local_") &&
    Date.parse(message.sentAt) > Date.parse(readAtByThread.get(message.threadId) ?? "1970-01-01T00:00:00Z") &&
    message.senderUserId !== options.localUserId
  ) {
    const current = unreadCounts.get(message.threadId) ?? 0
    unreadCounts.set(message.threadId, current + 1)
  }

  notify()
}

/**
 * Insert an optimistic (local-only) message for instant UX.
 * When the server confirms via applyChatMessageReceived, the local echo is replaced.
 */
export function addOptimisticMessage(opts: {
  threadId: string
  senderUserId: string
  body: string
  clientMessageId?: string
  trackDelivery?: boolean
}): { localMessageId: string; clientMessageId: string } {
  const localId = `__local_${++localIdCounter}_${Date.now()}`
  const clientMessageId = opts.clientMessageId ?? createClientMessageId()
  pendingLocalIds.add(localId)
  deliveryStateByLocalMessageId.set(localId, "sending")
  if (opts.trackDelivery ?? Boolean(opts.clientMessageId)) {
    pendingLocalMessageIdByClientMessageId.set(clientMessageId, localId)
  }

  const optimistic: ChatMessage = {
    messageId: localId,
    threadId: opts.threadId,
    senderUserId: opts.senderUserId,
    body: opts.body,
    sentAt: new Date().toISOString()
  }

  const existing = messageCache.get(opts.threadId) ?? []
  messageCache.set(opts.threadId, [...existing, optimistic])
  notify()
  return { localMessageId: localId, clientMessageId }
}

export function markOptimisticMessageFailed(clientMessageId: string): void {
  const localMessageId = pendingLocalMessageIdByClientMessageId.get(clientMessageId)
  if (!localMessageId) return
  deliveryStateByLocalMessageId.set(localMessageId, "failed")
  notify()
}

export function markOptimisticMessageSending(clientMessageId: string): void {
  const localMessageId = pendingLocalMessageIdByClientMessageId.get(clientMessageId)
  if (!localMessageId) return
  deliveryStateByLocalMessageId.set(localMessageId, "sending")
  notify()
}

export function confirmOptimisticMessage(
  clientMessageId: string,
  message: ChatMessage,
  localUserId?: string
): void {
  const localMessageId = pendingLocalMessageIdByClientMessageId.get(clientMessageId)
  if (!localMessageId) {
    applyChatMessageReceived(message, { localUserId })
    return
  }
  pendingLocalMessageIdByClientMessageId.delete(clientMessageId)
  pendingLocalIds.delete(localMessageId)
  deliveryStateByLocalMessageId.delete(localMessageId)
  const existing = (messageCache.get(message.threadId) ?? []).filter(
    (entry) => entry.messageId !== localMessageId
  )
  messageCache.set(message.threadId, existing)
  if (existing.some((entry) => entry.messageId === message.messageId)) {
    // The websocket already supplied the canonical message. Removing the local
    // echo still changes the snapshot even though the server event is a duplicate.
    notify()
    return
  }
  applyChatMessageReceived(message, { localUserId })
}

export function getMessageDeliveryState(messageId: string): MessageDeliveryState {
  return deliveryStateByLocalMessageId.get(messageId) ?? "sent"
}

export function getRetryableMessage(messageId: string): {
  body: string
  clientMessageId: string
  threadId: string
} | null {
  const clientMessageId = [...pendingLocalMessageIdByClientMessageId.entries()].find(
    ([, localMessageId]) => localMessageId === messageId
  )?.[0]
  if (!clientMessageId) return null
  const message = [...messageCache.values()].flat().find(
    (entry) => entry.messageId === messageId
  )
  return message
    ? { body: message.body, clientMessageId, threadId: message.threadId }
    : null
}

export function resetChatStore(): void {
  threadCache = []
  messageCache = new Map()
  messageListStateByThreadId = new Map()
  threadListState = { status: "idle" }
  pendingLocalIds.clear()
  deliveryStateByLocalMessageId.clear()
  pendingLocalMessageIdByClientMessageId.clear()
  unreadCounts = new Map()
  readAtByThread = new Map()
  summaryLastMessageByThread = new Map()
  activeThreadId = null
  notify()
}

function createClientMessageId(): string {
  return `client_${Date.now()}_${++localIdCounter}`
}

/** Mark a thread as currently being viewed — suppresses unread increments. */
export function setActiveThread(threadId: string | null): void {
  activeThreadId = threadId
  if (threadId) {
    unreadCounts.set(threadId, 0)
    notify()
  }
}

/** Clear unread count for a specific thread. */
export function markThreadRead(threadId: string): void {
  if (unreadCounts.get(threadId)) {
    unreadCounts.set(threadId, 0)
    notify()
  }
}

/** Get total unread across all threads. */
export function getTotalUnreadCount(): number {
  let total = 0
  for (const count of unreadCounts.values()) {
    total += count
  }
  return total
}

/** Get unread count for a specific thread. */
export function getThreadUnreadCount(threadId: string): number {
  return unreadCounts.get(threadId) ?? 0
}

// ─── Read helpers ───────────────────────────────────────────
export function getThreads(): ChatThread[] {
  return threadCache.map(cloneThread)
}

export function getMessages(threadId: string): ChatMessage[] {
  return messageCache.get(threadId) ?? []
}

export function getMessageListState(threadId: string): MessageListState {
  return { ...(messageListStateByThreadId.get(threadId) ?? { status: "idle" }) }
}

export function hasThreadsFetched(): boolean {
  return threadListState.status === "ready"
}

export function getThreadListState(): ThreadListState {
  return { ...threadListState }
}

function cloneThread(thread: ChatThread): ChatThread {
  return {
    ...thread,
    participantUserIds: [...thread.participantUserIds] as [string, string],
    participants: [
      cloneParticipant(thread.participants[0]),
      cloneParticipant(thread.participants[1])
    ],
    lastMessage: thread.lastMessage ? { ...thread.lastMessage } : undefined
  }
}

function cloneParticipant(
  participant: ChatThread["participants"][number]
): ChatThread["participants"][number] {
  return {
    ...participant,
    ...(participant.avatar
      ? {
          avatar: {
            ...participant.avatar,
            loadout: {
              ...participant.avatar.loadout,
              accessoryIds: [...participant.avatar.loadout.accessoryIds]
            }
          }
        }
      : {})
  }
}

/** Find a thread for a given partner userId, if the server created one. */
export function findThreadForPartner(
  partnerUserId: string
): ChatThread | undefined {
  const thread = threadCache.find((t) =>
    t.participantUserIds.includes(partnerUserId)
  )
  return thread ? cloneThread(thread) : undefined
}

// ─── Reactive hook ──────────────────────────────────────────
export interface ChatStoreView {
  threads: ChatThread[]
  threadsFetched: boolean
  threadListState: ThreadListState
  getMessages: (threadId: string) => ChatMessage[]
  getMessageListState: typeof getMessageListState
  getMessageDeliveryState: typeof getMessageDeliveryState
  getRetryableMessage: typeof getRetryableMessage
  findThreadForPartner: (partnerUserId: string) => ChatThread | undefined
  addOptimisticMessage: typeof addOptimisticMessage
  totalUnreadCount: number
  getThreadUnreadCount: typeof getThreadUnreadCount
  setActiveThread: typeof setActiveThread
  markThreadRead: typeof markThreadRead
  markOptimisticMessageSending: typeof markOptimisticMessageSending
}

export function useChatStore(): ChatStoreView {
  const [tick, setTick] = useState(0)

  const sync = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => subscribeToChatStore(sync), [sync])

  return useMemo(() => ({
    threads: getThreads(),
    threadsFetched: threadListState.status === "ready",
    threadListState: getThreadListState(),
    getMessages,
    getMessageListState,
    getMessageDeliveryState,
    getRetryableMessage,
    findThreadForPartner,
    addOptimisticMessage,
    totalUnreadCount: getTotalUnreadCount(),
    getThreadUnreadCount,
    setActiveThread,
    markThreadRead,
    markOptimisticMessageSending
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }), [tick])
}

function setMessageListState(
  threadId: string,
  state: MessageListState
): void {
  messageListStateByThreadId = new Map(messageListStateByThreadId)
  messageListStateByThreadId.set(threadId, state)
}
