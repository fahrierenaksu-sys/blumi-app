import type {
  DiscoveryDecisionQuota,
  MediaSessionToken,
  MiniRoom,
  MiniRoomParticipant
, ServerEvent } from "@blumi/contracts"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  StyleSheet,
  View
} from "react-native"
import { MatchResultModal } from "../components/MatchResultModal"
import type { CandidateAvatarSnapshot } from "../components/DiscoverCard"
import { createCandidateAvatarSnapshot } from "../features/avatarV2/candidateAvatarSnapshot"
import {
  demoSendMessage,
  demoRoomInviteAction,
  getDemoMessages,
  isDemoMode,
  setDemoMode,
  useDemoStore
} from "../features/demo/demoStore"
import { DUMMY_PROFILES } from "../features/demo/dummyProfiles"
import {
  BLUMI_BUILD_PROFILE,
  BLUMI_DEV_ENTRY_ROUTE,
  BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG,
  IS_BLUMI_PAID_COINS_ENABLED,
  MOBILE_HTTP_BASE_URL,
  MOBILE_WS_BASE_URL
} from "../config/env"
import {
  canApplyBlumiDevEntry,
  shouldApplyBlumiDevEntryNavigation
} from "../features/dev/blumiDevEntryPolicy"
import {
  createThread,
  fetchChatThreads,
  fetchThreadMessages,
  markThreadRead,
  type FetchThreadMessagesOptions,
  sendThreadMessage
} from "../features/chat/chatApi"
import { createChatCoordinator } from "../features/chat/chatCoordinator"
import { createMatchThreadSyncGate, createThreadListRefreshGuard } from "../features/chat/threadListRefreshGuard"
import {
  cancelThreadRoomInvite,
  createThreadRoomInvite,
  decideThreadRoomInvite,
  fetchThreadRoomInvites,
  joinRoomSession,
  leaveActiveRoom,
  normalizeRoomInviteRecord
} from "../features/chat/chatRoomInviteApi"
import type {
  ChatLocale,
  ChatRoomInviteAction,
  ChatRoomInviteTimelineItem
} from "../features/chat/chatRoomInviteModel"
import {
  hydrateBlockedUsersFromServer,
  useBlockStore
} from "../features/safety/blockStore"
import {
  applyChatMessageListed,
  hasMessageHistory,
  applyChatMessageListFailed,
  applyChatMessageListLoading,
  applyChatMessageReceived,
  confirmOptimisticMessage,
  applyChatThreadCreated,
  applyChatThreadListFailed,
  applyChatThreadListed,
  applyChatThreadRead,
  applyChatThreadListLoading,
  findThreadForPartner,
  getThreads,
  markThreadRead as markLocalThreadRead,
  markOptimisticMessageFailed,
  resetChatStore,
  useTotalUnreadCount
} from "../features/chat/chatStore"
import {
  recordMutualConnection,
  updateSavedConnectionStatus
} from "../features/connections/savedConnectionsStore"
import { presentConnectionMatch } from "../features/connections/connectionMatchPresentation"
import { flushAuthenticatedConnectionDecisionOutbox } from "../features/connections/connectionDecisionRuntime"
import type { ConnectionDecisionDeliveryDependencies } from "../features/connections/connectionDecisionDelivery"
import {
  createGlobalRealtimeEventHandler
} from "../features/realtime/globalRealtimeEventHandler"
import {
  isSameAuthenticatedSession,
  reconcileRealtimeConnectionMatch,
  type ConnectionMatchedPayload
} from "../features/connections/globalMatchReconciliation"
import {
  connectGlobal,
  disconnectGlobal,
  sendGlobal,
  subscribeToStatus,
  useGlobalRealtime,
  useGlobalRealtimeEvents
} from "../features/realtime/globalRealtimeProvider"
import { isRealtimeAuthInvalidClose } from "../features/realtime/realtimeClient"
import {
  createGlobalRealtimeLifecycle,
  getGlobalRealtimeLifecycleIdentity
} from "../features/realtime/globalRealtimeLifecycle"
import { LobbyScreen } from "../screens/LobbyScreen"
import { MiniRoomScreen } from "../screens/MiniRoomScreen"
import { type ProfilePreviewData } from "../screens/ProfilePreviewScreen"
import { RoomDebriefScreen } from "../screens/RoomDebriefScreen"
import { InboxScreen } from "../screens/InboxScreen"
import { ChatThreadScreen } from "../screens/ChatThreadScreen"
import { YouScreen } from "../screens/YouScreen"
import { ProfileEditScreen } from "../screens/ProfileEditScreen"
import { MatchResultScreen } from "../screens/MatchResultScreen"
import { WelcomeScreen } from "../screens/WelcomeScreen"
import { AuthEntryScreen } from "../screens/AuthEntryScreen"
import { AvatarV2Provider } from "../features/avatarV2/state/AvatarV2Provider"
import { isAvatarQaUnlockEnabled } from "../features/avatarV2/qa/avatarQaInventory"
import { getOnboardingStarterBodyId } from "../features/avatarV2/avatarStarterModel"
import type { UserAvatar } from "../features/avatarV2/avatarV2.types"
import { RoomV2Provider } from "../features/roomV2/state/RoomV2Provider"
import { AccountRestrictionScreen } from "../screens/AccountRestrictionScreen"
import type { SessionActor } from "../features/session/sessionModel"
import { useSessionState } from "../features/session/useSessionState"
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
import { usePushRegistration } from "../features/notifications/usePushRegistration"
import { resolveNotificationDestination } from "../features/notifications/notificationRouting"
import { useInventoryStore } from "../features/inventory/inventoryStore"
import { shouldHydrateProductionInventory } from "../features/inventory/inventoryHydrationPolicy"
import { captureProductEvent } from "../analytics/productAnalytics"
import { getRevenueCatCoinPackClient } from "../features/commerce/revenueCatRuntimeClient"
import { ConnectionBanner } from "../ui/connectionBanner"
import { LinkedProfileScreen } from "./LinkedProfileScreen"
import { linking } from "./rootLinking"
import { navigationRef } from "./rootNavigationRef"
import { RootNavigationChrome } from "./RootNavigationChrome"
import { useBottomNavChrome } from "./useBottomNavChrome"
import {
  cosmeticShopScreenBundle,
  legalScreenBundle,
  miniRoomRigPreviewScreenBundle,
  myRoomScreenBundle,
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
  Welcome: undefined
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
  ChatThread: {
    threadId?: string
    partnerId?: string
    partnerName?: string
    sendChatMessage?: (
      threadId: string,
      body: string,
      clientMessageId: string
    ) => Promise<void>
    requestMessages?: (threadId: string, options?: FetchThreadMessagesOptions) => Promise<void>
    markThreadRead?: (threadId: string) => void
    roomInvites?: readonly ChatRoomInviteTimelineItem[]
    onRoomInviteAction?: (action: ChatRoomInviteAction) => Promise<void>
    onCloseActiveRoom?: (expectedRoomSessionId: string) => Promise<void>
    locale?: ChatLocale
  }
  MatchResult: {
    match: BlumiMatch
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function createLocalDemoMediaSessionToken(): string {
  return "demo-session"
}
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

interface GlobalMatchState {
  miniRoomId: string
  matchedUserName: string
  matchedUserId?: string
}

type ReadyMiniRoomEvent = Extract<ServerEvent, { type: "mini_room.ready" }>

interface RootNavigatorProps {
  fontsReady?: boolean
}

export function RootNavigator({ fontsReady = true }: RootNavigatorProps = {}) {
  void fontsReady
  const reduceMotion = useReducedMotion()
  const reducedMotionScreenOptions = getReducedMotionScreenOptions(reduceMotion)
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
  const [globalMatch, setGlobalMatch] = useState<GlobalMatchState | null>(null)
  const [roomInvites, setRoomInvites] = useState<ChatRoomInviteTimelineItem[]>([])
  const handledMatchIdsRef = useRef(new Set<string>())
  const reconcilingMatchIdsRef = useRef(new Set<string>())
  const latestSessionActorRef = useRef<SessionActor | null>(sessionActor)
  latestSessionActorRef.current = sessionActor
  const isCurrentSession = useCallback(
    (expectedActor: SessionActor): boolean =>
      isSameAuthenticatedSession(expectedActor, latestSessionActorRef.current),
    []
  )
  const handledReadyMiniRoomIdsRef = useRef(new Set<string>())
  const devEntryAppliedGenerationRef = useRef<number | null>(null)
  const [isNavigationReady, setIsNavigationReady] = useState(false)
  const [navigationReadyGeneration, setNavigationReadyGeneration] = useState(0)
  const totalUnreadCount = useTotalUnreadCount()
  const { connectionStatus: rootConnectionStatus } = useGlobalRealtime()
  const demoStore = useDemoStore()
  const visibleRoomInvites = sessionActor?.session.mode === "demo"
    ? demoStore.roomInvites
    : roomInvites
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
  const threadListRefreshGuardRef = useRef<ReturnType<typeof createThreadListRefreshGuard> | null>(null)
  if (!threadListRefreshGuardRef.current) threadListRefreshGuardRef.current = createThreadListRefreshGuard()
  const matchThreadSyncGateRef = useRef<ReturnType<typeof createMatchThreadSyncGate> | null>(null)
  if (!matchThreadSyncGateRef.current) matchThreadSyncGateRef.current = createMatchThreadSyncGate()
  const applyRealtimeThreadList = useCallback((list: Parameters<typeof applyChatThreadListed>[0]): void => {
    threadListRefreshGuardRef.current?.observeAuthoritativeThreadChange()
    applyChatThreadListed(list)
  }, [])
  const applyNewThread = useCallback((thread: Parameters<typeof applyChatThreadCreated>[0]): void => {
    threadListRefreshGuardRef.current?.observeAuthoritativeThreadChange()
    applyChatThreadCreated(thread)
  }, [])

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

  const refreshProductionThreads = useCallback(async (): Promise<void> => {
    const actor = latestSessionActorRef.current
    if (actor?.session.mode !== "production") return
    const requestRevision = threadListRefreshGuardRef.current!.beginHttpRefresh()
    applyChatThreadListLoading()
    try {
      const threadList = await fetchChatThreads(
        MOBILE_HTTP_BASE_URL,
        actor.session.sessionToken
      )
      if (!isCurrentSession(actor) || !threadListRefreshGuardRef.current?.isCurrentHttpRefresh(requestRevision)) return
      applyChatThreadListed(threadList)
      const syncKey = `${actor.profile.userId}:${actor.session.sessionToken}`
      if (matchThreadSyncGateRef.current?.shouldStart(syncKey, Date.now())) {
        void fetchChatThreads(
          MOBILE_HTTP_BASE_URL,
          actor.session.sessionToken,
          fetch,
          undefined,
          { syncMatches: true }
        ).then((recovered) => {
          if (!isCurrentSession(actor) || recovered.userId !== actor.profile.userId) return
          const knownThreadIds = new Set(getThreads().map((thread) => thread.threadId))
          for (const thread of recovered.threads) {
            if (knownThreadIds.has(thread.threadId) || !thread.participantUserIds.includes(actor.profile.userId)) continue
            applyNewThread(thread)
            knownThreadIds.add(thread.threadId)
          }
        }).catch(() => { /* The readable Inbox remains available; retry on a later visit. */ })
      }
    } catch (error) {
      if (!isCurrentSession(actor) || !threadListRefreshGuardRef.current?.isCurrentHttpRefresh(requestRevision)) return
      const message = error instanceof Error
        ? error.message
        : "We could not refresh your chats yet."
      applyChatThreadListFailed(message)
      throw error
    }
  }, [applyNewThread, isCurrentSession])

  const reconcileConnectionDecisionDelivery = useCallback<
    NonNullable<ConnectionDecisionDeliveryDependencies["onDelivered"]>
  >(async (intent, response): Promise<void> => {
    const actor = sessionActor
    if (!actor) return
    if (response.match) {
      const connection = await recordMutualConnection({
        ownerUserId: actor.profile.userId,
        currentUserId: actor.profile.userId,
        participantUserIds: response.match.participantUserIds
      })
      if (!connection || !isCurrentSession(actor) || actor.session.mode !== "production") {
        return
      }
      const thread = await createThread(
        MOBILE_HTTP_BASE_URL,
        actor.session.sessionToken,
        { participantUserIds: response.match.participantUserIds }
      )
      if (!isCurrentSession(actor)) return
      applyNewThread(thread)
      presentConnectionMatch({
        hasPresented: (miniRoomId) => handledMatchIdsRef.current.has(miniRoomId),
        markPresented: (miniRoomId) => {
          handledMatchIdsRef.current = new Set([
            ...handledMatchIdsRef.current,
            miniRoomId
          ])
        },
        captureMatchCreated: () => {
          captureProductEvent("match_created", {
            source: "mini_room_mutual_save",
            mode: actor.session.mode
          })
        },
        showMatchToast: (toast) => {
          showToast({ ...toast, type: "success" })
        },
        showMatchModal: setGlobalMatch
      }, {
        miniRoomId: response.match.miniRoomId,
        matchedUserId: connection.userId,
        matchedUserName: connection.displayName,
        mode: actor.session.mode
      })
      return
    }
    if (intent.status === "saved" && isCurrentSession(actor)) {
      await updateSavedConnectionStatus({
        ownerUserId: actor.profile.userId,
        userId: intent.partnerUserId,
        status: "pending"
      })
    }
  }, [applyNewThread, isCurrentSession, sessionActor])

  const dismissGlobalMatch = useCallback((): void => {
    setGlobalMatch(null)
  }, [])

  const goLobby = useCallback((): void => {
    setGlobalMatch(null)
    if (navigationRef.isReady()) {
      navigationRef.navigate("Lobby")
    }
  }, [])

  const openReadyMiniRoom = useCallback(
    (
      payload: ReadyMiniRoomEvent["payload"],
      options: { allowReopen?: boolean } = {}
    ): void => {
      const actor = latestSessionActorRef.current
      if (!actor || !navigationRef.isReady()) return
      if (!payload.miniRoom.participantUserIds.includes(actor.profile.userId)) {
        return
      }
      if (
        !options.allowReopen &&
        handledReadyMiniRoomIdsRef.current.has(payload.miniRoom.miniRoomId)
      ) {
        return
      }

      const partner = payload.participants.find(
        (participant) => participant.userId !== actor.profile.userId
      )
      if (!partner) return

      handledReadyMiniRoomIdsRef.current = new Set([
        ...handledReadyMiniRoomIdsRef.current,
        payload.miniRoom.miniRoomId
      ])
      navigationRef.navigate("MiniRoom", {
        readyMiniRoom: {
          miniRoom: payload.miniRoom,
          mediaSession: payload.mediaSession
        },
        participants: {
          you: {
            userId: actor.profile.userId,
            displayName: actor.profile.displayName
          },
          partner: {
            userId: partner.userId,
            displayName: partner.displayName,
            avatarSnapshot: createCandidateAvatarSnapshot({
              userId: partner.userId,
              displayName: partner.displayName,
              avatarSelection: partner.avatar
            })
          }
        }
      })
    },
    []
  )

  const handleDemoRoomInviteAction = useCallback(
    async (action: ChatRoomInviteAction): Promise<void> => {
      const actor = latestSessionActorRef.current
      if (!actor || actor.session.mode !== "demo") {
        throw new Error("Blumi Room invitations are available in demo mode only.")
      }

      const currentUser = {
        userId: actor.profile.userId,
        displayName: actor.profile.displayName
      }
      const invite = demoRoomInviteAction(action, currentUser)
      if (!invite) {
        throw new Error("That demo room invitation is no longer available.")
      }

      if (
        (action.type === "accept" || action.type === "open_room") &&
        invite.status === "accepted" &&
        invite.roomSessionId
      ) {
        const partnerUserId = invite.senderUserId === actor.profile.userId
          ? invite.recipientUserId
          : invite.senderUserId
        const partnerProfile = DUMMY_PROFILES.find(
          (profile) => profile.userId === partnerUserId
        )
        const participants = [
          {
            userId: actor.profile.userId,
            displayName: actor.profile.displayName,
            avatar: {
              presetId: actor.profile.avatar?.presetId ?? "dusk"
            }
          },
          {
            userId: partnerUserId,
            displayName: partnerProfile?.displayName ?? "Blumi friend",
            avatar: {
              presetId: partnerProfile?.avatarPresetId ?? "dusk"
            }
          }
        ] as [MiniRoomParticipant, MiniRoomParticipant]
        const miniRoomId = invite.roomSessionId
        openReadyMiniRoom({
          miniRoom: {
            miniRoomId,
            lobbyRoomId: "demo-lobby",
            sourceThreadId: invite.threadId,
            participantUserIds: [actor.profile.userId, partnerUserId] as [string, string],
            livekitRoomName: miniRoomId
          },
          mediaSession: {
            miniRoomId,
            livekitUrl: "demo://local",
            token: createLocalDemoMediaSessionToken(),
            issuedAt: new Date().toISOString()
          },
          participants
        }, { allowReopen: true })
      }
    },
    [openReadyMiniRoom]
  )

  const chatCoordinator = useMemo(
    () => createChatCoordinator({
      hasMessageHistory,
      getSessionActor: () => latestSessionActorRef.current,
      isCurrentSession,
      setRoomInvites: (update) => {
        setRoomInvites((current) => update(current))
      },
      fetchThreadRoomInvites,
      sendThreadMessage,
      fetchThreadMessages,
      markThreadRead,
      createThreadRoomInvite,
      leaveActiveRoom,
      decideThreadRoomInvite,
      cancelThreadRoomInvite,
      joinRoomSession,
      applyChatMessageListed,
      applyChatMessageListLoading,
      applyChatMessageListFailed,
      confirmOptimisticMessage,
      markOptimisticMessageFailed,
      markLocalThreadRead,
      openReadyMiniRoom,
      captureProductEvent,
      showWarningToast: (toast) => {
        showToast({ ...toast, type: "warning" })
      },
      sendGlobal,
      baseHttpUrl: MOBILE_HTTP_BASE_URL
    }),
    [isCurrentSession, openReadyMiniRoom]
  )
  const {
    handleRoomInviteAction,
    closeMyActiveRoom,
    markChatThreadRead,
    requestMessages,
    sendChatMessage,
    upsertRoomInvite
  } = chatCoordinator

  const sendChatMessageForRoute = useCallback(async (
    threadId: string,
    body: string,
    clientMessageId: string
  ): Promise<void> => {
    const actor = latestSessionActorRef.current
    if (actor?.session.mode !== "demo") {
      return sendChatMessage(threadId, body, clientMessageId)
    }
    try {
      const message = demoSendMessage(threadId, actor.profile.userId, body, clientMessageId)
      confirmOptimisticMessage(clientMessageId, message, actor.profile.userId)
    } catch (error) {
      markOptimisticMessageFailed(clientMessageId)
      throw error
    }
  }, [sendChatMessage])

  const requestMessagesForRoute = useCallback(async (
    threadId: string,
    options?: FetchThreadMessagesOptions
  ): Promise<void> => {
    const actor = latestSessionActorRef.current
    if (actor?.session.mode !== "demo") {
      return requestMessages(threadId, options)
    }
    applyChatMessageListed({
      userId: actor.profile.userId,
      threadId,
      messages: getDemoMessages(threadId)
    })
  }, [requestMessages])

  const warmThreadMessagesForInbox = useCallback((threadId: string): Promise<void> => {
    if (latestSessionActorRef.current?.session.mode !== "production") return Promise.resolve()
    return requestMessages(threadId, {}, { purpose: "prefetch" }).catch(() => undefined)
  }, [requestMessages])

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

  const goChat = useCallback(
    (params: { threadId?: string; partnerId?: string; partnerName?: string }): void => {
      setGlobalMatch(null)
      if (navigationRef.isReady()) {
        navigationRef.navigate("ChatThread", {
          ...params,
          sendChatMessage: sendChatMessageForRoute,
          requestMessages: requestMessagesForRoute,
          markThreadRead: markChatThreadRead,
          roomInvites: visibleRoomInvites,
          onRoomInviteAction: sessionActor?.session.mode === "demo"
            ? handleDemoRoomInviteAction
            : handleRoomInviteAction,
          onCloseActiveRoom: sessionActor?.session.mode === "production"
            ? closeMyActiveRoom
            : undefined,
          locale: chatLocale
        })
      }
    },
    [
      chatLocale,
      closeMyActiveRoom,
      handleDemoRoomInviteAction,
      handleRoomInviteAction,
      markChatThreadRead,
      requestMessagesForRoute,
      sendChatMessageForRoute,
      sessionActor?.session.mode,
      visibleRoomInvites
    ]
  )

  const handleNotificationResponseData = useCallback((data: unknown, expectedActor: SessionActor): boolean => {
    if (
      expectedActor.session.mode !== "production" ||
      sessionEntryRoute !== "Main" ||
      isAccountRestricted ||
      !isCurrentSession(expectedActor) ||
      !navigationRef.isReady()
    ) return false
    const destination = resolveNotificationDestination(data)
    if (!destination) return false
    if (destination.route === "ChatThread") {
      navigationRef.navigate("ChatThread", destination.params)
      return true
    }
    navigationRef.navigate(destination.route)
    return true
  }, [isAccountRestricted, isCurrentSession, sessionEntryRoute])

  const pushRegistration = usePushRegistration(
    sessionEntryRoute === "Main" && !isAccountRestricted ? sessionActor : null,
    handleNotificationResponseData,
    navigationReadyGeneration
  )

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
  const resetInactiveSessionState = useCallback((): void => {
    if (isDemoMode()) setDemoMode(false)
    handledMatchIdsRef.current = new Set()
    reconcilingMatchIdsRef.current = new Set()
    handledReadyMiniRoomIdsRef.current = new Set()
    setGlobalMatch(null)
    setRoomInvites([])
    resetChatStore()
    disconnectGlobal()
  }, [])

  const realtimeSessionIdentity = getGlobalRealtimeLifecycleIdentity(sessionActor)
  const realtimeSessionCallbacksRef = useRef({ clearSessionActor, refreshAccountModeration, resynchronizeMessages: chatCoordinator.resynchronizeMessages })
  realtimeSessionCallbacksRef.current = { clearSessionActor, refreshAccountModeration, resynchronizeMessages: chatCoordinator.resynchronizeMessages }

  useEffect(() => createGlobalRealtimeLifecycle({
    sessionActor,
    isMainRoute: sessionEntryRoute === "Main",
    isAccountRestricted,
    isCurrentSession,
    isDemoMode,
    setDemoMode,
    resetInactiveSessionState,
    refreshProductionThreads,
    resynchronizeActiveConversation: () => {
      const route = navigationRef.getCurrentRoute()
      const threadId = route?.name === "ChatThread"
        ? (route.params as RootStackParamList["ChatThread"] | undefined)?.threadId
        : route?.name === "MiniRoom"
          ? (route.params as RootStackParamList["MiniRoom"] | undefined)?.readyMiniRoom.miniRoom.sourceThreadId
          : undefined
      return threadId ? realtimeSessionCallbacksRef.current.resynchronizeMessages(threadId) : Promise.resolve()
    },
    hydrateBlockedUsersFromServer,
    connectGlobal,
    disconnectGlobal,
    sendGlobal,
    subscribeToStatus,
    applyChatThreadListed,
    getThreads,
    isRealtimeAuthInvalidClose,
    clearSessionActor: () => realtimeSessionCallbacksRef.current.clearSessionActor(),
    refreshAccountModeration: () => realtimeSessionCallbacksRef.current.refreshAccountModeration(),
    showWarningToast: (toast) => {
      showToast({ ...toast, type: "warning" })
    },
    wsBaseUrl: MOBILE_WS_BASE_URL,
    httpBaseUrl: MOBILE_HTTP_BASE_URL
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  })(), [
    isAccountRestricted,
    refreshProductionThreads,
    resetInactiveSessionState,
    realtimeSessionIdentity,
    sessionEntryRoute
  ])

  // ── Chat + match event routing ──────────────────────────
  const handleRealtimeConnectionMatch = useCallback(
    (payload: ConnectionMatchedPayload): void => {
      const actor = sessionActor
      if (!actor) return

      reconcilingMatchIdsRef.current = new Set([
        ...reconcilingMatchIdsRef.current,
        payload.miniRoomId
      ])
      void reconcileRealtimeConnectionMatch(payload, actor, {
        getCurrentSessionActor: () => latestSessionActorRef.current,
        recordMutualConnection,
        hydrateFromServer,
        createThread,
        applyChatThreadCreated: applyNewThread,
        presentMatch: (match) => {
          presentConnectionMatch({
            hasPresented: (miniRoomId) => handledMatchIdsRef.current.has(miniRoomId),
            markPresented: (miniRoomId) => {
              handledMatchIdsRef.current = new Set([
                ...handledMatchIdsRef.current,
                miniRoomId
              ])
            },
            captureMatchCreated: () => {
              captureProductEvent("match_created", {
                source: "mini_room_mutual_save",
                mode: match.mode
              })
            },
            showMatchToast: (toast) => {
              showToast({ ...toast, type: "success" })
            },
            showMatchModal: setGlobalMatch
          }, match)
        },
        httpBaseUrl: MOBILE_HTTP_BASE_URL
      })
        .catch(() => undefined)
        .finally(() => {
          reconcilingMatchIdsRef.current = new Set(
            [...reconcilingMatchIdsRef.current].filter(
              (miniRoomId) => miniRoomId !== payload.miniRoomId
            )
          )
        })
    },
    [applyNewThread, hydrateFromServer, sessionActor]
  )

  const handleGlobalEvent = useMemo(
    () => createGlobalRealtimeEventHandler({
      currentUserId: sessionActor?.profile.userId,
      getMatchDeduplicationState: () => ({
        handledMatchIds: handledMatchIdsRef.current,
        reconcilingMatchIds: reconcilingMatchIdsRef.current
      }),
      normalizeRoomInviteRecord,
      upsertRoomInvite,
      applyChatThreadListed: applyRealtimeThreadList,
      applyChatThreadRead,
      requestThreadPage: (cursor) => sendGlobal({ type: "chat.list_threads", payload: { cursor } }),
      requestThreadRefresh: () => { void refreshProductionThreads().catch(() => { /* Refresh already published its visible error state. */ }) },
      applyChatThreadCreated: applyNewThread,
      applyChatMessageListed,
      applyChatMessageReceived,
      getThreads,
      openReadyMiniRoom,
      onConnectionMatched: handleRealtimeConnectionMatch,
      showIncomingMessageToast: (toast) => {
        showToast({ ...toast, type: "info" })
      }
    }),
    [
      handleRealtimeConnectionMatch,
      applyNewThread,
      applyRealtimeThreadList,
      refreshProductionThreads,
      openReadyMiniRoom,
      sessionActor?.profile.userId,
      upsertRoomInvite
    ]
  )

  useGlobalRealtimeEvents(handleGlobalEvent)

  const shouldShowBootPrelude =
    sessionEntryRoute === "Splash" ||
    (shouldWaitForPreAuthDraftHydration(sessionEntryRoute) &&
      isPreAuthDraftHydrating) ||
    (shouldGateOnboardingBootPrelude(sessionEntryRoute) &&
      !isBootPreludeReady)

  if (shouldShowBootPrelude) {
    return <BlumiLoadingScreen onPreludeReady={handleBootPreludeReady} />
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
        fallback={<ActivityIndicator color="#F26779" />}
        onReady={handleNavigationReady}
        onStateChange={syncCurrentRouteName}
      >
        <Stack.Navigator
          screenListeners={screenListeners}
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
                options={{ headerShown: false }}
              />
            </>
          ) : sessionEntryRoute === "Main" && sessionActor ? (
            <>
              <Stack.Screen
                name="Lobby"
                options={{
                  ...MAIN_TAB_SCREEN_OPTIONS,
                  ...reducedMotionScreenOptions,
                  title: "Discover"
                }}
              >
                {() => (
                  <LobbyScreen
                    sessionActor={sessionActor}
                    onResetSession={clearSessionActor}
                    onUpdateDiscoveryPreferences={(discoveryPreferences) =>
                      updateSessionProfile({
                        displayName: sessionActor.profile.displayName,
                        discoveryPreferences
                      })
                    }
                  />
                )}
              </Stack.Screen>
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
                options={{ headerShown: false }}
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
                name="Inbox"
                options={{ ...MAIN_TAB_SCREEN_OPTIONS, ...reducedMotionScreenOptions }}
              >
                {(screenProps) => (
                  <InboxScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onRetryThreads={refreshProductionThreads}
                    onWarmThread={warmThreadMessagesForInbox}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="MyRoom"
                options={{ ...MAIN_TAB_SCREEN_OPTIONS, ...reducedMotionScreenOptions }}
              >
                {(screenProps) => (
                  <myRoomScreenBundle.DeferredScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    resolvedCapabilities={resolvedCapabilities}
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
                options={{ headerShown: false }}
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
                options={{
                  headerShown: false,
                  animation: reduceMotion ? "none" : "simple_push",
                  animationDuration: 240
                }}
              >
                {(screenProps) => (
                  <ChatThreadScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onThreadCreated={applyNewThread}
                    route={{
                      ...screenProps.route,
                      params: {
                        ...screenProps.route.params,
                        sendChatMessage: sendChatMessageForRoute,
                        requestMessages: requestMessagesForRoute,
                        markThreadRead: markChatThreadRead,
                        roomInvites: visibleRoomInvites,
                        onRoomInviteAction: sessionActor?.session.mode === "demo"
                          ? handleDemoRoomInviteAction
                          : handleRoomInviteAction,
                        onCloseActiveRoom: sessionActor?.session.mode === "production"
                          ? closeMyActiveRoom
                          : undefined,
                        locale: chatLocale
                      }
                    }}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="MatchResult"
                options={{ headerShown: false }}
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
                options={{ headerShown: false }}
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
                name="CosmeticShop"
                options={{ ...MAIN_TAB_SCREEN_OPTIONS, ...reducedMotionScreenOptions }}
              >
                {(screenProps) => (
                  <cosmeticShopScreenBundle.DeferredScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    roomFurnitureCatalog={undefined}
                    qaOnlyOwnedRoomItemIds={[]}
                    isRoomCatalogQaPreview={false}
                    isFullShopCatalogQaPreview={IS_FULL_SHOP_CATALOG_QA_PREVIEW}
                    initialShopMode={undefined}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="ProfileEdit"
                options={{ headerShown: false }}
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
                options={{ headerShown: false }}
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
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="Legal"
                component={legalScreenBundle.DeferredScreen}
                options={{ headerShown: false }}
              />
            </>
          ) : sessionEntryRoute === "Welcome" ? (
            <Stack.Screen
              name="Welcome"
              options={{ headerShown: false }}
            >
              {() => (
                <WelcomeScreen
                  isSubmitting={isBootstrapping}
                  errorMessage={errorMessage}
                  onComplete={completeIntro}
                />
              )}
            </Stack.Screen>
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
                options={{ headerShown: false }}
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
            onClose={dismissGlobalMatch}
            onKeepDiscovering={goLobby}
            onSendMessage={() => {
              if (!globalMatch?.matchedUserId) {
                goLobby()
                return
              }

              const thread = findThreadForPartner(globalMatch.matchedUserId)
              if (thread) {
                goChat({ threadId: thread.threadId })
              } else {
                // Thread not synced yet, navigate with partner intent
                goChat({
                  partnerId: globalMatch.matchedUserId,
                  partnerName: globalMatch.matchedUserName
                })
              }
            }}
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
