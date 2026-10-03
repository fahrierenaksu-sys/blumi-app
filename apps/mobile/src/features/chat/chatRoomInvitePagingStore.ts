import { useCallback, useSyncExternalStore } from "react"

export interface ChatRoomInviteHistory {
  ready: boolean
  latestInviteIds: readonly string[]
  historyInviteIds: readonly string[]
  activeInviteIds: readonly string[]
  activeContextKnown: boolean
  nextCursor: string | null
  hasLoadedOlderPage?: boolean
  lastOlderPage?: { before: string; inviteIds: readonly string[] }
}

const EMPTY_HISTORY: ChatRoomInviteHistory = {
  ready: false, latestInviteIds: [], historyInviteIds: [], activeInviteIds: [], activeContextKnown: false, nextCursor: null
}
let owner: string | undefined
let histories = new Map<string, ChatRoomInviteHistory>()
const listeners = new Set<() => void>()
const emit = () => { for (const listener of listeners) listener() }
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index])
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])]

function ensureOwner(userId: string) {
  if (owner === userId) return
  owner = userId
  histories = new Map()
}

export function resetChatRoomInviteHistory(): void {
  owner = undefined
  histories = new Map()
  emit()
}

export function getChatRoomInviteHistory(threadId: string | undefined, userId: string): ChatRoomInviteHistory {
  return threadId && owner === userId ? histories.get(threadId) ?? EMPTY_HISTORY : EMPTY_HISTORY
}

export function applyLatestRoomInvitePage(input: {
  userId: string; threadId: string; inviteIds: readonly string[]; activeInviteIds: readonly string[];
  activeContextKnown: boolean; nextCursor: string | null
}): void {
  ensureOwner(input.userId)
  const previous = histories.get(input.threadId)
  const connected = previous?.latestInviteIds.some(id => input.inviteIds.includes(id)) ?? false
  const historyInviteIds = connected ? union(previous!.historyInviteIds, input.inviteIds) : [...input.inviteIds]
  const hasLoadedOlderPage = connected && !!previous?.hasLoadedOlderPage
  const nextCursor = hasLoadedOlderPage
    ? previous!.nextCursor : input.nextCursor
  if (previous?.ready && sameIds(previous.latestInviteIds, input.inviteIds) &&
    sameIds(previous.historyInviteIds, historyInviteIds) && sameIds(previous.activeInviteIds, input.activeInviteIds) &&
    previous.activeContextKnown === input.activeContextKnown && previous.nextCursor === nextCursor) return
  histories.set(input.threadId, { ready: true, latestInviteIds: [...input.inviteIds], historyInviteIds,
    activeInviteIds: [...input.activeInviteIds], activeContextKnown: input.activeContextKnown, nextCursor, hasLoadedOlderPage })
  emit()
}

/** Returns false when a newer first page replaced this cursor while it loaded. */
export function applyOlderRoomInvitePage(input: {
  userId: string; threadId: string; before: string; inviteIds: readonly string[]; nextCursor: string | null
}): boolean {
  const previous = getChatRoomInviteHistory(input.threadId, input.userId)
  if (!previous.ready || previous.nextCursor !== input.before) return false
  histories.set(input.threadId, { ...previous, historyInviteIds: union(previous.historyInviteIds, input.inviteIds),
    nextCursor: input.nextCursor, hasLoadedOlderPage: true, lastOlderPage: { before: input.before, inviteIds: [...input.inviteIds] } })
  emit()
  return true
}

/** A new realtime invite joins history; status updates do not unhide old pages. */
export function observeRoomInviteArrival(userId: string, threadId: string, inviteId: string): void {
  const previous = getChatRoomInviteHistory(threadId, userId)
  if (!previous.ready || previous.historyInviteIds.includes(inviteId)) return
  histories.set(threadId, { ...previous, historyInviteIds: union(previous.historyInviteIds, [inviteId]) })
  emit()
}

export function observeRoomInviteActiveContext(userId: string, threadId: string, inviteId: string, active: boolean): void {
  const previous = getChatRoomInviteHistory(threadId, userId)
  if (!previous.ready || previous.activeInviteIds.includes(inviteId) === active) return
  histories.set(threadId, { ...previous, activeInviteIds: active ? union(previous.activeInviteIds, [inviteId])
    : previous.activeInviteIds.filter(id => id !== inviteId) })
  emit()
}

export function useChatRoomInviteHistory(threadId: string | undefined, userId: string): ChatRoomInviteHistory {
  const read = useCallback(() => getChatRoomInviteHistory(threadId, userId), [threadId, userId])
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, read, read)
}
