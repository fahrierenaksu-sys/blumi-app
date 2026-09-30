import { createContext, useContext, useMemo, type MutableRefObject, type ReactElement } from "react"
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler"

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
 *
 * Owners that do not need a relation, and why:
 * - Room object drag: only on the My Room editor and room setup routes,
 *   which are separate stack routes above the pager.
 * - iOS edge back: only on detail routes pushed above the pager; the pager's
 *   own slot route has `gestureEnabled: false`.
 */
const MainTabPagerGestureContext = createContext<MutableRefObject<GestureType | undefined> | null>(null)

export const MainTabPagerGestureProvider = MainTabPagerGestureContext.Provider

/**
 * The pager's gesture ref for a gesture on a pager page that must own its
 * touch (`gesture.blocksExternalGesture(ref)`), or null outside the pager.
 */
export function useMainTabPagerGestureRef(): MutableRefObject<GestureType | undefined> | null {
  return useContext(MainTabPagerGestureContext)
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
