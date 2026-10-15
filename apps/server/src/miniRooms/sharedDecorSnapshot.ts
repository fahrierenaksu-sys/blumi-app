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
 * with a defensive bound, legacy/unknown/held items are projected away, and only then is the wire cap applied, so
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
