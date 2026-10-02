/**
 * Keyboard glue (react-native-keyboard-controller), iOS only.
 *
 * On iOS the library reports the keyboard frame on the UI thread every frame,
 * including while the reader drags it down (interactive dismiss), so the chat
 * composer can ride the keyboard like iMessage instead of jumping after a
 * KeyboardAvoidingView re-layout.
 *
 * Android keeps today's window-resize behaviour: no provider is mounted, the
 * glued components render plain views, and nothing changes there (the
 * keyboard-open amount follows the keyboard events instead). Enabling
 * the provider on Android stops the window from resizing for the keyboard
 * app-wide, which every other screen still relies on; that needs its own pass
 * on an Android device.
 */
import { forwardRef, useEffect, type ReactNode } from "react"
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type ViewProps
} from "react-native"
import {
  KeyboardAvoidingView,
  KeyboardChatScrollView,
  KeyboardProvider,
  KeyboardStickyView,
  useReanimatedKeyboardAnimation
} from "react-native-keyboard-controller"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { getGluedFooterLift } from "./keyboardGlueModel"

export const KEYBOARD_GLUE_ENABLED = Platform.OS === "ios"

export function AppKeyboardProvider({ children }: { children: ReactNode }) {
  if (!KEYBOARD_GLUE_ENABLED) return <>{children}</>
  return <KeyboardProvider>{children}</KeyboardProvider>
}

export interface GluedKeyboard {
  /** The keyboard's height on screen: negative while open, 0 when closed. */
  height: SharedValue<number>
  /** How far open it is: 0 closed, 1 open. */
  progress: SharedValue<number>
}

function useGluedKeyboardIos(): GluedKeyboard {
  // The library reports the open keyboard as a negative translation.
  const { height, progress } = useReanimatedKeyboardAnimation()
  return { height, progress }
}

function useGluedKeyboardOff(): GluedKeyboard {
  const height = useSharedValue(0)
  const progress = useSharedValue(0)
  return { height, progress }
}

/** The keyboard on the UI thread. Always closed where the glue is off. */
export const useGluedKeyboard = KEYBOARD_GLUE_ENABLED
  ? useGluedKeyboardIos
  : useGluedKeyboardOff

/** How long the keyboard-open amount takes to follow the keyboard on Android. */
const KEYBOARD_FALLBACK_MOTION_MS = 250

function useKeyboardOpenAmountIos(): SharedValue<number> {
  return useReanimatedKeyboardAnimation().progress
}

/**
 * Android keeps the window-resize behaviour (no provider): the keyboard's
 * show and hide events ease a shared value on the UI thread instead, so
 * nothing re-renders per toggle.
 */
function useKeyboardOpenAmountFallback(): SharedValue<number> {
  const amount = useSharedValue(0)
  useEffect(() => {
    const ease = (target: number) => {
      amount.value = withTiming(target, {
        duration: KEYBOARD_FALLBACK_MOTION_MS,
        easing: Easing.out(Easing.cubic)
      })
    }
    const show = Keyboard.addListener("keyboardDidShow", () => ease(1))
    const hide = Keyboard.addListener("keyboardDidHide", () => ease(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [amount])
  return amount
}

/**
 * How far open the keyboard is, 0 closed to 1 open, on the UI thread. iOS
 * follows the keyboard frame by frame (also while it is dragged down);
 * Android eases after the show or hide event.
 */
export const useKeyboardOpenAmount = KEYBOARD_GLUE_ENABLED
  ? useKeyboardOpenAmountIos
  : useKeyboardOpenAmountFallback

/**
 * Keeps its content above the keyboard by bottom padding, driven on the UI
 * thread by react-native-keyboard-controller on iOS. Android resizes the
 * window for the keyboard instead, so it is a plain view there (what React
 * Native's KeyboardAvoidingView did with no behaviour).
 */
export function AppKeyboardAvoidingView({
  keyboardVerticalOffset = 0,
  children,
  ...rest
}: ViewProps & { keyboardVerticalOffset?: number }) {
  if (!KEYBOARD_GLUE_ENABLED) return <View {...rest}>{children}</View>
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset} {...rest}>
      {children}
    </KeyboardAvoidingView>
  )
}

/**
 * A footer that rides the keyboard. `bottomInset` is the safe-area padding the
 * footer already has at the screen's bottom edge: while the keyboard is open
 * that padding sits on the keyboard instead of leaving a gap (CHT-03).
 */
export function KeyboardGluedFooter({
  bottomInset,
  style,
  children,
  ...rest
}: ViewProps & { bottomInset: number }) {
  if (!KEYBOARD_GLUE_ENABLED) {
    return <View style={style} {...rest}>{children}</View>
  }
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: bottomInset }} style={style} {...rest}>
      {children}
    </KeyboardStickyView>
  )
}

