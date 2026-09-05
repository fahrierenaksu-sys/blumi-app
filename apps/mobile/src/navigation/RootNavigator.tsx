import type {
  DiscoveryDecisionQuota,
  MediaSessionToken,
  MiniRoom,
  MiniRoomParticipant
, ServerEvent } from "@blumi/contracts"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  createNavigationContainerRef,
  NavigationContainer,
  type LinkingOptions
} from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  View
} from "react-native"
import { MatchResultModal } from "../components/MatchResultModal"
import type { CandidateAvatarSnapshot } from "../components/DiscoverCard"
import { createCandidateAvatarSnapshot } from "../features/avatarV2/candidateAvatarSnapshot"
import {
  demoRoomInviteAction,
  isDemoMode,
  setDemoMode,
  useDemoStore
} from "../features/demo/demoStore"
import { DUMMY_PROFILES } from "../features/demo/dummyProfiles"
import {
  BLUMI_BUILD_PROFILE,
  BLUMI_DEV_ENTRY_ROUTE,
  BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG,
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
import {
  cancelThreadRoomInvite,
  createThreadRoomInvite,
  decideThreadRoomInvite,
  fetchThreadRoomInvites,
  joinRoomSession,
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
  useChatStore
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
import { createGlobalRealtimeLifecycle } from "../features/realtime/globalRealtimeLifecycle"
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
import { getAvatarV2StorageKey } from "../features/avatarV2/avatarV2Persistence"
import { RoomV2Provider } from "../features/roomV2/state/RoomV2Provider"
import type { UserRoomDecor } from "../features/roomV2/roomV2.types"
import { getRoomV2StorageKey } from "../features/roomV2/roomV2Persistence"
import { AccountRestrictionScreen } from "../screens/AccountRestrictionScreen"
import type { SessionActor } from "../features/session/sessionModel"
import { useSessionState } from "../features/session/useSessionState"
import { selectSessionEntryRoute } from "../features/session/sessionRouting"
import type {
  RegisterAccountInput,
  UpdateSessionProfileInput
} from "../features/session/sessionApi"
import {
  createPreAuthOnboardingDraft,
  type PreAuthOnboardingDraft
} from "../features/session/preAuthOnboardingDraft"
import {
  createPreAuthOnboardingDraftStorage,
  getPreAuthOnboardingDraftScope,
  resolvePreAuthOnboardingDraftId,
  type PreAuthOnboardingDraftSnapshot,
  type PreAuthOnboardingResumeStep
} from "../features/session/preAuthOnboardingStorage"
import {
  getOnboardingScreenMode,
  shouldGateOnboardingBootPrelude,
  shouldWaitForPreAuthDraftHydration,
  getUnauthenticatedNavigatorInitialRoute,
  getSessionNavigatorKey
} from "../features/session/onboardingFlowModel"
import {
  getBottomNavKeyForRoute,
  getChatLocale,
  getOnboardingEntryRoute,
  MAIN_TAB_SCREEN_OPTIONS,
  ROOT_STACK_SCREEN_OPTIONS
} from "./rootNavigationModel"
import { uiTheme } from "../ui/theme"
import { ToastContainer, showToast } from "../ui/toast"
import { BlumiLoadingScreen } from "../ui/BlumiLoadingScreen"
import { markOnboardingContentReady } from "../features/session/nativeOnboardingBootBridge"
import { BottomNav, type BottomNavKey } from "../ui/bottomNav"
import type { BlumiMatch } from "../features/matches/matchRoomModel"
import { usePushRegistration } from "../features/notifications/usePushRegistration"
import { resolveNotificationDestination } from "../features/notifications/notificationRouting"
import { useInventoryStore } from "../features/inventory/inventoryStore"
import { shouldHydrateProductionInventory } from "../features/inventory/inventoryHydrationPolicy"
import { captureProductEvent } from "../analytics/productAnalytics"
import { getRevenueCatCoinPackClient } from "../features/commerce/revenueCatRuntimeClient"
import { ConnectionBanner } from "../ui/connectionBanner"
import { parseReferralCodeFromUrl } from "../features/referrals/referralModel"
import { capturePendingReferral } from "../features/referrals/referralStorage"
import { LinkedProfileScreen } from "./LinkedProfileScreen"
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
    locale?: ChatLocale
  }
  MatchResult: {
    match: BlumiMatch
  }
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["blumi://"],
  config: {
    screens: {
      Lobby: "discover",
      Inbox: "inbox",
      ChatThread: "chat/:threadId",
      ProfilePreview: "profile/:userId",
      Settings: "settings",
      MyRoom: "room",
      MyRoomEditor: "room/edit",
      WardrobeV2: "wardrobe",
      CosmeticShop: "shop"
    }
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL()
    if (!url) return url
    const referralCode = parseReferralCodeFromUrl(url)
    if (!referralCode) return url
    await capturePendingReferral({ code: referralCode })
    captureProductEvent("referral_link_opened", { source: "initial_url" })
    return null
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const referralCode = parseReferralCodeFromUrl(url)
      if (referralCode) {
        void capturePendingReferral({ code: referralCode })
        captureProductEvent("referral_link_opened", { source: "app_link" })
        return
      }
      listener(url)
    })
    return () => subscription.remove()
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const navigationRef = createNavigationContainerRef<RootStackParamList>()

