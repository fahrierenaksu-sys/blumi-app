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
  ChatReceiptCursor,
  ChatParticipantSummary,
  ChatPartnerReceipts,
  ChatReceiptUpdated,
  ChatThread,
  ChatThreadList,
  CompleteAvatarSelection
} from "@blumi/contracts"
import { useMemo, useSyncExternalStore } from "react"
import {
  getMessageListErrorMessageForDisplay,
  getThreadListErrorMessageForDisplay
} from "./chatErrorCopy"
import { applyReceiptEvent, applyReceiptSnapshot } from "./chatReceiptModel"
import { keepLocalRenderKey, resetMessageRenderKeys } from "./chatMessageRenderKeys"
import { forgetPartnerReceipts, getPartnerReceipts, resetPartnerReceipts, setPartnerReceipts } from "./chatPartnerReceiptsState"
import { compareMessageOrder, forgetReadHere, getReadHereThrough, noteReadHere, resetReadHere } from "./chatReadHere"
export { getPartnerReceipts } from "./chatPartnerReceiptsState"
export { getMessageRenderKey } from "./chatMessageRenderKeys"

// ─── In-memory store ────────────────────────────────────────
let threadCache: ChatThread[] = []
let messageCache: Map<string, ChatMessage[]> = new Map()
const loadedHistoryThreads = new Set<string>()
// First-page membership is separate from the merged cache: after an offline
// gap, a window must not page from an older disconnected cache segment.
const latestHistoryMessageIdsByThread = new Map<string, readonly string[]>()
const earlierHistoryMessageIdsByThread = new Map<string, Map<string, readonly string[]>>()
const deliveryVersionByThread = new Map<string, number>()
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
  bumpDeliveryVersion(localMessageId)
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
// `chat.participant_updated`: a partner's current name and outfit. A list
// reply whose request was issued before the update must not bring back the
// old name; a list requested after it already carries the new one.
let participantUpdatesByUserId: Map<string, { sequence: number; participant: ChatParticipantSummary }> = new Map()

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
let activeThreadId: string | null = null // which thread is currently being viewed

function noteReadOnThisDevice(threadId: string, messageId?: string): void {
  if (messageId !== undefined) {
    const message = (messageCache.get(threadId) ?? []).find((entry) => entry.messageId === messageId) ??
      threadCache.find((thread) => thread.threadId === threadId)?.lastMessage
    if (message?.messageId === messageId) noteReadHere(threadId, [message])
    return
  }
  noteReadHere(threadId, [threadCache.find((thread) => thread.threadId === threadId)?.lastMessage, ...(messageCache.get(threadId) ?? [])])
}

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
  const previousById = new Map(threadCache.map((thread) => [thread.threadId, thread]))
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
    merged.set(thread.threadId, reuseThread(previousById.get(thread.threadId), withParticipantUpdates(
      cloneThread({ ...thread, ...(latestMessage ? { lastMessage: latestMessage } : {}) }),
      listRequestSequence
    )))
    applyStableReceiptSnapshot(thread.threadId, thread.partnerReceipts)
    const currentReadAt = readAtByThread.get(thread.threadId)
    if (thread.lastReadAt && (!currentReadAt || Date.parse(thread.lastReadAt) >= Date.parse(currentReadAt))) readAtByThread.set(thread.threadId, thread.lastReadAt)
    if (thread.unreadCount !== undefined && (!currentReadAt || (thread.lastReadAt && Date.parse(thread.lastReadAt) >= Date.parse(currentReadAt)))) {
      const readHereThrough = getReadHereThrough(thread.threadId) // all listed messages read here?
      const listReadHere = readHereThrough && thread.lastMessage && compareMessageOrder(thread.lastMessage, readHereThrough) <= 0
      const newlyReceivedUnread = newerMessages.filter((message) => message.senderUserId !== payload.userId &&
        (!thread.lastReadAt || Date.parse(message.sentAt) > Date.parse(thread.lastReadAt)) &&
        (!readHereThrough || compareMessageOrder(message, readHereThrough) > 0)).length
      unreadCounts.set(thread.threadId, activeThreadId === thread.threadId ? 0 : (listReadHere ? 0 : thread.unreadCount) + newlyReceivedUnread)
    }
  }
  if (!payload.append) {
    unreadCounts = new Map([...unreadCounts].filter(([threadId]) => merged.has(threadId)))
    participantUpdatesByUserId = new Map([...participantUpdatesByUserId]
      .filter(([, update]) => update.sequence > lastAppliedListRequestSequence))
  }
  const sorted = [...merged.values()].sort(
    (a, b) => (b.lastMessage?.sentAt ? Date.parse(b.lastMessage.sentAt) : 0) -
              (a.lastMessage?.sentAt ? Date.parse(a.lastMessage.sentAt) : 0)
  )
  if (!sameEntries(threadCache, sorted)) threadCache = sorted
  if (threadListState.status !== "ready") threadListState = { status: "ready" }
  threadListVersion += 1
  notify()
}

