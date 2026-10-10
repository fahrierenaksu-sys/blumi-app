import { NavigationProvider, NavigationRouteContext } from "@react-navigation/native"
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react"

interface PageNavigationLike {
  isFocused: () => boolean
  addListener: (type: "focus" | "blur", listener: () => void) => () => void
}

interface PageRouteLike {
  key: string
  name: string
  params?: object
}

/**
 * Gives one pager page its own focus for `useIsFocused`.
 *
 * React Navigation 7 answers `useIsFocused` from the screen's focus context
 * before it asks `navigation.isFocused()`, so without this every mounted page
 * read the shared slot's focus: an unseen Discover page counted as focused,
 * took the one live avatar canvas back after the room editor closed, and My
 * Room showed no avatar. `NavigationProvider` marks its subtree focused only
 * while its route key is the slot the parent stack has focused, so the page
 * passes the slot key while the page focus hub says it is the focused page.
 * Children still read the page's real route.
 */
export function MainTabPageFocusScope(props: {
  navigation: PageNavigationLike
  route: PageRouteLike
  slotKey: string
  children: ReactNode
}) {
  const { navigation, route, slotKey, children } = props
  const subscribe = useCallback((onChange: () => void) => {
    const unsubscribeFocus = navigation.addListener("focus", onChange)
    const unsubscribeBlur = navigation.addListener("blur", onChange)
    return () => {
      unsubscribeFocus()
      unsubscribeBlur()
    }
  }, [navigation])
  const readFocus = useCallback(() => navigation.isFocused(), [navigation])
  const isPageFocused = useSyncExternalStore(subscribe, readFocus, readFocus)
  const focusRoute = useMemo(
    () => ({ ...route, key: isPageFocused ? slotKey : route.key }),
    [isPageFocused, route, slotKey]
  )
  return (
    <NavigationProvider route={focusRoute as never} navigation={navigation as never}>
      <NavigationRouteContext.Provider value={route as never}>
        {children}
      </NavigationRouteContext.Provider>
    </NavigationProvider>
  )
}
