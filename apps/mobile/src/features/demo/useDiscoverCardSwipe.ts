import { useCallback, useEffect, useMemo } from "react"
import type { LayoutChangeEvent } from "react-native"
import { Gesture, State } from "react-native-gesture-handler"
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"
import { hapticLight, hapticSelection } from "../../ui/haptics"
import { useMainTabPagerGestureRef } from "../../ui/MainTabPagerGestureOwnership"
import { MOTION_SPRINGS } from "../../ui/motion"
import {
  DISCOVER_SWIPE_RESET_SPRING,
  getDiscoverStampOpacity,
  getDiscoverSwipeOutDuration,
  getDiscoverSwipeOutX,
  getDiscoverSwipeRotation,
  getDiscoverSwipeThreshold,
  getDiscoverSwipeThresholdSide,
  getDiscoverSwipeTranslateX,
  getDiscoverThrowArcY,
  isDiscoverSwipeLowerHalfGrab,
  resolveDiscoverSwipeRelease,
  shouldClaimDiscoverSwipe,
  shouldTickDiscoverSwipeThreshold,
  type DiscoverSwipeDirection,
  type DiscoverSwipeThresholdSide
} from "../discovery/discoverySwipeModel"
import { useDiscoverSwipeValues, type DiscoverSwipeValues } from "../discovery/useDiscoverSwipeValues"

/** The LIKE/PASS stamp starts this large when the drag enters its side. */
const STAMP_POP_SCALE = 1.08
const STAMP_POP_START = { duration: 0, reduceMotion: ReduceMotion.Never } as const
const STAMP_POP_SETTLE = { ...MOTION_SPRINGS.snappy, reduceMotion: ReduceMotion.Never } as const

/**
 * The Discover card's horizontal swipe as a Gesture Handler pan. Every frame
 * of the drag, the snap-back and the exit runs on the UI thread; JS hears
 * once per swipe, when the exit animation finishes (like or pass).
 *
 * Claiming matches the PanResponder it replaces: the pan activates manually
 * once the finger moved more than 4 px and 1.1x more horizontally than
 * vertically, so vertical scrolling and the flip tap keep working. Reduce
 * Motion exits instantly and snaps back without a spring, as before.
 *
 * On the main-page pager the card owns every drag that starts on it: the
 * pan blocks the pager, which moves the page only for drags that start
 * elsewhere on Discover.
 *
 * Crossing the commit threshold ticks once (selection haptic) and pops the
 * stamp; the side is tracked in a shared value, so JS hears only when it
 * changes. A release past the threshold plays the commit haptic and commits
 * the like or pass at once (DSC-10): the card then leaves on its own exit
 * value, so the deck advances and the next card can be grabbed while this
 * one is still flying out. The deck keeps it mounted (`leaving`) until
 * `onExitEnd`. A button exit arrives as `exitRequest` and leaves the same way.
 *
 * The owning card leans with its drag (the other way when held by its lower
 * half, fixed when the pan activates) and leaves at its release speed. Reduce
 * Motion keeps it upright, skips the stamp pop and exits instantly.
 */
export interface DiscoverCardExitRequest {
  direction: DiscoverSwipeDirection
  durationMs: number
  /** A Like/Pass press: the card is thrown on an arc (see getDiscoverThrowArcY). */
  thrown?: boolean
}

