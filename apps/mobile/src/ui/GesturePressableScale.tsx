import { useCallback, type ReactNode } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { Pressable, type PressableProps } from "react-native-gesture-handler"
import Animated from "react-native-reanimated"
import { usePressScaleFeel } from "./PressableScale"

type PressableEvent = Parameters<NonNullable<PressableProps["onPressIn"]>>[0]

type GesturePressableScaleStyle =
  | StyleProp<ViewStyle>
  | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)

export type GesturePressableScaleProps = Omit<PressableProps, "style" | "children"> & {
  /** The control's look, or a function of the pressed state. */
  style?: GesturePressableScaleStyle
  /** Scale while pressed (default: the motion press scale). */
  pressedScale?: number
  children?: ReactNode
}

/**
 * PressableScale's press feel for a control on a surface Reanimated moves,
 * such as a composer glued to the keyboard. With synchronous UI props those
 * transforms skip React Native's layout, so RN Pressable's touch-move check
 * can place the button where it was before the keyboard opened and drop a
 * tap. Gesture Handler hit-tests the native view instead, so the first tap
 * lands.
 *
 * The hit box stays still: only the drawn control (`style` and children)
 * scales on the shared `press` spring; Reduce Motion dims it instead.
 */
export function GesturePressableScale({
  pressedScale,
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: GesturePressableScaleProps) {
  const { animatedStyle, pressIn, pressOut } = usePressScaleFeel(pressedScale)
  const handlePressIn = useCallback((event: PressableEvent): void => {
    pressIn()
    onPressIn?.(event)
  }, [onPressIn, pressIn])
  const handlePressOut = useCallback((event: PressableEvent): void => {
    pressOut()
    onPressOut?.(event)
  }, [onPressOut, pressOut])
  return (
    <Pressable {...rest} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      {({ pressed }) => (
        <Animated.View style={[typeof style === "function" ? style({ pressed }) : style, animatedStyle]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  )
}
