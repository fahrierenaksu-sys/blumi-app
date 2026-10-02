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
import { Platform, ScrollView, View, type ScrollViewProps, type ViewProps } from "react-native"
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

export const KEYBOARD_GLUE_ENABLED = Platform.OS === "ios"

export function AppKeyboardProvider({ children }: { children: ReactNode }) {
  if (!KEYBOARD_GLUE_ENABLED) return <>{children}</>
  return <KeyboardProvider>{children}</KeyboardProvider>
}

function useGluedKeyboardHeightIos(): SharedValue<number> {
  // The library reports the open keyboard as a negative translation.
  return useReanimatedKeyboardAnimation().height
}

function useGluedKeyboardHeightOff(): SharedValue<number> {
  return useSharedValue(0)
}

/**
 * The keyboard's current height (negative while open, 0 when closed) on the
 * UI thread. Always 0 where the glue is off.
 */
export const useGluedKeyboardHeight = KEYBOARD_GLUE_ENABLED
  ? useGluedKeyboardHeightIos
  : useGluedKeyboardHeightOff

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
