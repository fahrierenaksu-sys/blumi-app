import { Image as ExpoImage } from "expo-image"
import { useCallback, useEffect, useRef } from "react"
import { StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import type {
  RoomEditorDragGhostContent,
  RoomEditorDragGhostValues
} from "./useRoomEditorDragGestures"
import { styles } from "./roomEditorStyles"

/**
 * The piece under the finger while dragging. A full-screen, touch-transparent
 * overlay so a tray piece can travel from the clipped tray onto the stage; the
 * position is shared values written by the pans, never React state.
 */
export function RoomEditorDragGhost(props: {
  ghost: RoomEditorDragGhostContent | undefined
  values: RoomEditorDragGhostValues
}) {
  const { ghost, values } = props
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

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: values.opacity.value,
    transform: [
      { translateX: values.x.value - values.overlayOrigin.value.x },
      { translateY: values.y.value - values.overlayOrigin.value.y },
      { scale: values.scale.value }
    ]
  }))

  return (
    <View
      ref={overlayRef}
      onLayout={measureOverlay}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {ghost ? (
        <Animated.View style={[styles.dragGhostAnchor, animatedStyle]}>
          <ExpoImage
            source={ghost.source}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={0}
            style={{
              position: "absolute",
              left: ghost.frame.offsetX,
              top: ghost.frame.offsetY,
              width: ghost.frame.width,
              height: ghost.frame.height,
              transform: [{ scaleX: ghost.mirrored ? -1 : 1 }]
            }}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}
