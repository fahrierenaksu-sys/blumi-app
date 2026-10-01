import type { ChatMessage } from "@blumi/contracts"

/** Server order of two messages: send time, then id. */
export function compareMessageOrder(left: ChatMessage, right: ChatMessage): number {
  return Date.parse(left.sentAt) - Date.parse(right.sentAt) || left.messageId.localeCompare(right.messageId)
}

// Newest message shown read on this device per thread. A thread list served
// before the server stored that read still counts it unread (CHT-06).
let readHereThroughByThread: Map<string, ChatMessage> = new Map()

export function getReadHereThrough(threadId: string): ChatMessage | undefined {
  return readHereThroughByThread.get(threadId)
}

/** Remembers the newest confirmed (non-local) candidate as read on this device. */
export function noteReadHere(threadId: string, candidates: readonly (ChatMessage | undefined)[]): void {
  let newest = readHereThroughByThread.get(threadId)
  for (const candidate of candidates) {
    if (candidate && !candidate.messageId.startsWith("__local_") && (!newest || compareMessageOrder(candidate, newest) > 0)) newest = candidate
  }
  if (newest) readHereThroughByThread.set(threadId, newest)
}

export function forgetReadHere(removedThreadIds: ReadonlySet<string>): void {
  readHereThroughByThread = new Map([...readHereThroughByThread].filter(([threadId]) => !removedThreadIds.has(threadId)))
}

/** Account switch or sign-out. */
export function resetReadHere(): void {
  readHereThroughByThread = new Map()
}
