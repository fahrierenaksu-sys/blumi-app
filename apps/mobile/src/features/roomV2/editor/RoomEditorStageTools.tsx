import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, View } from "react-native"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomEditorStageZoom } from "./roomEditorDockModel"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/** Small glass controls over the room: undo the last draft change, and zoom. */
export function RoomEditorStageTools(props: {
  copy: MyRoomEditorCopy
  canUndo: boolean
  zoom: RoomEditorStageZoom
  canToggleZoom: boolean
  onUndo: () => void
  onToggleZoom: () => void
}) {
  const { copy, canUndo, zoom, canToggleZoom, onUndo, onToggleZoom } = props
  return (
    <View style={styles.stageTools}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.undo}
        accessibilityState={{ disabled: !canUndo }}
        disabled={!canUndo}
        onPress={onUndo}
        hitSlop={6}
        style={({ pressed }) => [
          pressed ? styles.controlPressed : null,
          !canUndo ? styles.controlDisabled : null
        ]}
      >
        <WardrobeGlass
          tone="control"
          radius={18}
          style={styles.stageToolButton}
          contentStyle={styles.glassControl}
        >
          <Ionicons name="arrow-undo-outline" size={17} color={roomEditorTheme.ink} />
        </WardrobeGlass>
      </Pressable>
      {canToggleZoom ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={zoom === "fill" ? copy.zoomRoomOut : copy.zoomRoomIn}
          onPress={onToggleZoom}
          hitSlop={6}
          style={({ pressed }) => (pressed ? styles.controlPressed : null)}
        >
          <WardrobeGlass
            tone="control"
            radius={18}
            style={styles.stageToolButton}
            contentStyle={styles.glassControl}
          >
            <Ionicons
              name={zoom === "fill" ? "contract-outline" : "expand-outline"}
              size={17}
              color={roomEditorTheme.ink}
            />
          </WardrobeGlass>
        </Pressable>
      ) : null}
    </View>
  )
}
