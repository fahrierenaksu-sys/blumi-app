import { useCallback } from "react"
import { FlatList, Pressable, Text, View } from "react-native"
import type { PanGesture } from "react-native-gesture-handler"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"
import { InventoryCatalogCard } from "./InventoryCatalogCard"
import { getDefaultRoomV2FurnitureRotation } from "./roomEditorPlacementModel"
import type { RoomEditorInventoryEntry } from "./roomEditorPresentationModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import { styles } from "./roomEditorStyles"

/**
 * Horizontal owned-furniture tray with fixed-size loading placeholders and
 * distinct no-matches, no-pieces (Shop Home link), and unavailable states.
 */
export function RoomEditorInventoryList(props: {
  copy: MyRoomEditorCopy
  inventoryViewState: RoomEditorInventoryState["inventoryViewState"]
  inventoryStatusLabel: string
  filteredInventoryEntries: RoomEditorInventoryEntry[]
  selectedInventoryEntry: RoomEditorInventoryState["selectedInventoryEntry"]
  selectedInventoryRotation: PlacedRoomItem["rotation"]
  setSelectedInventoryItemId: (itemId: string) => void
  canPlaceAnotherRoomItem: (itemId: string) => boolean
  createInventoryItemDragGesture: (
    item: FurnitureItem,
    owned: boolean,
    placed: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => PanGesture
  onBrowseShop: () => void
}) {
  const {
    copy,
    inventoryViewState,
    inventoryStatusLabel,
    filteredInventoryEntries,
    selectedInventoryEntry,
    selectedInventoryRotation,
    setSelectedInventoryItemId,
    canPlaceAnotherRoomItem,
    createInventoryItemDragGesture,
    onBrowseShop
  } = props

  const renderInventoryItem = useCallback(({ item: entry }: { item: RoomEditorInventoryEntry }) => (
    <InventoryCatalogCard
      item={entry.item}
      owned={entry.owned}
      placed={!canPlaceAnotherRoomItem(entry.item.id)}
      selected={selectedInventoryEntry?.item.id === entry.item.id}
      previewRotation={selectedInventoryEntry?.item.id === entry.item.id
        ? selectedInventoryRotation
        : getDefaultRoomV2FurnitureRotation(entry.item)}
      trayDragHint={copy.trayDragHint}
      onPreviewItem={setSelectedInventoryItemId}
      createDragGesture={createInventoryItemDragGesture}
    />
  ), [
    canPlaceAnotherRoomItem,
    copy.trayDragHint,
    createInventoryItemDragGesture,
    selectedInventoryEntry?.item.id,
    selectedInventoryRotation,
    setSelectedInventoryItemId
  ])

  return (
    <FlatList
      data={inventoryViewState.isLoading ? [] : filteredInventoryEntries}
      renderItem={renderInventoryItem}
      keyExtractor={(entry) => entry.item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.inventoryScroll}
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={4}
      removeClippedSubviews
      ListEmptyComponent={(
        inventoryViewState.isLoading ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={inventoryStatusLabel}
            style={styles.inventoryLoadingRow}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <View key={`inventory-loading-${index}`} style={styles.inventoryLoadingItem}>
                <View style={styles.inventoryLoadingCard} />
                <View style={styles.inventoryLoadingLabel} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.inventoryEmptyState}>
            <Text style={styles.inventoryEmptyText}>
              {inventoryViewState.emptyState === "no-matches"
                ? copy.noMatches
                : inventoryViewState.emptyState === "no-pieces"
                  ? copy.noPieces
                  : inventoryStatusLabel}
            </Text>
            {inventoryViewState.emptyState === "no-pieces" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.browseShop}
                onPress={onBrowseShop}
                style={styles.inventoryEmptyAction}
              >
                <Text style={styles.inventoryEmptyActionText}>{copy.browseShop}</Text>
              </Pressable>
            ) : null}
          </View>
        )
      )}
    />
  )
}