/**
 * Content above a glued footer that stays centred in the space the keyboard
 * leaves: it moves up by half the footer's travel (transform only, on the UI
 * thread). Plain view where the glue is off.
 */
export function KeyboardCenteredView({
  bottomInset,
  style,
  children,
  ...rest
}: ViewProps & { bottomInset: number }) {
  if (!KEYBOARD_GLUE_ENABLED) {
    return <View style={style} {...rest}>{children}</View>
  }
  return <KeyboardCenteredViewIos bottomInset={bottomInset} style={style} {...rest}>{children}</KeyboardCenteredViewIos>
}

function KeyboardCenteredViewIos({
  bottomInset,
  style,
  children,
  ...rest
}: ViewProps & { bottomInset: number }) {
  const { height } = useReanimatedKeyboardAnimation()
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, -height.value - bottomInset) / 2 }]
  }))
  return <Animated.View style={[style, lift]} {...rest}>{children}</Animated.View>
}

/**
 * Content that ends where a glued footer starts. The chat list keeps its full
 * layout height while the keyboard is open (its scroll view lifts the newest
 * messages with a content inset), so without a clip a row scrolled toward the
 * keyboard shows through the composer. The clip window rises with the footer
 * while the content stays put: two opposite translations, transform only, on
 * the UI thread. Touches pass through the window itself. Plain view where the
 * glue is off.
 */
export function KeyboardClippedView({
  bottomInset,
  style,
  children,
  ...rest
}: ViewProps & { bottomInset: number }) {
  if (!KEYBOARD_GLUE_ENABLED) {
    return <View style={style} {...rest}>{children}</View>
  }
  return <KeyboardClippedViewIos bottomInset={bottomInset} style={style} {...rest}>{children}</KeyboardClippedViewIos>
}

function KeyboardClippedViewIos({
  bottomInset,
  style,
  children,
  ...rest
}: ViewProps & { bottomInset: number }) {
  const { height, progress } = useReanimatedKeyboardAnimation()
  const clipWindow = useAnimatedStyle(() => ({
    transform: [{ translateY: -getGluedFooterLift(height.value, progress.value, bottomInset) }]
  }))
  const clipContent = useAnimatedStyle(() => ({
    transform: [{ translateY: getGluedFooterLift(height.value, progress.value, bottomInset) }]
  }))
  return (
    <Animated.View pointerEvents="box-none" style={[style, clipStyles.window, clipWindow]} {...rest}>
      <Animated.View pointerEvents="box-none" style={[clipStyles.content, clipContent]}>
        {children}
      </Animated.View>
    </Animated.View>
  )
}

const clipStyles = StyleSheet.create({
  window: { overflow: "hidden" },
  content: { flex: 1 }
})

export type ChatKeyboardScrollViewProps = ScrollViewProps & {
  /** Height between the list's bottom edge and the screen's bottom edge. */
  bottomOffset: number
}

/**
 * Scroll view for an inverted chat list (FlatList `renderScrollComponent`).
 * On iOS it lifts the newest messages with the keyboard on the UI thread
 * through content insets; elsewhere it is a plain ScrollView.
 */
export const ChatKeyboardScrollView = forwardRef<unknown, ChatKeyboardScrollViewProps>(
  function ChatKeyboardScrollView({ bottomOffset, ...props }, ref) {
    if (!KEYBOARD_GLUE_ENABLED) {
      return <ScrollView ref={ref as never} {...props} />
    }
    return (
      <KeyboardChatScrollView
        ref={ref as never}
        inverted
        offset={bottomOffset}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        {...props}
      />
    )
  }
)
