import { memo, useLayoutEffect, useRef, useSyncExternalStore } from "react"
import { StyleSheet, View } from "react-native"
import type { SessionActor } from "../features/session/sessionModel"
import { CurrentSceneAssetWarmup } from "../features/performance/CurrentSceneAssetWarmup"
import { BottomNav, type BottomNavKey } from "../ui/bottomNav"
import { getBottomNavReturnPresentation } from "./bottomNavReturnPreview"
import {
  getRootNavigationChromeSnapshot,
  subscribeToRootNavigationChrome
} from "./rootNavigationChromeStore"
import type { RootStackParamList } from "./RootNavigator"

interface RootNavigationChromeProps {
  navigatorKey: string
  sessionActor: SessionActor | null
  sessionEntryRoute: string
  isAccountRestricted: boolean
  chatCount: number
  isFullShopCatalogQaPreview: boolean
  onBottomNavPress: (key: BottomNavKey) => void
}

/**
 * Root chrome drawn above the native stack: the bottom navigation bar and the
 * current-scene asset warmup. It reads the focused route from the chrome
 * store so route changes re-render only this component, not the navigator.
 */
export const RootNavigationChrome = memo(function RootNavigationChrome({
  navigatorKey,
  sessionActor,
  sessionEntryRoute,
  isAccountRestricted,
  chatCount,
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
      {sessionEntryRoute === "Main" && sessionActor && !isAccountRestricted && bottomNavRoutePresentation.mounted ? (
        <View
          pointerEvents={earlyReturnNavVisualOnly ? "none" : "box-none"}
          accessibilityElementsHidden={earlyReturnNavVisualOnly}
          importantForAccessibility={earlyReturnNavVisualOnly ? "no-hide-descendants" : "auto"}
          style={StyleSheet.absoluteFill}
        >
          <BottomNav
            currentKey={currentBottomNavKey ?? lastBottomNavKeyRef.current}
            chatCount={chatCount}
            onPress={onBottomNavPress}
            visible={bottomNavRoutePresentation.visible}
            appearance={currentBottomNavKey === "discover" ? "ambient" : "default"}
          />
        </View>
      ) : null}
    </>
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
