import type { UserRoomDecor } from "./roomV2.types"

/**
 * Allows a fail-closed inventory state to preserve edits to items already in
 * the room. It never grants a new item or shell.
 */
export function isRoomV2ExistingDecorOnlyEdit(
  current: UserRoomDecor,
  next: UserRoomDecor
): boolean {
  if (next.roomShellId !== current.roomShellId) return false

  const currentItems = new Map(
    current.placedItems.map((item) => [item.instanceId, item.itemId])
  )
  const nextInstanceIds = new Set<string>()

  return next.placedItems.every((item) => {
    if (nextInstanceIds.has(item.instanceId)) return false
    nextInstanceIds.add(item.instanceId)
    return currentItems.get(item.instanceId) === item.itemId
  })
}
