/**
 * Per-account Chats list preferences kept on this phone: pinned conversations
 * and conversations deleted "for me".
 *
 * Delete for me hides a conversation from this account's list only. The
 * server keeps the conversation and its messages for both people (a server
 * side delete needs a per-participant column, which needs a migration), so
 * the hide remembers the newest activity it covered: a later message brings
 * the conversation back, the way a deleted chat reopens in other messengers.
 */
export interface InboxConversationPrefs {
  /** threadId → when it was pinned (ISO). */
  pinned: Readonly<Record<string, string>>
  /** threadId → the newest activity (ISO) the delete covered. */
  deletedThrough: Readonly<Record<string, string>>
}

export interface InboxThreadLike {
  threadId: string
  createdAt: string
  lastMessage?: { sentAt: string; messageId?: string } | null
  /** The server's "delete chat for me" point for this account (every device, migration 071). */
  hiddenThrough?: string
  /**
   * The hidden message at `hiddenThrough` when the server knows it (075): a
   * message in that millisecond with a later id is not hidden.
   */
  hiddenThroughMessageId?: string
}

export const EMPTY_INBOX_CONVERSATION_PREFS: InboxConversationPrefs = Object.freeze({
  pinned: Object.freeze({}),
  deletedThrough: Object.freeze({})
})

/** Entries kept per kind; the oldest are dropped first. */
export const MAX_INBOX_PREF_ENTRIES = 300

export function isConversationPinned(prefs: InboxConversationPrefs, threadId: string): boolean {
  return Object.hasOwn(prefs.pinned, threadId)
}

export function pinConversation(prefs: InboxConversationPrefs, threadId: string, now: Date): InboxConversationPrefs {
  if (!threadId || isConversationPinned(prefs, threadId)) return prefs
  return { ...prefs, pinned: capEntries({ ...prefs.pinned, [threadId]: now.toISOString() }) }
}

export function unpinConversation(prefs: InboxConversationPrefs, threadId: string): InboxConversationPrefs {
  if (!isConversationPinned(prefs, threadId)) return prefs
  const { [threadId]: _removed, ...pinned } = prefs.pinned
  return { ...prefs, pinned }
}

/** The newest activity of a conversation: its last message, or its creation. */
export function getConversationActivityAt(thread: InboxThreadLike): string {
  return thread.lastMessage?.sentAt ?? thread.createdAt
}

/** Hides the conversation up to its current activity and unpins it. */
export function deleteConversationForMe(prefs: InboxConversationPrefs, thread: InboxThreadLike): InboxConversationPrefs {
  const through = getConversationActivityAt(thread)
  const unpinned = unpinConversation(prefs, thread.threadId)
  const previous = unpinned.deletedThrough[thread.threadId]
  const next = previous && timeOf(previous) >= timeOf(through) ? previous : through
  return { ...unpinned, deletedThrough: capEntries({ ...unpinned.deletedThrough, [thread.threadId]: next }) }
}

/**
 * Hidden until something newer than the delete arrives. A point is a time,
 * read inclusively, unless the server names the hidden message at that time:
 * then a last message in the same millisecond with a later id (history order)
 * is newer. The on-device delete stored only a time; at the server's time
 * the server's exact point decides for it.
 */
export function isConversationDeletedForMe(prefs: InboxConversationPrefs, thread: InboxThreadLike): boolean {
  const activityAt = timeOf(getConversationActivityAt(thread))
  const serverAt = thread.hiddenThrough === undefined ? undefined : timeOf(thread.hiddenThrough)
  const exactId = thread.hiddenThroughMessageId
  const lastId = thread.lastMessage?.messageId
  const coveredAt = (throughAt: number) => {
    if (activityAt !== throughAt) return activityAt < throughAt
    if (exactId === undefined || serverAt !== throughAt || thread.lastMessage == null) return true
    return lastId === undefined || lastId.localeCompare(exactId) <= 0
  }
  return [prefs.deletedThrough[thread.threadId], thread.hiddenThrough]
    .some((through) => through !== undefined && coveredAt(timeOf(through)))
}

/**
 * The Chats list order: deleted conversations removed, pinned ones first
 * (most recently pinned on top), then the rest in their server order
 * (newest activity first). Stable for equal keys.
 */
export function arrangeInboxThreads<Thread extends InboxThreadLike>(
  threads: readonly Thread[],
  prefs: InboxConversationPrefs
): Thread[] {
  const visible = threads.filter((thread) => !isConversationDeletedForMe(prefs, thread))
  const pinned = visible
    .filter((thread) => isConversationPinned(prefs, thread.threadId))
    .map((thread, index) => ({ thread, index, pinnedAt: timeOf(prefs.pinned[thread.threadId]!) }))
    .sort((left, right) => right.pinnedAt - left.pinnedAt || left.index - right.index)
    .map((entry) => entry.thread)
  const rest = visible.filter((thread) => !isConversationPinned(prefs, thread.threadId))
  return [...pinned, ...rest]
}

export function serializeInboxConversationPrefs(prefs: InboxConversationPrefs): string {
  return JSON.stringify({ version: 1, pinned: prefs.pinned, deletedThrough: prefs.deletedThrough })
}

/** Tolerant: unreadable or foreign data yields empty preferences. */
export function parseInboxConversationPrefs(raw: string | null): InboxConversationPrefs {
  if (!raw) return EMPTY_INBOX_CONVERSATION_PREFS
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) {
      return EMPTY_INBOX_CONVERSATION_PREFS
    }
    const record = value as { pinned?: unknown; deletedThrough?: unknown }
    return {
      pinned: capEntries(readTimestamps(record.pinned)),
      deletedThrough: capEntries(readTimestamps(record.deletedThrough))
    }
  } catch {
    return EMPTY_INBOX_CONVERSATION_PREFS
  }
}

function readTimestamps(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const entries: Record<string, string> = {}
  for (const [threadId, at] of Object.entries(value as Record<string, unknown>)) {
    if (threadId.trim() && threadId.length <= 200 && typeof at === "string" && Number.isFinite(Date.parse(at))) {
      entries[threadId] = at
    }
  }
  return entries
}

function capEntries(entries: Record<string, string>): Record<string, string> {
  const keys = Object.keys(entries)
  if (keys.length <= MAX_INBOX_PREF_ENTRIES) return entries
  const kept = keys
    .sort((left, right) => timeOf(entries[right]!) - timeOf(entries[left]!))
    .slice(0, MAX_INBOX_PREF_ENTRIES)
  return Object.fromEntries(kept.map((key) => [key, entries[key]!]))
}

function timeOf(value: string): number {
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}
