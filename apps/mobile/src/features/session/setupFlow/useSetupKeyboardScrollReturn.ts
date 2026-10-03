import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue
} from "react-native-reanimated"
import {
  settleSetupKeyboardScrollAfterDrag,
  stepSetupKeyboardScrollReturn
} from "./setupFlowShellModel"

/**
 * Brings a keyboard page's scroll view back to its resting top while the
 * keyboard closes, in step with the keyboard, on the UI thread (no React
 * render). Attach `scrollRef` and `onScroll` to one Animated.ScrollView.
 * `keyboardAmount` is the keyboard's open amount, 0 closed to 1 open.
 */
export function useSetupKeyboardScrollReturn(keyboardAmount: SharedValue<number>) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const offset = useSharedValue(0)
  const dragging = useSharedValue(false)
  const closedDuringDrag = useSharedValue(false)
  const closeFromOffset = useSharedValue(0)
  const closeFromAmount = useSharedValue(0)

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.y
    },
    onBeginDrag: () => {
      dragging.value = true
      closedDuringDrag.value = false
    },
    onEndDrag: (event) => {
      dragging.value = false
      // Whatever is left of a close starts over from the release offset.
      closeFromAmount.value = 0
      const target = settleSetupKeyboardScrollAfterDrag(
        closedDuringDrag.value,
        keyboardAmount.value,
        event.contentOffset.y
      )
      closedDuringDrag.value = false
      if (target !== null) scrollTo(scrollRef, 0, target, true)
    }
  })

  useAnimatedReaction(
    () => keyboardAmount.value,
    (amount, previous) => {
      if (previous === null || amount === previous) return
      const step = stepSetupKeyboardScrollReturn(
        { fromOffset: closeFromOffset.value, fromAmount: closeFromAmount.value },
        amount,
        previous,
        offset.value
      )
      closeFromOffset.value = step.from.fromOffset
      closeFromAmount.value = step.from.fromAmount
      if (step.scrollTo === null) return
      // The finger owns the scroll during an interactive dismiss.
      if (dragging.value) {
        closedDuringDrag.value = true
        return
      }
      scrollTo(scrollRef, 0, step.scrollTo, false)
    }
  )

  return { scrollRef, onScroll }
}
