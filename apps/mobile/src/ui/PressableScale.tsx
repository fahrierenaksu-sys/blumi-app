import { useCallback } from "react"
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { useReducedMotion } from "./animations"
import { uiTheme } from "./theme"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** Opacity of a pressed control when Reduce Motion replaces the scale. */
export const PRESSABLE_SCALE_REDUCED_OPACITY = 0.82

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>
  /** Scale while pressed (default: the theme's press scale). */
  pressedScale?: number
}

/**
 * One press feel for tappable cards and controls (MQ-1): the press-in and
 * release spring runs on the UI thread from a shared value, so a busy JS
 * thread never stutters the motion itself. It keeps RN Pressable's responder
 * semantics, so a scroll that starts on it still cancels the press. Reduce
 * Motion dims instead of scaling.
 */
export function PressableScale({
  pressedScale = uiTheme.animation.scalePress,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(0)
  const animatedStyle = useAnimatedStyle(() => reduceMotion
    ? { opacity: 1 - (1 - PRESSABLE_SCALE_REDUCED_OPACITY) * progress.value }
    : { transform: [{ scale: 1 + (pressedScale - 1) * progress.value }] })
  const handlePressIn = useCallback((event: GestureResponderEvent): void => {
    progress.value = reduceMotion
      ? withTiming(1, { duration: 0 })
      : withSpring(1, uiTheme.animation.springSnappy)
    onPressIn?.(event)
  }, [onPressIn, progress, reduceMotion])
  const handlePressOut = useCallback((event: GestureResponderEvent): void => {
    progress.value = reduceMotion
      ? withTiming(0, { duration: 0 })
      : withSpring(0, uiTheme.animation.springSnappy)
    onPressOut?.(event)
  }, [onPressOut, progress, reduceMotion])
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  )
}
