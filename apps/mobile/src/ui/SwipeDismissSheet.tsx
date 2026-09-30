import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode
} from "react"
import { Pressable, StyleSheet } from "react-native"
import type { LayoutChangeEvent, ScrollViewProps, StyleProp, ViewStyle } from "react-native"
import { Gesture, GestureDetector, State, type GestureType } from "react-native-gesture-handler"
import Reanimated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { useReducedMotion } from "./animations"
import {
  SHEET_DISMISS,
  SHEET_RETURN_SPRING,
  getSheetBackdropOpacity,
  getSheetExitOffset,
  resolveSheetDismissClaim,
  resolveSheetDismissRelease,
  resolveSheetDragOffset
} from "./sheetDismissModel"

interface SheetScrollOwnership {
  /** Vertical content offset of the sheet's scroll view (0 at the top). */
  scrollOffset: SharedValue<number>
  panRef: MutableRefObject<GestureType | undefined>
}

const SheetScrollContext = createContext<SheetScrollOwnership | null>(null)

/** The dimming layer behind the sheet, drawn and faded by the sheet itself. */
export interface SwipeDismissSheetBackdrop {
  /** Tint of the full-screen layer behind the sheet. */
  style?: StyleProp<ViewStyle>
  /** A tap on the backdrop closes the sheet (same callback as its close button). */
  onPress?: () => void
  accessibilityLabel?: string
}

export interface SwipeDismissSheetProps {
  /** Closes the sheet; the same callback as its close button. */
  onDismiss: () => void
  /** False while the sheet must stay open (for example, while submitting). */
  enabled?: boolean
  /**
   * Keep the modal's tint here rather than on the modal container: it fades
   * in proportion to the drag and is gone once a swipe has moved the sheet
   * out, so the Modal's close animation that follows carries nothing visible.
   */
  backdrop?: SwipeDismissSheetBackdrop
  style?: StyleProp<ViewStyle>
  accessibilityViewIsModal?: boolean
  testID?: string
  children: ReactNode
}

/**
 * The one swipe-down-to-dismiss surface for bottom sheets. A mostly vertical
 * downward drag that starts on the sheet moves it with the finger on the UI
 * thread; a release past the dismiss distance (or a downward flick) slides
 * it out and calls `onDismiss`, otherwise it springs back. Content scrolled
 * below its top keeps the touch (use `SwipeDismissSheetScrollView` for the
 * sheet's scroll view). Reduce Motion: the sheet still follows the finger
 * (direct manipulation), but closes and returns without animation. VoiceOver:
 * the escape gesture closes the sheet; keep the visible close button.
 *
 * Inside a React Native `Modal`, wrap the modal content in
 * `GestureHandlerRootView` so the gesture works on Android.
 */
