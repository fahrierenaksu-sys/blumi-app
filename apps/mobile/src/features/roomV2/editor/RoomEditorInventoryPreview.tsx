import Ionicons from "@expo/vector-icons/Ionicons"
import { Image as ExpoImage } from "expo-image"
import { Animated, Pressable, Text, View } from "react-native"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { PlacedRoomItem } from "../roomV2.types"
import { resolveRoomV2InventoryPreviewSource } from "./roomEditorPlacementModel"
import type { RoomEditorInventoryState } from "./useRoomEditorInventory"
import { styles } from "./roomEditorStyles"

/**
 * Inspector for the selected tray piece: fixed-size loading placeholder while
 * ownership hydrates, else the piece with its direction rail and Place action.
 */
export function RoomEditorInventoryPreview(props: {
  copy: MyRoomEditorCopy
  inventoryViewState: RoomEditorInventoryState["inventoryViewState"]
  inventoryStatusLabel: string
  selectedInventoryEntry: RoomEditorInventoryState["selectedInventoryEntry"]
  selectedInventoryRotation: PlacedRoomItem["rotation"]
  selectedInventoryRotations: PlacedRoomItem["rotation"][]
  selectedInventoryTransition: RoomEditorInventoryState["selectedInventoryTransition"]
  canPlaceAnotherRoomItem: (itemId: string) => boolean
  canPlaceInventoryItem: boolean
  handleSelectInventoryRotation: (rotation: PlacedRoomItem["rotation"]) => void
  handleAddSelectedInventoryItem: () => void
}) {
  const {
    copy,
    inventoryViewState,
    inventoryStatusLabel,
    selectedInventoryEntry,
    selectedInventoryRotation,
    selectedInventoryRotations,
    selectedInventoryTransition,
    canPlaceAnotherRoomItem,
    canPlaceInventoryItem,
    handleSelectInventoryRotation,
    handleAddSelectedInventoryItem
  } = props
  return inventoryViewState.isLoading ? (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={inventoryStatusLabel}
      style={[styles.selectedInventoryPreview, styles.inventoryLoadingPreview]}
    >
      <View style={[styles.selectedInventoryContentRow, styles.inventoryLoadingPreviewContentRow]}>
        <View style={[styles.selectedInventoryImageWrap, styles.inventoryLoadingPreviewImage]} />
        <View style={styles.inventoryLoadingPreviewCopy}>
          <View style={styles.inventoryLoadingPreviewEyebrow} />
          <View style={styles.inventoryLoadingPreviewTitle} />
          <View style={styles.inventoryLoadingPreviewHint} />
        </View>
      </View>
      <View style={styles.inventoryLoadingPreviewAction} />
    </View>
  ) : selectedInventoryEntry ? (
    <Animated.View
      style={[styles.selectedInventoryPreview, selectedInventoryTransition]}
      accessibilityRole="summary"
      accessibilityLabel={copy.previewItem(selectedInventoryEntry.item.name)}
    >
      <View style={styles.selectedInventoryContentRow}>
        <View style={styles.selectedInventoryImageWrap}>
          <ExpoImage
            source={resolveRoomV2InventoryPreviewSource(
              selectedInventoryEntry.item,
              selectedInventoryRotation
            )}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
            style={styles.selectedInventoryImage}
          />
        </View>
        <View style={styles.selectedInventoryCopy}>
          <Text style={styles.selectedInventoryEyebrow}>{copy.nowEditing}</Text>
          <View style={styles.selectedInventoryTitleRow}>
            <Text numberOfLines={1} style={styles.selectedInventoryName}>
              {selectedInventoryEntry.item.name}
            </Text>
            {!canPlaceAnotherRoomItem(selectedInventoryEntry.item.id) ? (
              <View style={styles.selectedInventoryPlacedPill}>
                <Ionicons name="checkmark" size={12} color="#B8FFD7" />
                <Text style={styles.selectedInventoryPlacedText}>{copy.placed}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.rotationRail}>
            {selectedInventoryRotations.map((rotation) => {
              const selected = selectedInventoryRotation === rotation
              return (
                <Pressable
                  key={rotation}
                  accessibilityRole="button"
                  accessibilityLabel={copy.chooseRotation(copy.rotationLabels[rotation], selectedInventoryEntry.item.name)}
                  accessibilityState={{ selected }}
                  onPress={() => handleSelectInventoryRotation(rotation)}
                  style={[
                    styles.rotationOption,
                    selected ? styles.rotationOptionSelected : null
                  ]}
                >
                  <Text style={[
                    styles.rotationOptionText,
                    selected ? styles.rotationOptionTextSelected : null
                  ]}>{copy.rotationLabels[rotation]}</Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={styles.selectedInventoryHint}>
            {selectedInventoryEntry.item.interactionType === "seat" && selectedInventoryRotation !== "front"
              ? copy.seatInspectorHint
              : copy.defaultInspectorHint}
          </Text>
        </View>
      </View>
      {canPlaceAnotherRoomItem(selectedInventoryEntry.item.id) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.placeItem(selectedInventoryEntry.item.name)}
          accessibilityState={{ disabled: !selectedInventoryEntry.owned || !canPlaceInventoryItem }}
          disabled={!selectedInventoryEntry.owned || !canPlaceInventoryItem}
          onPress={handleAddSelectedInventoryItem}
          style={({ pressed }) => [
            styles.placeSelectedInventoryButton,
            !selectedInventoryEntry.owned || !canPlaceInventoryItem
              ? styles.placeSelectedInventoryButtonDisabled
              : null,
            pressed ? styles.placeSelectedInventoryButtonPressed : null
          ]}
        >
          <Ionicons
            name="add"
            size={18}
            color={selectedInventoryEntry.owned && canPlaceInventoryItem ? "#FFFFFF" : "#A68D9C"}
          />
          <Text style={[
            styles.placeSelectedInventoryButtonText,
            !selectedInventoryEntry.owned || !canPlaceInventoryItem
              ? styles.placeSelectedInventoryButtonTextDisabled
              : null
          ]}>{copy.placeInRoom}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  ) : null
}
