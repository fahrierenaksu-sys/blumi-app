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
  ChatPartnerReceipts,
  ChatReceiptUpdated,
  ChatThread,
  ChatThreadList
} from "@blumi/contracts"
import { useMemo, useSyncExternalStore } from "react"
import {
  getMessageListErrorMessageForDisplay,
  getThreadListErrorMessageForDisplay
} from "./chatErrorCopy"
import { applyReceiptEvent, applyReceiptSnapshot } from "./chatReceiptModel"
import { keepLocalRenderKey, resetMessageRenderKeys } from "./chatMessageRenderKeys"
export { getMessageRenderKey } from "./chatMessageRenderKeys"

// ─── In-memory store ────────────────────────────────────────
let threadCache: ChatThread[] = []
let messageCache: Map<string, ChatMessage[]> = new Map()
const loadedHistoryThreads = new Set<string>()
const EMPTY_THREAD_MESSAGES: ChatMessage[] = []
const IDLE_MESSAGE_LIST_STATE = { status: "idle" } as const
export type ThreadListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "failed"; errorMessage: string }

let threadListState: ThreadListState = { status: "idle" }
let threadListVersion = 0 // bumps per applied list reply or failure (push tap routing)
export type MessageListState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "failed"; errorMessage: string }

let messageListStateByThreadId: Map<string, MessageListState> = new Map()
const messageListCompletionVersionByThreadId: Map<string, number> = new Map()

// Track optimistic message local IDs so we can replace them on server confirmation
const pendingLocalIds: Set<string> = new Set()
type MessageDeliveryState = "sending" | "failed" | "sent"
const deliveryStateByLocalMessageId: Map<string, MessageDeliveryState> = new Map()
type PendingLocalMessage = {
  clientMessageId: string
  threadId: string
  senderUserId: string
}
const pendingMessageByLocalMessageId: Map<string, PendingLocalMessage> = new Map()
let localIdCounter = 0

function findPendingLocalMessageId(
  clientMessageId: string,
  scope: { threadId?: string; senderUserId?: string; body?: string } = {}
): string | undefined {
  const matchingIds = [...pendingMessageByLocalMessageId.entries()]
    .filter(([localMessageId, pending]) => {
      if (!pendingLocalIds.has(localMessageId) || pending.clientMessageId !== clientMessageId) return false
      if (scope.threadId !== undefined && pending.threadId !== scope.threadId) return false
      if (scope.senderUserId !== undefined && pending.senderUserId !== scope.senderUserId) return false
      if (scope.body !== undefined) {
        const message = (messageCache.get(pending.threadId) ?? []).find((entry) => entry.messageId === localMessageId)
        if (message?.body !== scope.body) return false
      }
      return true
    })
    .map(([localMessageId]) => localMessageId)
  // A client id is scoped by sender and thread on the server. If a caller only
  // supplies the id and it is ambiguous locally, do not mutate another bubble.
  return matchingIds.length === 1 ? matchingIds[0] : undefined
}

function removePendingLocalMessage(localMessageId: string): void {
  pendingLocalIds.delete(localMessageId)
  deliveryStateByLocalMessageId.delete(localMessageId)
  pendingMessageByLocalMessageId.delete(localMessageId)
}

// Thread-list request tracking. A list reply is computed when its request is
// served, so a slow reply must not erase threads the client learned about
// (chat.thread_created or a newer message) after that request was issued.
let chatEventSequence = 0
let learnedSequenceByThreadId: Map<string, number> = new Map()
// Threads removed locally (blocked partner). A list whose request predates
// the removal must not bring them back; a newer list (after unblock) may.
let removedSequenceByThreadId: Map<string, number> = new Map()
let pendingRealtimeListRequestSequence: number | null = null
let lastAppliedListRequestSequence = 0

/** Marks the issue time of a list request whose reply is applied explicitly. */
export function beginChatThreadListRequest(): number {
  chatEventSequence += 1
  return chatEventSequence
}

/**
 * Records the first-page `chat.list_threads` sent when a socket connects.
 * The server answers it on that socket only, and a closed socket's replies
 * never arrive, so the newest request replaces any unanswered older one.
 */
export function noteRealtimeThreadListRequested(): void {
  pendingRealtimeListRequestSequence = beginChatThreadListRequest()
}

function markThreadLearned(threadId: string): void {
  chatEventSequence += 1
  learnedSequenceByThreadId.set(threadId, chatEventSequence)
}

// A lost send acknowledgement is reconciled only with a committed copy close
// to the optimistic bubble in time (allowing for device clock skew).
const LOST_ACK_RECONCILE_WINDOW_MS = 5 * 60_000

