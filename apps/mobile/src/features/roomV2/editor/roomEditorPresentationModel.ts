import type { AppLocale } from "../../session/appLocale"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import { normalizeRoomInventorySearchText } from "../roomV2Selectors"
import type { getRoomWorldMotionReadinessSummary } from "../../roomWorld/roomWorldDiagnostics"
import type {
  FurnitureCategory,
  FurnitureItem,
  PlacedRoomItem
} from "../roomV2.types"
import {
  getRoomV2FurnitureRotationOptions,
  type PlacementPreview
} from "./roomEditorPlacementModel"

/**
 * Pure presentation decisions for the My Room editor: status pill, header
 * subtitle, collection status label, tray filtering, and inspector selection.
 */

export interface RoomEditorInventoryEntry {
  item: FurnitureItem
  owned: boolean
}

export type RoomEditorInventoryCategoryId = "all" | FurnitureCategory

export type RoomEditorWorldStatusIcon = "walk" | "resize" | "alert-circle"

export function getEditRoomWorldStatus(
  level: ReturnType<typeof getRoomWorldMotionReadinessSummary>["level"],
  copy: MyRoomEditorCopy
): {
  icon: RoomEditorWorldStatusIcon
  label: string
  color: string
} {
  switch (level) {
    case "ready":
      return {
        icon: "walk",
        label: copy.readiness.ready,
        color: "#8FFFD1"
      }
    case "constrained":
      return {
        icon: "resize",
        label: copy.readiness.constrained,
        color: "#FFE1A8"
      }
    case "blocked":
      return {
        icon: "alert-circle",
        label: copy.readiness.blocked,
        color: "#FFB4C8"
      }
  }
}

/** Header subtitle: live placement feedback wins over the selection hint. */
export function getRoomEditorSubtitle(input: {
  copy: MyRoomEditorCopy
  placementFeedback: string | undefined
  selectedInstanceId: string | undefined
  canRotateSelectedPlacedItem: boolean
}): string {
  const { copy, placementFeedback, selectedInstanceId, canRotateSelectedPlacedItem } = input
  return placementFeedback ?? (
    !selectedInstanceId
      ? copy.defaultSubtitle
      : canRotateSelectedPlacedItem
        ? copy.rotatableSubtitle
        : copy.fixedSubtitle
  )
}

export function getRoomEditorInventoryStatusLabel(input: {
  locale: AppLocale
  copy: MyRoomEditorCopy
  inventoryViewState: { isLoading: boolean; isFailed: boolean }
  inventoryEntryCount: number
}): string {
  const { locale, copy, inventoryViewState } = input
  return inventoryViewState.isLoading
    ? locale === "tr" ? "Eşya koleksiyonun yükleniyor…" : "Loading your collection…"
    : inventoryViewState.isFailed
      ? locale === "tr" ? "Eşya koleksiyonun doğrulanamadı." : "Your collection could not be verified."
      : copy.piecesReady(input.inventoryEntryCount)
}

export function filterRoomEditorInventoryEntries<Entry extends RoomEditorInventoryEntry>(
  inventoryEntries: readonly Entry[],
  activeInventoryCategory: RoomEditorInventoryCategoryId,
  inventorySearchQuery: string
): Entry[] {
  const normalizedQuery = normalizeRoomInventorySearchText(inventorySearchQuery)
  return inventoryEntries.filter((entry) => (
    (activeInventoryCategory === "all" || entry.item.category === activeInventoryCategory) &&
    (!normalizedQuery || normalizeRoomInventorySearchText(entry.item.name).includes(normalizedQuery))
  ))
}

/**
 * Inspector entry: the explicit selection, else the first owned piece not yet
 * in the room, else the first visible piece.
 */
export function resolveSelectedRoomEditorInventoryEntry<Entry extends RoomEditorInventoryEntry>(
  filteredInventoryEntries: readonly Entry[],
  selectedInventoryItemId: string | undefined,
  placedRoomItemIds: ReadonlySet<string>
): Entry | undefined {
  return (
    filteredInventoryEntries.find((entry) => entry.item.id === selectedInventoryItemId) ??
    filteredInventoryEntries.find((entry) => entry.owned && !placedRoomItemIds.has(entry.item.id)) ??
    filteredInventoryEntries[0]
  )
}

export function getSelectedPlacedRotationOptions(
  placedItems: readonly PlacedRoomItem[],
  selectedInstanceId: string | undefined,
  furnitureCatalog: readonly FurnitureItem[]
): PlacedRoomItem["rotation"][] {
  const selectedPlacedItem = placedItems.find(
    (item) => item.instanceId === selectedInstanceId
  )
  const selectedFurniture = furnitureCatalog.find(
    (item) => item.id === selectedPlacedItem?.itemId
  )
  return selectedFurniture
    ? getRoomV2FurnitureRotationOptions(selectedFurniture)
    : []
}

/** Renderer highlight map: the preview item plus its blockers when invalid. */
export function getRoomEditorPlacementStateByRenderId(
  placementPreview: PlacementPreview | undefined
): Record<string, "valid" | "invalid"> | undefined {
  if (!placementPreview) return undefined
  const stateByRenderId: Record<string, "valid" | "invalid"> = {
    [placementPreview.item.renderId]: placementPreview.isValid
      ? "valid"
      : "invalid"
  }
  if (!placementPreview.isValid) {
    placementPreview.blockingRenderIds?.forEach((renderId) => {
      stateByRenderId[renderId] = "invalid"
    })
  }
  return {
    ...stateByRenderId
  }
}
