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
 * The shared press feel, for a pressable that cannot be PressableScale
 * itself (GesturePressableScale). Press-in and release run the `press`
 * token on the UI thread; Reduce Motion dims instead of scaling.
 */
export function usePressScaleFeel(pressedScale: number = MOTION_PRESS_SCALE) {
  const motion = useMotion()
  const { reduceMotion } = motion
  const progress = useSharedValue(0)
  const animatedStyle = useAnimatedStyle(() => reduceMotion
    ? { opacity: 1 - (1 - PRESSABLE_SCALE_REDUCED_OPACITY) * progress.value }
    : { transform: [{ scale: 1 + (pressedScale - 1) * progress.value }] })
  const pressIn = useCallback((): void => {
    progress.value = animateTo(1, motion.press)
  }, [motion, progress])
  const pressOut = useCallback((): void => {
    progress.value = animateTo(0, motion.press)
  }, [motion, progress])
  return { animatedStyle, pressIn, pressOut }
}

/**
 * One press feel for every tappable card and control (MQ-1): the press-in
 * and release run the `press` motion token on the UI thread from a shared
 * value, so a busy JS thread never stutters the motion itself. It keeps RN
 * Pressable's responder semantics, so a scroll that starts on it still
 * cancels the press. Reduce Motion dims instead of scaling.
 *
 * A control on a surface Reanimated moves (a keyboard-glued footer) uses
 * GesturePressableScale instead: RN Pressable checks finger movement against
 * a layout that misses those transforms, so a tap there can be dropped.
 */
export function PressableScale({
  pressedScale = MOTION_PRESS_SCALE,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const { animatedStyle, pressIn, pressOut } = usePressScaleFeel(pressedScale)
  // Only a function style needs the pressed state in React (as RN Pressable
  // re-renders for it); a plain style never re-renders on press.
  const styleIsFunction = typeof style === "function"
  const [pressed, setPressed] = useState(false)
  const handlePressIn = useCallback((event: GestureResponderEvent): void => {
    pressIn()
    if (styleIsFunction) setPressed(true)
    onPressIn?.(event)
  }, [onPressIn, pressIn, styleIsFunction])
  const handlePressOut = useCallback((event: GestureResponderEvent): void => {
    pressOut()
    if (styleIsFunction) setPressed(false)
    onPressOut?.(event)
  }, [onPressOut, pressOut, styleIsFunction])
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
