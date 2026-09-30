import { useCallback, useMemo } from "react"
import { Gesture, State } from "react-native-gesture-handler"
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import {
  DISCOVER_SWIPE_RESET_SPRING,
  getDiscoverStampOpacity,
  getDiscoverSwipeOutX,
  getDiscoverSwipeThreshold,
  getDiscoverSwipeTranslateX,
  resolveDiscoverSwipeRelease,
  shouldClaimDiscoverSwipe,
  SWIPE_OUT_DURATION,
  type DiscoverSwipeDirection
} from "../discovery/discoverySwipeModel"
import { useDiscoverSwipeValues, type DiscoverSwipeValues } from "../discovery/useDiscoverSwipeValues"

/**
 * The Discover card's horizontal swipe as a Gesture Handler pan. Every frame
 * of the drag, the snap-back and the exit runs on the UI thread; JS hears
 * once per swipe, when the exit animation finishes (like or pass).
 *
 * Claiming matches the PanResponder it replaces: the pan activates manually
 * once the finger moved more than 4 px and 1.1x more horizontally than
 * vertically, so vertical scrolling and the flip tap keep working. Reduce
 * Motion exits instantly and snaps back without a spring, as before.
 */
export function useDiscoverCardSwipe(input: {
  swipe?: DiscoverSwipeValues
  cardId: string
  disabled: boolean
  canSwipeRight: boolean
  reduceMotion: boolean
  screenWidth: number
  onSwipeRight: (userId: string) => void
  onSwipeLeft: (userId: string) => void
}) {
  const { cardId, disabled, canSwipeRight, reduceMotion, screenWidth, onSwipeRight, onSwipeLeft } = input
  const localSwipe = useDiscoverSwipeValues()
  const { x, ownerId } = input.swipe ?? localSwipe
  const touchStartX = useSharedValue(0)
  const touchStartY = useSharedValue(0)
  const swipeThreshold = getDiscoverSwipeThreshold(screenWidth)

  const commitSwipe = useCallback((direction: DiscoverSwipeDirection): void => {
    if (direction === "right") {
      onSwipeRight(cardId)
    } else {
      onSwipeLeft(cardId)
    }
  }, [cardId, onSwipeLeft, onSwipeRight])

  const forceSwipe = useCallback((direction: DiscoverSwipeDirection): void => {
    "worklet"
    ownerId.value = cardId
    x.value = withTiming(getDiscoverSwipeOutX(direction, screenWidth), {
      duration: reduceMotion ? 0 : SWIPE_OUT_DURATION,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.Never
    }, (finished) => {
      "worklet"
      // An interrupted exit never submits a like or pass.
      if (finished) scheduleOnRN(commitSwipe, direction)
    })
  }, [cardId, commitSwipe, ownerId, reduceMotion, screenWidth, x])

  const resetPosition = useCallback((): void => {
    "worklet"
    x.value = reduceMotion
      ? 0
      : withSpring(0, { ...DISCOVER_SWIPE_RESET_SPRING, reduceMotion: ReduceMotion.Never })
  }, [reduceMotion, x])

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(!disabled)
    .manualActivation(true)
    .onTouchesDown((event) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch) return
      touchStartX.value = touch.absoluteX
      touchStartY.value = touch.absoluteY
    })
    .onTouchesMove((event, stateManager) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch || event.state !== State.BEGAN) return
      if (shouldClaimDiscoverSwipe(touch.absoluteX - touchStartX.value, touch.absoluteY - touchStartY.value)) {
        stateManager.activate()
      }
    })
    .onStart((event) => {
      "worklet"
      cancelAnimation(x)
      ownerId.value = cardId
      x.value = event.translationX
    })
    .onUpdate((event) => {
      "worklet"
      x.value = event.translationX
    })
    .onEnd((event, success) => {
      "worklet"
      // A cancelled pan (the system took the touch) returns the card to rest.
      if (!success) {
        resetPosition()
        return
      }
      const release = resolveDiscoverSwipeRelease({
        dx: event.translationX,
        velocityXPerSecond: event.velocityX,
        threshold: swipeThreshold,
        canSwipeRight
      })
      if (release === "reset") {
        resetPosition()
      } else {
        forceSwipe(release)
      }
    }), [
    canSwipeRight,
    cardId,
    disabled,
    forceSwipe,
    ownerId,
    resetPosition,
    swipeThreshold,
    touchStartX,
    touchStartY,
    x
  ])

  const cardSwipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value) }]
  }))
  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: getDiscoverStampOpacity(getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value), swipeThreshold).like
  }))
  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: getDiscoverStampOpacity(getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value), swipeThreshold).nope
  }))

  return { gesture, cardSwipeStyle, likeStampStyle, nopeStampStyle }
}
