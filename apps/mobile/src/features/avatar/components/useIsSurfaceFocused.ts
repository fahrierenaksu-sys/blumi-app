import { NavigationContext } from "@react-navigation/native"
import { useCallback, useContext, useSyncExternalStore } from "react"

const ALWAYS_FOCUSED = () => true
const NO_SUBSCRIPTION = () => () => undefined

/**
 * Whether the screen around this component is the focused one. Unlike `useIsFocused` it never throws: a surface
 * outside any screen counts as focused. Inside a main-tab pager page the navigation is the page's own
 * (`MainTabPageFocusScope`), so a mounted page that is not shown reads false.
 */
export function useIsSurfaceFocused(): boolean {
  const navigation = useContext(NavigationContext)
  const subscribe = useCallback((onChange: () => void) => {
    if (!navigation) return NO_SUBSCRIPTION()
    const unsubscribeFocus = navigation.addListener("focus", onChange)
    const unsubscribeBlur = navigation.addListener("blur", onChange)
    return () => {
      unsubscribeFocus()
      unsubscribeBlur()
    }
  }, [navigation])
  const readFocus = navigation ? navigation.isFocused : ALWAYS_FOCUSED
  return useSyncExternalStore(subscribe, readFocus, readFocus)
}