/**
 * `chat.participant_updated`: a partner saved a new name or outfit. Every
 * conversation with them shows it at once (list row, open chat header); the
 * conversation itself, its order and unread state stay as they are.
 */
export function applyChatParticipantUpdated(participant: ChatParticipantSummary): void {
  chatEventSequence += 1
  participantUpdatesByUserId = new Map(participantUpdatesByUserId)
  participantUpdatesByUserId.set(participant.userId, { sequence: chatEventSequence, participant: cloneParticipant(participant) })
  let changed = false
  const updatedThreads = threadCache.map((thread) => {
    if (!thread.participantUserIds.includes(participant.userId)) return thread
    const updated = reuseThread(thread, withParticipantUpdates(thread, 0))
    if (updated !== thread) changed = true
    return updated
  })
  if (changed) {
    threadCache = updatedThreads
    notify()
  }
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
  const current = getPartnerReceipts(payload.threadId)
  const next = applyReceiptEvent(current, payload)
  if (next === current) return
  setPartnerReceipts(payload.threadId, next)
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
    latestHistoryMessageIdsByThread.delete(threadId)
    earlierHistoryMessageIdsByThread.delete(threadId)
    deliveryVersionByThread.delete(threadId)
    messageListCompletionVersionByThreadId.delete(threadId)
  }
  threadCache = threadCache.filter((thread) => !removed.has(thread.threadId))
  messageCache = new Map([...messageCache].filter(([threadId]) => !removed.has(threadId)))
  messageListStateByThreadId = new Map([...messageListStateByThreadId].filter(([threadId]) => !removed.has(threadId)))
  unreadCounts = new Map([...unreadCounts].filter(([threadId]) => !removed.has(threadId)))
  readAtByThread = new Map([...readAtByThread].filter(([threadId]) => !removed.has(threadId)))
  summaryLastMessageByThread = new Map([...summaryLastMessageByThread].filter(([threadId]) => !removed.has(threadId)))
  forgetPartnerReceipts(removed)
  forgetReadHere(removed)
  participantUpdatesByUserId = new Map([...participantUpdatesByUserId].filter(([userId]) => userId !== partnerUserId))
  if (activeThreadId && removed.has(activeThreadId)) activeThreadId = null
  notify()
  return removedIds
}

