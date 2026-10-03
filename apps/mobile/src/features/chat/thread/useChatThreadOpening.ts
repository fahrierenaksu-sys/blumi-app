import type { ChatMessage } from "@blumi/contracts"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getHistoryPageMessageIds, getMessageRenderKey } from "../chatStore"
import { CHAT_INITIAL_HISTORY_LIMIT } from "../chatHistoryPolicy"
import type { ChatRoomInviteHistory } from "../chatRoomInvitePagingStore"
import {
  buildChatTimeline,
  compareChatTimelineItems,
  getChatTimelineItemKey,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"
import {
  CHAT_THREAD_SKELETON_DELAY_MS,
  buildChatThreadWindow,
  countChatRowsAddedWithinWindow,
  getOldestConfirmedChatMessageId,
  hasEarlierCachedChatRows,
  isDisjointChatHistoryPage,
  resolveChatThreadBody,
  resolveChatTimelineReveal,
  selectChatThreadOpeningMessages,
  type ChatThreadBody,
  type ChatThreadListStatus,
  type ChatTimelineReveal
} from "./chatThreadOpeningModel"

export interface ChatThreadOpening {
  /** Chronological rows to draw: cached messages (or the row's last message) and invitations. */
  timeline: ChatTimelineItem[]
  body: ChatThreadBody
  /** The skeleton is on screen: still nothing to show after CHAT_THREAD_SKELETON_DELAY_MS. */
  showsSkeleton: boolean
  /** The skeleton was on screen at some point (what replaces it fades in). */
  skeletonWasShown: boolean
  timelineReveal: ChatTimelineReveal
  hasOlderCachedRows: boolean
  oldestVisibleMessageId: string | null
  cachedEarlierInviteIds: readonly string[]
  /** History fills in silently, including equal-time pages at the newest edge. */
  absorbedHistoryKeys: ReadonlySet<string>
  /** Expand after a confirmed page, or locally when no message cursor is shown. */
  revealEarlier(rowCount?: number, confirmedPageIds?: readonly string[], confirmedInviteIds?: readonly string[]): void
}

/**
 * What an opening conversation draws, decided in the render that mounts it
 * (chatThreadOpeningModel holds the rules). The recent cached window
 * is in the first frame; nothing waits for the push transition, an
 * interaction or a fade. The skeleton is the only delayed piece: it appears
 * only when there is still nothing to show after the delay.
 */
export function useChatThreadOpening(input: {
  threadId: string | undefined
  currentUserId?: string
  messages: readonly ChatMessage[]
  lastMessage: ChatMessage | undefined
  historyReady: boolean
  latestHistoryMessageIds?: readonly string[]
  listStatus: ChatThreadListStatus
  roomInvites: readonly ChatRoomInviteTimelineItem[]
  inviteHistory?: ChatRoomInviteHistory
  waitsForServerHistory: boolean
  isPendingThread: boolean
}): ChatThreadOpening {
  const { threadId, currentUserId, messages, lastMessage, historyReady, latestHistoryMessageIds, inviteHistory } = input
  const roomInvites = useMemo(() => {
    if (!inviteHistory?.ready) return input.roomInvites
    const allowed = new Set([...inviteHistory.historyInviteIds, ...inviteHistory.activeInviteIds])
    return input.roomInvites.filter(invite => allowed.has(invite.inviteId))
  }, [input.roomInvites, inviteHistory])
  const openingMessages = useMemo(
    () => selectChatThreadOpeningMessages({ messages, historyReady, threadId, lastMessage }),
    [historyReady, lastMessage, messages, threadId]
  )
  const [requestedWindow, setRequestedWindow] = useState({ threadId, currentUserId, earlierRows: 0 })
  const sameScope = requestedWindow.threadId === threadId && requestedWindow.currentUserId === currentUserId
  if (!sameScope) setRequestedWindow({ threadId, currentUserId, earlierRows: 0 })
  const earlierRows = sameScope ? requestedWindow.earlierRows : 0
  const currentScope = useRef({ threadId, currentUserId })
  currentScope.current = { threadId, currentUserId }
  const committedWindow = useRef<{
    threadId: string | undefined; currentUserId: string | undefined; earlierRows: number;
    rowLimit: number; timeline: readonly ChatTimelineItem[]; latestHistoryMessageIds: readonly string[] | undefined;
    excludedCursorKeys: ReadonlySet<string>; cachedKeys: ReadonlySet<string>; latestInviteIds?: readonly string[];
    eligibleMessageKeys: ReadonlySet<string>
  } | null>(null)
  const window = useMemo(() => {
    const committed = committedWindow.current
    const previous = committed && committed.threadId === threadId && committed.currentUserId === currentUserId ? committed : null
    const latestPageChanged = !!previous && previous.latestHistoryMessageIds !== latestHistoryMessageIds
    const invitePageChanged = !!previous && previous.latestInviteIds !== inviteHistory?.latestInviteIds && !!inviteHistory?.ready
    const disjointInvites = invitePageChanged && !!previous.latestInviteIds?.length &&
      !previous.latestInviteIds.some(id => inviteHistory!.latestInviteIds.includes(id))
    const resetMessages = latestPageChanged && ((!historyReady && latestHistoryMessageIds === undefined) || isDisjointChatHistoryPage(
      previous.timeline, latestHistoryMessageIds, getMessageRenderKey, previous.latestHistoryMessageIds
    ))
    const resetToLatest = disjointInvites || resetMessages
    const previousCursor = previous && getOldestConfirmedChatMessageId(previous.timeline, () => "sent", previous.excludedCursorKeys)
    const earlierPageIds = !resetMessages && threadId && previousCursor ? getHistoryPageMessageIds(threadId, previousCursor) ?? [] : []
    const olderInviteIds = inviteHistory?.lastOlderPage?.inviteIds ?? []
    // Expanding one facet must not expose an unconfirmed gap in the other.
    // Keep authoritative message membership independently from the row budget.
    const eligibleMessageKeys = new Set(previous && !resetMessages ? previous.eligibleMessageKeys : [])
    if (!previous || resetMessages) {
      const latestIds = latestHistoryMessageIds && new Set(latestHistoryMessageIds)
      const boundary = latestIds ? openingMessages.find(message => latestIds.has(message.messageId)) : undefined
      for (const message of openingMessages) {
        const item: ChatTimelineItem = { kind: "message", message, createdAt: message.sentAt }
        if (!latestIds || latestIds.has(message.messageId) || message.messageId.startsWith("__local_") ||
          boundary && compareChatTimelineItems(item, { kind: "message", message: boundary, createdAt: boundary.sentAt }) >= 0) {
          eligibleMessageKeys.add(`message:${getMessageRenderKey(message.messageId)}`)
        }
      }
    }
    for (const id of [...latestHistoryMessageIds ?? [], ...earlierPageIds]) eligibleMessageKeys.add(`message:${getMessageRenderKey(id)}`)
    for (const message of openingMessages) {
      const key = `message:${getMessageRenderKey(message.messageId)}`
      if (previous && !previous.cachedKeys.has(key)) eligibleMessageKeys.add(key)
    }
    const eligibleMessages = openingMessages.filter(message => eligibleMessageKeys.has(`message:${getMessageRenderKey(message.messageId)}`))
    const rowLimit = resetToLatest ? CHAT_INITIAL_HISTORY_LIMIT : (previous?.rowLimit ?? CHAT_INITIAL_HISTORY_LIMIT) +
      (earlierRows - (previous?.earlierRows ?? 0)) +
      countChatRowsAddedWithinWindow(eligibleMessages, roomInvites, previous?.timeline ?? [], getMessageRenderKey,
        earlierPageIds, previous?.excludedCursorKeys, previous?.cachedKeys, olderInviteIds)
    const knownKeys = new Set(previous?.timeline.map(getChatTimelineItemKey))
    const expandingEarlier = earlierRows > (previous?.earlierRows ?? 0)
    const pendingEarlierIds = new Set(expandingEarlier ? [] : earlierPageIds.filter(id => !knownKeys.has(`message:${getMessageRenderKey(id)}`)))
    const pendingInviteIds = new Set(expandingEarlier ? [] : olderInviteIds.filter(id => !knownKeys.has(`room-invite:${id}`)))
    const shownInvites = roomInvites.filter(invite => !pendingInviteIds.has(invite.inviteId))
    const pinnedInviteIds = new Set(inviteHistory?.activeInviteIds.filter(id =>
      shownInvites.some(invite => invite.inviteId === id && (invite.status === "pending" || invite.status === "accepted" && Boolean(invite.roomSessionId)))) ?? [])
    const retainedMessageKeys = new Set([
      ...previous?.excludedCursorKeys ?? [],
      ...previous?.timeline.filter(item => item.kind === "message" && item.message.messageId.startsWith("__local_")).map(getChatTimelineItemKey) ?? []
    ])
    const timeline = input.waitsForServerHistory
      ? buildChatThreadWindow(eligibleMessages, shownInvites, rowLimit, getMessageRenderKey, pendingEarlierIds, retainedMessageKeys,
        expandingEarlier ? undefined : previous?.cachedKeys, pinnedInviteIds)
      : buildChatTimeline(openingMessages, shownInvites, getMessageRenderKey)
    const earlierPageKeys = new Set(earlierPageIds.map(id => `message:${getMessageRenderKey(id)}`))
    for (const id of olderInviteIds) earlierPageKeys.add(`room-invite:${id}`)
    const absorbedHistoryKeys = new Set(
      timeline.map(getChatTimelineItemKey).filter(key => !knownKeys.has(key) &&
        (latestPageChanged || invitePageChanged || earlierRows > (previous?.earlierRows ?? 0) || earlierPageKeys.has(key)))
    )
    const visibleKeys = new Set(timeline.map(getChatTimelineItemKey))
    const excludedCursorKeys = new Set([...previous?.excludedCursorKeys ?? []].filter(key => visibleKeys.has(key)))
    const previousBoundary = previous?.timeline.find(item => item.kind === "message" && item.message.messageId === previousCursor)
    if (previousBoundary) {
      for (const item of timeline) {
        if (item.kind !== "message" || !item.renderKey?.startsWith("__local_") || item.message.messageId.startsWith("__local_")) continue
        const wasLocal = previous?.timeline.some(old => old.kind === "message" &&
          old.message.messageId.startsWith("__local_") && getChatTimelineItemKey(old) === getChatTimelineItemKey(item))
        if (wasLocal && compareChatTimelineItems(item, previousBoundary) < 0) excludedCursorKeys.add(getChatTimelineItemKey(item))
      }
    }
    if (expandingEarlier && earlierPageIds.length && earlierPageIds.every(id => visibleKeys.has(`message:${getMessageRenderKey(id)}`))) {
      for (const id of earlierPageIds) excludedCursorKeys.delete(`message:${getMessageRenderKey(id)}`)
    }
    const oldestVisibleMessageId = getOldestConfirmedChatMessageId(timeline, () => "sent", excludedCursorKeys)
    const cachedKeys = new Set([
      ...openingMessages.map(message => `message:${getMessageRenderKey(message.messageId)}`),
      ...roomInvites.map(getChatTimelineItemKey)
    ])
    const visibleInviteIds = new Set(timeline.filter(item => item.kind === "room_invite").map(item => item.inviteId))
    const cachedEarlierInviteIds = inviteHistory?.ready
      ? inviteHistory.historyInviteIds.filter(id => !visibleInviteIds.has(id)) : []
    return { timeline, rowLimit, absorbedHistoryKeys, excludedCursorKeys, oldestVisibleMessageId, cachedKeys, eligibleMessageKeys, eligibleMessages, cachedEarlierInviteIds }
  }, [currentUserId, earlierRows, historyReady, input.waitsForServerHistory, inviteHistory, latestHistoryMessageIds, openingMessages, roomInvites, threadId])
  const { timeline } = window
  useEffect(() => {
    committedWindow.current = { threadId, currentUserId, earlierRows, rowLimit: window.rowLimit, timeline, latestHistoryMessageIds,
      excludedCursorKeys: window.excludedCursorKeys, cachedKeys: window.cachedKeys, eligibleMessageKeys: window.eligibleMessageKeys }
    committedWindow.current.latestInviteIds = inviteHistory?.latestInviteIds
  }, [currentUserId, earlierRows, inviteHistory?.latestInviteIds, latestHistoryMessageIds, threadId, timeline, window.cachedKeys, window.eligibleMessageKeys, window.excludedCursorKeys, window.rowLimit])
  const revealEarlier = useCallback((rowCount = CHAT_INITIAL_HISTORY_LIMIT, confirmedPageIds?: readonly string[], confirmedInviteIds?: readonly string[]) => {
    if (!threadId || currentScope.current.threadId !== threadId || currentScope.current.currentUserId !== currentUserId) return
    const knownKeys = new Set(committedWindow.current?.timeline.map(getChatTimelineItemKey))
    const confirmedCount = confirmedPageIds || confirmedInviteIds ?
      (confirmedPageIds?.filter(id => !knownKeys.has(`message:${getMessageRenderKey(id)}`)).length ?? 0) +
      (confirmedInviteIds?.filter(id => !knownKeys.has(`room-invite:${id}`)).length ?? 0) : rowCount
    const additionalRows = Math.min(CHAT_INITIAL_HISTORY_LIMIT, Math.max(0, Math.floor(confirmedCount)))
    if (!additionalRows) return
    setRequestedWindow(current => current.threadId === threadId && current.currentUserId === currentUserId
      ? { threadId, currentUserId, earlierRows: current.earlierRows + additionalRows } : current)
  }, [currentUserId, threadId])
  const hasOlderCachedRows = useMemo(
    () => hasEarlierCachedChatRows(window.eligibleMessages, roomInvites, timeline, getMessageRenderKey),
    [window.eligibleMessages, roomInvites, timeline]
  )
  const messageCount = useMemo(
    () => timeline.reduce((count, item) => item.kind === "message" ? count + 1 : count, 0),
    [timeline]
  )
  const body = resolveChatThreadBody({
    waitsForServerHistory: input.waitsForServerHistory,
    historyReady,
    timelineLength: timeline.length,
    messageCount,
    isPendingThread: input.isPendingThread,
    listStatus: input.listStatus
  })
  const isLoading = body === "loading"
  const [skeletonDue, setSkeletonDue] = useState(false)
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setSkeletonDue(true), CHAT_THREAD_SKELETON_DELAY_MS)
    return () => {
      clearTimeout(timer)
      setSkeletonDue(false)
    }
  }, [isLoading])
  const showsSkeleton = isLoading && skeletonDue
  const [skeletonWasShown, setSkeletonWasShown] = useState(false)
  if (showsSkeleton && !skeletonWasShown) setSkeletonWasShown(true)
  const everShown = skeletonWasShown || showsSkeleton
  return {
    timeline,
    body,
    showsSkeleton,
    skeletonWasShown: everShown,
    timelineReveal: resolveChatTimelineReveal({ body, skeletonWasShown: everShown }),
    revealEarlier,
    hasOlderCachedRows,
    oldestVisibleMessageId: window.oldestVisibleMessageId,
    cachedEarlierInviteIds: window.cachedEarlierInviteIds,
    absorbedHistoryKeys: window.absorbedHistoryKeys
  }
}
