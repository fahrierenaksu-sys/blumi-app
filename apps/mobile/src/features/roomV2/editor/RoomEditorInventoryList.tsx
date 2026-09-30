import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native"
import type { PanGesture } from "react-native-gesture-handler"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"
import { InventoryCatalogCard } from "./InventoryCatalogCard"
import {
  ROOM_EDITOR_DOCK_COLUMNS,
  getRoomEditorDockCardWidth,
  getRoomEditorDockColumns,
  getRoomEditorDockPageCount,
  getRoomEditorDockPageIndex,
  getRoomEditorDockRowCount
} from "./roomEditorDockModel"
import { getDefaultRoomV2FurnitureRotation } from "./roomEditorPlacementModel"
import type { RoomEditorInventoryEntry } from "./roomEditorPresentationModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import { ROOM_EDITOR_DOCK_GRID_GAP, styles } from "./roomEditorStyles"

type TrayColumn = RoomEditorInventoryEntry[]

const keyExtractor = (column: TrayColumn): string => column[0].item.id

/**
 * The owned-furniture tray: three cards across, paging sideways with dots
 * when there is more than one page. The compact dock shows one row, the
 * expanded dock at most two, so the room always stays in view.
 * Keeps fixed-size loading placeholders and distinct no-matches, no-pieces
 * (Shop Home link), and unavailable states.
 */
export function RoomEditorInventoryList(props: {
  copy: MyRoomEditorCopy
  isExpanded: boolean
  /** Changes when the category changes; the tray returns to page one. */
  filterKey: string
  inventoryViewState: RoomEditorInventoryState["inventoryViewState"]
  inventoryStatusLabel: string
  filteredInventoryEntries: RoomEditorInventoryEntry[]
  highlightedItemId: string | undefined
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
    isExpanded,
    filterKey,
    inventoryViewState,
    inventoryStatusLabel,
    filteredInventoryEntries,
    highlightedItemId,
    selectedInventoryEntry,
    selectedInventoryRotation,
    setSelectedInventoryItemId,
    canPlaceAnotherRoomItem,
    createInventoryItemDragGesture,
    onBrowseShop
  } = props
  const [listWidth, setListWidth] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const cardWidth = getRoomEditorDockCardWidth(listWidth, ROOM_EDITOR_DOCK_GRID_GAP)
  const pageWidth = (cardWidth + ROOM_EDITOR_DOCK_GRID_GAP) * ROOM_EDITOR_DOCK_COLUMNS
  const entries = useMemo(
    () => (inventoryViewState.isLoading ? [] : filteredInventoryEntries),
    [filteredInventoryEntries, inventoryViewState.isLoading]
  )
  const rowCount = getRoomEditorDockRowCount(isExpanded, entries.length)
  const columns = useMemo(
    () => getRoomEditorDockColumns(entries, rowCount),
    [entries, rowCount]
  )
  const pageCount = getRoomEditorDockPageCount(entries.length, rowCount)
  const activePage = Math.min(pageIndex, pageCount - 1)

  const renderInventoryColumn = useCallback(({ item: column }: { item: TrayColumn }) => (
    <View style={styles.inventoryColumn}>
      {column.map((entry) => (
        <InventoryCatalogCard
          key={entry.item.id}
          item={entry.item}
          owned={entry.owned}
          placed={!canPlaceAnotherRoomItem(entry.item.id)}
          selected={highlightedItemId === entry.item.id}
          width={cardWidth}
          previewRotation={selectedInventoryEntry?.item.id === entry.item.id
            ? selectedInventoryRotation
            : getDefaultRoomV2FurnitureRotation(entry.item)}
          trayDragHint={copy.trayDragHint}
          onPreviewItem={setSelectedInventoryItemId}
          createDragGesture={createInventoryItemDragGesture}
        />
      ))}
    </View>
  ), [
    canPlaceAnotherRoomItem,
    cardWidth,
    copy.trayDragHint,
    createInventoryItemDragGesture,
    highlightedItemId,
    selectedInventoryEntry?.item.id,
    selectedInventoryRotation,
    setSelectedInventoryItemId
  ])

  const rowRef = useRef<FlatList<TrayColumn>>(null)
  // A new category or row count lays the pages out afresh: back to page one.
  const shownLayoutKeyRef = useRef(`${filterKey}:${rowCount}`)
  useLayoutEffect(() => {
    const layoutKey = `${filterKey}:${rowCount}`
    if (shownLayoutKeyRef.current === layoutKey) return
    shownLayoutKeyRef.current = layoutKey
    rowRef.current?.scrollToOffset({ offset: 0, animated: false })
    setPageIndex(0)
  }, [filterKey, rowCount])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPageIndex(getRoomEditorDockPageIndex(event.nativeEvent.contentOffset.x, pageWidth, pageCount))
  }, [pageCount, pageWidth])

  const emptyComponent = inventoryViewState.isLoading ? (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={inventoryStatusLabel}
      style={[styles.inventoryLoadingRow, { width: listWidth }]}
    >
      {Array.from({ length: ROOM_EDITOR_DOCK_COLUMNS }, (_, index) => (
        <View key={`inventory-loading-${index}`} style={styles.inventoryLoadingItem}>
          <View style={styles.inventoryLoadingCard} />
          <View style={styles.inventoryLoadingLabel} />
        </View>
      ))}
    </View>
  ) : (
    <View style={[styles.inventoryEmptyState, { width: listWidth }]}>
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
  const isMeasured = cardWidth > 0
  const hasPages = pageCount > 1 && entries.length > 0

  return (
    <View onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
      {isMeasured ? (
        <>
          <FlatList
            ref={rowRef}
            data={columns}
            renderItem={renderInventoryColumn}
            keyExtractor={keyExtractor}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEnabled={hasPages}
            snapToInterval={pageWidth}
            decelerationRate="fast"
            contentContainerStyle={styles.inventoryScroll}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            onMomentumScrollEnd={handleScroll}
            ListEmptyComponent={emptyComponent}
          />
          {/* The dot row keeps its height so the dock never changes size. */}
          <View
            accessible={hasPages}
            accessibilityRole="text"
            accessibilityLabel={copy.trayPage(activePage + 1, pageCount)}
            style={styles.inventoryPageDots}
          >
            {hasPages
              ? Array.from({ length: pageCount }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.inventoryPageDot,
                    index === activePage ? styles.inventoryPageDotActive : null
                  ]}
                />
              ))
              : null}
          </View>
        </>
      ) : null}
    </View>
  )
}