export function applyChatMessageListed(payload: ChatMessageList, options: { before?: string } = {}): void {
  const existing = reconcileLostAcknowledgements(payload)
  const byId = new Map<string, ChatMessage>()
  for (const message of existing) {
    byId.set(message.messageId, message)
  }
  for (const message of payload.messages) {
    const known = byId.get(message.messageId)
    byId.set(message.messageId, sameMessage(known, message) ? known! : message)
  }
  const sorted = [...byId.values()].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
  if (!sameEntries(existing, sorted) || !messageCache.has(payload.threadId)) messageCache.set(payload.threadId, sorted)
  if (!options.before) {
    const latestIds = payload.messages.map((message) => message.messageId)
    if (!sameEntries(latestHistoryMessageIdsByThread.get(payload.threadId) ?? [], latestIds) ||
      !latestHistoryMessageIdsByThread.has(payload.threadId)) latestHistoryMessageIdsByThread.set(payload.threadId, latestIds)
  } else {
    let pages = earlierHistoryMessageIdsByThread.get(payload.threadId)
    if (!pages) earlierHistoryMessageIdsByThread.set(payload.threadId, pages = new Map())
    const ids = payload.messages.map((message) => message.messageId)
    if (!sameEntries(pages.get(options.before) ?? [], ids) || !pages.has(options.before)) pages.set(options.before, ids)
  }
  applyStableReceiptSnapshot(payload.threadId, payload.partnerReceipts)
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
  // A duplicated acknowledgement of an earlier identical send carries no
  // new identity. It must not consume a newer pending bubble with that body.
  if (alreadyReceived) return

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

  if (pendingEchoId) removePendingLocalMessage(pendingEchoId)
  if (pendingEchoId && !alreadyReceived) keepLocalRenderKey(message.messageId, pendingEchoId)
  const cleaned = pendingEchoId ? existing.filter((entry) => entry.messageId !== pendingEchoId) : existing
  // The usual live message appends to an ordered cache. Binary insertion also
  // handles delayed delivery without sorting all old history. History loads
  // and local pending rows preserve this chronological cache invariant.
  const sorted = insertChronologicalMessage(cleaned, message)
  messageCache.set(message.threadId, sorted)
  if (!alreadyReceived && threadCache.some((thread) => thread.threadId === message.threadId)) {
    markThreadLearned(message.threadId)
  }

  // Update lastMessage on thread
  const nextThreads = threadCache.map((thread) =>
    thread.threadId === message.threadId && (!thread.lastMessage || compareMessageOrder(message, thread.lastMessage) > 0)
      ? { ...thread, lastMessage: message }
      : thread
  ).sort(
    (a, b) => (b.lastMessage?.sentAt ? Date.parse(b.lastMessage.sentAt) : 0) -
              (a.lastMessage?.sentAt ? Date.parse(a.lastMessage.sentAt) : 0)
  )
  if (!sameEntries(threadCache, nextThreads)) threadCache = nextThreads

  // Focus suppresses a badge, but the screen names the actual visible cursor
  // when it marks read. Cached or incoming rows alone are not proof of a read.
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
  /** Injectable presentation clock; committed timestamps still come from the server. */
  now?: number
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

  const existing = messageCache.get(opts.threadId) ?? []
  const lastKnownTime = Date.parse(existing.at(-1)?.sentAt ?? "")
  // This is only the pending row's presentation position. A backwards
  // device clock must not put a newly sent bubble outside the recent window;
  // the committed ACK replaces it with the authoritative server timestamp.
  const localNow = opts.now !== undefined && Number.isFinite(opts.now) ? opts.now : Date.now()
  const localSentAt = Math.max(localNow, Number.isFinite(lastKnownTime) ? lastKnownTime + 1 : 0)

  const optimistic: ChatMessage = {
    messageId: localId,
    threadId: opts.threadId,
    senderUserId: opts.senderUserId,
    body: opts.body,
    sentAt: new Date(localSentAt).toISOString()
  }

  messageCache.set(opts.threadId, insertChronologicalMessage(existing, optimistic))
  bumpThreadDeliveryVersion(opts.threadId)
  notify()
  return { localMessageId: localId, clientMessageId }
}

export function markOptimisticMessageFailed(clientMessageId: string): boolean {
  const localMessageId = findPendingLocalMessageId(clientMessageId)
  if (!localMessageId || deliveryStateByLocalMessageId.get(localMessageId) === "failed") return false
  deliveryStateByLocalMessageId.set(localMessageId, "failed")
  bumpDeliveryVersion(localMessageId)
  notify()
  return true
}