// Unread message tracking per thread
let unreadCounts: Map<string, number> = new Map()
let readAtByThread: Map<string, string> = new Map()
let summaryLastMessageByThread: Map<string, ChatMessage> = new Map()
// The partner's delivery/read cursors per thread, as the server disclosed them.
let partnerReceiptsByThread: Map<string, ChatPartnerReceipts> = new Map()
let activeThreadId: string | null = null // which thread is currently being viewed

type Listener = () => void
const listeners: Set<Listener> = new Set()

export function subscribeToChatStore(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Increments on every notification; the reactive view is keyed on it.
let chatStoreVersion = 0

function getChatStoreVersion(): number {
  return chatStoreVersion
}

function notify(): void {
  chatStoreVersion += 1
  for (const l of listeners) l()
}

// ─── Server-event reducers (called from RootNavigator) ──────
export function applyChatThreadListed(
  payload: ChatThreadList,
  options: { requestSequence?: number } = {}
): void {
  const merged = new Map((payload.append ? threadCache : []).map((thread) => [thread.threadId, thread]))
  let listRequestSequence = options.requestSequence ?? lastAppliedListRequestSequence
  if (!payload.append) {
    // An untracked list (demo, tests) is assumed no newer than the newest
    // tracked list already applied.
    let requestSequence = options.requestSequence
    if (requestSequence === undefined) {
      requestSequence = pendingRealtimeListRequestSequence ?? lastAppliedListRequestSequence
      pendingRealtimeListRequestSequence = null
    }
    listRequestSequence = requestSequence
    const listedIds = new Set(payload.threads.map((thread) => thread.threadId))
    for (const thread of threadCache) {
      if (listedIds.has(thread.threadId)) continue
      if ((learnedSequenceByThreadId.get(thread.threadId) ?? 0) > requestSequence) merged.set(thread.threadId, thread)
    }
    lastAppliedListRequestSequence = Math.max(lastAppliedListRequestSequence, requestSequence)
    learnedSequenceByThreadId = new Map([...learnedSequenceByThreadId]
      .filter(([, sequence]) => sequence > lastAppliedListRequestSequence))
  }
  const listedThreads = payload.threads.filter((thread) =>
    (removedSequenceByThreadId.get(thread.threadId) ?? 0) <= listRequestSequence)
  if (!payload.append) {
    removedSequenceByThreadId = new Map([...removedSequenceByThreadId]
      .filter(([, sequence]) => sequence > lastAppliedListRequestSequence))
  }
  for (const thread of listedThreads) {
    const previousSummary = summaryLastMessageByThread.get(thread.threadId)
    if (thread.lastMessage && (!previousSummary || compareMessageOrder(thread.lastMessage, previousSummary) > 0)) {
      summaryLastMessageByThread.set(thread.threadId, { ...thread.lastMessage })
    }
    const newerMessages = (messageCache.get(thread.threadId) ?? []).filter((message) =>
      !message.messageId.startsWith("__local_") && (!thread.lastMessage || compareMessageOrder(message, thread.lastMessage) > 0))
    const latestMessage = newerMessages.reduce<ChatMessage | undefined>((latest, message) =>
      !latest || compareMessageOrder(message, latest) > 0 ? message : latest, thread.lastMessage)
    merged.set(thread.threadId, cloneThread({ ...thread, ...(latestMessage ? { lastMessage: latestMessage } : {}) }))
    setPartnerReceipts(thread.threadId, applyReceiptSnapshot(partnerReceiptsByThread.get(thread.threadId), thread.partnerReceipts))
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
  threadListVersion += 1
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

/** `chat.receipt_updated`: the partner's cursor moved (only theirs, never mine). */
export function applyChatReceiptUpdated(payload: ChatReceiptUpdated, options: { localUserId?: string } = {}): void {
  if (options.localUserId && (payload.userId === options.localUserId ||
    !payload.participantUserIds.includes(options.localUserId))) return
  const current = partnerReceiptsByThread.get(payload.threadId)
  const next = applyReceiptEvent(current, payload)
  if (next === current) return
  setPartnerReceipts(payload.threadId, next)
  notify()
}

export function getPartnerReceipts(threadId: string): ChatPartnerReceipts | undefined {
  return partnerReceiptsByThread.get(threadId)
}

function setPartnerReceipts(threadId: string, receipts: ChatPartnerReceipts | undefined): void {
  if (receipts === partnerReceiptsByThread.get(threadId)) return
  partnerReceiptsByThread = new Map(partnerReceiptsByThread)
  if (receipts) partnerReceiptsByThread.set(threadId, receipts)
  else partnerReceiptsByThread.delete(threadId)
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
  threadListVersion += 1
  notify()
}

export function applyChatThreadCreated(thread: ChatThread): void {
  markThreadLearned(thread.threadId)
  // Dedupe by threadId, put newest first.
  const filtered = threadCache.filter((t) => t.threadId !== thread.threadId)
  threadCache = [cloneThread(thread), ...filtered].sort(
    (a, b) => (b.lastMessage?.sentAt ? Date.parse(b.lastMessage.sentAt) : 0) -
              (a.lastMessage?.sentAt ? Date.parse(a.lastMessage.sentAt) : 0)
  )
  notify()
}

/**
 * Drops every thread with a partner the user just blocked (the server hides
 * them too). Returns the removed thread ids. An unblock restores them through
 * the next thread-list refresh.
 */
export function removeChatThreadsWithPartner(partnerUserId: string): string[] {
  const removedIds = threadCache
    .filter((thread) => thread.participantUserIds.includes(partnerUserId))
    .map((thread) => thread.threadId)
  if (removedIds.length === 0) return []
  chatEventSequence += 1
  const removed = new Set(removedIds)
  for (const threadId of removedIds) {
    removedSequenceByThreadId.set(threadId, chatEventSequence)
    learnedSequenceByThreadId.delete(threadId)
    for (const message of messageCache.get(threadId) ?? []) {
      if (pendingLocalIds.has(message.messageId)) removePendingLocalMessage(message.messageId)
    }
    loadedHistoryThreads.delete(threadId)
    messageListCompletionVersionByThreadId.delete(threadId)
  }
  threadCache = threadCache.filter((thread) => !removed.has(thread.threadId))
  messageCache = new Map([...messageCache].filter(([threadId]) => !removed.has(threadId)))
  messageListStateByThreadId = new Map([...messageListStateByThreadId].filter(([threadId]) => !removed.has(threadId)))
  unreadCounts = new Map([...unreadCounts].filter(([threadId]) => !removed.has(threadId)))
  readAtByThread = new Map([...readAtByThread].filter(([threadId]) => !removed.has(threadId)))
  summaryLastMessageByThread = new Map([...summaryLastMessageByThread].filter(([threadId]) => !removed.has(threadId)))
  partnerReceiptsByThread = new Map([...partnerReceiptsByThread].filter(([threadId]) => !removed.has(threadId)))
  if (activeThreadId && removed.has(activeThreadId)) activeThreadId = null
  notify()
  return removedIds
}

export function applyChatMessageListed(payload: ChatMessageList): void {
  const existing = reconcileLostAcknowledgements(payload)
  const byId = new Map<string, ChatMessage>()
  for (const message of existing) {
    byId.set(message.messageId, message)
  }
  for (const message of payload.messages) {
    byId.set(message.messageId, message)
  }
  const sorted = [...byId.values()].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  messageCache.set(payload.threadId, sorted)
  setPartnerReceipts(payload.threadId, applyReceiptSnapshot(partnerReceiptsByThread.get(payload.threadId), payload.partnerReceipts))
  loadedHistoryThreads.add(payload.threadId)
  markMessageListCompleted(payload.threadId)
  setMessageListState(payload.threadId, { status: "ready" })
  notify()
}

/**
 * A send whose HTTP response and realtime echo were both lost stays failed
 * (or sending) locally while the server committed it. When history lists a
 * newly learned message from the same sender, thread and body close to the
 * bubble's time, it is that send: drop the bubble so the message shows once,
 * as sent. Pairs are matched oldest first; a message already known before
 * this list never matches, so an earlier identical message is left alone.
 */
function reconcileLostAcknowledgements(payload: ChatMessageList): ChatMessage[] {
  const existing = messageCache.get(payload.threadId) ?? []
  const knownIds = new Set(existing.map((message) => message.messageId))
  const byTime = (left: ChatMessage, right: ChatMessage) => Date.parse(left.sentAt) - Date.parse(right.sentAt)
  const localCandidates = existing
    .filter((message) => pendingLocalIds.has(message.messageId) &&
      pendingMessageByLocalMessageId.get(message.messageId)?.threadId === payload.threadId)
    .sort(byTime)
  if (localCandidates.length === 0) return existing
  const serverCandidates = payload.messages
    .filter((message) => !knownIds.has(message.messageId))
    .sort(byTime)
  const reconciledLocalIds = new Set<string>()
  const claimedServerIds = new Set<string>()
  for (const local of localCandidates) {
    const pending = pendingMessageByLocalMessageId.get(local.messageId)
    const match = serverCandidates.find((message) =>
      !claimedServerIds.has(message.messageId) &&
      message.senderUserId === pending?.senderUserId &&
      message.body === local.body &&
      Math.abs(Date.parse(message.sentAt) - Date.parse(local.sentAt)) <= LOST_ACK_RECONCILE_WINDOW_MS)
    if (!match) continue
    claimedServerIds.add(match.messageId)
    reconciledLocalIds.add(local.messageId)
    keepLocalRenderKey(match.messageId, local.messageId)
    removePendingLocalMessage(local.messageId)
  }
  return reconciledLocalIds.size === 0
    ? existing
    : existing.filter((message) => !reconciledLocalIds.has(message.messageId))
}

export function applyChatMessageListLoading(threadId: string): void {
  setMessageListState(threadId, { status: "loading" })
  notify()
}

export function applyChatMessageListFailed(
  threadId: string,
  errorMessage: string
): void {
  markMessageListCompleted(threadId)
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
  const alreadyReceived = existing.some((entry) => entry.messageId === message.messageId)

  // Realtime ChatMessage currently omits clientMessageId. Reconcile only a
  // unique local candidate with the same thread, sender and body; if identical
  // sends make this ambiguous, leave them for the exact HTTP ACK to resolve.
  const pendingEchoCandidates = options.localUserId && message.senderUserId !== options.localUserId
    ? []
    : existing.filter((entry) => {
      if (!pendingLocalIds.has(entry.messageId) || entry.senderUserId !== message.senderUserId || entry.body !== message.body) {
        return false
      }
      const pending = pendingMessageByLocalMessageId.get(entry.messageId)
      return !pending || (pending.threadId === message.threadId && pending.senderUserId === message.senderUserId)
    })
  const pendingEchoId = pendingEchoCandidates.length === 1 ? pendingEchoCandidates[0]?.messageId : undefined

  if (alreadyReceived && !pendingEchoId) return
  if (pendingEchoId) removePendingLocalMessage(pendingEchoId)
  if (pendingEchoId && !alreadyReceived) keepLocalRenderKey(message.messageId, pendingEchoId)
  const cleaned = pendingEchoId ? existing.filter((entry) => entry.messageId !== pendingEchoId) : existing
  const sorted = (alreadyReceived ? cleaned : [...cleaned, message])
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  messageCache.set(message.threadId, sorted)
  if (!alreadyReceived && threadCache.some((thread) => thread.threadId === message.threadId)) {
    markThreadLearned(message.threadId)
  }

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
    !alreadyReceived &&
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
    pendingMessageByLocalMessageId.set(localId, {
      clientMessageId,
      threadId: opts.threadId,
      senderUserId: opts.senderUserId
    })
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
  const localMessageId = findPendingLocalMessageId(clientMessageId)
  if (!localMessageId) return
  deliveryStateByLocalMessageId.set(localMessageId, "failed")
  notify()
}

export function markOptimisticMessageSending(clientMessageId: string): void {
  const localMessageId = findPendingLocalMessageId(clientMessageId)
  if (!localMessageId) return
  deliveryStateByLocalMessageId.set(localMessageId, "sending")
  notify()
}

export function confirmOptimisticMessage(
  clientMessageId: string,
  message: ChatMessage,
  localUserId?: string
): void {
  const localMessageId = findPendingLocalMessageId(clientMessageId, {
    threadId: message.threadId,
    senderUserId: message.senderUserId,
    body: message.body
  })
  if (!localMessageId) {
    applyChatMessageReceived(message, { localUserId })
    return
  }
  removePendingLocalMessage(localMessageId)
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
  keepLocalRenderKey(message.messageId, localMessageId)
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
  const pending = pendingMessageByLocalMessageId.get(messageId)
  if (!pending) return null
  const message = [...messageCache.values()].flat().find(
    (entry) => entry.messageId === messageId
  )
  return message
    ? { body: message.body, clientMessageId: pending.clientMessageId, threadId: pending.threadId }
    : null
}

export function resetChatStore(): void {
  threadCache = []
  messageCache = new Map()
  loadedHistoryThreads.clear()
  messageListStateByThreadId = new Map()
  messageListCompletionVersionByThreadId.clear()
  threadListState = { status: "idle" }
  pendingLocalIds.clear()
  deliveryStateByLocalMessageId.clear()
  pendingMessageByLocalMessageId.clear()
  resetMessageRenderKeys()
  unreadCounts = new Map()
  readAtByThread = new Map()
  summaryLastMessageByThread = new Map()
  partnerReceiptsByThread = new Map()
  activeThreadId = null
  learnedSequenceByThreadId = new Map()
  removedSequenceByThreadId = new Map()
  pendingRealtimeListRequestSequence = null
  lastAppliedListRequestSequence = 0
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

/** Only a focused, foreground ChatThread screen registers itself as active. */
export function getActiveChatThreadId(): string | null { return activeThreadId }

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

/** Subscribe only to the primitive badge value, not every chat-store update. */
export function useTotalUnreadCount(): number {
  return useSyncExternalStore(
    subscribeToChatStore,
    getTotalUnreadCount,
    getTotalUnreadCount
  )
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
  return messageCache.get(threadId) ?? EMPTY_THREAD_MESSAGES
}

export interface ChatThreadSnapshot {
  thread: ChatThread | undefined
  messages: ChatMessage[]
  messageListState: MessageListState
  historyReady: boolean
  deliveryKey: string
  partnerReceipts: ChatPartnerReceipts | undefined
}

/** Only this conversation's changes invalidate the native timeline. */
export function createChatThreadSnapshotReader(threadId?: string, partnerId?: string): () => ChatThreadSnapshot {
  let previous: ChatThreadSnapshot | undefined
  return () => {
    const thread = threadCache.find((entry) => threadId
      ? entry.threadId === threadId
      : Boolean(partnerId && entry.participantUserIds.includes(partnerId)))
    const resolvedId = thread?.threadId ?? threadId
    const messages = resolvedId ? getMessages(resolvedId) : EMPTY_THREAD_MESSAGES
    const messageListState = (resolvedId && messageListStateByThreadId.get(resolvedId)) || IDLE_MESSAGE_LIST_STATE
    const historyReady = Boolean(resolvedId && loadedHistoryThreads.has(resolvedId))
    const deliveryKey = messages.map((message) => getMessageDeliveryState(message.messageId)).join("|")
    const partnerReceipts = resolvedId ? partnerReceiptsByThread.get(resolvedId) : undefined
    if (previous && previous.thread === thread && previous.messages === messages &&
      previous.messageListState === messageListState && previous.historyReady === historyReady &&
      previous.deliveryKey === deliveryKey && previous.partnerReceipts === partnerReceipts) return previous
    previous = { thread, messages, messageListState, historyReady, deliveryKey, partnerReceipts }
    return previous
  }
}

export function useChatThreadStore(threadId?: string, partnerId?: string) {
  const read = useMemo(() => createChatThreadSnapshotReader(threadId, partnerId), [threadId, partnerId])
  const snapshot = useSyncExternalStore(subscribeToChatStore, read, read)
  return {
    ...snapshot,
    addOptimisticMessage,
    getMessageDeliveryState,
    getRetryableMessage,
    markOptimisticMessageSending,
    setActiveThread
  }
}

export function getMessageListState(threadId: string): MessageListState {
  return { ...(messageListStateByThreadId.get(threadId) ?? { status: "idle" }) }
}

/** Monotonic per-thread marker for completed server history requests. */
export function getMessageListCompletionVersion(threadId: string): number {
  return messageListCompletionVersionByThreadId.get(threadId) ?? 0
}

export function hasMessageHistory(threadId: string): boolean {
  return loadedHistoryThreads.has(threadId)
}

export function hasThreadsFetched(): boolean {
  return threadListState.status === "ready"
}

export function getThreadListState(): ThreadListState {
  return { ...threadListState }
}

export function getThreadListStatus(): ThreadListState["status"] { return threadListState.status }
export function getThreadListVersion(): number { return threadListVersion }
/** Re-renders only when a thread list reply or failure is applied. */
export function useThreadListVersion(): number {
  return useSyncExternalStore(subscribeToChatStore, getThreadListVersion, getThreadListVersion)
}
export function hasChatThread(threadId: string): boolean { return threadCache.some((thread) => thread.threadId === threadId) }

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
  /** Store notification this view was built for; equal versions carry equal data. */
  storeVersion: number
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
  const storeVersion = useSyncExternalStore(
    subscribeToChatStore,
    getChatStoreVersion,
    getChatStoreVersion
  )

  return useMemo(() => ({
    storeVersion,
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
  }), [storeVersion])
}

function setMessageListState(
  threadId: string,
  state: MessageListState
): void {
  messageListStateByThreadId = new Map(messageListStateByThreadId)
  messageListStateByThreadId.set(threadId, state)
}

function markMessageListCompleted(threadId: string): void {
  messageListCompletionVersionByThreadId.set(
    threadId,
    getMessageListCompletionVersion(threadId) + 1
  )
}
