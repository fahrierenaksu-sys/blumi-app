/**
 * Where a tapped message or room-invite push may open. The conversation can
 * be gone (removed, or hidden by a block) by the time the push is tapped; its
 * ChatThread screen would then wait forever on "still getting ready". So a tap
 * for a thread this phone does not know yet waits for the next thread list:
 * listed means open it, missing means the Inbox. If no list arrives in time
 * the thread opens anyway (the old behaviour), so a tap is never lost.
 *
 * No runtime imports: runs under plain Node tests.
 */
export const CHAT_TAP_LIST_WAIT_MS = 4_000
const MAX_TRACKED_TAPS = 16

export type ChatTapDecision =
  | { kind: "open" }
  | { kind: "inbox" }
  | { kind: "wait"; retryInMs: number }

export function resolveChatTapDecision(input: {
  hasThread: boolean
  /** Thread list replies applied so far, and when the tap was first routed. */
  listVersion: number
  tapListVersion: number
  waitedMs: number
}): ChatTapDecision {
  if (input.hasThread) return { kind: "open" }
  if (input.listVersion > input.tapListVersion) return { kind: "inbox" }
  if (input.waitedMs >= CHAT_TAP_LIST_WAIT_MS) return { kind: "open" }
  return { kind: "wait", retryInMs: CHAT_TAP_LIST_WAIT_MS - Math.max(0, input.waitedMs) }
}

/** Remembers when each pending thread tap was first routed; bounded. */
export function createChatTapGate(dependencies: {
  hasThread: (threadId: string) => boolean
  now: () => number
}): { decide(threadId: string, listVersion: number): ChatTapDecision; reset(): void } {
  const firstSeen = new Map<string, { version: number; at: number }>()
  return {
    decide(threadId, listVersion) {
      let seen = firstSeen.get(threadId)
      if (!seen) {
        seen = { version: listVersion, at: dependencies.now() }
        if (firstSeen.size >= MAX_TRACKED_TAPS) {
          const oldest = firstSeen.keys().next().value
          if (oldest !== undefined) firstSeen.delete(oldest)
        }
        firstSeen.set(threadId, seen)
      }
      const decision = resolveChatTapDecision({
        hasThread: dependencies.hasThread(threadId),
        listVersion,
        tapListVersion: seen.version,
        waitedMs: dependencies.now() - seen.at
      })
      if (decision.kind !== "wait") firstSeen.delete(threadId)
      return decision
    },
    reset() { firstSeen.clear() }
  }
}
