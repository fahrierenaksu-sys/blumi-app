import { useMemo } from "react"
import { StyleSheet, type AccessibilityValue, type LayoutChangeEvent } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Reanimated, { measure, useAnimatedRef, useSharedValue } from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import type { RoomWorldPoint } from "../../roomWorld/roomWorldGeometry"
import { mapRoomStageLocalPointToStage } from "../roomStageViewport"

/** A finger that moves farther than this before lifting is a scroll or swipe, not a tap. */
const ROOM_FLOOR_TAP_MAX_DISTANCE_PT = 12

/**
 * The room's floor as a touch target: a childless layer filling the stage,
 * under every item and avatar, so a tap on furniture or a bubble never
 * reaches it and a tap anywhere else always does.
 *
 * The tap is resolved on the UI thread at the moment it lands: Gesture
 * Handler gives the touch in this view's own coordinates (every camera zoom,
 * pan, scroll or safe-area offset of its ancestors already undone) and the
 * view is measured right then, so the stage point is the one under the
 * finger. (A Pressable's `locationX` is relative to whichever child view was
 * hit, which sent MiniRoom walks to the room's top-left corner.)
 */
export function RoomFloorTapLayer(props: {
  onTap: (point: RoomWorldPoint) => void
  accessibilityLabel: string
  accessibilityHint?: string
  accessibilityValue?: AccessibilityValue
  enabled?: boolean
  testID?: string
}) {
  const { onTap, enabled = true } = props
  const ref = useAnimatedRef<Reanimated.View>()
  const layoutSize = useSharedValue({ width: 0, height: 0 })
  const gesture = useMemo(() => Gesture.Tap()
    .enabled(enabled)
    .maxDistance(ROOM_FLOOR_TAP_MAX_DISTANCE_PT)
    .onEnd((event, success) => {
      "worklet"
      if (!success) return
      const measured = measure(ref)
      const size = measured && measured.width > 0 ? measured : layoutSize.value
      if (size.width <= 0 || size.height <= 0) return
      scheduleOnRN(onTap, mapRoomStageLocalPointToStage(event.x, event.y, size.width, size.height))
    }), [enabled, layoutSize, onTap, ref])
  const handleLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout
    layoutSize.value = { width, height }
  }

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        ref={ref}
        testID={props.testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel}
        accessibilityHint={props.accessibilityHint}
        accessibilityValue={props.accessibilityValue}
        // VoiceOver activates the floor at its middle.
        onAccessibilityTap={() => onTap({ x: 0.5, y: 0.75 })}
        onLayout={handleLayout}
        style={StyleSheet.absoluteFill}
      />
    </GestureDetector>
  )
}
