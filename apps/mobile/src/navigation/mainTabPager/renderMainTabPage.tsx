import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { memo, type ComponentProps, type ReactNode } from "react"
import type { SessionActor } from "../../features/session/sessionModel"
import { InboxScreen as InboxScreenComponent } from "../../screens/InboxScreen"
import { LobbyScreen as LobbyScreenComponent } from "../../screens/LobbyScreen"
import { cosmeticShopScreenBundle, myRoomScreenBundle } from "../deferredScreenBundles"
import type { RootStackParamList } from "../RootNavigator"
import type { MainTabPageProps } from "./MainTabPager"
import type { MainTabRouteName } from "./mainTabPagerConfig"

type LobbyProps = ComponentProps<typeof LobbyScreenComponent>
type InboxProps = ComponentProps<typeof InboxScreenComponent>
type MyRoomProps = ComponentProps<typeof myRoomScreenBundle.DeferredScreen>

// Page roots are memoised: the pager re-renders a page wrapper when its
// selection flips, and the page itself re-renders only when its own props
// (session, callbacks, route) change.
const LobbyScreen = memo(LobbyScreenComponent)
const InboxScreen = memo(InboxScreenComponent)
const MyRoomScreen = memo(myRoomScreenBundle.DeferredScreen)
const CosmeticShopScreen = memo(cosmeticShopScreenBundle.DeferredScreen)

/** Production Shop owns no QA-only room items; one shared array keeps its props equal. */
export const NO_QA_OWNED_ROOM_ITEM_IDS: readonly string[] = Object.freeze([])

export interface MainTabPageDependencies {
  onResetSession: LobbyProps["onResetSession"]
  /** Bound to the current session by the navigator, so its identity is stable. */
  onUpdateDiscoveryPreferences: NonNullable<LobbyProps["onUpdateDiscoveryPreferences"]>
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
        onUpdateDiscoveryPreferences={dependencies.onUpdateDiscoveryPreferences}
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
      <MyRoomScreen
        {...pageProps}
        sessionActor={actor}
        resolvedCapabilities={dependencies.resolvedCapabilities}
      />
    )
  }
  return (
    <CosmeticShopScreen
      {...pageProps}
      sessionActor={actor}
      roomFurnitureCatalog={undefined}
      qaOnlyOwnedRoomItemIds={NO_QA_OWNED_ROOM_ITEM_IDS}
      isRoomCatalogQaPreview={false}
      isFullShopCatalogQaPreview={dependencies.isFullShopCatalogQaPreview}
      initialShopMode={undefined}
    />
  )
}
