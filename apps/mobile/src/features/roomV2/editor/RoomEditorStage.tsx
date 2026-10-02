import type { RefObject } from "react"
import {
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent
} from "react-native"
import { GestureDetector, type PanGesture } from "react-native-gesture-handler"
import Animated, { type AnimatedRef } from "react-native-reanimated"
import { RoomRenderer2D } from "../components/RoomRenderer2D"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomShell, RoomV2RenderItem } from "../roomV2.types"
import type { RoomEditorStageFrame } from "./roomEditorDockModel"
import type { RoomEditorFloorOverlay } from "./roomEditorFloorGridModel"
import { RoomEditorFloorGridOverlay } from "./RoomEditorFloorGridOverlay"
import { styles } from "./roomEditorStyles"

/**
 * The editable room, drawn edge to edge in the frame the dock model gives it.
 * Taps stay on the Pressable (and the pieces inside it); the Gesture Handler
 * pan owns touch-and-hold drag-to-move of placed pieces. The frame carries an
 * animated ref so tray drags can measure the stage on the UI thread, and the
 * floor grid is drawn under the furniture while a floor piece is placed.
 */
export function RoomEditorStage(props: {
  copy: MyRoomEditorCopy
  frame: RoomEditorStageFrame
  stageRef: RefObject<View | null>
  stageAnimatedRef: AnimatedRef<Animated.View>
  selectedInstanceId: string | undefined
  onLayout: (event: LayoutChangeEvent) => void
  onPress: (event: GestureResponderEvent) => void
  dragGesture: PanGesture
  shell: RoomShell | null
  renderItems: RoomV2RenderItem[]
  placementStateByRenderId: Record<string, "valid" | "invalid"> | undefined
  floorOverlay: RoomEditorFloorOverlay | undefined
  onItemTap: (item: RoomV2RenderItem) => void
}) {
  const {
    copy,
    frame,
    stageRef,
    stageAnimatedRef,
    selectedInstanceId,
    onLayout,
    onPress,
    dragGesture,
    shell,
    renderItems,
    placementStateByRenderId,
    floorOverlay,
    onItemTap
  } = props
  return (
    // The frame lives on a plain view: the gesture detector's own host view
    // must contain the Pressable, or touches outside that host are dropped.
    <Animated.View ref={stageAnimatedRef} style={[styles.stageSurface, frame]}>
    <GestureDetector gesture={dragGesture}>
      <Pressable
        accessible={Boolean(selectedInstanceId)}
        accessibilityRole="button"
        accessibilityLabel={copy.stageLabel}
        accessibilityHint={`${copy.stageHint} ${copy.stageDragHint}`}
        ref={stageRef}
        style={styles.stagePressable}
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
          floorUnderlay={<RoomEditorFloorGridOverlay overlay={floorOverlay} />}
        />
      </Pressable>
    </GestureDetector>
    </Animated.View>
  )
}
