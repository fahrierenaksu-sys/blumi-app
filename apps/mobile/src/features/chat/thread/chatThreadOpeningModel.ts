import type { ChatMessage } from "@blumi/contracts"

/**
 * What the conversation shows when it opens, and how the timeline appears.
 * Pure rules, so node tests cover them; useChatThreadOpening and
 * ChatThreadScreen apply them.
 *
 * Whatever this phone already knows about the conversation is drawn in the
 * first frame of the push: the cached history, or at least the message the
 * Chats row showed. History that arrives later fills in behind it without a
 * reveal or row entrances (chatTimelineEntranceModel absorbs it). Only a
 * conversation with nothing to show waits, and its skeleton appears only if
 * the wait outlasts CHAT_THREAD_SKELETON_DELAY_MS, so a fast load never
 * flashes placeholders.
 */

export type ChatThreadBody = "timeline" | "loading" | "empty"

export type ChatThreadListStatus = "idle" | "loading" | "ready" | "failed"

/** A wait shorter than this shows nothing; a longer one shows the skeleton. */
export const CHAT_THREAD_SKELETON_DELAY_MS = 300

export interface ChatThreadBodyInput {
  /** Production threads wait for their first server history page; demo threads list locally. */
  waitsForServerHistory: boolean
  /** The store holds this thread's history from a completed page (cached). */
  historyReady: boolean
  /** Rows the timeline would show: messages and room invitations. */
  timelineLength: number
  /** Of those rows, the messages (cached ones, or the Chats row's last message). */
  messageCount: number
  isPendingThread: boolean
  listStatus: ChatThreadListStatus
}

/**
 * - A matched thread that does not exist yet shows the empty state (it owns
 *   the "opening chat" and retry copy).
 * - Any message this phone holds shows the timeline at once, also before the
 *   first history page (that page fills in behind it). Invitations alone wait
 *   for history, so a lone card never stands in for a conversation.
 * - Unknown history with nothing to show is "loading" (the screen shows the
 *   skeleton after the delay); a failed first page shows the empty state
 *   with its retry.
 * - Known history without rows shows the empty state; a background refresh
 *   of known history never brings the loading state back.
 */
export function resolveChatThreadBody(input: ChatThreadBodyInput): ChatThreadBody {
  if (input.isPendingThread) return "empty"
  const historyKnown = !input.waitsForServerHistory || input.historyReady
  if (input.timelineLength > 0 && (historyKnown || input.messageCount > 0)) return "timeline"
  if (!historyKnown) return input.listStatus === "failed" ? "empty" : "loading"
  if (!input.waitsForServerHistory && (input.listStatus === "idle" || input.listStatus === "loading")) {
    return "loading"
  }
  return "empty"
}

/**
 * The messages the conversation opens on. Cached messages win. Before the
 * first history page, a thread with nothing cached opens on the last
 * message the Chats row already showed, so the conversation is on screen in
 * the first frame; its id is the server's, so the page that follows keeps
 * that row in place. Returns `messages` itself whenever it has something.
 */
export function selectChatThreadOpeningMessages(input: {
  messages: readonly ChatMessage[]
  historyReady: boolean
  threadId: string | undefined
  lastMessage: ChatMessage | undefined
}): readonly ChatMessage[] {
  if (input.messages.length > 0 || input.historyReady) return input.messages
  const last = input.lastMessage
  if (!last || !input.threadId || last.threadId !== input.threadId) return input.messages
  return [last]
}

/**
 * How the always-mounted timeline is shown for `body`:
 * - "shown": at full opacity in the same frame (anything cached, a load
 *   that beat the skeleton delay, or an update while open);
 * - "crossfade": a short fade from the skeleton, only when the skeleton was
 *   actually on screen;
 * - "hidden": transparent and empty behind the loading or empty state.
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
