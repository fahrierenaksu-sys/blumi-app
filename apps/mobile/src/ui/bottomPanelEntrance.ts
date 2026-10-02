import { useLayoutEffect, useRef } from "react"
import { Easing, useAnimatedStyle, useSharedValue } from "react-native-reanimated"
import { animateSegment } from "./motion"

/**
 * The soft entrance shared by the bottom panels of the room editor (its
 * inventory dock) and the avatar wardrobe: the panel rises a short way from
 * below while it fades in, on the UI thread with no React render per frame.
 *
 * It waits until the screen is on its way in. A route is mounted a few frames
 * before the native fade starts, so a mount-time entering animation was
 * mostly spent while the screen itself was still invisible. The rise starts
 * on the route's opening `transitionStart` (when the fade begins), or after
 * a short fallback when no transition is reported (an initial route, a
 * restored state). It plays once per mount: coming back to the screen from a
 * pushed route does not replay it.
 *
 * Under Reduce Motion the panel is simply there: no rise and no fade.
 */
export const BOTTOM_PANEL_ENTRANCE_DISTANCE = 28
export const BOTTOM_PANEL_ENTRANCE_MS = 380
/** Starts the rise anyway when the route reports no opening transition. */
export const BOTTOM_PANEL_ENTRANCE_FALLBACK_MS = 360

const ENTRANCE_SEGMENT = { durationMs: BOTTOM_PANEL_ENTRANCE_MS, easing: Easing.out(Easing.cubic) }

/** The slice of a native-stack navigation object the entrance listens to. */
export interface BottomPanelEntranceNavigation {
  addListener: (
    type: "transitionStart",
    callback: (event: { data?: { closing?: boolean } }) => void
  ) => () => void
}

/**
 * Calls `start` once, when the route's opening transition begins or when the
 * fallback runs out first. Returns the cleanup.
 */
export function subscribeBottomPanelEntranceStart(
  navigation: BottomPanelEntranceNavigation,
  start: () => void,
  fallbackMs: number = BOTTOM_PANEL_ENTRANCE_FALLBACK_MS
): () => void {
  let done = false
  const fire = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    unsubscribe()
    start()
  }
  const timer = setTimeout(fire, fallbackMs)
  const unsubscribe = navigation.addListener("transitionStart", (event) => {
    if (event.data?.closing !== true) fire()
  })
  return () => {
    done = true
    clearTimeout(timer)
    unsubscribe()
  }
}

/** Animated style for the panel's wrapping `Animated.View`. */
export function useBottomPanelEntrance(
  navigation: BottomPanelEntranceNavigation,
  reduceMotion: boolean
) {
  const progress = useSharedValue(reduceMotion ? 1 : 0)
  const startedRef = useRef(reduceMotion)

  useLayoutEffect(() => {
    if (reduceMotion) {
      startedRef.current = true
      progress.value = 1
      return undefined
    }
    if (startedRef.current) return undefined
    return subscribeBottomPanelEntranceStart(navigation, () => {
      startedRef.current = true
      progress.value = animateSegment(1, ENTRANCE_SEGMENT)
    })
  }, [navigation, progress, reduceMotion])

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * BOTTOM_PANEL_ENTRANCE_DISTANCE }]
  }))
}
