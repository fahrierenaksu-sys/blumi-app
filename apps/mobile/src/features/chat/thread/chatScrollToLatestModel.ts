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

/**
 * Points the reader must come back past the threshold before the pill
 * leaves again, so a list resting near the threshold never flickers it.
 */
export const CHAT_SCROLL_TO_LATEST_RETURN_BAND = 48

/**
 * The pill's next state on the UI thread. While the keyboard moves, the
 * scroll offset and the keyboard inset are a frame apart, so the state holds
 * until the keyboard settles; around the threshold it has a return band.
 * Each change re-renders the screen once, so it must not flicker.
 */
export function resolveChatScrolledAway(input: {
  wasAway: boolean
  offsetY: number
  newestEdgeInset: number
  keyboardSettled: boolean
}): boolean {
  "worklet"
  if (!input.keyboardSettled) return input.wasAway
  if (!input.wasAway) return isChatScrolledAwayFromLatest(input.offsetY, input.newestEdgeInset)
  return input.offsetY + input.newestEdgeInset > CHAT_SCROLL_TO_LATEST_THRESHOLD - CHAT_SCROLL_TO_LATEST_RETURN_BAND
}

/** The keyboard is fully open or fully closed (0..1 open progress). */
export function isGluedKeyboardSettled(progress: number): boolean {
  "worklet"
  return progress <= 0.001 || progress >= 0.999
}

/** The scroll offset that shows the newest message above the keyboard. */
export function getChatLatestScrollOffset(newestEdgeInset: number): number {
  return newestEdgeInset > 0 ? -newestEdgeInset : 0
}

export interface ChatNewestEdgeChange {
  /** Scroll to the newest message (its offset depends on the keyboard). */
  readonly follow: boolean
  /** Partner rows the reader has not seen yet (they stay where they were). */
  readonly unseenIncoming: number
}

const NO_NEWEST_EDGE_CHANGE: ChatNewestEdgeChange = { follow: false, unseenIncoming: 0 }

/**
 * What the list does when its newest row changes. The list keeps what the
 * reader looks at in place when rows are added (maintainVisibleContentPosition
 * without an autoscroll: React Native's autoscroll returns to offset 0, which
 * ignores the keyboard inset and hides the newest rows under the composer),
 * so following the newest message is decided here:
 * - my own new message is always shown (CHT-05), even from history;
 * - a reader at the newest message keeps following it;
 * - a reader up in history stays there, and partner rows are counted.
 * The first render and a replaced history (previous newest row gone) never
 * count and only follow a reader who was at the newest message.
 */
export function resolveChatNewestEdgeChange(input: {
  previousNewestKey: string | null
  newestFirst: readonly ChatTimelineItem[]
  currentUserId: string
  isAway: boolean
}): ChatNewestEdgeChange {
  const newest = input.newestFirst[0]
  if (!newest || input.previousNewestKey === null) return NO_NEWEST_EDGE_CHANGE
  if (getChatTimelineItemKey(newest) === input.previousNewestKey) return NO_NEWEST_EDGE_CHANGE
  let incoming = 0
  let mine = false
  for (const item of input.newestFirst) {
    if (getChatTimelineItemKey(item) === input.previousNewestKey) {
      if (mine) return { follow: true, unseenIncoming: 0 }
      return input.isAway
        ? { follow: false, unseenIncoming: incoming }
        : { follow: true, unseenIncoming: 0 }
    }
    const sender = item.kind === "message" ? item.message.senderUserId : item.senderUserId
    if (sender === input.currentUserId) mine = true
    else incoming += 1
  }
  return input.isAway ? NO_NEWEST_EDGE_CHANGE : { follow: true, unseenIncoming: 0 }
}

export function formatScrollToLatestCount(count: number): string {
  return count > 99 ? "99+" : String(count)
}
