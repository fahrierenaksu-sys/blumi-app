import { useLayoutEffect, useRef, type RefObject } from "react"
import {
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent
} from "react-native"
import { GestureDetector, type PanGesture } from "react-native-gesture-handler"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ReduceMotion,
  type AnimatedRef
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { animateTo, useMotion } from "../../../ui/motion"
import { RoomRenderer2D } from "../components/RoomRenderer2D"
import type { MyRoomEditorCopy } from "../myRoomCopy"
import type { RoomShell, RoomV2RenderItem } from "../roomV2.types"
import {
  getRoomEditorStageZoomFlip,
  type RoomEditorStageFrame,
  type RoomEditorStageZoom
} from "./roomEditorDockModel"
import type { RoomEditorFloorOverlay } from "./roomEditorFloorGridModel"
import { RoomEditorFloorGridOverlay } from "./RoomEditorFloorGridOverlay"
import { styles } from "./roomEditorStyles"

/**
 * The editable room, drawn edge to edge in the frame the dock model gives it.
 * Taps stay on the Pressable (and the pieces inside it); the Gesture Handler
 * pan owns touch-and-hold drag-to-move of placed pieces. The frame carries an
 * animated ref so tray drags can measure the stage on the UI thread, and the
 * floor grid is drawn under the furniture while a floor piece is placed.
 * A zoom springs from the old frame to the new one (the layout itself
 * changes at once, so touches always map to the real room), and an undo
 * answers with a small settle. Reduce Motion crossfades both instead.
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
  zoom: RoomEditorStageZoom
  /** Grows by one on every undo. */
  undoCount: number
  /** The zoom motion ended: the stage sits at its real place again. */
  onFrameSettled: () => void
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
    onItemTap,
    zoom,
    undoCount,
    onFrameSettled
  } = props
  const motion = useMotion()
  const flipScale = useSharedValue(1)
  const flipX = useSharedValue(0)
  const flipY = useSharedValue(0)
  const settleScale = useSharedValue(1)
  const fade = useSharedValue(1)

  const { left, top, width, height } = frame
  const previousFrameRef = useRef<{ frame: RoomEditorStageFrame; zoom: RoomEditorStageZoom }>({ frame, zoom })
  useLayoutEffect(() => {
    const previous = previousFrameRef.current
    const next = { left, top, width, height }
    previousFrameRef.current = { frame: next, zoom }
    if (previous.zoom === zoom) return
    const flip = getRoomEditorStageZoomFlip(previous.frame, next)
    if (flip.scale === 1 && flip.translateX === 0 && flip.translateY === 0) return
    if (motion.reduceMotion) {
      fade.value = 0.4
      fade.value = animateTo(1, motion.crossfade)
      onFrameSettled()
      return
    }
    flipScale.value = flip.scale
    flipX.value = flip.translateX
    flipY.value = flip.translateY
    flipX.value = animateTo(0, motion.smooth)
    flipY.value = animateTo(0, motion.smooth)
    flipScale.value = animateTo(1, motion.smooth, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(onFrameSettled)
    })
  }, [fade, flipScale, flipX, flipY, height, left, motion, onFrameSettled, top, width, zoom])

  const previousUndoRef = useRef(undoCount)
  useLayoutEffect(() => {
    if (previousUndoRef.current === undoCount) return
    previousUndoRef.current = undoCount
    if (motion.reduceMotion) {
      fade.value = 0.6
      fade.value = animateTo(1, motion.crossfade)
      return
    }
    settleScale.value = withSequence(
      withTiming(UNDO_SETTLE_SCALE, { duration: UNDO_SETTLE_MS, reduceMotion: ReduceMotion.Never }),
      animateTo(1, motion.snappy)
    )
  }, [fade, motion, settleScale, undoCount])

  const motionStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateX: flipX.value },
      { translateY: flipY.value },
      { scale: flipScale.value * settleScale.value }
    ]
  }))

  return (
    // The frame lives on a plain view: the gesture detector's own host view
    // must contain the Pressable, or touches outside that host are dropped.
    <Animated.View ref={stageAnimatedRef} style={[styles.stageSurface, frame, motionStyle]}>
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

/** Undo: the room dips this much and springs back (snappy). */
const UNDO_SETTLE_SCALE = 0.985
const UNDO_SETTLE_MS = 70
