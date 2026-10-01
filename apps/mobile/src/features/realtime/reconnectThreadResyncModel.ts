import type { ChatThread } from "@blumi/contracts"

/**
 * Which conversations to refetch after a reconnect (CHAT-RT-09, 2026-10-01).
 *
 * While the socket was down, `chat.message_received` events were missed. The
 * thread list that follows the reconnect shows each thread's latest message;
 * a cached conversation whose latest message changed is stale and is
 * refetched. Conversations never opened have no cache and load on open, the
 * active one is already resynchronized, and the count is bounded so a long
 * outage does not fire a burst of history requests.
 */
export const MAX_RECONNECT_THREAD_RESYNCS = 5

/** Latest message per thread, as last seen before the connection dropped. */
export type ThreadLastMessageSnapshot = ReadonlyMap<string, string | null>

export function snapshotThreadLastMessages(threads: readonly ChatThread[]): ThreadLastMessageSnapshot {
  return new Map(threads.map((thread) => [thread.threadId, thread.lastMessage?.messageId ?? null]))
}

export function selectThreadsToResynchronize(input: {
  before: ThreadLastMessageSnapshot
  listed: readonly ChatThread[]
  hasMessageHistory: (threadId: string) => boolean
  activeThreadId?: string
  limit?: number
}): string[] {
  const limit = input.limit ?? MAX_RECONNECT_THREAD_RESYNCS
  const changed: string[] = []
  for (const thread of input.listed) {
    if (changed.length >= limit) break
    if (thread.threadId === input.activeThreadId) continue
    if (!input.before.has(thread.threadId)) continue
    if ((thread.lastMessage?.messageId ?? null) === input.before.get(thread.threadId)) continue
    if (!input.hasMessageHistory(thread.threadId)) continue
    changed.push(thread.threadId)
  }
  return changed
}
