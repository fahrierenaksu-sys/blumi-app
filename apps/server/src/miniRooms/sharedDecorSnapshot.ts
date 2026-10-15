import {
  MAX_SHARED_ROOM_DECOR_ITEMS,
  storedSharedRoomDecorSnapshotSchema,
  type SharedRoomDecorSnapshot
} from "@blumi/contracts"
import { isActiveRoomItemId, projectRoomDecorItems } from "../rooms/roomItemProjection"

export interface ReadSharedDecorResult {
  snapshot: SharedRoomDecorSnapshot
  /** Active placements left out because the wire carries at most MAX_SHARED_ROOM_DECOR_ITEMS. */
  omittedItemCount: number
}

/**
 * Reads the shared-room snapshot copied from the host's stored decor row. Order matters: the stored row is parsed
 * without a count bound (it must stay readable), legacy/unknown/held items are projected away, and only then is the wire cap applied, so
 * retired placements never make a room unreadable. If more active items than the wire cap remain, the first ones in
 * stored order are kept and the rest are counted (never hidden): the host's own room still holds all of them.
 */
export function readSharedDecor(
  value: unknown,
  isActive: (itemId: string) => boolean = isActiveRoomItemId
): ReadSharedDecorResult {
  const stored = storedSharedRoomDecorSnapshotSchema.parse(value)
  const projected = projectRoomDecorItems(stored.decor, isActive)
  const placedItems = projected.placedItems.slice(0, MAX_SHARED_ROOM_DECOR_ITEMS)
  return {
    snapshot: { ...stored, decor: { ...projected, placedItems } },
    omittedItemCount: projected.placedItems.length - placedItems.length
  }
}

const DEFAULT_WARNING_INTERVAL_MS = 10 * 60 * 1000
const MAX_WARNED_ROOMS = 500

/**
 * Logs "placements were left out" at most once per room per interval, so a polling client cannot flood the log. The
 * room key only lives in memory (never logged): the line carries a count and nothing that identifies a user or room.
 */
export function createOmittedItemsWarning(options: {
  intervalMs?: number
  now?: () => number
  warn?: (message: string, detail: { omittedItemCount: number }) => void
} = {}): (roomKey: string, omittedItemCount: number) => void {
  const intervalMs = options.intervalMs ?? DEFAULT_WARNING_INTERVAL_MS
  const now = options.now ?? Date.now
  const warn = options.warn ?? ((message, detail) => console.warn(message, detail))
  const lastWarnedAt = new Map<string, number>()
  return (roomKey, omittedItemCount) => {
    if (omittedItemCount <= 0) return
    const at = now()
    const previous = lastWarnedAt.get(roomKey)
    if (previous !== undefined && at - previous < intervalMs) return
    if (lastWarnedAt.size >= MAX_WARNED_ROOMS) lastWarnedAt.clear()
    lastWarnedAt.set(roomKey, at)
    warn("Shared room decor exceeded the item cap; extra placements are not shown", { omittedItemCount })
  }
}
