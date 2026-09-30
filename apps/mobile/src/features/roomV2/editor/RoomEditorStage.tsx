import Ionicons from "@expo/vector-icons/Ionicons"
import type { RefObject } from "react"
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent
} from "react-native"
import { GestureDetector, type PanGesture } from "react-native-gesture-handler"
import { RoomRenderer2D } from "../components/RoomRenderer2D"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomShell, RoomV2RenderItem } from "../roomV2.types"
import type { getEditRoomWorldStatus } from "./roomEditorPresentationModel"
import { styles } from "./roomEditorStyles"

/**
 * The editable room stage: avatar-path status pill plus the renderer inside a
 * pressable surface. Taps stay on the Pressable (and the pieces inside it);
 * the Gesture Handler pan owns touch-and-hold drag-to-move of placed pieces.
 */
export function RoomEditorStage(props: {
  copy: MyRoomEditorCopy
  roomWorldStatus: ReturnType<typeof getEditRoomWorldStatus>
  stageRef: RefObject<View | null>
  selectedInstanceId: string | undefined
  onLayout: (event: LayoutChangeEvent) => void
  onPress: (event: GestureResponderEvent) => void
  dragGesture: PanGesture
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
    dragGesture,
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
      <GestureDetector gesture={dragGesture}>
        <Pressable
          accessible={Boolean(selectedInstanceId)}
          accessibilityRole="button"
          accessibilityLabel={copy.stageLabel}
          accessibilityHint={`${copy.stageHint} ${copy.stageDragHint}`}
          ref={stageRef}
          style={styles.roomImageWrapper}
          onLayout={onLayout}
          onPress={onPress}
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
      </GestureDetector>
    </View>
  )
}
