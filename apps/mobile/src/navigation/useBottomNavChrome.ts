import {
  CommonActions,
  type NavigationState,
  type ParamListBase,
  type RouteProp,
  type ScreenListeners
} from "@react-navigation/native"
import type { NativeStackNavigationEventMap } from "@react-navigation/native-stack"
import { useCallback } from "react"
import { Platform } from "react-native"
import type { BottomNavKey } from "../ui/bottomNav"
import {
  resolveBottomNavReturnPreview,
  retainBottomNavReturnPreview
} from "./bottomNavReturnPreview"
import {
  clearRootNavigationChromeReturnPreview,
  getRootNavigationChromeSnapshot,
  publishRootNavigationChrome,
  publishRootNavigationChromeReturnPreview,
  settleRootNavigationChromeReturnPreview
} from "./rootNavigationChromeStore"
import { MAIN_TAB_PAGER_ENABLED } from "./mainTabPager/mainTabPagerConfig"
import { requestMainTabPagerPage } from "./mainTabPager/mainTabPagerController"
import { shouldDispatchMainTabNavigation } from "./rootNavigationModel"
import { navigationRef } from "./rootNavigationRef"
import type { RootStackParamList } from "./RootNavigator"

interface BottomNavChromeInput {
  sessionNavigatorKey: string
  sessionEntryRoute: string
  isAccountRestricted: boolean
  dismissGlobalMatch: () => void
}

interface ScreenListenerProps {
  route: RouteProp<ParamListBase>
  navigation: { getState: () => NavigationState }
}

/**
 * Owns the root chrome's view of navigation: publishing the focused route to
 * the chrome store, the iOS back-gesture return preview, and bottom-tab
 * dispatch. Every returned callback is stable per navigator key so the
 * memoized chrome does not re-render with the navigator.
 */
export function useBottomNavChrome({
  sessionNavigatorKey,
  sessionEntryRoute,
  isAccountRestricted,
  dismissGlobalMatch
}: BottomNavChromeInput) {
  const syncCurrentRouteName = useCallback((): void => {
    const currentRoute = navigationRef.getCurrentRoute()
    const routeName = currentRoute?.name as keyof RootStackParamList | undefined
    const shopParams = currentRoute?.params as RootStackParamList["CosmeticShop"]
    const previousSnapshot = getRootNavigationChromeSnapshot()
    const returnPreview = previousSnapshot.navigatorKey === sessionNavigatorKey
      ? retainBottomNavReturnPreview(previousSnapshot.returnPreview, currentRoute?.key)
      : undefined
    publishRootNavigationChrome({
      navigatorKey: sessionNavigatorKey,
      routeName,
      routeKey: currentRoute?.key,
      shopMode: routeName === "CosmeticShop" ? shopParams?.initialShopMode : undefined,
      returnPreview
    })
  }, [sessionNavigatorKey])

  const handleBottomNavPress = useCallback((key: BottomNavKey): void => {
    if (!navigationRef.isReady()) return
    const destination = key === "discover"
      ? "Lobby"
      : key === "chats"
        ? "Inbox"
        : key === "myroom"
          ? "MyRoom"
          : "CosmeticShop"
    if (!shouldDispatchMainTabNavigation(navigationRef.getCurrentRoute()?.name, destination)) return
    dismissGlobalMatch()
    // With the pager, a tap commits through the same selection path as a
    // swipe (one selected-page state, one navigation per change). The stack
    // navigation below remains the rollback path and the fallback when a
    // detail route covers the pager.
    if (MAIN_TAB_PAGER_ENABLED && requestMainTabPagerPage(key)) return
    // The bottom bar shares a native stack with detail routes. Reordering
    // existing native controllers with RESET can leave a rapid-switching iOS
    // transition unresponsive. StackRouter's pop navigation returns to an
    // earlier tab, or pushes it once when absent, without reordering live
    // controllers or accumulating another instance on every revisit.
    navigationRef.dispatch(CommonActions.navigate(destination, undefined, {
      pop: true,
      merge: true
    }))
  }, [dismissGlobalMatch])

  const screenListeners = useCallback(({ route, navigation }: ScreenListenerProps): ScreenListeners<
    NavigationState,
    NativeStackNavigationEventMap
  > => ({
    transitionStart: ({ data }) => {
      if (sessionEntryRoute !== "Main" || isAccountRestricted) return
      if (!data.closing) {
        // A cancelled pop reappears on the source; the target's willAppear
        // must not discard the preview while the gesture is still active.
        clearRootNavigationChromeReturnPreview(sessionNavigatorKey, route.key)
      }
      // A closing detail route does not show the bottom bar yet: the bar is
      // fixed to the screen bottom and would appear under the sliding page
      // before the back swipe finishes. It is shown on transitionEnd.
    },
    transitionEnd: ({ data }) => {
      const preview = sessionEntryRoute === "Main" && !isAccountRestricted
        ? resolveBottomNavReturnPreview({
          platform: Platform.OS === "ios" ? "ios" : "android",
          closing: data.closing,
          sourceRouteKey: route.key,
          stack: navigation.getState()
        })
        : undefined
      if (preview) {
        // The page has fully left. Native dismissal can precede the JS pop,
        // so bridge the bar until the target route is published.
        publishRootNavigationChromeReturnPreview(sessionNavigatorKey, { ...preview, completed: true })
        return
      }
      settleRootNavigationChromeReturnPreview(sessionNavigatorKey, route.key, data.closing)
    },
    gestureCancel: () => {
      clearRootNavigationChromeReturnPreview(sessionNavigatorKey, route.key)
    }
  }), [isAccountRestricted, sessionEntryRoute, sessionNavigatorKey])

  return { syncCurrentRouteName, handleBottomNavPress, screenListeners }
}
