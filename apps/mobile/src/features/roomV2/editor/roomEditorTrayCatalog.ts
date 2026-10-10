import { isReleaseCatalogItemHeld } from "@blumi/domain"
import { IS_LOCAL_QA_ENVIRONMENT } from "../../session/localQaEnvironment"
import { ROOM_V2_FURNITURE_CATALOG } from "../roomV2Catalog"

/**
 * The pieces the owned-furniture tray may offer: never a held one (pricing pending, QA ids), even when an inventory
 * row says it is owned. The server refuses to save a held piece anyway; this keeps it out of sight. Placed pieces
 * still resolve against the full catalog, so a room that holds one draws it.
 */
export function filterRoomEditorTrayCatalog<T extends { id: string }>(catalog: readonly T[]): T[] {
  return catalog.filter((item) => !isReleaseCatalogItemHeld(item.id))
}

/**
 * Simulator QA: with `showHeldPieces` (local QA environment only) the tray lists held pieces too, so the editor can
 * be driven before pricing. It changes what the tray may offer, never what is owned: the tray still shows only
 * pieces in the server's inventory, and the server decides whether a save places one (on the memory server that
 * takes BLUMI_QA_ROOM_GRANT=1).
 */
export function resolveRoomEditorTrayCatalog<T extends { id: string }>(
  catalog: readonly T[],
  options: { showHeldPieces: boolean }
): T[] {
  return options.showHeldPieces ? [...catalog] : filterRoomEditorTrayCatalog(catalog)
}

export const ROOM_EDITOR_TRAY_CATALOG = resolveRoomEditorTrayCatalog(ROOM_V2_FURNITURE_CATALOG, {
  showHeldPieces: IS_LOCAL_QA_ENVIRONMENT
})
