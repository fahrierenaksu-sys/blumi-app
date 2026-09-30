import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, Text } from "react-native"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { PlacedRoomItem } from "../roomV2.types"
import {
  getNextRoomEditorTrayRotation,
  type RoomEditorCapsuleMode
} from "./roomEditorDockModel"
import type { PlacementPreview } from "./roomEditorPlacementModel"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/**
 * The floating capsule under the room. For a piece in the room: its name,
 * confirm for a valid placement preview, rotate through supplied asset views,
 * and remove. For a tray piece picked in the dock: its name, a direction
 * control when the piece has more than one supplied view, and Place.
 */
export function RoomEditorSelectedItemActions(props: {
  copy: MyRoomEditorCopy
  mode: Exclude<RoomEditorCapsuleMode, "hidden">
  itemName: string
  placementPreview: PlacementPreview | undefined
  selectedInstanceId: string | undefined
  canRotateSelectedPlacedItem: boolean
  commitTrayPlacementPreview: (preview: PlacementPreview | undefined) => boolean
  handleRotate: () => void
  handleRemoveItem: () => void
  trayRotation: PlacedRoomItem["rotation"]
  trayRotations: readonly PlacedRoomItem["rotation"][]
  handleSelectInventoryRotation: (rotation: PlacedRoomItem["rotation"]) => void
  handlePlaceTrayItem: () => void
}) {
  const {
    copy,
    mode,
    itemName,
    placementPreview,
    selectedInstanceId,
    canRotateSelectedPlacedItem,
    commitTrayPlacementPreview,
    handleRotate,
    handleRemoveItem,
    trayRotation,
    trayRotations,
    handleSelectInventoryRotation,
    handlePlaceTrayItem
  } = props
  const nextTrayRotation = mode === "tray"
    ? getNextRoomEditorTrayRotation(trayRotations, trayRotation)
    : undefined
  return (
    <WardrobeGlass
      tone="panel"
      radius={24}
      style={styles.capsule}
      contentStyle={styles.capsuleContent}
    >
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.capsuleName}>
        {itemName}
      </Text>
      {nextTrayRotation ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.chooseRotation(copy.rotationLabels[nextTrayRotation], itemName)}
          accessibilityValue={{ text: copy.rotationLabels[trayRotation] }}
          onPress={() => handleSelectInventoryRotation(nextTrayRotation)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.capsuleDirectionButton,
            pressed ? styles.controlPressed : null
          ]}
        >
          <Ionicons name="refresh" size={14} color={roomEditorTheme.ink} />
          <Text maxFontSizeMultiplier={1.3} style={styles.capsuleDirectionText}>
            {copy.rotationLabels[trayRotation]}
          </Text>
        </Pressable>
      ) : null}
      {mode === "tray" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.placeItem(itemName)}
          onPress={handlePlaceTrayItem}
          hitSlop={6}
          style={({ pressed }) => [
            styles.capsulePrimaryButton,
            pressed ? styles.controlPressed : null
          ]}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text maxFontSizeMultiplier={1.3} style={styles.capsulePrimaryText}>
            {copy.placeInRoom}
          </Text>
        </Pressable>
      ) : null}
      {mode === "placed" && placementPreview?.isValid ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.confirmPlacement}
          onPress={() => commitTrayPlacementPreview(placementPreview)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.capsulePrimaryButton,
            pressed ? styles.controlPressed : null
          ]}
        >
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          <Text maxFontSizeMultiplier={1.3} style={styles.capsulePrimaryText}>
            {copy.confirmPlacement}
          </Text>
        </Pressable>
      ) : null}
      {selectedInstanceId && canRotateSelectedPlacedItem ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.rotateSelected}
          onPress={handleRotate}
          hitSlop={6}
          style={({ pressed }) => [
            styles.capsuleIconButton,
            pressed ? styles.controlPressed : null
          ]}
        >
          <Ionicons name="refresh" size={17} color={roomEditorTheme.ink} />
        </Pressable>
      ) : null}
      {selectedInstanceId ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.removeSelected}
          onPress={handleRemoveItem}
          hitSlop={6}
          style={({ pressed }) => [
            styles.capsuleIconButton,
            pressed ? styles.controlPressed : null
          ]}
        >
          <Ionicons name="trash-outline" size={17} color={roomEditorTheme.accent} />
        </Pressable>
      ) : null}
    </WardrobeGlass>
  )
}
