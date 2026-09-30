import { createContext, useContext, useMemo, type MutableRefObject, type ReactElement } from "react"
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler"

/**
 * Gesture ownership inside the main-page pager, expressed with one Gesture
 * Handler relation: a component that owns horizontal movement makes its
 * gesture `blocksExternalGesture(pager)`, so the pager waits for it to fail
 * and never activates while that component handles the touch.
 *
 * Owners that do not need a relation, and why:
 * - Discover card swipe: Discover is not swipeable (`MAIN_TAB_PAGES` in navigation/mainTabPager), the
 *   pager gesture is disabled while Discover is selected.
 * - Room object drag: only on the My Room editor and room setup routes,
 *   which are separate stack routes above the pager.
 * - iOS edge back: only on detail routes pushed above the pager; the pager's
 *   own slot route has `gestureEnabled: false`.
 */
const MainTabPagerGestureContext = createContext<MutableRefObject<GestureType | undefined> | null>(null)

export const MainTabPagerGestureProvider = MainTabPagerGestureContext.Provider

/**
 * Wrap a horizontal native scroller (ScrollView, FlatList) rendered on a
 * pager page. A drag that starts on it scrolls it and never moves the page.
 * Outside the pager (rollback flag off, or another route) the child is
 * rendered unchanged.
 */
export function MainTabPagerHorizontalScrollOwner({ children }: { children: ReactElement }) {
  const pagerGestureRef = useContext(MainTabPagerGestureContext)
  const nativeScrollGesture = useMemo(
    () => pagerGestureRef ? Gesture.Native().blocksExternalGesture(pagerGestureRef) : null,
    [pagerGestureRef]
  )
  if (!nativeScrollGesture) return children
  return <GestureDetector gesture={nativeScrollGesture}>{children}</GestureDetector>
}
