import { Image as ExpoImage } from "expo-image"
import { useCallback, useEffect, useRef } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { getRoomEditorDragShadowFrame, ROOM_EDITOR_DRAG_LIFT_HEIGHT } from "./roomEditorDragModel"
import { getRoomEditorSquashScale } from "./roomEditorPlaceMotion"
import type {
  RoomEditorDragGhostContent,
  RoomEditorDragGhostValues
} from "./useRoomEditorDragGestures"
import { styles } from "./roomEditorStyles"

/**
 * The piece under the finger while dragging. A full-screen, touch-transparent
 * overlay so a tray piece can travel from the clipped tray onto the stage; the
 * position is shared values written by the pans, never React state. Placement
 * validity is drawn once on the room floor by RoomEditorFloorGridOverlay.
 */
export function RoomEditorDragGhost(props: {
  ghost: RoomEditorDragGhostContent | undefined
  values: RoomEditorDragGhostValues
  /** The room itself draws the held piece right now (a rug on its floor layer): the overlay shows nothing. */
  hidden?: boolean
}) {
  const { ghost, values, hidden = false } = props
  const { overlayOrigin } = values
  const overlayRef = useRef<View | null>(null)

  const measureOverlay = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y) => {
      overlayOrigin.value = { x, y }
    })
  }, [overlayOrigin])

  // Re-measure when a drag starts: the screen may have moved since layout.
  const ghostSession = ghost?.session
  useEffect(() => {
    if (ghostSession !== undefined) measureOverlay()
  }, [ghostSession, measureOverlay])

  const squashValue = values.squash
  const animatedStyle = useAnimatedStyle(() => {
    // the settle on a drop squashes the piece about its floor contact (the transform origin)
    const squash = getRoomEditorSquashScale(squashValue?.value ?? 0)
    return {
      opacity: values.opacity.value,
      transform: [
        { translateX: values.x.value - values.overlayOrigin.value.x },
        { translateY: values.y.value - values.overlayOrigin.value.y },
        { scaleX: values.scale.value * squash.x },
        { scaleY: values.scale.value * squash.y }
      ]
    }
  })

  // Held: the piece floats over a soft shadow on the floor; dropped: it
  // comes down onto it. Only transform and opacity animate.
  const liftValue = values.lift
  const pieceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(liftValue?.value ?? 0) * ROOM_EDITOR_DRAG_LIFT_HEIGHT }]
  }))
  const shadowStyle = useAnimatedStyle(() => {
    const lift = liftValue?.value ?? 0
    return { opacity: lift, transform: [{ scaleX: 0.9 + 0.1 * lift }] }
  })

  return (
    <View
      ref={overlayRef}
      onLayout={measureOverlay}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={hidden ? hiddenOverlayStyle : StyleSheet.absoluteFill}
    >
      {ghost ? (
        <Animated.View style={[
          styles.dragGhostAnchor,
          {
            left: ghost.frame.offsetX,
            top: ghost.frame.offsetY,
            width: ghost.frame.width,
            height: ghost.frame.height,
            // A real image-sized host avoids native clipping of descendants
            // of a zero-sized absolute-fill view. Keep scaling at the anchor.
            transformOrigin: [-ghost.frame.offsetX, -ghost.frame.offsetY, 0]
          },
          animatedStyle
        ]}>
          {liftValue && !ghost.hangsOnWall ? (
            <Animated.View
              style={[
                ghostShadowStyles.shadow,
                ghost.shadowSpot
                  ? { ...getRoomEditorDragShadowFrame(ghost.frame, ghost.shadowSpot), marginTop: 0 }
                  : {
                      left: ghost.frame.width * 0.14,
                      top: ghost.frame.height * 0.94,
                      width: ghost.frame.width * 0.72,
                      height: Math.max(6, ghost.frame.height * 0.08)
                    },
                shadowStyle
              ]}
            />
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, pieceStyle]}>
            <ExpoImage
              source={ghost.source}
              contentFit="contain"
              cachePolicy="memory-disk"
              allowDownscaling={false}
              transition={0}
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ scaleX: ghost.mirrored ? -1 : 1 }] }
              ]}
            />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  )
}

const hiddenOverlayStyle = [StyleSheet.absoluteFill, { opacity: 0 }]

const ghostShadowStyles = StyleSheet.create({
  shadow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(32, 22, 42, 0.2)",
    marginTop: -3
  }
})
