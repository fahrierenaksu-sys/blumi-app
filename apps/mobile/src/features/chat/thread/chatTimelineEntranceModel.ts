import { getChatTimelineItemKey, type ChatTimelineItem } from "../chatRoomInviteModel"

/**
 * Pure rules for which timeline rows play the short "new message" entrance.
 *
 * Only rows that appear at the newest edge while the conversation is on
 * screen enter: a message I send, a message that arrives, or a new room
 * invitation. The first load (cached or fetched history), earlier pages from
 * pagination, and Reduce Motion never animate, and a key that has entered
 * once never enters again.
 */

export interface ChatTimelineEntranceState {
  /** Every key the list has already shown or absorbed; never replayed. */
  knownKeys: ReadonlySet<string>
  /** The timeline the last plan saw (newest edge and replacement detection). */
  items: readonly ChatTimelineItem[]
}

export interface ChatTimelineEntrancePlanInput extends ChatTimelineEntranceState {
  nextItems: readonly ChatTimelineItem[]
  /** True until the list has been presented once (history still settling). */
  isInitialLoad: boolean
  reduceMotion: boolean
}

export interface ChatTimelineEntrancePlan {
  enteringKeys: ReadonlySet<string>
  state: ChatTimelineEntranceState
}

const NO_ENTERING_KEYS: ReadonlySet<string> = new Set<string>()

export const EMPTY_CHAT_TIMELINE_ENTRANCE_STATE: ChatTimelineEntranceState = {
  knownKeys: new Set<string>(),
  items: []
}

function toTimestamp(isoDate: string): number {
  const time = Date.parse(isoDate)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

function getNewestTimestamp(items: readonly ChatTimelineItem[]): number {
  return items.reduce(
    (newest, item) => Math.max(newest, toTimestamp(item.createdAt)),
    Number.NEGATIVE_INFINITY
  )
}

function getReplacementSignature(item: ChatTimelineItem): string | null {
  return item.kind === "message"
    ? `${item.message.senderUserId}\u0000${item.message.body}`
    : null
}

/**
 * Messages that left the list in this update, counted by sender and body. A
 * server acknowledgement replaces the optimistic bubble under a new id; the
 * replacement must not replay the entrance the local bubble already played.
 */
function countRemovedSignatures(
  previousItems: readonly ChatTimelineItem[],
  nextKeys: ReadonlySet<string>
): Map<string, number> {
  const removed = new Map<string, number>()
  for (const item of previousItems) {
    if (nextKeys.has(getChatTimelineItemKey(item))) continue
    const signature = getReplacementSignature(item)
    if (signature) removed.set(signature, (removed.get(signature) ?? 0) + 1)
  }
  return removed
}

function selectEnteringKeys(
  input: ChatTimelineEntrancePlanInput,
  unknownItems: readonly ChatTimelineItem[],
  nextKeys: ReadonlySet<string>
): ReadonlySet<string> {
  if (input.isInitialLoad || input.reduceMotion || unknownItems.length === 0) {
    return NO_ENTERING_KEYS
  }
  const newestKnown = getNewestTimestamp(input.items)
  const removedSignatures = countRemovedSignatures(input.items, nextKeys)
  const entering = new Set<string>()
  for (const item of unknownItems) {
    // Earlier pages land behind the newest known row; only the newest edge enters.
    if (toTimestamp(item.createdAt) < newestKnown) continue
    const signature = getReplacementSignature(item)
    const pendingReplacements = signature ? removedSignatures.get(signature) ?? 0 : 0
    if (signature && pendingReplacements > 0) {
      removedSignatures.set(signature, pendingReplacements - 1)
      continue
    }
    entering.add(getChatTimelineItemKey(item))
  }
  return entering.size > 0 ? entering : NO_ENTERING_KEYS
}

export function planChatTimelineEntrances(
  input: ChatTimelineEntrancePlanInput
): ChatTimelineEntrancePlan {
  const nextKeys = new Set(input.nextItems.map(getChatTimelineItemKey))
  const unknownItems = input.nextItems.filter(
    (item) => !input.knownKeys.has(getChatTimelineItemKey(item))
  )
  const enteringKeys = selectEnteringKeys(input, unknownItems, nextKeys)
  const knownKeys = unknownItems.length === 0
    ? input.knownKeys
    : new Set([...input.knownKeys, ...unknownItems.map(getChatTimelineItemKey)])
  return {
    enteringKeys,
    state: { knownKeys, items: input.nextItems }
  }
}