function createLocalDemoMediaSessionToken(): string {
  return "demo-session"
}
const preAuthDraftStorage = createPreAuthOnboardingDraftStorage<
  UpdateSessionProfileInput,
  UserAvatar,
  UserRoomDecor
>({
  store: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key)
  }
})
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

function scheduleDeferredMaintenance(work: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === "function") {
    const idleId = globalThis.requestIdleCallback(work, { timeout: 5_000 })
    return () => globalThis.cancelIdleCallback?.(idleId)
  }

  const timeoutId = setTimeout(work, 5_000)
  return () => clearTimeout(timeoutId)
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
  const [preAuthDraft, setPreAuthDraft] = useState<
    PreAuthOnboardingDraft<
      UpdateSessionProfileInput,
      UserAvatar,
      UserRoomDecor
    >
  >(() => createPreAuthOnboardingDraft())
  const preAuthDraftSnapshotRef = useRef<PreAuthOnboardingDraftSnapshot<
    UpdateSessionProfileInput,
    UserAvatar,
    UserRoomDecor
  > | null>(null)
  const [preAuthDraftSnapshot, setPreAuthDraftSnapshot] = useState(
    preAuthDraftSnapshotRef.current
  )
  const [isPreAuthDraftHydrating, setIsPreAuthDraftHydrating] = useState(true)
  const [isBootPreludeReady, setIsBootPreludeReady] = useState(false)
  const handleBootPreludeReady = useCallback(() => {
    setIsBootPreludeReady(true)
  }, [])
  const preAuthDraftAttemptIdRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )
  const [preAuthDraftGeneration, setPreAuthDraftGeneration] = useState(0)
  const preAuthDraftId = resolvePreAuthOnboardingDraftId(
    preAuthDraftSnapshot?.draftId,
    preAuthDraftAttemptIdRef.current,
    preAuthDraftGeneration
  )
  const preAuthDraftScopeId = getPreAuthOnboardingDraftScope(preAuthDraftId)
  const persistPreAuthDraft = useCallback(async (
    nextDraft: PreAuthOnboardingDraft<
      UpdateSessionProfileInput,
      UserAvatar,
      UserRoomDecor
    >,
    resumeStep: PreAuthOnboardingResumeStep
  ): Promise<void> => {
    const snapshot = await preAuthDraftStorage.save(
      nextDraft,
      resumeStep,
      preAuthDraftSnapshotRef.current ?? { draftId: preAuthDraftId }
    )
    preAuthDraftSnapshotRef.current = snapshot
    setPreAuthDraftSnapshot(snapshot)
    setPreAuthDraft(snapshot.draft)
  }, [preAuthDraftId])
  const clearPreAuthDraft = useCallback(async (): Promise<void> => {
    const keys = [
      getAvatarV2StorageKey(preAuthDraftScopeId),
      getRoomV2StorageKey(preAuthDraftScopeId)
    ].filter((key): key is string => Boolean(key))
    await Promise.all([
      AsyncStorage.multiRemove(keys),
      preAuthDraftStorage.clear()
    ])
    preAuthDraftSnapshotRef.current = null
    setPreAuthDraftSnapshot(null)
    setPreAuthDraft(createPreAuthOnboardingDraft())
    setPreAuthDraftGeneration((generation) => generation + 1)
  }, [preAuthDraftScopeId])

  useEffect(() => {
    let active = true
    void preAuthDraftStorage.load()
      .then((snapshot) => {
        if (!active || snapshot === null) return
        preAuthDraftSnapshotRef.current = snapshot
        setPreAuthDraftSnapshot(snapshot)
        setPreAuthDraft(snapshot.draft)
      })
      .catch(() => preAuthDraftStorage.clear())
      .finally(() => {
        if (active) setIsPreAuthDraftHydrating(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (isPreAuthDraftHydrating) return
    const currentKeys = new Set([
      getAvatarV2StorageKey(preAuthDraftScopeId),
      getRoomV2StorageKey(preAuthDraftScopeId)
    ].filter((key): key is string => Boolean(key)))
    const cancelDeferredCleanup = scheduleDeferredMaintenance(() => {
      void AsyncStorage.getAllKeys()
        .then((keys) => keys.filter(
          (key) => key.includes("preauth-onboarding-draft") && !currentKeys.has(key)
        ))
        .then((staleKeys) => staleKeys.length > 0
          ? AsyncStorage.multiRemove(staleKeys)
          : undefined)
        .catch(() => undefined)
    })
    return cancelDeferredCleanup
  }, [isPreAuthDraftHydrating, preAuthDraftScopeId])
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
  const [currentRouteName, setCurrentRouteName] = useState<
    keyof RootStackParamList | undefined
  >()
  const { totalUnreadCount } = useChatStore()
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
  const chatLocale = getChatLocale(Intl.DateTimeFormat().resolvedOptions().locale)

  useEffect(() => {
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
    const actor = sessionActor
    if (actor?.session.mode !== "production") return
    applyChatThreadListLoading()
    try {
      const threadList = await fetchChatThreads(
        MOBILE_HTTP_BASE_URL,
        actor.session.sessionToken
      )
      if (!isCurrentSession(actor)) return
      applyChatThreadListed(threadList)
    } catch (error) {
      if (!isCurrentSession(actor)) return
      const message = error instanceof Error
        ? error.message
        : "We could not refresh your chats yet."
      applyChatThreadListFailed(message)
      throw error
    }
  }, [isCurrentSession, sessionActor])

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
      applyChatThreadCreated(thread)
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
  }, [isCurrentSession, sessionActor])

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
      if (!sessionActor || !navigationRef.isReady()) return
      if (!payload.miniRoom.participantUserIds.includes(sessionActor.profile.userId)) {
        return
      }
      if (
        !options.allowReopen &&
        handledReadyMiniRoomIdsRef.current.has(payload.miniRoom.miniRoomId)
      ) {
        return
      }

      const partner = payload.participants.find(
        (participant) => participant.userId !== sessionActor.profile.userId
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
            userId: sessionActor.profile.userId,
            displayName: sessionActor.profile.displayName
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
    [sessionActor]
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
              presetId: "dusk"
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
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [isCurrentSession, openReadyMiniRoom, sessionActor]
  )
  const {
    handleRoomInviteAction,
    markChatThreadRead,
    requestMessages,
    sendChatMessage,
    upsertRoomInvite
  } = chatCoordinator

  const syncCurrentRouteName = useCallback((): void => {
    setCurrentRouteName(
      navigationRef.getCurrentRoute()?.name as keyof RootStackParamList | undefined
    )
  }, [])

  const handleNavigationReady = useCallback((): void => {
    setIsNavigationReady(true)
    setNavigationReadyGeneration((generation) => generation + 1)
    syncCurrentRouteName()
    if (sessionEntryRoute !== "AuthEntry") {
      markOnboardingContentReady()
    }
  }, [sessionEntryRoute, syncCurrentRouteName])

  const handleBottomNavPress = useCallback((key: BottomNavKey): void => {
    setGlobalMatch(null)
    if (!navigationRef.isReady()) return
    if (key === "discover") {
      navigationRef.navigate("Lobby")
    } else if (key === "chats") {
      navigationRef.navigate("Inbox")
    } else if (key === "myroom") {
      navigationRef.navigate("MyRoom")
    } else if (key === "shop") {
      navigationRef.navigate("CosmeticShop")
    }
  }, [])

  const goChat = useCallback(
    (params: { threadId?: string; partnerId?: string; partnerName?: string }): void => {
      setGlobalMatch(null)
      if (navigationRef.isReady()) {
        navigationRef.navigate("ChatThread", {
          ...params,
          sendChatMessage,
          requestMessages,
          markThreadRead: markChatThreadRead,
          roomInvites: visibleRoomInvites,
          onRoomInviteAction: sessionActor?.session.mode === "demo"
            ? handleDemoRoomInviteAction
            : handleRoomInviteAction,
          locale: chatLocale
        })
      }
    },
    [
      chatLocale,
      handleDemoRoomInviteAction,
      handleRoomInviteAction,
      markChatThreadRead,
      requestMessages,
      sendChatMessage,
      sessionActor?.session.mode,
      visibleRoomInvites
    ]
  )

  const handleNotificationResponseData = useCallback((data: unknown): void => {
    if (!navigationRef.isReady()) return
    const destination = resolveNotificationDestination(data)
    if (!destination) return
    if (destination.route === "ChatThread") {
      navigationRef.navigate("ChatThread", destination.params)
      return
    }
    navigationRef.navigate(destination.route)
  }, [])

  const pushRegistration = usePushRegistration(
    sessionEntryRoute === "Main" && !isAccountRestricted ? sessionActor : null,
    handleNotificationResponseData
  )

  useEffect(() => {
    if (
      !sessionActor ||
      !shouldHydrateProductionInventory(
        sessionActor.session.mode,
        sessionActor.session.onboarding
      )
    ) return
    let active = true
    const sessionToken = sessionActor.session.sessionToken
    void hydrateFromServer(sessionToken).then((hydrated) => {
      if (!active || !hydrated.success) return
      return claimDailyRewardFromServer(sessionToken).then((rewardCoins) => {
        if (!active || !rewardCoins) return
        const rewardBody = sessionActor.session.onboarding.completedAt
          ? "A little something for your next vibe."
          : "Your first vibe starts with a little extra."
        showToast({
          title: `Daily reward: +${rewardCoins} coins`,
          body: rewardBody,
          type: "success",
          durationMs: 4000
        })
      })
    })
    return () => {
      active = false
    }
  }, [claimDailyRewardFromServer, hydrateFromServer, sessionActor])

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

  useEffect(() => createGlobalRealtimeLifecycle({
    sessionActor,
    isMainRoute: sessionEntryRoute === "Main",
    isAccountRestricted,
    isCurrentSession,
    isDemoMode,
    setDemoMode,
    resetInactiveSessionState,
    refreshProductionThreads,
    hydrateBlockedUsersFromServer,
    connectGlobal,
    disconnectGlobal,
    sendGlobal,
    subscribeToStatus,
    applyChatThreadListed,
    getThreads,
    isRealtimeAuthInvalidClose,
    clearSessionActor,
    refreshAccountModeration,
    showWarningToast: (toast) => {
      showToast({ ...toast, type: "warning" })
    },
    wsBaseUrl: MOBILE_WS_BASE_URL,
    httpBaseUrl: MOBILE_HTTP_BASE_URL
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  })(), [
    clearSessionActor,
    isAccountRestricted,
    refreshAccountModeration,
    refreshProductionThreads,
    resetInactiveSessionState,
    sessionActor,
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
        applyChatThreadCreated,
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
    [hydrateFromServer, sessionActor]
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
      applyChatThreadListed,
      applyChatThreadRead,
      requestThreadPage: (cursor) => sendGlobal({ type: "chat.list_threads", payload: { cursor } }),
      requestThreadRefresh: () => { void refreshProductionThreads().catch(() => { /* Refresh already published its visible error state. */ }) },
      applyChatThreadCreated,
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

  const currentBottomNavKey = sessionEntryRoute === "Main" && sessionActor
    ? getBottomNavKeyForRoute(currentRouteName)
    : null
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
          key={
            isAccountRestricted
              ? `restricted:${sessionActor?.profile.userId ?? "no-session"}`
              : getSessionNavigatorKey(sessionEntryRoute, sessionActor?.profile.userId)
          }
          initialRouteName={
            isAccountRestricted
              ? "AccountRestriction"
              : sessionEntryRoute === "AuthEntry"
                ? getUnauthenticatedNavigatorInitialRoute()
                : onboardingEntryRoute ?? undefined
          }
          screenOptions={{
            ...ROOT_STACK_SCREEN_OPTIONS,
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
                options={{ ...MAIN_TAB_SCREEN_OPTIONS, title: "Discover" }}
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
                options={{ headerShown: false }}
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
                options={MAIN_TAB_SCREEN_OPTIONS}
              >
                {(screenProps) => (
                  <InboxScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    onRetryThreads={refreshProductionThreads}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen
                name="MyRoom"
                options={MAIN_TAB_SCREEN_OPTIONS}
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
                options={{ headerShown: false }}
              >
                {(screenProps) => (
                  <ChatThreadScreen
                    {...screenProps}
                    sessionActor={sessionActor}
                    route={{
                      ...screenProps.route,
                      params: {
                        ...screenProps.route.params,
                        sendChatMessage,
                        requestMessages,
                        markThreadRead: markChatThreadRead,
                        roomInvites: visibleRoomInvites,
                        onRoomInviteAction: sessionActor?.session.mode === "demo"
                          ? handleDemoRoomInviteAction
                          : handleRoomInviteAction,
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
                options={MAIN_TAB_SCREEN_OPTIONS}
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
                    options={{ headerShown: false, animation: "fade" }}
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
                options={{ headerShown: false, animation: "fade" }}
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
                options={{ headerShown: false, animation: "fade" }}
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
                options={{ headerShown: false, animation: "fade" }}
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
      {currentBottomNavKey && !isAccountRestricted ? (
        <BottomNav
          currentKey={currentBottomNavKey}
          chatCount={chatBadgeCount}
          onPress={handleBottomNavPress}
          appearance={currentBottomNavKey === "discover" ? "ambient" : "default"}
        />
      ) : null}
      <ToastContainer />
    </View>
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