export function useDiscoverCardSwipe(input: {
  swipe?: DiscoverSwipeValues
  cardId: string
  disabled: boolean
  canSwipeRight: boolean
  reduceMotion: boolean
  screenWidth: number
  onSwipeRight: (userId: string) => void
  onSwipeLeft: (userId: string) => void
  /** The deck keeps this card mounted while it flies out. */
  leaving?: boolean
  exitRequest?: DiscoverCardExitRequest | null
  onExitEnd?: (userId: string) => void
}) {
  const { cardId, disabled, canSwipeRight, reduceMotion, screenWidth, onSwipeRight, onSwipeLeft } = input
  const { leaving = false, exitRequest = null, onExitEnd } = input
  const localSwipe = useDiscoverSwipeValues()
  const { x, ownerId } = input.swipe ?? localSwipe
  const touchStartX = useSharedValue(0)
  const touchStartY = useSharedValue(0)
  const touchStartLocalY = useSharedValue(0)
  const cardHeight = useSharedValue(0)
  const grabbedLowerHalf = useSharedValue(false)
  const stampScale = useSharedValue(1)
  const thresholdSide = useSharedValue<DiscoverSwipeThresholdSide>(0)
  // The leaving card's own position, so the shared drag is free at release.
  const exitX = useSharedValue(0)
  const exiting = useSharedValue(false)
  const exitThrown = useSharedValue(false)
  const pagerGestureRef = useMainTabPagerGestureRef()
  const swipeThreshold = getDiscoverSwipeThreshold(screenWidth)

  const commitSwipe = useCallback((direction: DiscoverSwipeDirection): void => {
    if (direction === "right") {
      onSwipeRight(cardId)
    } else {
      onSwipeLeft(cardId)
    }
  }, [cardId, onSwipeLeft, onSwipeRight])

  const finishExit = useCallback((): void => {
    onExitEnd?.(cardId)
  }, [cardId, onExitEnd])

  const forceSwipe = useCallback((direction: DiscoverSwipeDirection, durationMs: number, thrown: boolean): void => {
    "worklet"
    // Leaves from where it is on its own value; the shared drag keeps its
    // release value until the deck hands it to the next card.
    exitX.value = getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value)
    exitThrown.value = thrown
    exiting.value = true
    exitX.value = withTiming(getDiscoverSwipeOutX(direction, screenWidth), {
      duration: durationMs,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.Never
    }, (finished) => {
      "worklet"
      if (finished) scheduleOnRN(finishExit)
    })
  }, [cardId, exitThrown, exitX, exiting, finishExit, ownerId, screenWidth, x])

  // A button exit (Like/Pass): the deck already committed the decision.
  useEffect(() => {
    if (exitRequest) forceSwipe(exitRequest.direction, exitRequest.durationMs, exitRequest.thrown === true)
  }, [exitRequest, forceSwipe])

  // A card that comes back (a refused decision) follows the shared drag again.
  useEffect(() => {
    if (!leaving) exiting.value = false
  }, [exiting, leaving])

  const resetPosition = useCallback((): void => {
    "worklet"
    x.value = reduceMotion
      ? 0
      : withSpring(0, { ...DISCOVER_SWIPE_RESET_SPRING, reduceMotion: ReduceMotion.Never }, (finished) => {
        "worklet"
        // At rest the card forgets its grab, so an action-button exit leans
        // like a card held from above.
        if (finished) grabbedLowerHalf.value = false
      })
  }, [grabbedLowerHalf, reduceMotion, x])

  const popStamp = useCallback((): void => {
    "worklet"
    if (reduceMotion) return
    stampScale.value = withSequence(withTiming(STAMP_POP_SCALE, STAMP_POP_START), withSpring(1, STAMP_POP_SETTLE))
  }, [reduceMotion, stampScale])

  const onCardLayout = useCallback((event: LayoutChangeEvent): void => {
    cardHeight.value = event.nativeEvent.layout.height
  }, [cardHeight])

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(!disabled)
    .manualActivation(true)
    .blocksExternalGesture(...(pagerGestureRef ? [pagerGestureRef] : []))
    .onTouchesDown((event) => {
      "worklet"
      const touch = event.allTouches[0]
      if (!touch) return
      touchStartX.value = touch.absoluteX
      touchStartY.value = touch.absoluteY
      touchStartLocalY.value = touch.y
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
      grabbedLowerHalf.value = isDiscoverSwipeLowerHalfGrab(touchStartLocalY.value, cardHeight.value)
      x.value = event.translationX
      thresholdSide.value = 0
    })
    .onUpdate((event) => {
      "worklet"
      x.value = event.translationX
      const previousSide = thresholdSide.value
      const nextSide = getDiscoverSwipeThresholdSide(
        previousSide,
        event.translationX,
        swipeThreshold,
        canSwipeRight
      )
      if (nextSide === previousSide) return
      thresholdSide.value = nextSide
      if (!shouldTickDiscoverSwipeThreshold(previousSide, nextSide)) return
      scheduleOnRN(hapticSelection)
      popStamp()
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
        return
      }
      const remaining = getDiscoverSwipeOutX(release, screenWidth) - x.value
      const velocityTowardExit = release === "right" ? event.velocityX : -event.velocityX
      // The commit haptic and the decision belong to the release, not to the
      // end of the exit animation (DSC-10).
      scheduleOnRN(hapticLight)
      forceSwipe(release, reduceMotion ? 0 : getDiscoverSwipeOutDuration(remaining, velocityTowardExit), false)
      scheduleOnRN(commitSwipe, release)
    }), [
    canSwipeRight,
    cardHeight,
    cardId,
    commitSwipe,
    disabled,
    forceSwipe,
    grabbedLowerHalf,
    ownerId,
    pagerGestureRef,
    popStamp,
    reduceMotion,
    resetPosition,
    screenWidth,
    swipeThreshold,
    thresholdSide,
    touchStartLocalY,
    touchStartX,
    touchStartY,
    x
  ])

  const cardSwipeStyle = useAnimatedStyle(() => {
    const translateX = exiting.value ? exitX.value : getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value)
    const translateY = exiting.value && exitThrown.value && !reduceMotion ? getDiscoverThrowArcY(translateX, screenWidth) : 0
    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: `${reduceMotion ? 0 : getDiscoverSwipeRotation(translateX, screenWidth, grabbedLowerHalf.value)}deg` }
      ]
    }
  })
  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: getDiscoverStampOpacity(exiting.value ? exitX.value : getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value), swipeThreshold).like,
    transform: [{ scale: stampScale.value }]
  }))
  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: getDiscoverStampOpacity(exiting.value ? exitX.value : getDiscoverSwipeTranslateX(ownerId.value, cardId, x.value), swipeThreshold).nope,
    transform: [{ scale: stampScale.value }]
  }))

  return { gesture, cardSwipeStyle, likeStampStyle, nopeStampStyle, onCardLayout }
}
