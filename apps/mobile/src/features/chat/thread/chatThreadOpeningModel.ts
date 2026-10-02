/**
 * What the conversation shows when it opens, and how the timeline appears.
 * Pure rules, so node tests cover them; ChatThreadScreen applies them.
 *
 * A thread whose history this session already holds opens on its messages
 * in the first frame of the push: no skeleton, no reveal, and no row
 * entrance (chatTimelineEntranceModel absorbs the first presentation). Only
 * a thread whose history is still unknown shows the skeleton, and the
 * timeline then crossfades in as soon as the first page arrives.
 */

export type ChatThreadBody = "timeline" | "skeleton" | "empty"

export type ChatThreadListStatus = "idle" | "loading" | "ready" | "failed"

export interface ChatThreadBodyInput {
  /** Production threads wait for their first server history page; demo threads list locally. */
  waitsForServerHistory: boolean
  /** The store holds this thread's history from a completed page (cached). */
  historyReady: boolean
  timelineLength: number
  isPendingThread: boolean
  listStatus: ChatThreadListStatus
}

/**
 * - A matched thread that does not exist yet shows the empty state (it owns
 *   the "opening chat" and retry copy).
 * - Unknown history shows the skeleton, even when realtime already cached a
 *   message or two: a partial list would fill in late. A failed first page
 *   shows the empty state with its retry.
 * - Known history shows the timeline, or the empty state for a chat without
 *   messages. A background refresh of known history never brings the
 *   skeleton back.
 */
export function resolveChatThreadBody(input: ChatThreadBodyInput): ChatThreadBody {
  if (input.isPendingThread) return "empty"
  if (input.waitsForServerHistory && !input.historyReady) {
    return input.listStatus === "failed" ? "empty" : "skeleton"
  }
  if (input.timelineLength > 0) return "timeline"
  if (!input.waitsForServerHistory && (input.listStatus === "idle" || input.listStatus === "loading")) {
    return "skeleton"
  }
  return "empty"
}

/**
 * How the always-mounted timeline is shown for `body`:
 * - "shown": at full opacity in the same frame (cached history, or an
 *   update while open);
 * - "crossfade": fades in with the crossfade token, from the commit that
 *   brought the first page, because the skeleton stood in for it;
 * - "hidden": transparent and empty behind the skeleton or the empty state.
 */
export type ChatTimelineReveal = "shown" | "crossfade" | "hidden"

export function resolveChatTimelineReveal(input: {
  body: ChatThreadBody
  skeletonWasShown: boolean
}): ChatTimelineReveal {
  if (input.body !== "timeline") return "hidden"
  return input.skeletonWasShown ? "crossfade" : "shown"
}

/** The timeline's opacity in its very first frame. */
export function getChatTimelineInitialOpacity(body: ChatThreadBody): number {
  return body === "timeline" ? 1 : 0
}
