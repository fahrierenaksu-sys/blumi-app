import { useEffect, useRef } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue
} from "react-native-reanimated"
import { useReducedMotion } from "../../../ui/animations"
import { uiTheme } from "../../../ui/theme"
import { getWardrobePageDotWidth, type WardrobeIndicatorFrame } from "./wardrobeIndicatorModel"
import { wardrobeTheme, wardrobeV2Styles as styles } from "./wardrobeV2Styles"

/**
 * WRD-3: the selection capsule slides to the chosen section or category
 * with the springSnappy token on the UI thread. It appears in place on its
 * first measured frame, and jumps under Reduce Motion.
 */
export function WardrobeSlidingIndicator(props: {
  frame: WardrobeIndicatorFrame
  style: StyleProp<ViewStyle>
}) {
  const { frame } = props
  const reduceMotion = useReducedMotion()
  const x = useSharedValue(frame.x)
  const width = useSharedValue(frame.width)
  const placedRef = useRef(false)
  useEffect(() => {
    width.value = frame.width
    if (!placedRef.current || reduceMotion) {
      placedRef.current = true
      x.value = frame.x
      return
    }
    x.value = withSpring(frame.x, uiTheme.animation.springSnappy)
  }, [frame.width, frame.x, reduceMotion, width, x])
  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }]
  }))
  return <Animated.View pointerEvents="none" style={[props.style, animatedStyle]} />
}

/**
 * One page dot that follows the list's live position (pages scrolled), so
 * the dots move with the finger instead of after the momentum ends.
 */
export function WardrobePageDot(props: { index: number; position: SharedValue<number> }) {
  const { index, position } = props
  const dotStyle = useAnimatedStyle(() => {
    const presence = Math.max(0, 1 - Math.abs(position.value - index))
    return {
      width: getWardrobePageDotWidth(position.value, index),
      backgroundColor: interpolateColor(presence, [0, 1], [wardrobeTheme.hairline, wardrobeTheme.accent])
    }
  })
  return <Animated.View style={[styles.pageDot, dotStyle]} />
}