export function SwipeDismissSheet({
  onDismiss,
  enabled = true,
  backdrop,
  style,
  accessibilityViewIsModal,
  testID,
  children
}: SwipeDismissSheetProps) {
  const reduceMotion = useReducedMotion()
  const onDismissRef = useRef(onDismiss)
  useLayoutEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])
  const dismiss = useCallback(() => onDismissRef.current(), [])

  const offset = useSharedValue(0)
  const sheetHeight = useSharedValue(0)
  const scrollOffset = useSharedValue(0)
  const touchStartX = useSharedValue(0)
  const touchStartY = useSharedValue(0)
  const startedAtTop = useSharedValue(true)
  const startTranslation = useSharedValue(0)
  const reduceMotionValue = useSharedValue(reduceMotion)
  useLayoutEffect(() => {
    reduceMotionValue.value = reduceMotion
  }, [reduceMotion, reduceMotionValue])

  const panRef = useRef<GestureType | undefined>(undefined)
  const ownership = useMemo<SheetScrollOwnership>(() => ({ scrollOffset, panRef }), [scrollOffset])

  const gesture = useMemo(() => Gesture.Pan()
    .withRef(panRef)
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((event) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch) return
      touchStartX.value = touch.absoluteX
      touchStartY.value = touch.absoluteY
      startedAtTop.value = scrollOffset.value <= 0.5
    })
    .onTouchesMove((event, stateManager) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch || event.state !== State.BEGAN) return
      const claim = resolveSheetDismissClaim({
        dx: touch.absoluteX - touchStartX.value,
        dy: touch.absoluteY - touchStartY.value,
        atTop: startedAtTop.value
      })
      if (claim === "activate") stateManager.activate()
      else if (claim === "fail") stateManager.fail()
    })
    .onStart((event) => {
      "worklet"
      // A touch on a sheet that is still springing back catches it in place.
      cancelAnimation(offset)
      startTranslation.value = event.translationY - offset.value
    })
    .onUpdate((event) => {
      "worklet"
      offset.value = resolveSheetDragOffset(event.translationY - startTranslation.value)
    })
    .onEnd((event, success) => {
      "worklet"
      const release = success
        ? resolveSheetDismissRelease({ offset: offset.value, velocityY: event.velocityY, sheetHeight: sheetHeight.value })
        : "return"
      if (release === "dismiss") {
        // Reduce Motion: sheet and backdrop leave at once, before the Modal closes.
        if (reduceMotionValue.value) {
          offset.value = getSheetExitOffset(sheetHeight.value)
          scheduleOnRN(dismiss)
          return
        }
        offset.value = withTiming(
          getSheetExitOffset(sheetHeight.value),
          { duration: SHEET_DISMISS.exitDurationMs, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never },
          (finished) => {
            "worklet"
            if (finished) scheduleOnRN(dismiss)
          }
        )
        return
      }
      offset.value = reduceMotionValue.value
        ? 0
        : withSpring(0, {
          stiffness: SHEET_RETURN_SPRING.stiffness,
          damping: SHEET_RETURN_SPRING.damping,
          mass: SHEET_RETURN_SPRING.mass,
          velocity: event.velocityY,
          reduceMotion: ReduceMotion.Never
        })
    }), [
    dismiss,
    enabled,
    offset,
    reduceMotionValue,
    scrollOffset,
    sheetHeight,
    startTranslation,
    startedAtTop,
    touchStartX,
    touchStartY
  ])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }]
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: getSheetBackdropOpacity(offset.value, sheetHeight.value)
  }))
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    sheetHeight.value = event.nativeEvent.layout.height
  }, [sheetHeight])
  const backdropPress = backdrop?.onPress

  return (
    <SheetScrollContext.Provider value={ownership}>
      {backdrop ? (
        <Reanimated.View
          pointerEvents={backdropPress ? "auto" : "none"}
          style={[StyleSheet.absoluteFill, backdrop.style, backdropStyle]}
        >
          {backdropPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backdrop.accessibilityLabel}
              style={StyleSheet.absoluteFill}
              onPress={backdropPress}
            />
          ) : null}
        </Reanimated.View>
      ) : null}
      <GestureDetector gesture={gesture}>
        <Reanimated.View
          accessibilityViewIsModal={accessibilityViewIsModal}
          onAccessibilityEscape={enabled ? dismiss : undefined}
          onLayout={handleLayout}
          style={[style, sheetStyle]}
          testID={testID}
        >
          {children}
        </Reanimated.View>
      </GestureDetector>
    </SheetScrollContext.Provider>
  )
}

/**
 * A vertical scroll view inside `SwipeDismissSheet`. It scrolls as usual; a
 * downward drag that starts while it is at the top moves the sheet instead
 * (it does not bounce, so the two never move together). Outside a sheet it
 * behaves as a plain non-bouncing scroll view.
 */
export function SwipeDismissSheetScrollView(props: ScrollViewProps & { children?: ReactNode }) {
  const ownership = useContext(SheetScrollContext)
  const localOffset = useSharedValue(0)
  const scrollOffset = ownership?.scrollOffset ?? localOffset
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = event.contentOffset.y
    }
  })
  const panRef = ownership?.panRef
  const nativeGesture = useMemo(
    () => panRef ? Gesture.Native().simultaneousWithExternalGesture(panRef) : Gesture.Native(),
    [panRef]
  )
  return (
    <GestureDetector gesture={nativeGesture}>
      <Reanimated.ScrollView
        {...props}
        bounces={false}
        overScrollMode="never"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
    </GestureDetector>
  )
}
