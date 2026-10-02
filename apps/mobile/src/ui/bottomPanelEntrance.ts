import { useLayoutEffect, useRef } from "react"
import {
  Easing,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue
} from "react-native-reanimated"
import { animateSegment } from "./motion"

/**
 * The soft entrance shared by the bottom panels of the room editor (its
 * inventory dock) and the avatar wardrobe: the panel rises a short way from
 * below while it fades in, on the UI thread with no React render per frame.
 *
 * It waits until the screen is on its way in. A route is mounted a few frames
 * before its native transition (the push from the right) starts, so a
 * mount-time entering animation was mostly spent while the screen itself was
 * still off screen. The rise starts on the route's opening
 * `transitionStart` (when the push begins), or after
 * a short fallback when no transition is reported (an initial route, a
 * restored state). It plays once per mount: coming back to the screen from a
 * pushed route does not replay it.
 *
 * The panel also glides, instead of snapping, when its height changes. Both
 * panels measure their product row after the first layout, so they grow
 * while they rise; the glide keeps that growth inside the same soft rise. The
 * region above the panel (the editor's room, the wardrobe's avatar) takes the
 * same glide so the two move together. Screens get all of it from one call,
 * `useBottomPanelEntranceProps`, so the two panels cannot drift apart.
 *
 * Under Reduce Motion the panel is simply there: no rise, no fade, no glide.
 */
export const BOTTOM_PANEL_ENTRANCE_DISTANCE = 28
export const BOTTOM_PANEL_ENTRANCE_MS = 380
/** Starts the rise anyway when the route reports no opening transition. */
export const BOTTOM_PANEL_ENTRANCE_FALLBACK_MS = 360

/**
 * The layout glide of the panel and of the region above it. It is handed out
 * only when Reduce Motion allows motion, so Reanimated's own check is off.
 */
export const BOTTOM_PANEL_LAYOUT_TRANSITION = LinearTransition
  .duration(240)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.Never)

const ENTRANCE_SEGMENT = {durationMs: BOTTOM_PANEL_ENTRANCE_MS, easing: Easing.out(Easing.cubic) }

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

/**
 * Everything a bottom panel's wrapping `Animated.View` needs, in one call:
 * spread it onto the view (`<Animated.View {...entrance}>`). The room editor
 * dock and the avatar wardrobe panel both use it. `layout` is also the glide
 * for the region above the panel; it is undefined under Reduce Motion.
 */
export function useBottomPanelEntranceProps(
  navigation: BottomPanelEntranceNavigation,
  reduceMotion: boolean
) {
  const style = useBottomPanelEntrance(navigation, reduceMotion)
  return {
    style,
    layout: reduceMotion ? undefined : BOTTOM_PANEL_LAYOUT_TRANSITION
  }
}
