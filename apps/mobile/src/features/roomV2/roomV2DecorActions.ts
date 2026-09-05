import type { PlacedRoomItem, UserRoomDecor } from "./roomV2.types"

export function selectRoomV2Shell(
  decor: UserRoomDecor,
  roomShellId: string
): UserRoomDecor {
  const nextShellId = roomShellId.trim()
  return {
    ...decor,
    roomShellId: nextShellId || decor.roomShellId,
    placedItems: decor.placedItems.map((item) => ({ ...item }))
  }
}

/**
 * Commits one editor placement without allowing a repeated confirmation to
 * create another item with the same instance ID. Existing instances are moved;
 * new instances are inserted once.
 */
export function commitRoomV2PlacedItem(
  decor: UserRoomDecor,
  placedItem: PlacedRoomItem
): UserRoomDecor {
  if (
    !decor.placedItems.some((current) => current.instanceId === placedItem.instanceId) &&
    !canPlaceRoomV2ItemInstance(decor, placedItem.itemId)
  ) {
    return {
      ...decor,
      placedItems: decor.placedItems.map((current) => ({ ...current }))
    }
  }
  let committed = false
  const nextPlacedItems: PlacedRoomItem[] = []

  for (const current of decor.placedItems) {
    if (current.instanceId !== placedItem.instanceId) {
      nextPlacedItems.push({ ...current })
      continue
    }
    if (!committed) {
      nextPlacedItems.push({ ...placedItem })
      committed = true
    }
  }

  if (!committed) {
    nextPlacedItems.push({ ...placedItem })
  }

  return {
    ...decor,
    placedItems: nextPlacedItems
  }
}

/** A single owned room product represents one placeable instance. */
export function canPlaceRoomV2ItemInstance(
  decor: UserRoomDecor,
  itemId: string
): boolean {
  const normalizedItemId = itemId.trim()
  return normalizedItemId.length > 0 && !decor.placedItems.some(
    (current) => current.itemId === normalizedItemId
  )
}
