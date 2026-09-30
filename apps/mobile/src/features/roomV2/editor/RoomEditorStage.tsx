import Ionicons from "@expo/vector-icons/Ionicons"
import type { RefObject } from "react"
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type GestureResponderHandlers,
  type LayoutChangeEvent
} from "react-native"
import { RoomRenderer2D } from "../components/RoomRenderer2D"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomShell, RoomV2RenderItem } from "../roomV2.types"
import type { getEditRoomWorldStatus } from "./roomEditorPresentationModel"
import { styles } from "./roomEditorStyles"

/**
 * The editable room stage: avatar-path status pill plus the renderer inside a
 * pressable surface that owns the tap and drag-to-move gestures.
 */
export function RoomEditorStage(props: {
  copy: MyRoomEditorCopy
  roomWorldStatus: ReturnType<typeof getEditRoomWorldStatus>
  stageRef: RefObject<View | null>
  selectedInstanceId: string | undefined
  onLayout: (event: LayoutChangeEvent) => void
  onPress: (event: GestureResponderEvent) => void
  panHandlers: GestureResponderHandlers
  shell: RoomShell | null
  renderItems: RoomV2RenderItem[]
  placementStateByRenderId: Record<string, "valid" | "invalid"> | undefined
  onItemTap: (item: RoomV2RenderItem) => void
}) {
  const {
    copy,
    roomWorldStatus,
    stageRef,
    selectedInstanceId,
    onLayout,
    onPress,
    panHandlers,
    shell,
    renderItems,
    placementStateByRenderId,
    onItemTap
  } = props
  return (
    <View style={styles.stageWrap}>
      <View style={styles.roomWorldStatusPill} pointerEvents="none">
        <Ionicons
          name={roomWorldStatus.icon}
          size={14}
          color={roomWorldStatus.color}
        />
        <Text style={styles.roomWorldStatusText} numberOfLines={1}>
          {roomWorldStatus.label}
        </Text>
      </View>
      <Pressable
        accessible={Boolean(selectedInstanceId)}
        accessibilityRole="button"
        accessibilityLabel={copy.stageLabel}
        accessibilityHint={copy.stageHint}
        ref={stageRef}
        style={styles.roomImageWrapper}
        onLayout={onLayout}
        onPress={onPress}
        {...panHandlers}
      >
        <RoomRenderer2D
          shell={shell}
          renderItems={renderItems}
          selectedInstanceId={selectedInstanceId}
          placementStateByRenderId={placementStateByRenderId}
          onItemTap={onItemTap}
          itemInteractionMode="edit"
          roomVNextRuntimeMode="disabled"
          debugPlacement={false}
          testID="edit-room-v1"
          style={styles.renderer}
        />
      </Pressable>
    </View>
  )
}
