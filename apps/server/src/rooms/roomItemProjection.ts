import { isLegacyItemId } from "@blumi/domain"
import { ECONOMY_CATALOG, findEconomyCatalogItem, type EconomyCatalogItem } from "../economy/economyCatalog"
import type { EconomyInventoryRecord } from "../economy/economyRepository"
import type { PersonalRoomDecor } from "./personalRoomDecorRepository"

/**
 * A room item is active when the server catalog of this environment sells or grants it (held items are absent in
 * every environment, production keeps only receipt-backed and default items) and it is not a retired id. Stored
 * rows are never rewritten: legacy, unknown and held ids are only left out of what the server returns.
 */
export function isActiveRoomItemIdIn(
  catalog: readonly EconomyCatalogItem[]
): (itemId: string) => boolean {
  return (itemId) => !isLegacyItemId(itemId) && findEconomyCatalogItem(itemId, "room", catalog) !== null
}

export const isActiveRoomItemId: (itemId: string) => boolean = isActiveRoomItemIdIn(ECONOMY_CATALOG)

/** Room part of the inventory read projection: owned room ids are filtered to active ids, the row is untouched. */
export function projectInventoryRoomItems(
  inventory: EconomyInventoryRecord,
  isActive: (itemId: string) => boolean = isActiveRoomItemId
): EconomyInventoryRecord {
  return {
    ...inventory,
    ownedRoomItemIds: inventory.ownedRoomItemIds.filter(isActive)
  }
}

/**
 * Drops every placed item the predicate rejects (legacy, unknown, held or unowned). The decor keeps its shell, so an
 * all-legacy room reads as an empty room and the client builds the default room; the caller keeps the revision.
 */
export function projectRoomDecorItems<T extends PersonalRoomDecor>(
  decor: T,
  isPlaceable: (itemId: string) => boolean
): T {
  return {
    ...decor,
    placedItems: decor.placedItems
      .filter((item) => isPlaceable(item.itemId))
      .map((item) => ({ ...item }))
  }
}
