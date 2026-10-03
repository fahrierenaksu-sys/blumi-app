import { createContext, useCallback, useContext, useEffect, useMemo, type MutableRefObject, type ReactElement } from "react"
import { View, type GestureResponderEvent } from "react-native"
import { Gesture, GestureDetector, State, type GestureType } from "react-native-gesture-handler"
import { useSharedValue, type SharedValue } from "react-native-reanimated"
import { MAIN_TAB_PAGER_EDGE_HANDOFF, resolveHorizontalScrollerDragOwner } from "./mainTabPagerEdgeHandoffModel"

/**
 * Gesture ownership inside the main-page pager, expressed with one Gesture
 * Handler relation: a component that owns horizontal movement makes its
 * gesture `blocksExternalGesture(pager)`, so the pager waits for it to fail
 * and never activates while that component handles the touch.
 *
 * Owners:
 * - Discover card swipe: the card's pan blocks the pager
 *   (`useMainTabPagerGestureRef` in useDiscoverCardSwipe), so a drag that
 *   starts on the card is a like/pass swipe and a drag elsewhere on Discover
 *   moves the page.
 * - Horizontal scrollers on a page: `MainTabPagerHorizontalScrollOwner`.
 * - Paged scrollers that hand a drag past their first or last page to the
 *   pager: `MainTabPagerEdgeHandoffScrollOwner` (the Shop product shelf).
 *
 * Owners that do not need a relation, and why:
 * - Room object drag: only on the My Room editor and room setup routes,
 *   which are separate stack routes above the pager.
 * - iOS edge back: only on detail routes pushed above the pager; the pager's
 *   own slot route has `gestureEnabled: false`.
 */
const MainTabPagerGestureContext = createContext<MutableRefObject<GestureType | undefined> | null>(null)
const ScrollTapBlockedContext = createContext<SharedValue<boolean> | null>(null)

export const MainTabPagerGestureProvider = MainTabPagerGestureContext.Provider

/**
 * The pager's gesture ref for a gesture on a pager page that must own its
 * touch (`gesture.blocksExternalGesture(ref)`), or null outside the pager.
 */
export function useMainTabPagerGestureRef(): MutableRefObject<GestureType | undefined> | null {
  return useContext(MainTabPagerGestureContext)
}

/** Reject a scroll's trailing press, while keeping accessibility clicks. */
export function useScrollSafePress(onPress: (event: GestureResponderEvent) => void) {
  const tapBlocked = useContext(ScrollTapBlockedContext)
  return useCallback((event: GestureResponderEvent) => {
    // Accessibility activates Pressable without a touch sequence. The block
    // belongs only to the physical touch and persists until the next down.
    if (event.nativeEvent.changedTouches?.length && tapBlocked?.value) return
    onPress(event)
  }, [onPress, tapBlocked])
}

/**
 * Wrap a horizontal native scroller (ScrollView, FlatList) rendered on a
 * pager page. A drag that starts on it scrolls it and never moves the page.
 * Pass `enabled={false}` while the scroller has nothing to scroll (a single
 * page), so a drag there moves the page instead of being swallowed; also
 * turn the scroller's own `scrollEnabled` off then. Outside the pager
 * (rollback flag off, or another route) the child is rendered unchanged.
 */
export function MainTabPagerHorizontalScrollOwner({
  children,
  enabled = true
}: {
  children: ReactElement
  enabled?: boolean
}) {
  const pagerGestureRef = useMainTabPagerGestureRef()
  const nativeScrollGesture = useMemo(
    () => pagerGestureRef ? Gesture.Native().blocksExternalGesture(pagerGestureRef) : null,
    [pagerGestureRef]
  )
  if (!nativeScrollGesture || !enabled) return children
  return <GestureDetector gesture={nativeScrollGesture}>{children}</GestureDetector>
}

