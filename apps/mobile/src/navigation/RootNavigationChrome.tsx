import { memo, useLayoutEffect, useRef, useSyncExternalStore } from "react"
import { StyleSheet, View } from "react-native"
import type { SessionActor } from "../features/session/sessionModel"
import { CurrentSceneAssetWarmup } from "../features/performance/CurrentSceneAssetWarmup"
import { BottomNav, type BottomNavKey, type BottomNavProps } from "../ui/bottomNav"
import { getBottomNavReturnPresentation } from "./bottomNavReturnPreview"
import { MAIN_TAB_PAGER_ENABLED } from "./mainTabPager/mainTabPagerConfig"
import { getBottomNavKeyForRoute } from "./rootNavigationModel"
import {
  getRootNavigationChromeSnapshot,
  subscribeToRootNavigationChrome
} from "./rootNavigationChromeStore"
import type { RootStackParamList } from "./RootNavigator"
import { useMainTabChatBadgeCount } from "./useMainTabChatBadgeCount"

interface RootNavigationChromeProps {
  navigatorKey: string
  sessionActor: SessionActor | null
  sessionEntryRoute: string
  isAccountRestricted: boolean
  isFullShopCatalogQaPreview: boolean
  onBottomNavPress: (key: BottomNavKey) => void
}

/**
 * The bottom bar with its Chats badge read here: an unread change re-renders
 * only the bar, not the navigator, the pager pages or pushed screens.
 */
const BadgedBottomNav = memo(function BadgedBottomNav(props: Omit<BottomNavProps, "chatCount">) {
  const chatCount = useMainTabChatBadgeCount()
  return <BottomNav {...props} chatCount={chatCount} />
})

/**
 * Root chrome drawn above the native stack: the current-scene asset warmup
 * and, on the rollback path only (pager flag off), the bottom navigation bar.
 * With the main-page pager the bar is part of the pager's slot screen
 * (`MainTabBottomBar`), so it sits beneath pushed routes. It reads the
 * focused route from the chrome store so route changes re-render only this
 * component, not the navigator.
 */
export const RootNavigationChrome = memo(function RootNavigationChrome({
  navigatorKey,
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  isFullShopCatalogQaPreview,
  onBottomNavPress
}: RootNavigationChromeProps) {
  const routeSnapshot = useSyncExternalStore(
    subscribeToRootNavigationChrome,
    getRootNavigationChromeSnapshot,
    getRootNavigationChromeSnapshot
  )
  const hasCurrentNavigatorSnapshot = routeSnapshot.navigatorKey === navigatorKey
  const routeName = hasCurrentNavigatorSnapshot
    ? routeSnapshot.routeName as keyof RootStackParamList | undefined
    : undefined
  const bottomNavRoutePresentation = getBottomNavReturnPresentation(
    routeName,
    hasCurrentNavigatorSnapshot ? routeSnapshot.routeKey : undefined,
    hasCurrentNavigatorSnapshot ? routeSnapshot.returnPreview : undefined
  )
  const earlyReturnNavVisualOnly = bottomNavRoutePresentation.visualOnly
  const currentBottomNavKey = sessionEntryRoute === "Main" && sessionActor
    ? bottomNavRoutePresentation.currentKey
    : null
  // The last committed tab keeps the bar highlighted while a detail route is
  // focused; it is recorded after commit instead of during render.
  const lastBottomNavKeyRef = useRef<BottomNavKey>("discover")
  useLayoutEffect(() => {
    if (currentBottomNavKey) lastBottomNavKeyRef.current = currentBottomNavKey
  }, [currentBottomNavKey])
  // An overlay above the stack cannot sit beneath a detail route: during an
  // iOS back swipe it could only appear on top of the sliding page or after
  // the gesture ends. With the pager the slot screen draws the bar instead.
  const overlayOwnsBottomNav = !MAIN_TAB_PAGER_ENABLED
  const canWarmCurrentSceneAssets = isCurrentSceneWarmupRoute(
    routeName,
    sessionEntryRoute,
    isAccountRestricted
  )

  return (
    <>
      {sessionActor ? (
        <CurrentSceneAssetWarmup
          enabled={canWarmCurrentSceneAssets}
          initialShopMode={hasCurrentNavigatorSnapshot ? routeSnapshot.shopMode : undefined}
          sessionMode={sessionActor.session.mode}
          isFullShopCatalogQaPreview={isFullShopCatalogQaPreview}
        />
      ) : null}
      {overlayOwnsBottomNav && sessionEntryRoute === "Main" && sessionActor && !isAccountRestricted && bottomNavRoutePresentation.mounted ? (
        <View
          pointerEvents={earlyReturnNavVisualOnly ? "none" : "box-none"}
          accessibilityElementsHidden={earlyReturnNavVisualOnly}
          importantForAccessibility={earlyReturnNavVisualOnly ? "no-hide-descendants" : "auto"}
          style={StyleSheet.absoluteFill}
        >
          <BadgedBottomNav
            currentKey={currentBottomNavKey ?? lastBottomNavKeyRef.current}
            onPress={onBottomNavPress}
            visible={bottomNavRoutePresentation.visible}
            appearance={currentBottomNavKey === "discover" ? "ambient" : "default"}
          />
        </View>
      ) : null}
    </>
  )
})

interface MainTabBottomBarProps {
  /** The pager slot route name: always the selected main tab. */
  routeName: string
  onPress: (key: BottomNavKey) => void
}

/**
 * The bottom bar drawn inside the main-page pager's slot screen. A detail
 * route pushed above the slot covers it like page content; an interactive
 * back swipe reveals it already rendered under the finger, and a cancelled
 * swipe covers it again, with no route-state change during the gesture.
 */
export const MainTabBottomBar = memo(function MainTabBottomBar({
  routeName,
  onPress
}: MainTabBottomBarProps) {
  const currentBottomNavKey = getBottomNavKeyForRoute(routeName) ?? "discover"
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <BadgedBottomNav
        currentKey={currentBottomNavKey}
        onPress={onPress}
        appearance={currentBottomNavKey === "discover" ? "ambient" : "default"}
      />
    </View>
  )
})

export function isCurrentSceneWarmupRoute(
  routeName: keyof RootStackParamList | undefined,
  sessionEntryRoute: string,
  isAccountRestricted: boolean
): boolean {
  return sessionEntryRoute === "Main" &&
    !isAccountRestricted &&
    (routeName === "Lobby" || routeName === "CosmeticShop")
}
