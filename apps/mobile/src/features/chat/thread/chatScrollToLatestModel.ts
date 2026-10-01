import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"

/**
 * Pure rules for the "↓" pill (CHT-05). The timeline is an inverted list, so
 * offset 0 is the newest message; the pill appears once the reader scrolled
 * more than this many points away from it.
 */
export const CHAT_SCROLL_TO_LATEST_THRESHOLD = 200

export function isChatScrolledAwayFromLatest(offsetY: number): boolean {
  "worklet"
  return offsetY > CHAT_SCROLL_TO_LATEST_THRESHOLD
}

/**
 * Rows that appeared at the newest edge since `previousNewestKey` and were
 * not sent by me (my own sends scroll to the latest instead). An unknown
 * previous key (first render, or history replaced) counts nothing.
 */
export function countNewIncomingAtNewestEdge(input: {
  previousNewestKey: string | null
  newestFirst: readonly ChatTimelineItem[]
  currentUserId: string
}): number {
  if (input.previousNewestKey === null) return 0
  let count = 0
  for (const item of input.newestFirst) {
    if (getChatTimelineItemKey(item) === input.previousNewestKey) return count
    const sender = item.kind === "message" ? item.message.senderUserId : item.senderUserId
    if (sender !== input.currentUserId) count += 1
  }
  return 0
}

export function formatScrollToLatestCount(count: number): string {
  return count > 99 ? "99+" : String(count)
}
