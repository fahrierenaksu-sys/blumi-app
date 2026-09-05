import type { MiniRoom } from "@blumi/contracts"
import type { UserRoomDecor } from "../roomV2/roomV2.types"

export function resolveSharedRoomDecor(room: MiniRoom): { decor: UserRoomDecor; legacyFallback: boolean } {
  const decor = room.sharedDecor?.decor
  if (!decor) return {
    legacyFallback: true,
    decor: { schemaVersion: 3, geometryVersion: "room_v2", roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }
  }
  return {
    legacyFallback: false,
    decor: {
      ...decor,
      ...(decor.migration ? { migration: { ...decor.migration } } : {}),
      placedItems: decor.placedItems.map((item) => ({ ...item }))
    }
  }
}
