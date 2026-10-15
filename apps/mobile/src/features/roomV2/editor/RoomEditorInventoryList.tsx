import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { type FlatList, StyleSheet, Text, View } from "react-native"
import type { PanGesture } from "react-native-gesture-handler"
import Reanimated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { hapticError } from "../../../ui/haptics"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"
import { getAppLocale } from "../../session/appLocale"
import { getFurnitureDisplayName } from "../furnitureDisplayNames"
import { InventoryCatalogCard } from "./InventoryCatalogCard"
import {
  ROOM_EDITOR_DOCK_COLUMNS,
  getRoomEditorDockCardWidth,
  getRoomEditorDockColumns,
  getRoomEditorDockPageCount,
  getRoomEditorDockPageDotPresence,
  getRoomEditorDockPagePosition,
  getRoomEditorDockRowCount
} from "./roomEditorDockModel"
import { getDefaultRoomV2FurnitureRotation } from "./roomEditorPlacementModel"
import type { RoomEditorInventoryEntry } from "./roomEditorPresentationModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import { ROOM_EDITOR_DOCK_GRID_GAP, roomEditorTheme, styles } from "./roomEditorStyles"
import { PressableScale } from "../../../ui/PressableScale"

type TrayColumn = RoomEditorInventoryEntry[]

const keyExtractor = (column: TrayColumn): string => column[0].item.id

const PAGE_DOT_SIZE = 6
const PAGE_DOT_ACTIVE_WIDTH = 16
const PAGE_DOT_GROWTH = PAGE_DOT_ACTIVE_WIDTH - PAGE_DOT_SIZE

const dotStyles = StyleSheet.create({
  slot: { width: PAGE_DOT_SIZE, height: PAGE_DOT_SIZE },
  lastSlot: { width: PAGE_DOT_ACTIVE_WIDTH, height: PAGE_DOT_SIZE },
  cap: { position: "absolute", left: 0, top: 0, width: PAGE_DOT_SIZE, height: PAGE_DOT_SIZE, borderRadius: PAGE_DOT_SIZE / 2 },
  // One pixel wide; scaled sideways it joins the two round caps into the pill.
  middle: { position: "absolute", left: PAGE_DOT_SIZE / 2, top: 0, width: 1, height: PAGE_DOT_SIZE, transformOrigin: "0% 50%" }
})

function colorFor(presence: number): string {
  "worklet"
  return interpolateColor(presence, [0, 1], [roomEditorTheme.hairline, roomEditorTheme.accent])
}

/**
 * One tray page dot that follows the live swipe on the UI thread. Every dot
 * keeps a fixed layout slot: the active pill is two round caps joined by a
 * scaled bar, and the dots after it slide over by the width it has gained, so
 * nothing re-lays out per frame and the pill keeps its round ends. The last
 * slot reserves the pill's extra width so the row never changes size.
 */
function TrayPageDot(props: { index: number; isLast: boolean; position: SharedValue<number> }) {
  const { index, isLast, position } = props
  const slotStyle = useAnimatedStyle(() => {
    let gained = 0
    for (let before = 0; before < index; before += 1) {
      gained += PAGE_DOT_GROWTH * getRoomEditorDockPageDotPresence(position.value, before)
    }
    return { transform: [{ translateX: gained }] }
  })
  const leftCapStyle = useAnimatedStyle(() => ({
    backgroundColor: colorFor(getRoomEditorDockPageDotPresence(position.value, index))
  }))
  const rightCapStyle = useAnimatedStyle(() => {
    const presence = getRoomEditorDockPageDotPresence(position.value, index)
    return { backgroundColor: colorFor(presence), transform: [{ translateX: PAGE_DOT_GROWTH * presence }] }
  })
  const middleStyle = useAnimatedStyle(() => {
    const presence = getRoomEditorDockPageDotPresence(position.value, index)
    return { backgroundColor: colorFor(presence), transform: [{ scaleX: PAGE_DOT_GROWTH * presence }] }
  })
  return (
    <Reanimated.View style={[isLast ? dotStyles.lastSlot : dotStyles.slot, slotStyle]}>
      <Reanimated.View style={[dotStyles.cap, leftCapStyle]} />
      <Reanimated.View style={[dotStyles.cap, rightCapStyle]} />
      <Reanimated.View style={[dotStyles.middle, middleStyle]} />
    </Reanimated.View>
  )
}

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
  /** Shows why a locked or already-placed card cannot be placed. */
  onTrayFeedback: (message: string) => void
  onClearSelection: () => void
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
    onBrowseShop,
    onTrayFeedback,
    onClearSelection
  } = props
  const handleUnavailableItem = useCallback((reason: "locked" | "placed") => {
    hapticError()
    onTrayFeedback(reason === "placed" ? copy.feedback.alreadyPlaced : copy.feedback.lockedInShop)
  }, [copy.feedback.alreadyPlaced, copy.feedback.lockedInShop, onTrayFeedback])
  const [listWidth, setListWidth] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  /** Written on the UI thread: the tray position in pages, for the dots. */
  const pagePosition = useSharedValue(0)
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
          previewLabel={copy.previewItem(getFurnitureDisplayName(entry.item, getAppLocale()))}
          onPreviewItem={setSelectedInventoryItemId}
          clearSelectionLabel={copy.clearSelection}
          onClearSelection={onClearSelection}
          onUnavailableItem={handleUnavailableItem}
          createDragGesture={createInventoryItemDragGesture}
        />
      ))}
    </View>
  ), [
    canPlaceAnotherRoomItem,
    cardWidth,
    copy,
    handleUnavailableItem,
    createInventoryItemDragGesture,
    highlightedItemId,
    selectedInventoryEntry?.item.id,
    selectedInventoryRotation,
    onClearSelection,
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
    pagePosition.value = 0
    setPageIndex(0)
  }, [filterKey, pagePosition, rowCount])

  // The dots follow the live offset on the UI thread; React hears only page
  // changes (for the VoiceOver page label), never every frame.
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      pagePosition.value = getRoomEditorDockPagePosition(event.contentOffset.x, pageWidth, pageCount)
    }
  }, [pageCount, pageWidth])
  useAnimatedReaction(
    () => Math.round(pagePosition.value),
    (index, previous) => {
      if (previous !== null && index !== previous) scheduleOnRN(setPageIndex, index)
    }
  )

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
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={copy.browseShop}
          onPress={onBrowseShop}
          style={styles.inventoryEmptyAction}
        >
          <Text style={styles.inventoryEmptyActionText}>{copy.browseShop}</Text>
        </PressableScale>
      ) : null}
    </View>
  )
  const isMeasured = cardWidth > 0
  const hasPages = pageCount > 1 && entries.length > 0

  return (
    <View onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
      {isMeasured ? (
        <>
          <Reanimated.FlatList
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
            onScroll={handleScroll}
            scrollEventThrottle={16}
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
                <TrayPageDot key={index} index={index} isLast={index === pageCount - 1} position={pagePosition} />
              ))
              : null}
          </View>
        </>
      ) : null}
    </View>
  )
}
