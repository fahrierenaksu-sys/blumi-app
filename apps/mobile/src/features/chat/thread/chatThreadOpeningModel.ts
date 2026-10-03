import type { ChatMessage } from "@blumi/contracts"
import {
  buildChatTimeline,
  compareChatTimelineItems,
  getChatTimelineItemKey,
  isLegacyRoomInviteSentinel,
  type ChatRoomInviteTimelineItem,
  type ChatTimelineItem
} from "../chatRoomInviteModel"

const rowTime = (item: ChatTimelineItem): number => Date.parse(item.createdAt) || 0
const compareRows = compareChatTimelineItems

/** Bound the work before sorting, grouping and formatting a long cached chat. */
export function buildChatThreadWindow(
  messages: readonly ChatMessage[],
  roomInvites: readonly ChatRoomInviteTimelineItem[],
  rowLimit: number,
  getRenderKey: (messageId: string) => string,
  excludedMessageIds: ReadonlySet<string> = new Set(),
  retainedMessageKeys: ReadonlySet<string> = new Set(),
  previousCachedKeys?: ReadonlySet<string>,
  retainedInviteIds: ReadonlySet<string> = new Set()
): ChatTimelineItem[] {
  // Failed/pending local sends remain reachable even when the device clock
  // predates server history. An ACK keeps an already shown local render key.
  const localMessages = messages.filter(message => {
    const renderKey = getRenderKey(message.messageId)
    const key = `message:${renderKey}`
    const hiddenCachedLocal = previousCachedKeys?.has(key) && !retainedMessageKeys.has(key)
    return !isLegacyRoomInviteSentinel(message.body) && (message.messageId.startsWith("__local_") && !hiddenCachedLocal ||
      renderKey.startsWith("__local_") && retainedMessageKeys.has(key))
  }).slice(-rowLimit)
  const localIds = new Set(localMessages.map(message => message.messageId))
  // At most two server-live contexts are additional rows, so an ancient live
  // invitation stays reachable without consuming the recent history page.
  const pinnedInvites = roomInvites.filter(invite => retainedInviteIds.has(invite.inviteId)).slice(-2)
  const messageLimit = Math.max(0, rowLimit - localMessages.length)
  const recentMessages: ChatMessage[] = []
  let boundaryTime: number | undefined
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!
    if (excludedMessageIds.has(message.messageId) || localIds.has(message.messageId)) continue
    if (message.messageId.startsWith("__local_") && previousCachedKeys?.has(`message:${getRenderKey(message.messageId)}`)) continue
    const sentAt = Date.parse(message.sentAt) || 0
    if (recentMessages.length >= messageLimit && sentAt !== boundaryTime) break
    if (!isLegacyRoomInviteSentinel(message.body)) {
      recentMessages.push(message)
      boundaryTime = sentAt
    }
  }
  // Only eligible paged invitation records participate in the visible window.
  const recentInvites = [...new Map(roomInvites.map(invite => [invite.inviteId, invite])).values()]
    .filter(invite => !retainedInviteIds.has(invite.inviteId)).sort(compareRows).slice(-messageLimit)
  const recentRows = buildChatTimeline(recentMessages, messageLimit ? recentInvites : [], getRenderKey).slice(-messageLimit)
  return buildChatTimeline([...recentRows.filter(item => item.kind === "message").map(item => item.message), ...localMessages],
    [...recentRows.filter((item): item is ChatRoomInviteTimelineItem => item.kind === "room_invite"), ...pinnedInvites], getRenderKey)
}

/**
 * Keep the oldest shown row when a new row lands anywhere above it. The
 * newest row can carry a future device clock, so it is not an arrival fence.
 * Stable render keys also keep an optimistic ACK from growing the window.
 */
