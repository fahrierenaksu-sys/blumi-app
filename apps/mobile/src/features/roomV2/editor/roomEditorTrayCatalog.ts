import { isReleaseCatalogItemHeld } from "@blumi/domain"
import { ROOM_V2_FURNITURE_CATALOG } from "../roomV2Catalog"

/**
 * The pieces the owned-furniture tray may offer: never a held one (pricing pending, QA ids), even when an inventory
 * row says it is owned. The server refuses to save a held piece anyway; this keeps it out of sight. Placed pieces
 * still resolve against the full catalog, so a room that holds one draws it.
 */
export function filterRoomEditorTrayCatalog<T extends { id: string }>(catalog: readonly T[]): T[] {
  return catalog.filter((item) => !isReleaseCatalogItemHeld(item.id))
}

export const ROOM_EDITOR_TRAY_CATALOG = filterRoomEditorTrayCatalog(ROOM_V2_FURNITURE_CATALOG)
