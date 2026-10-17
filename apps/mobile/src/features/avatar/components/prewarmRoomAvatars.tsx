import { prewarmAvatar25Pages } from "../renderer/Avatar25Canvas"
import { roomAvatar25d } from "../roomAvatarSeam"
import type { RoomAvatar25dLoadout } from "../roomAvatarSeamContract"

/**
 * Loads the texture pages of avatars about to appear in a room (an invitation on screen), so the room draws them
 * on its first frames instead of loading them while it opens. Loadouts the 2.5D resolver cannot draw are skipped.
 */
export function prewarmRoomAvatars(loadouts: readonly RoomAvatar25dLoadout[]): void {
  const avatars = loadouts.flatMap((loadout) => {
    const spec = roomAvatar25d.resolveRoomAvatar25d({ loadout, state: "idle", direction: "front" })
    return spec ? [{ rig: spec.rig ?? "female", itemIds: spec.itemIds }] : []
  })
  if (avatars.length > 0) void prewarmAvatar25Pages(avatars)
}
