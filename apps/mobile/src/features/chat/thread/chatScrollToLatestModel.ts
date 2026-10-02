import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"

/**
 * Pure rules for the "↓" pill (CHT-05). The timeline is an inverted list, so
 * offset 0 is the newest message; the pill appears once the reader scrolled
 * more than this many points away from it.
 */
export const CHAT_SCROLL_TO_LATEST_THRESHOLD = 200

/**
 * While the keyboard is open, the chat scroll view lifts the newest message
 * above it with a content inset at the newest edge, so the newest message
 * sits at offset `-inset` instead of 0. `keyboardHeight` is the keyboard's
 * height on screen (sign ignored); `bottomOffset` is the space below the list
 * that the keyboard covers anyway (the composer's safe-area padding).
 */
export function getChatNewestEdgeInset(keyboardHeight: number, bottomOffset: number): number {
  "worklet"
  return Math.max(0, Math.abs(keyboardHeight) - Math.max(0, bottomOffset))
}

export function isChatScrolledAwayFromLatest(offsetY: number, newestEdgeInset = 0): boolean {
  "worklet"
  return offsetY + newestEdgeInset > CHAT_SCROLL_TO_LATEST_THRESHOLD
}

/** The scroll offset that shows the newest message above the keyboard. */
export function getChatLatestScrollOffset(newestEdgeInset: number): number {
  return newestEdgeInset > 0 ? -newestEdgeInset : 0
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
