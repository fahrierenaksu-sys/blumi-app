import type { ReactNode } from "react"

/** One extra drawing placed in the room's draw order (the room pet). */
export interface RoomRendererDepthSlot {
  /** Draw just before this item; null (or an item not drawn here) draws it after every item. */
  readonly beforeRenderId: string | null
  readonly node: ReactNode
}

export const ROOM_RENDERER_DEPTH_SLOT_KEY = "room-renderer-depth-slot"

/**
 * The drawn entries with the slot inserted before `beforeRenderId`. Without a
 * slot the entries come back unchanged (same array), so nothing extra draws.
 */
export function placeRoomRendererDepthSlot<Entry extends { readonly renderId: string }>(
  entries: readonly Entry[],
  slot: (Entry & { readonly beforeRenderId: string | null }) | null
): readonly Entry[] {
  if (!slot) return entries
  const index = slot.beforeRenderId === null ? -1 : entries.findIndex((entry) => entry.renderId === slot.beforeRenderId)
  const at = index < 0 ? entries.length : index
  return [...entries.slice(0, at), slot, ...entries.slice(at)]
}
