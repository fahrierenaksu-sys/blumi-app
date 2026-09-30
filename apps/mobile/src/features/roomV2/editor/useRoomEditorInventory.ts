import { useEffect, useMemo, useState } from "react"
import type { InventoryStoreView } from "../../inventory/inventoryStore"
import type { AppLocale } from "../../session/appLocale"
import { useSelectionTransition } from "../../../ui/animations"
import {
  canPlaceRoomEditorInventoryItem,
  getRoomEditorInventoryViewState,
  useRoomEditorInventoryEntries
} from "../../../screens/useRoomEditorInventoryEntries"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { PlacedRoomItem, UserRoomDecor } from "../roomV2.types"
import {
  ACTIVE_ROOM_FURNITURE_CATALOG,
  QA_OWNED_ROOM_ITEM_IDS
} from "./roomEditorCatalog"
import {
  getDefaultRoomV2FurnitureRotation,
  getRoomV2FurnitureRotationOptions
} from "./roomEditorPlacementModel"
import {
  filterRoomEditorInventoryEntries,
  getRoomEditorInventoryStatusLabel,
  resolveSelectedRoomEditorInventoryEntry,
  type RoomEditorInventoryCategoryId,
  type RoomEditorInventoryEntry
} from "./roomEditorPresentationModel"

/**
 * The owned-furniture tray: server-authoritative ownership, hydration gating,
 * category/search filtering, and the inspector's selected piece and direction.
 */
export function useRoomEditorInventory(input: {
  inventory: InventoryStoreView["inventory"]
  inventoryHydrationStatus: InventoryStoreView["hydrationStatus"]
  requireServerInventory: boolean | undefined
  placedItems: UserRoomDecor["placedItems"]
  locale: AppLocale
  copy: MyRoomEditorCopy
}) {
  const { inventory, inventoryHydrationStatus, placedItems, locale, copy } = input
  const [activeInventoryCategory, setActiveInventoryCategory] = useState<RoomEditorInventoryCategoryId>("all")
  const [inventorySearchQuery, setInventorySearchQuery] = useState("")
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | undefined>()
  const [selectedInventoryRotation, setSelectedInventoryRotation] = useState<PlacedRoomItem["rotation"]>("front")

  const inventoryEntries: RoomEditorInventoryEntry[] = useRoomEditorInventoryEntries(
    ACTIVE_ROOM_FURNITURE_CATALOG,
    inventory.ownedRoomItemIds,
    QA_OWNED_ROOM_ITEM_IDS
  )
  const placedRoomItemIds = useMemo(
    () => new Set(placedItems.map((placedItem) => placedItem.itemId)),
    [placedItems]
  )
  const filteredInventoryEntries = useMemo(() => filterRoomEditorInventoryEntries(
    inventoryEntries,
    activeInventoryCategory,
    inventorySearchQuery
  ), [activeInventoryCategory, inventoryEntries, inventorySearchQuery])
  const inventoryViewState = getRoomEditorInventoryViewState(
    inventoryHydrationStatus,
    inventoryEntries.length,
    filteredInventoryEntries.length
  )
  const canPlaceInventoryItem = canPlaceRoomEditorInventoryItem(
    inventoryHydrationStatus,
    input.requireServerInventory === true
  )
  const inventoryStatusLabel = getRoomEditorInventoryStatusLabel({
    locale,
    copy,
    inventoryViewState,
    inventoryEntryCount: inventoryEntries.length
  })
  const selectedInventoryEntry = useMemo(() => resolveSelectedRoomEditorInventoryEntry(
    filteredInventoryEntries,
    selectedInventoryItemId,
    placedRoomItemIds
  ), [filteredInventoryEntries, placedRoomItemIds, selectedInventoryItemId])
  const selectedInventoryRotations = useMemo(
    () => selectedInventoryEntry
      ? getRoomV2FurnitureRotationOptions(selectedInventoryEntry.item)
      : [],
    [selectedInventoryEntry]
  )
  const selectedInventoryTransition = useSelectionTransition(
    selectedInventoryEntry?.item.id
  )

  useEffect(() => {
    const nextItemId = selectedInventoryEntry?.item.id
    setSelectedInventoryItemId((current) => current === nextItemId ? current : nextItemId)
  }, [selectedInventoryEntry?.item.id])

  useEffect(() => {
    if (!selectedInventoryEntry) return
    const availableRotations = getRoomV2FurnitureRotationOptions(selectedInventoryEntry.item)
    setSelectedInventoryRotation((current) => (
      availableRotations.includes(current)
        ? current
        : getDefaultRoomV2FurnitureRotation(selectedInventoryEntry.item)
    ))
  }, [selectedInventoryEntry])

  return {
    activeInventoryCategory,
    setActiveInventoryCategory,
    inventorySearchQuery,
    setInventorySearchQuery,
    setSelectedInventoryItemId,
    selectedInventoryRotation,
    setSelectedInventoryRotation,
    inventoryEntries,
    filteredInventoryEntries,
    inventoryViewState,
    canPlaceInventoryItem,
    inventoryStatusLabel,
    selectedInventoryEntry,
    selectedInventoryRotations,
    selectedInventoryTransition
  }
}

export type RoomEditorInventoryState = ReturnType<typeof useRoomEditorInventory>
