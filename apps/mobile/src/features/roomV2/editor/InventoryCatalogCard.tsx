import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo, useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import { GestureDetector, type PanGesture } from "react-native-gesture-handler"
import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"
import { styles } from "./roomEditorStyles"

/** One tray card: tap to preview, touch and hold then drag onto the stage to place. */
export const InventoryCatalogCard = memo(function InventoryCatalogCard(props: {
  item: FurnitureItem
  owned: boolean
  placed: boolean
  selected: boolean
  previewRotation: PlacedRoomItem["rotation"]
  trayDragHint: string
  onPreviewItem: (itemId: string) => void
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
    previewRotation,
    trayDragHint,
    onPreviewItem,
    createDragGesture
  } = props
  const canDrag = owned && !placed
  const dragGesture = useMemo(
    () => createDragGesture(item, owned, placed, previewRotation),
    [createDragGesture, item, owned, placed, previewRotation]
  )

  return (
    <View style={styles.inventoryItemContainer}>
      <GestureDetector gesture={dragGesture}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Preview ${item.name}`}
          accessibilityHint={canDrag ? trayDragHint : undefined}
          accessibilityState={{ disabled: !owned || placed, selected }}
          disabled={!owned || placed}
          onPress={() => onPreviewItem(item.id)}
          style={({ pressed }) => [
            styles.inventoryItem,
            !owned ? styles.inventoryItemLocked : null,
            placed ? styles.inventoryItemPlaced : null,
            selected && !placed ? styles.inventoryItemSelected : null,
            pressed && owned && !placed ? styles.inventoryItemPressed : null
          ]}
        >
          <ExpoImage
            source={item.asset.source}
            style={styles.inventoryItemImage}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
          />
          {!owned ? (
            <View style={styles.inventoryItemLock}>
              <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
            </View>
          ) : null}
          {placed ? (
            <View style={styles.inventoryItemPlacedMark}>
              <Ionicons name="checkmark" size={13} color="#07130E" />
            </View>
          ) : null}
        </Pressable>
      </GestureDetector>
      <Text numberOfLines={1} style={styles.inventoryItemName}>{item.name}</Text>
    </View>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.owned === next.owned &&
  previous.placed === next.placed &&
  previous.selected === next.selected &&
  previous.previewRotation === next.previewRotation &&
  previous.trayDragHint === next.trayDragHint &&
  previous.onPreviewItem === next.onPreviewItem &&
  previous.createDragGesture === next.createDragGesture
)