export function markOptimisticMessageSending(clientMessageId: string): void {
  const localMessageId = findPendingLocalMessageId(clientMessageId)
  if (!localMessageId || deliveryStateByLocalMessageId.get(localMessageId) === "sending") return
  deliveryStateByLocalMessageId.set(localMessageId, "sending")
  bumpDeliveryVersion(localMessageId)
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

function bumpDeliveryVersion(localMessageId: string): void {
  const threadId = pendingMessageByLocalMessageId.get(localMessageId)?.threadId
  if (threadId) bumpThreadDeliveryVersion(threadId)
}

function bumpThreadDeliveryVersion(threadId: string): void {
  deliveryVersionByThread.set(threadId, (deliveryVersionByThread.get(threadId) ?? 0) + 1)
}

export function getRetryableMessage(messageId: string): {
  body: string
  clientMessageId: string
  threadId: string
} | null {
  const pending = pendingMessageByLocalMessageId.get(messageId)
  if (!pending) return null
  const message = (messageCache.get(pending.threadId) ?? []).find(
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
  latestHistoryMessageIdsByThread.clear()
  earlierHistoryMessageIdsByThread.clear()
  deliveryVersionByThread.clear()
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
  resetPartnerReceipts()
  resetReadHere()
  activeThreadId = null
  learnedSequenceByThreadId = new Map()
  removedSequenceByThreadId = new Map()
  pendingRealtimeListRequestSequence = null
  lastAppliedListRequestSequence = 0
  participantUpdatesByUserId = new Map()
  notify()
}

function createClientMessageId(): string {
  return `client_${Date.now()}_${++localIdCounter}`
}

/** Mark a thread as currently being viewed — suppresses unread increments. */
export function setActiveThread(threadId: string | null): void {
  activeThreadId = threadId
  if (threadId) {
    if (unreadCounts.get(threadId)) {
      unreadCounts.set(threadId, 0)
      notify()
    }
  }
}

/** Only a focused, foreground ChatThread screen registers itself as active. */
export function getActiveChatThreadId(): string | null { return activeThreadId }

/**
 * The server hid the conversation for this account through `hiddenThrough`
 * ("delete chat for me", migration 071). Cached messages at or before it are
 * dropped so a conversation brought back by a newer message shows only what
 * came after, as the server's history does. Unsent bubbles stay.
 */
export function applyChatThreadHiddenForMe(threadId: string, hiddenThrough: string): void {
  const through = Date.parse(hiddenThrough)
  if (!Number.isFinite(through)) return
  const cached = messageCache.get(threadId)
  if (!cached) return
  const kept = cached.filter((message) => pendingLocalIds.has(message.messageId) || Date.parse(message.sentAt) > through)
  if (kept.length === cached.length) return
  messageCache = new Map(messageCache)
  messageCache.set(threadId, kept)
  notify()
}

/** Clear unread count for a specific thread. */
export function markThreadRead(threadId: string, upToMessageId?: string): void {
  noteReadOnThisDevice(threadId, upToMessageId)
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
// Every reducer replaces `threadCache` with a new array, so one clone per
// thread-list change serves every read until the next change. Unread, typing
// and message notifications no longer deep-clone every thread (the Inbox
// read this on each store notification, including on a row's press-in).
let threadSnapshotSource: ChatThread[] | null = null
let threadSnapshot: ChatThread[] = []
const threadSnapshotClones = new WeakMap<ChatThread, ChatThread>()

/** The threads, newest first. Shared between reads until the list changes: treat it as read-only. */
export function getThreads(): ChatThread[] {
  if (threadSnapshotSource !== threadCache) {
    threadSnapshot = threadCache.map((thread) => {
      const previous = threadSnapshotClones.get(thread)
      if (previous) return previous
      const snapshot = cloneThread(thread)
      threadSnapshotClones.set(thread, snapshot)
      return snapshot
    })
    threadSnapshotSource = threadCache
  }
  return threadSnapshot
}

export function getMessages(threadId: string): ChatMessage[] {
  return messageCache.get(threadId) ?? EMPTY_THREAD_MESSAGES
}

/** Server-confirmed membership of an older page, including a confirmed empty page. */
export function getHistoryPageMessageIds(threadId: string, before: string): readonly string[] | undefined {
  return earlierHistoryMessageIdsByThread.get(threadId)?.get(before)
}

export interface ChatThreadSnapshot {
  thread: ChatThread | undefined
  messages: ChatMessage[]
  messageListState: MessageListState
  historyReady: boolean
  /** Latest server page membership, unaffected by live events or older-page loads. */
  latestHistoryMessageIds: readonly string[] | undefined
  /** Opaque thread-local invalidation key; never scans canonical history. */
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
    const deliveryKey = String(resolvedId ? deliveryVersionByThread.get(resolvedId) ?? 0 : 0)
    const latestHistoryMessageIds = resolvedId ? latestHistoryMessageIdsByThread.get(resolvedId) : undefined
    const partnerReceipts = resolvedId ? getPartnerReceipts(resolvedId) : undefined
    if (previous && previous.thread === thread && previous.messages === messages &&
      previous.messageListState === messageListState && previous.historyReady === historyReady &&
      previous.latestHistoryMessageIds === latestHistoryMessageIds &&
      previous.deliveryKey === deliveryKey && previous.partnerReceipts === partnerReceipts) return previous
    previous = { thread, messages, messageListState, historyReady, latestHistoryMessageIds, deliveryKey, partnerReceipts }
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

function sameEntries<T>(first: readonly T[], second: readonly T[]): boolean {
  return first === second || (first.length === second.length && first.every((entry, index) => entry === second[index]))
}

function insertChronologicalMessage(messages: readonly ChatMessage[], message: ChatMessage): ChatMessage[] {
  const sentAt = Date.parse(message.sentAt)
  let left = 0
  let right = messages.length
  while (left < right) {
    const middle = (left + right) >>> 1
    // Insert after equal timestamps, matching stable sort's original order.
    if (Date.parse(messages[middle]!.sentAt) <= sentAt) left = middle + 1
    else right = middle
  }
  return [...messages.slice(0, left), message, ...messages.slice(left)]
}

function sameMessage(first: ChatMessage | undefined, second: ChatMessage | undefined): boolean {
  return first === second || Boolean(first && second &&
    first.messageId === second.messageId && first.threadId === second.threadId &&
    first.senderUserId === second.senderUserId && first.body === second.body &&
    first.sentAt === second.sentAt && first.deliveredAt === second.deliveredAt &&
    first.readAt === second.readAt && first.editedAt === second.editedAt)
}

function sameCursor(first: ChatReceiptCursor | undefined, second: ChatReceiptCursor | undefined): boolean {
  return first === second || Boolean(first && second && first.sentAt === second.sentAt && first.messageId === second.messageId)
}

function sameReceipts(first: ChatPartnerReceipts | undefined, second: ChatPartnerReceipts | undefined): boolean {
  return first === second || Boolean(first && second &&
    sameCursor(first.deliveredUpTo, second.deliveredUpTo) && sameCursor(first.readUpTo, second.readUpTo))
}

function applyStableReceiptSnapshot(threadId: string, snapshot: ChatPartnerReceipts | undefined): void {
  const previous = getPartnerReceipts(threadId)
  const next = applyReceiptSnapshot(previous, snapshot)
  setPartnerReceipts(threadId, sameReceipts(previous, next) ? previous : next)
}

function sameAvatar(first: CompleteAvatarSelection | undefined, second: CompleteAvatarSelection | undefined): boolean {
  if (first === second) return true
  if (!first || !second || first.presetId !== second.presetId || first.revision !== second.revision) return false
  const a = first.loadout
  const b = second.loadout
  if (!a || !b || !Array.isArray(a.accessoryIds) || !Array.isArray(b.accessoryIds)) return false
  return a.schemaVersion === b.schemaVersion && a.bodyId === b.bodyId && a.faceId === b.faceId &&
    a.eyesId === b.eyesId && a.noseId === b.noseId && a.mouthId === b.mouthId &&
    a.hairId === b.hairId && a.topId === b.topId && a.bottomId === b.bottomId && a.shoesId === b.shoesId &&
    (a.schemaVersion === 2 ? a.dressId : undefined) === (b.schemaVersion === 2 ? b.dressId : undefined) &&
    (a.schemaVersion === 2 ? a.outerwearId : undefined) === (b.schemaVersion === 2 ? b.outerwearId : undefined) &&
    sameEntries(a.accessoryIds, b.accessoryIds)
}

function sameParticipant(first: ChatParticipantSummary, second: ChatParticipantSummary): boolean {
  return first === second || (first.userId === second.userId && first.displayName === second.displayName &&
    sameAvatar(first.avatar, second.avatar))
}

/** Server refreshes preserve unchanged identities; changed fields still replace their records. */
function reuseThread(previous: ChatThread | undefined, next: ChatThread): ChatThread {
  if (!previous) return next
  const participants = next.participants.map((participant, index) =>
    sameParticipant(previous.participants[index]!, participant) ? previous.participants[index]! : participant
  ) as ChatThread["participants"]
  const lastMessage = sameMessage(previous.lastMessage, next.lastMessage) ? previous.lastMessage : next.lastMessage
  const partnerReceipts = sameReceipts(previous.partnerReceipts, next.partnerReceipts) ? previous.partnerReceipts : next.partnerReceipts
  const sameIds = sameEntries(previous.participantUserIds, next.participantUserIds)
  const samePeople = sameEntries(previous.participants, participants)
  if (previous.threadId === next.threadId && previous.miniRoomId === next.miniRoomId &&
    previous.createdAt === next.createdAt && previous.unreadCount === next.unreadCount &&
    previous.lastReadAt === next.lastReadAt && previous.hiddenThrough === next.hiddenThrough &&
    previous.lastMessage === lastMessage && previous.partnerReceipts === partnerReceipts && sameIds && samePeople) return previous
  return { ...next, participants: samePeople ? previous.participants : participants,
    participantUserIds: sameIds ? previous.participantUserIds : next.participantUserIds, lastMessage, partnerReceipts }
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

/**
 * `thread` with the participant updates that are newer than `sequence` laid
 * over it (the same object when nothing changes). A missing field in an
 * update keeps what the thread already shows.
 */
function withParticipantUpdates(thread: ChatThread, sequence: number): ChatThread {
  let changed = false
  const participants = thread.participants.map((participant) => {
    const update = participantUpdatesByUserId.get(participant.userId)
    if (!update || update.sequence <= sequence) return participant
    const displayName = update.participant.displayName ?? participant.displayName
    const avatar = update.participant.avatar ?? participant.avatar
    if (displayName === participant.displayName && avatar === participant.avatar) return participant
    changed = true
    return cloneParticipant({
      ...participant,
      ...(displayName !== undefined ? { displayName } : {}),
      ...(avatar ? { avatar } : {})
    })
  }) as ChatThread["participants"]
  return changed ? { ...thread, participants } : thread
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
export interface ChatInboxSnapshot {
  threads: ChatThread[]
  threadListState: ThreadListState
  unreadCounts: ReadonlyMap<string, number>
  getThreadUnreadCount: typeof getThreadUnreadCount
}

/** History, receipts and send-state updates have no visible effect on the Inbox. */
export function createChatInboxSnapshotReader(): () => ChatInboxSnapshot {
  let previous: ChatInboxSnapshot | undefined
  return () => {
    const threads = getThreads()
    const sameUnread = previous && previous.unreadCounts.size === threads.length &&
      threads.every((thread) => previous!.unreadCounts.get(thread.threadId) === getThreadUnreadCount(thread.threadId))
    if (previous && previous.threads === threads && sameListState(previous.threadListState, threadListState) && sameUnread) return previous
    previous = {
      threads,
      threadListState,
      unreadCounts: sameUnread ? previous!.unreadCounts : new Map(threads.map((thread) => [thread.threadId, getThreadUnreadCount(thread.threadId)])),
      getThreadUnreadCount
    }
    return previous
  }
}

export function useChatInboxStore(): ChatInboxSnapshot {
  const read = useMemo(() => createChatInboxSnapshotReader(), [])
  return useSyncExternalStore(subscribeToChatStore, read, read)
}

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
  const previous = messageListStateByThreadId.get(threadId)
  if (previous && sameListState(previous, state)) return
  messageListStateByThreadId = new Map(messageListStateByThreadId)
  messageListStateByThreadId.set(threadId, state)
}

function sameListState(first: ThreadListState | MessageListState, second: ThreadListState | MessageListState): boolean {
  return first.status === second.status && (first.status !== "failed" ||
    (second.status === "failed" && first.errorMessage === second.errorMessage))
}

function markMessageListCompleted(threadId: string): void {
  messageListCompletionVersionByThreadId.set(
    threadId,
    getMessageListCompletionVersion(threadId) + 1
  )
}
