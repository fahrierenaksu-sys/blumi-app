import { useCallback, useState } from "react"
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle
} from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue
} from "react-native-reanimated"
import {
  animateTo,
  MOTION_PRESS_SCALE,
  MOTION_REDUCED_PRESS_OPACITY,
  useMotion
} from "./motion"

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** Opacity of a pressed control when Reduce Motion replaces the scale. */
export const PRESSABLE_SCALE_REDUCED_OPACITY = MOTION_REDUCED_PRESS_OPACITY

type PressableScaleStyle =
  | StyleProp<ViewStyle>
  | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>)

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  /** A style, or a function of the pressed state like RN Pressable's. */
  style?: PressableScaleStyle
  /** Scale while pressed (default: the motion press scale). */
  pressedScale?: number
}

/**
 * One press feel for every tappable card and control (MQ-1): the press-in
 * and release run the `press` motion token on the UI thread from a shared
 * value, so a busy JS thread never stutters the motion itself. It keeps RN
 * Pressable's responder semantics, so a scroll that starts on it still
 * cancels the press. Reduce Motion dims instead of scaling.
 */
export function PressableScale({
  pressedScale = MOTION_PRESS_SCALE,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const motion = useMotion()
  const { reduceMotion } = motion
  const progress = useSharedValue(0)
  // Only a function style needs the pressed state in React (as RN Pressable
  // re-renders for it); a plain style never re-renders on press.
  const styleIsFunction = typeof style === "function"
  const [pressed, setPressed] = useState(false)
  const animatedStyle = useAnimatedStyle(() => reduceMotion
    ? { opacity: 1 - (1 - PRESSABLE_SCALE_REDUCED_OPACITY) * progress.value }
    : { transform: [{ scale: 1 + (pressedScale - 1) * progress.value }] })
  const handlePressIn = useCallback((event: GestureResponderEvent): void => {
    progress.value = animateTo(1, motion.press)
    if (styleIsFunction) setPressed(true)
    onPressIn?.(event)
  }, [motion, onPressIn, progress, styleIsFunction])
  const handlePressOut = useCallback((event: GestureResponderEvent): void => {
    progress.value = animateTo(0, motion.press)
    if (styleIsFunction) setPressed(false)
    onPressOut?.(event)
  }, [motion, onPressOut, progress, styleIsFunction])
  const baseStyle = typeof style === "function"
    ? style({ pressed, hovered: false, focused: false } as PressableStateCallbackType)
    : style
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[baseStyle, animatedStyle]}
    />
  )
}
