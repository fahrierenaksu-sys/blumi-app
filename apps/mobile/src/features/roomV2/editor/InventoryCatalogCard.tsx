import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo, useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import { GestureDetector, type PanGesture } from "react-native-gesture-handler"
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated"
import { getAppLocale } from "../../session/appLocale"
import { getFurnitureDisplayName } from "../furnitureDisplayNames"
import { useReducedMotion } from "../../../ui/animations"
import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"
import { resolveRoomV2InventoryPreviewSource } from "./roomEditorPlacementModel"
import { roomEditorTheme, styles } from "./roomEditorStyles"

const SHAKE_STEP = { duration: 50, reduceMotion: ReduceMotion.Never }

/**
 * One tray card: tap to preview, touch and hold then drag onto the stage to
 * place. A locked or already-placed card answers a tap with a short shake and
 * says why (ROOM-14) instead of being a dead touch. The state mark sits top
 * left; the ✕ top right closes the selection or, on a placed piece, takes it
 * back out of the room.
 */
export const InventoryCatalogCard = memo(function InventoryCatalogCard(props: {
  item: FurnitureItem
  owned: boolean
  placed: boolean
  selected: boolean
  width: number
  previewRotation: PlacedRoomItem["rotation"]
  trayDragHint: string
  previewLabel: string
  onPreviewItem: (itemId: string) => void
  clearSelectionLabel: string
  onClearSelection: () => void
  removeFromRoomLabel: string
  onRemoveFromRoom: (itemId: string) => void
  onUnavailableItem: (reason: "locked" | "placed") => void
  createDragGesture: (
    item: FurnitureItem,
    owned: boolean,
    placed: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => PanGesture
}) {
  const {
    item,
    owned,
    placed,
    selected,
    width,
    previewRotation,
    trayDragHint,
    previewLabel,
    onPreviewItem,
    clearSelectionLabel,
    onClearSelection,
    removeFromRoomLabel,
    onRemoveFromRoom,
    onUnavailableItem,
    createDragGesture
  } = props
  const canDrag = owned && !placed
  const reduceMotion = useReducedMotion()
  const shakeX = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }))
  const handlePress = () => {
    if (canDrag) {
      onPreviewItem(item.id)
      return
    }
    onUnavailableItem(owned ? "placed" : "locked")
    if (!reduceMotion) {
      shakeX.value = withSequence(
        withTiming(-6, SHAKE_STEP), withTiming(6, SHAKE_STEP), withTiming(-4, SHAKE_STEP), withTiming(0, SHAKE_STEP)
      )
    }
  }
  const dragGesture = useMemo(
    () => createDragGesture(item, owned, placed, previewRotation),
    [createDragGesture, item, owned, placed, previewRotation]
  )

  return (
    <Animated.View style={[styles.inventoryItemContainer, { width }, shakeStyle]}>
      <GestureDetector gesture={dragGesture}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={previewLabel}
          accessibilityHint={canDrag ? trayDragHint : undefined}
          accessibilityState={{ disabled: !owned || placed, selected }}
          onPress={handlePress}
          style={({ pressed }) => [
            styles.inventoryItem,
            !owned ? styles.inventoryItemLocked : null,
            selected ? styles.inventoryItemSelected : null,
            pressed && owned && !placed ? styles.inventoryItemPressed : null
          ]}
        >
          <ExpoImage
            source={resolveRoomV2InventoryPreviewSource(item, previewRotation)}
            style={styles.inventoryItemImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
          />
          {!owned ? (
            <View style={styles.inventoryItemLock}>
              <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
            </View>
          ) : selected ? (
            <View style={styles.inventoryItemCheck}>
              <Ionicons name="checkmark" size={13} color="#FFFFFF" />
            </View>
          ) : placed ? (
            <View style={[styles.inventoryItemCheck, styles.inventoryItemPlacedMark]}>
              <Ionicons name="checkmark" size={12} color={roomEditorTheme.accent} />
            </View>
          ) : null}
        </Pressable>
      </GestureDetector>
      {owned && (placed || selected) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={placed ? removeFromRoomLabel : clearSelectionLabel}
          onPress={placed ? () => onRemoveFromRoom(item.id) : onClearSelection}
          hitSlop={10}
          style={({ pressed }) => [styles.inventoryItemClose, pressed ? styles.selectionControlPressed : null]}
        >
          <Ionicons name="close" size={13} color={roomEditorTheme.ink} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.inventoryItemName}>
        {getFurnitureDisplayName(item, getAppLocale())}
      </Text>
    </Animated.View>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.owned === next.owned &&
  previous.placed === next.placed &&
  previous.selected === next.selected &&
  previous.width === next.width &&
  previous.previewRotation === next.previewRotation &&
  previous.trayDragHint === next.trayDragHint &&
  previous.previewLabel === next.previewLabel &&
  previous.onPreviewItem === next.onPreviewItem &&
  previous.clearSelectionLabel === next.clearSelectionLabel &&
  previous.onClearSelection === next.onClearSelection &&
  previous.removeFromRoomLabel === next.removeFromRoomLabel &&
  previous.onRemoveFromRoom === next.onRemoveFromRoom &&
  previous.onUnavailableItem === next.onUnavailableItem &&
  previous.createDragGesture === next.createDragGesture
)
