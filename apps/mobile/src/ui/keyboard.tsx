/**
 * Keyboard glue (react-native-keyboard-controller), iOS only.
 *
 * On iOS the library reports the keyboard frame on the UI thread every frame,
 * including while the reader drags it down (interactive dismiss), so the chat
 * composer can ride the keyboard like iMessage instead of jumping after a
 * KeyboardAvoidingView re-layout.
 *
 * Android keeps today's window-resize behaviour: no provider is mounted, the
 * glued components render plain views, and nothing changes there. Enabling
 * the provider on Android stops the window from resizing for the keyboard
 * app-wide, which every other screen still relies on; that needs its own pass
 * on an Android device.
 */
import { forwardRef, type ReactNode } from "react"
import { Platform, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from "react-native"
import {
  KeyboardChatScrollView,
  KeyboardProvider,
  KeyboardStickyView,
  useReanimatedKeyboardAnimation
} from "react-native-keyboard-controller"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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
