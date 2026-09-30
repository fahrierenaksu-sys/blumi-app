import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { memo } from "react"
import { Pressable, Text, View, type GestureResponderHandlers } from "react-native"
import type { FurnitureItem, PlacedRoomItem } from "../roomV2.types"
import { styles } from "./roomEditorStyles"

/** One tray card: tap to preview, drag vertically onto the stage to place. */
export const InventoryCatalogCard = memo(function InventoryCatalogCard(props: {
  item: FurnitureItem
  owned: boolean
  placed: boolean
  selected: boolean
  previewRotation: PlacedRoomItem["rotation"]
  onPreviewItem: (itemId: string) => void
  createPanHandlers: (
    item: FurnitureItem,
    owned: boolean,
    rotation: PlacedRoomItem["rotation"]
  ) => GestureResponderHandlers
}) {
  const {
    item,
    owned,
    placed,
    selected,
    previewRotation,
    onPreviewItem,
    createPanHandlers
  } = props
  const panHandlers = createPanHandlers(item, owned, previewRotation)

  return (
    <View style={styles.inventoryItemContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${item.name}`}
        accessibilityState={{ disabled: !owned || placed, selected }}
        disabled={!owned || placed}
        onPress={() => onPreviewItem(item.id)}
        {...panHandlers}
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
      <Text numberOfLines={1} style={styles.inventoryItemName}>{item.name}</Text>
    </View>
  )
}, (previous, next) =>
  previous.item.id === next.item.id &&
  previous.owned === next.owned &&
  previous.placed === next.placed &&
  previous.selected === next.selected &&
  previous.previewRotation === next.previewRotation &&
  previous.onPreviewItem === next.onPreviewItem &&
  previous.createPanHandlers === next.createPanHandlers
)
