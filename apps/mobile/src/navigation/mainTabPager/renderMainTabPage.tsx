import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import type { ComponentProps, ReactNode } from "react"
import type { SessionActor } from "../../features/session/sessionModel"
import { InboxScreen } from "../../screens/InboxScreen"
import { LobbyScreen } from "../../screens/LobbyScreen"
import { cosmeticShopScreenBundle, myRoomScreenBundle } from "../deferredScreenBundles"
import type { RootStackParamList } from "../RootNavigator"
import type { MainTabPageProps } from "./MainTabPager"
import type { MainTabRouteName } from "./mainTabPagerConfig"

type LobbyProps = ComponentProps<typeof LobbyScreen>
type InboxProps = ComponentProps<typeof InboxScreen>
type MyRoomProps = ComponentProps<typeof myRoomScreenBundle.DeferredScreen>

export interface MainTabPageDependencies {
  onResetSession: LobbyProps["onResetSession"]
  onUpdateDiscoveryPreferences: (actor: SessionActor) => LobbyProps["onUpdateDiscoveryPreferences"]
  onRetryThreads: InboxProps["onRetryThreads"]
  onWarmThread: InboxProps["onWarmThread"]
  resolvedCapabilities: MyRoomProps["resolvedCapabilities"]
  isFullShopCatalogQaPreview: boolean
}

/**
 * One definition of each main page, used by the pager (one slot route) and by
 * the rollback path (four separate stack routes).
 */
export function renderMainTabPage(
  dependencies: MainTabPageDependencies,
  actor: SessionActor,
  routeName: MainTabRouteName,
  pageProps: MainTabPageProps
): ReactNode {
  if (routeName === "Lobby") {
    return (
      <LobbyScreen
        sessionActor={actor}
        onResetSession={dependencies.onResetSession}
        onUpdateDiscoveryPreferences={dependencies.onUpdateDiscoveryPreferences(actor)}
      />
    )
  }
  if (routeName === "Inbox") {
    return (
      <InboxScreen
        {...(pageProps as NativeStackScreenProps<RootStackParamList, "Inbox">)}
        sessionActor={actor}
        onRetryThreads={dependencies.onRetryThreads}
        onWarmThread={dependencies.onWarmThread}
      />
    )
  }
  if (routeName === "MyRoom") {
    return (
      <myRoomScreenBundle.DeferredScreen
        {...pageProps}
        sessionActor={actor}
        resolvedCapabilities={dependencies.resolvedCapabilities}
      />
    )
  }
  return (
    <cosmeticShopScreenBundle.DeferredScreen
      {...pageProps}
      sessionActor={actor}
      roomFurnitureCatalog={undefined}
      qaOnlyOwnedRoomItemIds={[]}
      isRoomCatalogQaPreview={false}
      isFullShopCatalogQaPreview={dependencies.isFullShopCatalogQaPreview}
      initialShopMode={undefined}
    />
  )
}