export function countChatRowsAddedWithinWindow(
  messages: readonly ChatMessage[],
  roomInvites: readonly ChatRoomInviteTimelineItem[],
  previousItems: readonly ChatTimelineItem[],
  getRenderKey: (messageId: string) => string,
  historyMessageIds: readonly string[] = [],
  excludedHistoryAnchorKeys: ReadonlySet<string> = new Set(),
  previousCachedKeys: ReadonlySet<string> = new Set(previousItems.map(getChatTimelineItemKey)),
  historyInviteIds: readonly string[] = []
): number {
  if (!previousItems.length) return 0
  // A retained local/ACK can lie before the visible history under clock skew;
  // it must not turn every hidden cache row into a new arrival.
  const oldest = previousItems.find(item => item.kind === "room_invite" ||
    !item.message.messageId.startsWith("__local_") && !excludedHistoryAnchorKeys.has(getChatTimelineItemKey(item)))
  const knownKeys = new Set(previousItems.map(getChatTimelineItemKey))
  const historyKeys = new Set(historyMessageIds.map(id => `message:${getRenderKey(id)}`))
  for (const id of historyInviteIds) historyKeys.add(`room-invite:${id}`)
  const addedKeys = new Set<string>()
  for (const message of messages) {
    const key = `message:${getRenderKey(message.messageId)}`
    if (message.messageId.startsWith("__local_") && !previousCachedKeys.has(key) && !isLegacyRoomInviteSentinel(message.body)) addedKeys.add(key)
  }
  if (!oldest) {
    for (const message of messages) {
      const key = `message:${getRenderKey(message.messageId)}`
      if (!previousCachedKeys.has(key) && !historyKeys.has(key) && !isLegacyRoomInviteSentinel(message.body)) addedKeys.add(key)
    }
    for (const invite of roomInvites) {
      const key = getChatTimelineItemKey(invite)
      if (!previousCachedKeys.has(key) && !historyKeys.has(key)) addedKeys.add(key)
    }
    return addedKeys.size
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!
    const item: ChatTimelineItem = {
      kind: "message", message, createdAt: message.sentAt,
      renderKey: getRenderKey(message.messageId)
    }
    // The store orders by time; equal-time messages can arrive in any order.
    if (rowTime(item) < rowTime(oldest)) break
    const key = getChatTimelineItemKey(item)
    if (compareRows(item, oldest) > 0 && !knownKeys.has(key) && !previousCachedKeys.has(key) && !historyKeys.has(key) && !isLegacyRoomInviteSentinel(message.body)) addedKeys.add(key)
  }
  for (const invite of new Map(roomInvites.map(invite => [invite.inviteId, invite])).values()) {
    const key = getChatTimelineItemKey(invite)
    if (!knownKeys.has(key) && !previousCachedKeys.has(key) && !historyKeys.has(key) && compareRows(invite, oldest) > 0) addedKeys.add(key)
  }
  return addedKeys.size
}

export function hasEarlierCachedChatRows(
  messages: readonly ChatMessage[],
  roomInvites: readonly ChatRoomInviteTimelineItem[],
  timeline: readonly ChatTimelineItem[],
  getRenderKey: (messageId: string) => string
): boolean {
  if (!timeline.length) return false
  const visibleKeys = new Set(timeline.map(getChatTimelineItemKey))
  return messages.some(message => !isLegacyRoomInviteSentinel(message.body) &&
    !visibleKeys.has(`message:${getRenderKey(message.messageId)}`)) ||
    roomInvites.some(invite => !visibleKeys.has(getChatTimelineItemKey(invite)))
}

/** Local ids cannot be an HTTP cursor, including untracked local demo rows. */
export function getOldestConfirmedChatMessageId(
  timeline: readonly ChatTimelineItem[],
  getDeliveryState: (messageId: string) => string,
  excludedKeys: ReadonlySet<string> = new Set()
): string | null {
  const oldest = timeline.find(item => item.kind === "message" &&
    !item.message.messageId.startsWith("__local_") && !excludedKeys.has(getChatTimelineItemKey(item)) &&
    getDeliveryState(item.message.messageId) === "sent")
  return oldest?.kind === "message" ? oldest.message.messageId : null
}

/** An authoritative disjoint latest page must not expose an offline cache gap. */
export function isDisjointChatHistoryPage(
  previousItems: readonly ChatTimelineItem[],
  latestHistoryMessageIds: readonly string[] | undefined,
  getRenderKey: (messageId: string) => string,
  previousHistoryMessageIds?: readonly string[]
): boolean {
  if (!latestHistoryMessageIds?.length || !previousItems.length) return false
  // A single realtime row can overlap both ranges without filling the gap.
  // Only the prior authoritative page establishes a contiguous connection.
  if (previousHistoryMessageIds?.length) {
    const previousIds = new Set(previousHistoryMessageIds)
    return !latestHistoryMessageIds.some(id => previousIds.has(id))
  }
  const oldestConfirmed = previousItems.find(item => item.kind === "message" && !item.message.messageId.startsWith("__local_"))
  // Pending rows or invitations alone cannot establish a stale message range.
  if (!oldestConfirmed) return false
  const oldestKey = getChatTimelineItemKey(oldestConfirmed)
  return !latestHistoryMessageIds.some(id => `message:${getRenderKey(id)}` === oldestKey)
}

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
