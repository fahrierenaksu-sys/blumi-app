import type {
  DiscoveryDecisionQuota,
  MediaSessionToken,
  MiniRoom
} from "@blumi/contracts"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { useCallback, useEffect, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"
import { MatchResultModal } from "../components/MatchResultModal"
import type { CandidateAvatarSnapshot } from "../components/DiscoverCard"
import {
  isDemoMode,
  setDemoMode,
  useDemoStore
} from "../features/demo/demoStore"
import {
  BLUMI_BUILD_PROFILE,
  BLUMI_DEV_ENTRY_ROUTE,
  BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG,
  IS_BLUMI_PAID_COINS_ENABLED,
  MOBILE_HTTP_BASE_URL
} from "../config/env"
import {
  canApplyBlumiDevEntry,
  shouldApplyBlumiDevEntryNavigation
} from "../features/dev/blumiDevEntryPolicy"
import { useBlockStore } from "../features/safety/blockStore"
import {
  resetChatStore,
  useTotalUnreadCount
} from "../features/chat/chatStore"
import { flushAuthenticatedConnectionDecisionOutbox } from "../features/connections/connectionDecisionRuntime"
import {
  disconnectGlobal,
  useGlobalRealtime
} from "../features/realtime/globalRealtimeProvider"
import { MiniRoomScreen } from "../screens/MiniRoomScreen"
import { type ProfilePreviewData } from "../screens/ProfilePreviewScreen"
import { RoomDebriefScreen } from "../screens/RoomDebriefScreen"
import { ChatThreadScreen } from "../screens/ChatThreadScreen"
import { YouScreen } from "../screens/YouScreen"
import { ProfileEditScreen } from "../screens/ProfileEditScreen"
import { MatchResultScreen } from "../screens/MatchResultScreen"
import { AuthEntryScreen } from "../screens/AuthEntryScreen"
import { AvatarV2Provider } from "../features/avatarV2/state/AvatarV2Provider"
import { isAvatarQaUnlockEnabled } from "../features/avatarV2/qa/avatarQaInventory"
import { getOnboardingStarterBodyId } from "../features/avatarV2/avatarStarterModel"
import type { UserAvatar } from "../features/avatarV2/avatarV2.types"
import { RoomV2Provider } from "../features/roomV2/state/RoomV2Provider"
import { AccountRestrictionScreen } from "../screens/AccountRestrictionScreen"
import { useSessionState } from "../features/session/useSessionState"
import type { SessionActor } from "../features/session/sessionModel"
import { selectSessionEntryRoute } from "../features/session/sessionRouting"
import type {
  RegisterAccountInput,
  UpdateSessionProfileInput
} from "../features/session/sessionApi"
import type { PreAuthOnboardingResumeStep } from "../features/session/preAuthOnboardingStorage"
import { usePreAuthOnboardingDraft } from "../features/session/usePreAuthOnboardingDraft"
import {
  getOnboardingScreenMode,
  shouldGateOnboardingBootPrelude,
  shouldWaitForPreAuthDraftHydration,
  getUnauthenticatedNavigatorInitialRoute,
  getSessionNavigatorKey
} from "../features/session/onboardingFlowModel"
import {
  getChatLocale,
  getChatThreadScreenOptions,
  getDetailScreenOptions,
  getReducedMotionScreenOptions,
  getOnboardingEntryRoute,
  MAIN_TAB_SCREEN_OPTIONS,
  ROOT_STACK_SCREEN_OPTIONS
} from "./rootNavigationModel"
import { uiTheme } from "../ui/theme"
import { useReducedMotion } from "../ui/animations"
import { ToastContainer, showToast } from "../ui/toast"
import { BlumiLoadingScreen } from "../ui/BlumiLoadingScreen"
import { DiscoveryStartupBoundary } from "../features/discovery/DiscoveryStartupBoundary"
import { markOnboardingContentReady } from "../features/session/nativeOnboardingBootBridge"
import type { BlumiMatch } from "../features/matches/matchRoomModel"
import { useInventoryStore } from "../features/inventory/inventoryStore"
import { shouldHydrateProductionInventory } from "../features/inventory/inventoryHydrationPolicy"
import { captureProductEvent } from "../analytics/productAnalytics"
import { getRevenueCatCoinPackClient } from "../features/commerce/revenueCatRuntimeClient"
import { ConnectionBanner } from "../features/realtime/connectionBanner/ConnectionBanner"
import { LinkedProfileScreen } from "./LinkedProfileScreen"
import { linking } from "./rootLinking"
import { navigationRef } from "./rootNavigationRef"
import { MainTabBottomBar, RootNavigationChrome } from "./RootNavigationChrome"
import { useBottomNavChrome } from "./useBottomNavChrome"
import { useCurrentSessionGuard } from "./useCurrentSessionGuard"
import { useRoomInviteRouting } from "./useRoomInviteRouting"
import { useRootChatSync } from "./useRootChatSync"
import { useMatchModal } from "./useMatchModal"
import { renderRouteErrorBoundary } from "./RouteErrorBoundary"
import { useNotificationResponseRouting } from "./useNotificationResponseRouting"
import { usePendingDeepLinkReplay } from "./usePendingDeepLinkReplay"
import { useGlobalRealtimeSession } from "./useGlobalRealtimeSession"
import { useBlockedPartnerCleanup } from "./useBlockedPartnerCleanup"
import {
  MAIN_TAB_PAGER_ENABLED,
  MAIN_TAB_ROUTE_NAMES,
  type MainTabRouteName
} from "./mainTabPager/mainTabPagerConfig"
import { MainTabPager, type MainTabPageProps } from "./mainTabPager/MainTabPager"
import { withMainTabPagerRouter } from "./mainTabPager/mainTabPagerRouter"
import {
  renderMainTabPage as renderMainTabPageWith,
  type MainTabPageDependencies
} from "./mainTabPager/renderMainTabPage"
import {
  legalScreenBundle,
  miniRoomRigPreviewScreenBundle,
  myRoomEditorScreenBundle,
  preloadDeferredMainScreens,
  homeStudioScreenBundle,
  settingsScreenBundle,
  wardrobeV2ScreenBundle,
  registerScreenBundle,
  preAuthSetupFlowScreenBundle,
  profileSetupScreenBundle,
  avatarSetupScreenBundle,
  roomSetupScreenBundle,
  preloadDeferredAuthScreens,
  preloadDeferredAuthenticatedOnboardingScreens
} from "./deferredScreenBundles"

export interface ReadyMiniRoomRouteParam {
  miniRoom: MiniRoom
  mediaSession: MediaSessionToken
}

export interface MiniRoomParticipantsRouteParam {
  you: { userId: string; displayName: string }
  partner: {
    userId: string
    displayName: string
    avatarSnapshot?: CandidateAvatarSnapshot
  }
}

export type RootStackParamList = {
  AuthEntry: undefined
  Register: {
    intent?: "create" | "sign-in"
    entryMotion?: "world-handoff"
  } | undefined
  PreAuthSetup: {
    initialStep?: PreAuthOnboardingResumeStep
    entryMotion?: "world-handoff"
  } | undefined
  ProfileSetup: {
    reviewReturnTo?: "AvatarSetup" | "RoomSetup"
  } | undefined
  AvatarSetup: {
    /**
     * Carries a just-saved profile gender across the replace transition so
     * the avatar stage can seed its body before the provider catches up.
     */
    initialGender?: string
  } | undefined
  RoomSetup: undefined
  Lobby: {
    completedProductionDecision?: {
      decision: "like" | "pass"
      userId: string
      quota: DiscoveryDecisionQuota
    }
    pendingLikeUserId?: string
    pendingPassUserId?: string
  } | undefined
  ProfilePreview:
    | {
        profile: ProfilePreviewData
        userId?: never
      }
    | {
        userId: string
        profile?: never
      }
  MiniRoom: {
    readyMiniRoom: ReadyMiniRoomRouteParam
    participants: MiniRoomParticipantsRouteParam
  }
  MiniRoomRigPreview: undefined
  RoomDebrief: {
    miniRoomId: string
    partner: {
      userId: string
      displayName: string
      avatarSnapshot?: CandidateAvatarSnapshot
    }
    durationSeconds: number
    connected: boolean
  }
  Inbox: undefined
  MyRoom: undefined
  HomeStudio: undefined
  You: undefined
  CosmeticShop: {
    initialShopMode?: "avatar" | "home"
  } | undefined
  ProfileEdit: undefined
  WardrobeV2: undefined
  MyRoomEditor: {
    placementItemId?: string
  } | undefined
  Settings: undefined
  AccountRestriction: undefined
  Legal: { type: string }
  /**
   * Ids only. The chat callbacks come from the root as the screen's
   * `bindings` prop (see useRootChatSync), never through route params.
   */
  ChatThread: {
    threadId?: string
    partnerId?: string
    partnerName?: string
  }
  MatchResult: {
    match: BlumiMatch
    celebrate?: boolean
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

const CAN_REGISTER_MINI_ROOM_RIG_PREVIEW = canApplyBlumiDevEntry({
  route: BLUMI_DEV_ENTRY_ROUTE,
  buildProfile: BLUMI_BUILD_PROFILE,
  isDevelopmentRuntime: __DEV__
}) && BLUMI_DEV_ENTRY_ROUTE === "mini-room-rig-preview"
const CAN_REGISTER_HOME_STUDIO = canApplyBlumiDevEntry({
  route: BLUMI_DEV_ENTRY_ROUTE,
  buildProfile: BLUMI_BUILD_PROFILE,
  isDevelopmentRuntime: __DEV__
}) && BLUMI_DEV_ENTRY_ROUTE === "home-studio-pilot"

const IS_FULL_SHOP_CATALOG_QA_PREVIEW = isAvatarQaUnlockEnabled(
  __DEV__,
  BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG
)
function scheduleDeferredPreload(work: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === "function") {
    const idleId = globalThis.requestIdleCallback(() => {
      work()
    })
    return () => {
      if (typeof globalThis.cancelIdleCallback === "function") {
        globalThis.cancelIdleCallback(idleId)
      }
    }
  }

  const timeoutId = setTimeout(work, 32)
  return () => {
    clearTimeout(timeoutId)
  }
}

interface RootNavigatorProps {
  fontsReady?: boolean
}

export function RootNavigator({ fontsReady = true }: RootNavigatorProps = {}) {
  void fontsReady
  const reduceMotion = useReducedMotion()
  const reducedMotionScreenOptions = getReducedMotionScreenOptions(reduceMotion)
  const detailScreenOptions = getDetailScreenOptions(reduceMotion)
  const {
    sessionActor,
    hasSeenIntro,
    isHydrating,
    isBootstrapping,
    errorMessage,
    accountModeration,
    resolvedCapabilities,
    completeIntro,
    requestVerificationCode,
    registerSessionActor,
    registerSessionActorWithDraft,
    startDemoSession,
    completeProfileSetup,
    completeAvatarSetup,
    saveAvatarSelectionOutcome,
    completeRoomSetup,
    updateSessionProfile,
    clearErrorMessage,
    acknowledgeModeration,
    refreshAccountModeration,
    clearSessionActor
  } = useSessionState()
  const {
    preAuthDraft,
    preAuthDraftSnapshot,
    isPreAuthDraftHydrating,
    preAuthDraftScopeId,
    persistPreAuthDraft,
    clearPreAuthDraft
  } = usePreAuthOnboardingDraft()
  const [isBootPreludeReady, setIsBootPreludeReady] = useState(false)
  const handleBootPreludeReady = useCallback(() => {
    setIsBootPreludeReady(true)
  }, [])
  const { latestSessionActorRef, isCurrentSession } = useCurrentSessionGuard(sessionActor)
  const devEntryAppliedGenerationRef = useRef<number | null>(null)
  const [isNavigationReady, setIsNavigationReady] = useState(false)
  const [navigationReadyGeneration, setNavigationReadyGeneration] = useState(0)
  const totalUnreadCount = useTotalUnreadCount()
  const { connectionStatus: rootConnectionStatus } = useGlobalRealtime()
  const demoStore = useDemoStore()
  const {
    visibleRoomInvites,
    setRoomInvites,
    openReadyMiniRoom,
    handleDemoRoomInviteAction,
    resetRoomInviteRouting
  } = useRoomInviteRouting({
    latestSessionActorRef,
    sessionMode: sessionActor?.session.mode,
    demoRoomInvites: demoStore.roomInvites
  })
  const { claimDailyRewardFromServer, hydrateFromServer } = useInventoryStore(
    sessionActor?.profile.userId,
    sessionActor?.session.mode === "production"
  )
  useBlockStore(
    sessionActor?.profile.userId,
    sessionActor?.session.mode === "production"
  )
  const chatBadgeCount = totalUnreadCount + (isDemoMode() ? demoStore.matchedProfiles.length : 0)
  const sessionEntryRoute = selectSessionEntryRoute({
    isHydrating,
    hasSeenIntro,
    sessionActor
  })
  const onboardingEntryRoute = getOnboardingEntryRoute(sessionEntryRoute)
  const isAccountRestricted =
    sessionEntryRoute === "Main" &&
    sessionActor !== null &&
    accountModeration !== null
  const sessionNavigatorKey = isAccountRestricted
    ? `restricted:${sessionActor?.profile.userId ?? "no-session"}`
    : getSessionNavigatorKey(sessionEntryRoute, sessionActor?.profile.userId)
  const chatLocale = getChatLocale(Intl.DateTimeFormat().resolvedOptions().locale)
  const {
    applyRealtimeThreadList,
    applyNewThread,
    refreshProductionThreads,
    resynchronizeMessages,
    upsertRoomInvite,
    warmThreadMessagesForInbox,
    chatThreadBindings
  } = useRootChatSync({
    latestSessionActorRef,
    isCurrentSession,
    sessionMode: sessionActor?.session.mode,
    chatLocale,
    visibleRoomInvites,
    setRoomInvites,
    openReadyMiniRoom,
    handleDemoRoomInviteAction,
    receiptsEnabled: resolvedCapabilities.chat_read_receipts
  })
  const {
    globalMatch,
    reconcileConnectionDecisionDelivery,
    handleRealtimeConnectionMatch,
    getMatchDeduplicationState,
    dismissGlobalMatch,
    goLobby,
    handleMatchSendMessage,
    resetMatchModal
  } = useMatchModal({
    sessionActor,
    latestSessionActorRef,
    isCurrentSession,
    applyNewThread,
    hydrateFromServer
  })

  useEffect(() => {
    if (!IS_BLUMI_PAID_COINS_ENABLED) return
    const revenueCat = getRevenueCatCoinPackClient()
    if (!revenueCat.isAvailable) return
    const userId = sessionActor?.session.mode === "production"
      ? sessionActor.profile.userId
      : undefined
    void revenueCat.syncAuthenticatedUser(userId).catch(() => {
      captureProductEvent("purchase_failed", {
        stage: "revenuecat_identity_sync"
      })
    })
  }, [sessionActor?.profile.userId, sessionActor?.session.mode])

  const {
    syncCurrentRouteName,
    handleBottomNavPress,
    screenListeners
  } = useBottomNavChrome({
    sessionNavigatorKey,
    sessionEntryRoute,
    isAccountRestricted,
    dismissGlobalMatch
  })

  const handleNavigationReady = useCallback((): void => {
    setIsNavigationReady(true)
    setNavigationReadyGeneration((generation) => generation + 1)
    syncCurrentRouteName()
    if (sessionEntryRoute !== "AuthEntry") {
      markOnboardingContentReady()
    }
  }, [sessionEntryRoute, syncCurrentRouteName])

  const pushRegistration = useNotificationResponseRouting({
    sessionActor,
    sessionEntryRoute,
    isAccountRestricted,
    isCurrentSession,
    navigationReadyGeneration
  })

  const replayPendingDeepLink = usePendingDeepLinkReplay({
    sessionActor,
    sessionEntryRoute,
    isAccountRestricted,
    navigationReadyGeneration
  })
  const handleNavigationStateChange = useCallback((): void => {
    syncCurrentRouteName()
    replayPendingDeepLink()
  }, [replayPendingDeepLink, syncCurrentRouteName])

  const inventoryHydrationSessionToken = sessionActor &&
    shouldHydrateProductionInventory(
      sessionActor.session.mode,
      sessionActor.session.onboarding
    )
    ? sessionActor.session.sessionToken
    : null
  const inventoryRewardBody = sessionActor?.session.onboarding.completedAt
    ? "A little something for your next vibe."
    : "Your first vibe starts with a little extra."

  useEffect(() => {
    if (!inventoryHydrationSessionToken) return
    let active = true
    void hydrateFromServer(inventoryHydrationSessionToken).then((hydrated) => {
      if (!active || !hydrated.success) return
      return claimDailyRewardFromServer(inventoryHydrationSessionToken).then((rewardCoins) => {
        if (!active || !rewardCoins) return
        showToast({
          title: `Daily reward: +${rewardCoins} coins`,
          body: inventoryRewardBody,
          type: "success",
          durationMs: 4000
        })
      })
    })
    return () => {
      active = false
    }
  }, [claimDailyRewardFromServer, hydrateFromServer, inventoryHydrationSessionToken, inventoryRewardBody])

  useEffect(() => {
    if (sessionActor?.session.mode !== "production") return
    void flushAuthenticatedConnectionDecisionOutbox({
      actorUserId: sessionActor.profile.userId,
      sessionToken: sessionActor.session.sessionToken,
      onDelivered: reconcileConnectionDecisionDelivery
    }).catch((error: unknown) => {
      console.warn("Connection decision outbox could not be refreshed.", error)
    })
  }, [reconcileConnectionDecisionDelivery, rootConnectionStatus, sessionActor])

  useEffect(() => {
    if (sessionEntryRoute === "AuthEntry") {
      // Warm every unauthenticated destination while AuthEntry is visible.
      // Deferring this to idle time allowed a fast Whoa tap to enter a route
      // before its component bundle was ready.
      preloadDeferredAuthScreens()
      return
    }
    if (onboardingEntryRoute) {
      // Authenticated onboarding does not need the unauthenticated coordinator
      // or register bundle; avoid paying that parse cost on this path.
      preloadDeferredAuthenticatedOnboardingScreens()
    }
  }, [onboardingEntryRoute, sessionEntryRoute])

  useEffect(() => {
    if (sessionEntryRoute !== "Main") return
    const cancelDeferredPreload = scheduleDeferredPreload(() => {
      preloadDeferredMainScreens()
    })
    return cancelDeferredPreload
  }, [sessionEntryRoute])

  useEffect(() => {
    if (
      !canApplyBlumiDevEntry({
        route: BLUMI_DEV_ENTRY_ROUTE,
        buildProfile: BLUMI_BUILD_PROFILE,
        isDevelopmentRuntime: __DEV__
      }) ||
      !navigationRef.isReady() ||
      !shouldApplyBlumiDevEntryNavigation({
        route: BLUMI_DEV_ENTRY_ROUTE,
        buildProfile: BLUMI_BUILD_PROFILE,
        isDevelopmentRuntime: __DEV__,
        sessionEntryRoute,
        hasSessionActor: Boolean(sessionActor),
        navigationReady: isNavigationReady,
        appliedNavigationGeneration: devEntryAppliedGenerationRef.current,
        navigationGeneration: navigationReadyGeneration
      })
    ) {
      return
    }

    devEntryAppliedGenerationRef.current = navigationReadyGeneration

    if (BLUMI_DEV_ENTRY_ROUTE === "myroom") {
      navigationRef.navigate("MyRoom")
      return
    }

    if (BLUMI_DEV_ENTRY_ROUTE === "mini-room-rig-preview") {
      navigationRef.navigate("MiniRoomRigPreview")
      return
    }

    if (BLUMI_DEV_ENTRY_ROUTE === "home-studio-pilot") {
      navigationRef.navigate("HomeStudio")
    }
  }, [isNavigationReady, navigationReadyGeneration, sessionActor, sessionEntryRoute])

  // ── Global WS lifecycle ─────────────────────────────────
  // Leaving the authenticated main session leaves demo mode and clears every
  // session-scoped root store before the socket closes.
  const resetInactiveSessionState = useCallback((): void => {
    if (isDemoMode()) setDemoMode(false)
    resetMatchModal()
    resetRoomInviteRouting()
    resetChatStore()
    disconnectGlobal()
  }, [resetMatchModal, resetRoomInviteRouting])

  const applyConfirmedPartnerBlock = useBlockedPartnerCleanup(sessionActor?.profile.userId)

  useGlobalRealtimeSession({
    sessionActor,
    sessionEntryRoute,
    isAccountRestricted,
    isCurrentSession,
    resetInactiveSessionState,
    clearSessionActor,
    refreshAccountModeration,
    refreshProductionThreads,
    resynchronizeMessages,
    upsertRoomInvite,
    applyRealtimeThreadList,
    applyNewThread,
    openReadyMiniRoom,
    getMatchDeduplicationState,
    onConnectionMatched: handleRealtimeConnectionMatch,
    onPartnerBlocked: applyConfirmedPartnerBlock,
    receiptsEnabled: resolvedCapabilities.chat_read_receipts
  })

  const mainTabPageDependencies: MainTabPageDependencies = {
    onResetSession: clearSessionActor,
    onUpdateDiscoveryPreferences: (actor) => (discoveryPreferences) =>
      updateSessionProfile({
        displayName: actor.profile.displayName,
        discoveryPreferences
      }),
    onRetryThreads: refreshProductionThreads,
    onWarmThread: warmThreadMessagesForInbox,
    resolvedCapabilities,
    isFullShopCatalogQaPreview: IS_FULL_SHOP_CATALOG_QA_PREVIEW
  }
  const renderMainTabPage = (
    actor: SessionActor,
    routeName: MainTabRouteName,
    pageProps: MainTabPageProps
  ) => renderMainTabPageWith(mainTabPageDependencies, actor, routeName, pageProps)

  const shouldShowBootPrelude =
    sessionEntryRoute === "Splash" ||
    (shouldWaitForPreAuthDraftHydration(sessionEntryRoute) &&
      isPreAuthDraftHydrating) ||
    (shouldGateOnboardingBootPrelude(sessionEntryRoute) &&
      !isBootPreludeReady)

  if (shouldShowBootPrelude) {
    // Only a waiting prelude takes the scan over; it dissolves here first.
    const onPreludeReady = shouldGateOnboardingBootPrelude(sessionEntryRoute) ? handleBootPreludeReady : undefined
    return <BlumiLoadingScreen onPreludeReady={onPreludeReady} />
  }

  const onboardingStarterBodyId =
    sessionActor?.session.onboarding.avatar === "incomplete"
      ? getOnboardingStarterBodyId(sessionActor.profile.gender)
      : undefined

  return (
    <AvatarV2Provider
      key={sessionActor?.profile.userId ?? preAuthDraftScopeId}
      storageScopeId={sessionActor?.profile.userId ?? preAuthDraftScopeId}
      requireServerInventory={sessionActor?.session.mode === "production"}
      initialAvatarSelection={sessionActor?.profile.avatar}
      onboardingStarterBodyId={onboardingStarterBodyId}
      onSaveAvatar={saveAvatarSelectionOutcome}
      resolvedCapabilities={resolvedCapabilities}
    >
    <RoomV2Provider
      key={`${sessionActor?.profile.userId ?? preAuthDraftScopeId}:production`}
      storageScopeId={sessionActor?.profile.userId ?? preAuthDraftScopeId}
      requireServerInventory={sessionActor?.session.mode === "production"}
      storageNamespace="production"
      qaOnlyOwnedRoomItemIds={[]}
      isQaRuntimeAuthorized={false}
      isVNextRuntimeProof={false}
      allowStarterOnboardingEdits={
        !sessionActor || sessionActor.session.onboarding.room === "incomplete"
      }
      baseHttpUrl={MOBILE_HTTP_BASE_URL}
      serverSessionToken={
        sessionActor?.session.mode === "production"
          ? sessionActor.session.sessionToken
          : undefined
      }
    >
    <DiscoveryStartupBoundary key={sessionNavigatorKey} active={sessionEntryRoute === "Main" && sessionActor?.session.mode === "production" && !isAccountRestricted}>
    <View style={styles.navigatorShell}>
      {!isAccountRestricted
        ? <ConnectionBanner status={rootConnectionStatus} />
        : null}
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        fallback={<BlumiLoadingScreen />}
        onReady={handleNavigationReady}
        onStateChange={handleNavigationStateChange}
      >
        <Stack.Navigator
          screenListeners={screenListeners}
          screenLayout={renderRouteErrorBoundary}
          UNSTABLE_router={MAIN_TAB_PAGER_ENABLED ? withMainTabPagerRouter : undefined}
          key={sessionNavigatorKey}
          initialRouteName={
            isAccountRestricted
              ? "AccountRestriction"
              : sessionEntryRoute === "AuthEntry"
                ? getUnauthenticatedNavigatorInitialRoute()
                : onboardingEntryRoute ?? undefined
          }
          screenOptions={{
            ...ROOT_STACK_SCREEN_OPTIONS,
            ...reducedMotionScreenOptions,
            contentStyle: styles.screenContent
          }}
        >
          {isAccountRestricted && accountModeration ? (
            <>
              <Stack.Screen name="AccountRestriction" options={{ headerShown: false }}>
                {(screenProps) => (
                  <AccountRestrictionScreen
                    moderation={accountModeration}
                    busy={isBootstrapping}
                    errorMessage={errorMessage}
                    onAcknowledge={() => {
                      void acknowledgeModeration().catch(() => undefined)
                    }}
                    onOpenGuidelines={() =>
                      screenProps.navigation.navigate("Legal", { type: "guidelines" })
                    }
                    onSignOut={() => {
                      void clearSessionActor().catch(() => undefined)
                    }}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Legal"
                component={legalScreenBundle.DeferredScreen}
                options={detailScreenOptions}
              />
            </>
          ) : sessionEntryRoute === "Main" && sessionActor ? (
            <>
              {MAIN_TAB_ROUTE_NAMES.map((routeName) => (
                // With the pager every main tab name maps to the same slot
                // route; its router keeps exactly one in the stack and only
                // renames it. The rollback path renders each page directly.
                <Stack.Screen
                  key={routeName}
                  name={routeName}
                  options={{
                    ...MAIN_TAB_SCREEN_OPTIONS,
                    ...reducedMotionScreenOptions,
                    ...(routeName === "Lobby" ? { title: "Discover" } : null)
                  }}
                >
                  {(screenProps) => MAIN_TAB_PAGER_ENABLED ? (
                    <MainTabPager
                      navigation={screenProps.navigation}
                      route={screenProps.route}
                      renderPage={(pageRouteName, pageProps) =>
                        renderMainTabPage(sessionActor, pageRouteName, pageProps)
                      }
                      bottomBar={
                        <MainTabBottomBar
                          routeName={screenProps.route.name}
                          chatCount={chatBadgeCount}
                          onPress={handleBottomNavPress}
                        />
                      }
                    />
                  ) : renderMainTabPage(sessionActor, routeName, screenProps)}
                </Stack.Screen>
              ))}
              <Stack.Screen
                name="MiniRoom"
                options={{ headerShown: false, gestureEnabled: false }}
              >
                {(screenProps) => (
                  <MiniRoomScreen {...screenProps} sessionActor={sessionActor} />
                )}
              </Stack.Screen>
              {CAN_REGISTER_MINI_ROOM_RIG_PREVIEW ? (
                <Stack.Screen
                  name="MiniRoomRigPreview"
                  options={{ headerShown: false }}
                >
                  {(screenProps) => (
                    <miniRoomRigPreviewScreenBundle.DeferredScreen
                      {...screenProps}
                      sessionActor={sessionActor}
                    />
                  )}
                </Stack.Screen>
              ) : null}
              {CAN_REGISTER_HOME_STUDIO ? (
                <Stack.Screen
                  name="HomeStudio"
                  options={{ headerShown: false }}
                >
                  {(screenProps) => (
                    <homeStudioScreenBundle.DeferredScreen
                      {...screenProps}
                      sessionActor={sessionActor}
                    />
                  )}
                </Stack.Screen>
              ) : null}
              <Stack.Screen
                name="ProfilePreview"
                options={detailScreenOptions}
              >
                {(screenProps) => (
                  <LinkedProfileScreen
                    {...screenProps}
                    sessionToken={sessionActor.session.sessionToken}
                    demoMode={sessionActor.session.mode === "demo"}
                    sessionActor={sessionActor}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="RoomDebrief"
                options={{ headerShown: false, gestureEnabled: false }}
              >
                {(screenProps) => (
                  <RoomDebriefScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onDecisionDelivered={reconcileConnectionDecisionDelivery}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="WardrobeV2"
                component={wardrobeV2ScreenBundle.DeferredScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="MyRoomEditor"
                options={detailScreenOptions}
              >
                {(screenProps) => (
                  <myRoomEditorScreenBundle.DeferredScreen
                    {...screenProps}
                    inventoryOwnerUserId={sessionActor.profile.userId}
                    requireServerInventory={sessionActor.session.mode === "production"}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="ChatThread"
                options={getChatThreadScreenOptions(reduceMotion)}
              >
                {(screenProps) => (
                  <ChatThreadScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onThreadCreated={applyNewThread}
                    bindings={chatThreadBindings} pushRegistration={pushRegistration}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="MatchResult"
                options={detailScreenOptions}
              >
                {(screenProps) => (
                  <MatchResultScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="You"
                options={detailScreenOptions}
              >
                {(screenProps) => (
                  <YouScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onResetSession={clearSessionActor}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="ProfileEdit"
                options={detailScreenOptions}
              >
                {(screenProps) => (
                  <ProfileEditScreen
                    {...screenProps}
                    currentDisplayName={sessionActor!.profile.displayName}
                    currentAge={sessionActor!.profile.age}
                    currentBio={sessionActor!.profile.bio}
                    currentGender={sessionActor!.profile.gender}
                    currentIdentityGender={sessionActor!.profile.identityGender}
                    currentDiscoveryPreferences={sessionActor!.profile.discoveryPreferences}
                    currentAvatarBodyId={
                      sessionActor!.profile.avatar?.loadout?.bodyId ??
                      sessionActor!.profile.avatar.presetId
                    }
                    currentInterests={sessionActor!.profile.interests}
                    currentPrompts={sessionActor!.profile.prompts}
                    currentUserId={sessionActor!.profile.userId}
                    onSave={updateSessionProfile}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Settings"
                options={detailScreenOptions}
              >
                {(screenProps) => (
                  <settingsScreenBundle.DeferredScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onResetSession={clearSessionActor}
                    onUpdateProfile={updateSessionProfile}
                    pushPermissionStatus={pushRegistration.permissionStatus}
                    isRequestingPushPermission={
                      pushRegistration.isRequestingPermission
                    }
                    onRequestPushPermission={pushRegistration.requestPermission}
                    readReceiptsCapability={resolvedCapabilities.chat_read_receipts}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Legal"
                component={legalScreenBundle.DeferredScreen}
                options={detailScreenOptions}
              />
            </>
          ) : sessionEntryRoute === "AuthEntry" ? (
            <>
              <Stack.Screen name="AuthEntry" options={{ headerShown: false }}>
                {(screenProps) => (
                  <AuthEntryScreen
                    {...screenProps}
                    hasSeenIntro={hasSeenIntro}
                    isSubmitting={isBootstrapping}
                    errorMessage={errorMessage}
                    onCompleteIntro={completeIntro}
                    createInitialStep={preAuthDraftSnapshot?.resumeStep ?? "profile"}
                    onStartDemo={startDemoSession}
                    onClearError={clearErrorMessage}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="PreAuthSetup"
                options={{ headerShown: false, animation: "none" }}
                initialParams={
                  preAuthDraftSnapshot
                  ? { initialStep: preAuthDraftSnapshot.resumeStep }
                  : { initialStep: "profile" }
                }
                  >
                    {(screenProps) => (
                      <preAuthSetupFlowScreenBundle.DeferredScreen
                        {...screenProps}
                        initialStep={
                          screenProps.route.params?.initialStep ??
                      preAuthDraftSnapshot?.resumeStep ??
                      "profile"
                    }
                    entryMotion={screenProps.route.params?.entryMotion}
                    draft={preAuthDraft}
                    isSubmitting={isBootstrapping}
                    errorMessage={errorMessage}
                    onPersistDraft={persistPreAuthDraft}
                    onClearDraft={clearPreAuthDraft}
                    onRequestVerificationCode={requestVerificationCode}
                    onRegister={(input: RegisterAccountInput) =>
                      registerSessionActorWithDraft(
                        input,
                        preAuthDraft,
                        clearPreAuthDraft
                      )
                    }
                    onClearError={clearErrorMessage}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Register"
                    options={{ headerShown: false, animation: "fade", ...reducedMotionScreenOptions }}
                  >
                    {(screenProps) => (
                      <registerScreenBundle.DeferredScreen
                        {...screenProps}
                        isSubmitting={isBootstrapping}
                        errorMessage={errorMessage}
                    onRequestVerificationCode={requestVerificationCode}
                    onRegister={(input: RegisterAccountInput) =>
                      screenProps.route.params?.intent === "create"
                        ? registerSessionActorWithDraft(
                            input,
                            preAuthDraft,
                            clearPreAuthDraft
                          )
                        : registerSessionActor(input)
                    }
                    onClearError={clearErrorMessage}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Legal"
                component={legalScreenBundle.DeferredScreen}
                options={detailScreenOptions}
              />
            </>
          ) : onboardingEntryRoute && sessionActor ? (
            <>
              <Stack.Screen
                name="ProfileSetup"
                options={{ headerShown: false, animation: "fade", ...reducedMotionScreenOptions }}
              >
                {(screenProps) => {
                  const profileMode = getOnboardingScreenMode(
                    "ProfileSetup",
                    sessionActor.session.onboarding
                  )
                  const profileReviewReturnTarget =
                    screenProps.route.params?.reviewReturnTo ?? "AvatarSetup"

                  return (
                    <profileSetupScreenBundle.DeferredScreen
                      initialProfile={sessionActor.profile}
                      mode={profileMode}
                      isSubmitting={isBootstrapping}
                      errorMessage={errorMessage}
                      onComplete={async (input: UpdateSessionProfileInput) => {
                        // Start the durable save first, but do not make the
                        // user wait on the network before seeing the next
                        // onboarding step. The setup screens keep the
                        // submitting state while the save settles and
                        // surface any error through the shared feedback.
                        const profileSave = completeProfileSetup(input)
                        const nextRoute = profileMode === "review"
                          ? profileReviewReturnTarget
                          : "AvatarSetup"
                        if (nextRoute === "AvatarSetup") {
                          screenProps.navigation.replace("AvatarSetup", {
                            initialGender: input.gender
                          })
                        } else {
                          screenProps.navigation.replace(nextRoute)
                        }
                        await profileSave
                      }}
                      onBack={() =>
                        screenProps.navigation.navigate(profileReviewReturnTarget)
                      }
                      onSignOut={clearSessionActor}
                    />
                  )
                }}
              </Stack.Screen>
              <Stack.Screen
                name="AvatarSetup"
                options={{ headerShown: false, animation: "fade", ...reducedMotionScreenOptions }}
              >
                {(screenProps) => (
                      <avatarSetupScreenBundle.DeferredScreen
                        displayName={sessionActor.profile.displayName}
                        age={sessionActor.profile.age}
                        initialGender={
                          screenProps.route.params?.initialGender ??
                          sessionActor.profile.gender
                        }
                    isSubmitting={isBootstrapping}
                    errorMessage={errorMessage}
                    onComplete={async (avatar: UserAvatar) => {
                      await completeAvatarSetup(avatar)
                      screenProps.navigation.replace("RoomSetup")
                    }}
                    onBackToProfile={() =>
                      screenProps.navigation.navigate("ProfileSetup", {
                        reviewReturnTo: "AvatarSetup"
                      })
                    }
                    onEditProfile={() =>
                      screenProps.navigation.navigate("ProfileSetup", {
                        reviewReturnTo: "AvatarSetup"
                      })
                    }
                    onSignOut={clearSessionActor}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="RoomSetup"
                options={{ headerShown: false, animation: "fade", ...reducedMotionScreenOptions }}
              >
                {(screenProps) => (
                  <roomSetupScreenBundle.DeferredScreen
                    isSubmitting={isBootstrapping}
                    errorMessage={errorMessage}
                    onBackToAvatar={() =>
                      screenProps.navigation.navigate("AvatarSetup")
                    }
                    onEditProfile={() =>
                      screenProps.navigation.navigate("ProfileSetup", {
                        reviewReturnTo: "RoomSetup"
                      })
                    }
                    onSignOut={clearSessionActor}
                    onComplete={async () => completeRoomSetup()}
                  />
                )}
              </Stack.Screen>
            </>
          ) : (
            <Stack.Screen
              name="AuthEntry"
              component={BlumiLoadingScreen}
              options={{ headerShown: false }}
            />
          )}
        </Stack.Navigator>
        {sessionEntryRoute === "Main" && sessionActor && !isAccountRestricted ? (
          <MatchResultModal
            visible={globalMatch !== null}
            currentUserName={sessionActor.profile.displayName}
            matchedUserName={globalMatch?.matchedUserName ?? ""}
            matchedUserId={globalMatch?.matchedUserId}
            matchedAvatarSelection={globalMatch?.matchedAvatarSelection}
            onClose={dismissGlobalMatch}
            onKeepDiscovering={goLobby}
            onSendMessage={handleMatchSendMessage}
          />
        ) : null}
      </NavigationContainer>
      <RootNavigationChrome
        navigatorKey={sessionNavigatorKey}
        sessionActor={sessionActor}
        sessionEntryRoute={sessionEntryRoute}
        isAccountRestricted={isAccountRestricted}
        chatCount={chatBadgeCount}
        isFullShopCatalogQaPreview={IS_FULL_SHOP_CATALOG_QA_PREVIEW}
        onBottomNavPress={handleBottomNavPress}
      />
      <ToastContainer />
    </View>
    </DiscoveryStartupBoundary>
    </RoomV2Provider>
    </AvatarV2Provider>
  )
}

const styles = StyleSheet.create({
  navigatorShell: {
    flex: 1,
    backgroundColor: uiTheme.colors.background
  },
  screenContent: {
    backgroundColor: uiTheme.colors.background
  },
})