/**
 * Wrap a paged horizontal native scroller (FlatList with `pagingEnabled`) on
 * a pager page whose drags must reach the pager at its ends. A mostly
 * horizontal drag that starts on it stays with the scroller while the
 * scroller can still move that way; at the first page a drag towards a
 * previous page, and at the last page a drag towards a next page, moves the
 * main page instead. Decided on the UI thread from the scroller's live
 * content offset (`scrollOffset`, written by an animated scroll handler).
 *
 * Relations: a manual-activation pan decides and blocks the pager until it
 * fails; the native scroll waits for the pager to fail, so the two never move
 * together. `enabled={false}` (a single page) disables native scrolling and
 * releases every drag to the pager. The pan still rejects a trailing card
 * press once the finger moves past the slop, even if it stays in the card.
 * The wrapper stays mounted so the
 * scroller is never remounted (a remount would reset its offset without a
 * scroll event and leave `scrollOffset` stale). Outside the pager the child
 * is rendered unchanged.
 */
export function MainTabPagerEdgeHandoffScrollOwner({
  children,
  scrollOffset,
  maxScrollOffset,
  enabled = true
}: {
  children: ReactElement
  scrollOffset: SharedValue<number>
  maxScrollOffset: number
  enabled?: boolean
}) {
  const pagerGestureRef = useMainTabPagerGestureRef()
  const maxOffset = useSharedValue(maxScrollOffset)
  useEffect(() => {
    maxOffset.value = maxScrollOffset
  }, [maxOffset, maxScrollOffset])
  const touchStartX = useSharedValue(0)
  const touchStartY = useSharedValue(0)
  const tapBlocked = useSharedValue(false)
  const gestures = useMemo(() => {
    if (!pagerGestureRef) return null
    const native = Gesture.Native().enabled(enabled).requireExternalGestureToFail(pagerGestureRef)
    const handoff = Gesture.Pan()
      .manualActivation(true)
      // This pan assigns ownership; the native shelf still needs its touch.
      // Card activation is rejected separately by the shared tap guard.
      .cancelsTouchesInView(false)
      .blocksExternalGesture(pagerGestureRef)
      .simultaneousWithExternalGesture(native)
      .onTouchesDown((event, stateManager) => {
        "worklet"
        if (event.numberOfTouches > 1) {
          tapBlocked.value = true
          stateManager.fail()
          return
        }
        const touch = event.allTouches[0]
        if (!touch) return
        tapBlocked.value = false
        touchStartX.value = touch.absoluteX
        touchStartY.value = touch.absoluteY
      })
      .onTouchesMove((event, stateManager) => {
        "worklet"
        const touch = event.allTouches[0]
        if (!touch || event.state !== State.BEGAN) return
        const owner = resolveHorizontalScrollerDragOwner({
          dx: touch.absoluteX - touchStartX.value,
          dy: touch.absoluteY - touchStartY.value,
          scrollOffset: scrollOffset.value,
          maxScrollOffset: maxOffset.value
        })
        if (owner === "wait") return
        tapBlocked.value = true
        if (enabled && owner === "scroller") stateManager.activate()
        else stateManager.fail()
      })
      .onTouchesUp((event) => {
        "worklet"
        // Also catch a fast move delivered only in the final touch event.
        const touch = event.changedTouches[0]
        if (touch && (Math.abs(touch.absoluteX - touchStartX.value) >= MAIN_TAB_PAGER_EDGE_HANDOFF.slop
          || Math.abs(touch.absoluteY - touchStartY.value) >= MAIN_TAB_PAGER_EDGE_HANDOFF.slop)) {
          tapBlocked.value = true
        }
      })
      .onTouchesCancelled(() => {
        "worklet"
        tapBlocked.value = true
      })
    return { native, handoff }
  }, [enabled, maxOffset, pagerGestureRef, scrollOffset, tapBlocked, touchStartX, touchStartY])
  if (!gestures) return children
  return (
    <ScrollTapBlockedContext.Provider value={tapBlocked}>
      <GestureDetector gesture={gestures.handoff}>
        <View collapsable={false}>
          <GestureDetector gesture={gestures.native}>{children}</GestureDetector>
        </View>
      </GestureDetector>
    </ScrollTapBlockedContext.Provider>
  )
}
