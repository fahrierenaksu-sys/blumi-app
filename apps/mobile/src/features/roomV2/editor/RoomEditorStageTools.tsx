import Ionicons from "@expo/vector-icons/Ionicons"
import { Pressable, View } from "react-native"
import { WardrobeGlass } from "../../avatarV2/wardrobe/WardrobeGlass"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomEditorStageZoom } from "./roomEditorDockModel"
import { roomEditorTheme, styles } from "./roomEditorStyles"

/**
 * Small glass controls over the room: undo the last draft change, redo (the
 * 2.5D editor's history only, when `onRedo` is given), and zoom.
 */
export function RoomEditorStageTools(props: {
  copy: MyRoomEditorCopy
  canUndo: boolean
  zoom: RoomEditorStageZoom
  canToggleZoom: boolean
  onUndo: () => void
  onToggleZoom: () => void
  canRedo?: boolean
  onRedo?: () => void
}) {
  const { copy, canUndo, zoom, canToggleZoom, onUndo, onToggleZoom, canRedo = false, onRedo } = props
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
      {onRedo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.redo}
          accessibilityState={{ disabled: !canRedo }}
          disabled={!canRedo}
          onPress={onRedo}
          hitSlop={6}
          style={({ pressed }) => [
            pressed ? styles.controlPressed : null,
            !canRedo ? styles.controlDisabled : null
          ]}
        >
          <WardrobeGlass
            tone="control"
            radius={18}
            style={styles.stageToolButton}
            contentStyle={styles.glassControl}
          >
            <Ionicons name="arrow-redo-outline" size={17} color={roomEditorTheme.ink} />
          </WardrobeGlass>
        </Pressable>
      ) : null}
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
