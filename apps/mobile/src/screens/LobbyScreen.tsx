import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import Ionicons from "@expo/vector-icons/Ionicons"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData
} from "@tanstack/react-query"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import {
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { IncomingInviteCallout } from "../components/IncomingInviteCallout"
import {
  CandidateAvatarPreview,
  createCandidateAvatarSnapshot
} from "../components/DiscoverCard"
import { useBlockStore } from "../features/safety/blockStore"
import {
  DiscoverFiltersBottomSheet,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilters
} from "../components/DiscoverFiltersBottomSheet"
import {
  skipDiscoveryCandidate,
  useSavedConnections
} from "../features/connections/savedConnectionsStore"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import {
  createMatchFromDiscoveryResult,
  activateDiscoveryWatch,
  cancelDiscoveryWatch,
  decideDiscoverProfile,
  DiscoveryDecisionQuotaExhaustedError,
  DiscoveryCursorResetError,
  isDiscoveryWatchActive,
  type DiscoveryPageResult
} from "../features/discovery/discoveryApi"
import type {
  DiscoveryDecisionQuota,
  DiscoveryPreferences
} from "@blumi/contracts"
import {
  applyOptimisticDiscoveryDecision,
  applyProductionDetailDecision,
  beginInFlightDiscoveryDecision,
  finishInFlightDiscoveryDecision,
  rollbackOptimisticDiscoveryDecision
} from "../features/discovery/discoveryDeckModel"
import {
  buildAvailableDiscoveryCandidates,
  createLiveDiscoveryCandidate,
  createProductionDiscoveryCandidate,
  isLiveInviteAvailable,
  type DiscoveryCandidate
} from "../features/discovery/discoveryCandidateModel"
import { runDiscoveryRefresh } from "../features/discovery/discoveryRefreshModel"
import {
  countActiveDiscoverFilters
} from "../features/discovery/lobbyPresentationModel"
import {
  clearLocalDiscoveryFiltersFallback,
  loadDiscoveryFilters,
  loadLocalDiscoveryFiltersFallback,
  persistDiscoveryFilters,
  persistLocalDiscoveryFiltersFallback,
  resolveDiscoveryFiltersForFocus
} from "../features/discovery/discoveryFiltersModel"
import {
  buildDiscoveryPageQueryKey,
  buildDiscoveryWatchQueryKey,
  createDiscoveryPageQueryOptions,
  createDiscoveryWatchQueryOptions,
  flattenDiscoveryPages
} from "../features/discovery/discoveryQueryOptions"
import { getDiscoveryErrorMessageForDisplay } from "../features/discovery/discoveryErrorCopy"
import { useLobbyFlow } from "../features/lobby/useLobbyFlow"
import {
  loadPendingInvitesForUser,
  recordPendingInviteForUser,
  replacePendingInvitesForUser,
  type PendingInviteMemory
} from "../features/lobby/pendingInvitesStore"
import type { SessionActor } from "../features/session/sessionModel"
import type {
  MiniRoomParticipantsRouteParam,
  RootStackParamList
} from "../navigation/RootNavigator"
import { SoftBlobBackground } from "../ui/backgrounds"
import { uiTheme } from "../ui/theme"
import { DemoLobbyView } from "./DemoLobbyView"
import { showToast } from "../ui/toast"
import { captureProductEvent } from "../analytics/productAnalytics"
import { useInventoryStore } from "../features/inventory/inventoryStore"
import { DiscoveryDeckView } from "../features/discovery/DiscoveryDeckView"
import {
  DiscoverErrorCard,
  EmptyDiscoveryDeck,
  LoadingDiscoveryDeck
} from "../features/discovery/EmptyDiscoveryDeck"
import { useAppViewportMetrics } from "../ui/layout/useAppViewportMetrics"

interface LobbyScreenProps {
  sessionActor: SessionActor
  onResetSession: () => Promise<void>
  onUpdateDiscoveryPreferences?: (
    preferences: DiscoveryPreferences
  ) => Promise<void>
}

const PENDING_INVITE_TTL_MS = 30_000

type DiscoverFeedbackTone = "soft" | "warm"

interface DiscoverFeedback {
  id: number
  text: string
  tone: DiscoverFeedbackTone
}

export function LobbyScreen(props: LobbyScreenProps) {
  const { sessionActor, onResetSession, onUpdateDiscoveryPreferences } = props
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "Lobby">>()
  const queryClient = useQueryClient()
  const viewportMetrics = useAppViewportMetrics({ bottomNavVisible: true })
  const lastNavigatedMiniRoomIdRef = useRef<string | null>(null)

  const handleInvalidSession = useCallback(() => {
    void onResetSession()
  }, [onResetSession])

  const {
    connectionStatus,
    lobbyState,
    nearbyUsers,
    incomingInvite,
    readyMiniRoom,
    clearReadyMiniRoom,
    sendInvite,
    decideInvite,
    requestRefresh
  } = useLobbyFlow({
    sessionActor,
    onInvalidSession: handleInvalidSession
  })

  const myUserId = sessionActor.profile.userId
  const myDisplayName = sessionActor.profile.displayName
  const myAvatarSnapshot = useMemo(() => createCandidateAvatarSnapshot({
    userId: myUserId,
    displayName: myDisplayName,
    avatarSelection: sessionActor.profile.avatar
  }), [myDisplayName, myUserId, sessionActor.profile.avatar])
  const isDemoSession = sessionActor.session.mode === "demo"
  const isProductionDiscovery = sessionActor.session.mode === "production"
  const { saved: savedConnections, skipped: skippedConnections } = useSavedConnections(
    sessionActor.profile.userId
  )
  const {
    blockedUserIds,
    isBlocked: isUserBlocked,
    isReady: isSafetyListReady
  } = useBlockStore(
    sessionActor.profile.userId,
    sessionActor.session.mode === "production"
  )
  const { hydrateFromServer } = useInventoryStore(
    sessionActor.profile.userId,
    sessionActor.session.mode === "production"
  )
  const blockedUserKey = blockedUserIds.join("|")
  const [seenThisSessionUserIds, setSeenThisSessionUserIds] = useState<Set<string>>(
    () => new Set()
  )
  const [discoveryWatchBusy, setDiscoveryWatchBusy] = useState(false)
  const [inFlightDecisionUserIds, setInFlightDecisionUserIds] =
    useState<ReadonlySet<string>>(() => new Set())
  const inFlightDecisionUserIdsRef = useRef<ReadonlySet<string>>(new Set())
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS)
  const [filtersReadyForUserId, setFiltersReadyForUserId] = useState<string | null>(null)
  const filterPreferencesGenerationRef = useRef(0)
  const localFiltersFallbackRef = useRef<DiscoverFilters | null>(null)
  const filtersReady = filtersReadyForUserId === sessionActor.profile.userId
  const productionDiscoveryQueryKey = useMemo(
    () => buildDiscoveryPageQueryKey({
      baseHttpUrl: MOBILE_HTTP_BASE_URL,
      userId: sessionActor.profile.userId,
      filters,
      cursor: undefined
    }),
    [
      filters,
      sessionActor.profile.userId
    ]
  )
  const productionDiscoveryQuery = useInfiniteQuery(
    createDiscoveryPageQueryOptions({
      baseHttpUrl: MOBILE_HTTP_BASE_URL,
      userId: sessionActor.profile.userId,
      sessionToken: sessionActor.session.sessionToken,
      filters,
      enabled: isProductionDiscovery && filtersReady
    })
  )
  useEffect(() => {
    if (productionDiscoveryQuery.error instanceof DiscoveryCursorResetError) {
      // Reset the whole infinite deck; appending a new snapshot to old pages is unsafe.
      void queryClient.resetQueries({ queryKey: productionDiscoveryQueryKey, exact: true })
    }
  }, [productionDiscoveryQuery.error, productionDiscoveryQueryKey, queryClient])
  const discoveryWatchQuery = useQuery(
    createDiscoveryWatchQueryOptions({
      baseHttpUrl: MOBILE_HTTP_BASE_URL,
      userId: sessionActor.profile.userId,
      sessionToken: sessionActor.session.sessionToken,
      enabled: isProductionDiscovery
    })
  )
  const productionProfiles = useMemo(
    () => flattenDiscoveryPages(productionDiscoveryQuery.data?.pages ?? []),
    [productionDiscoveryQuery.data?.pages]
  )
  const lastProductionPage = productionDiscoveryQuery.data?.pages.at(-1)
  const productionQuota = lastProductionPage?.quota ?? null
  const productionSupplyState = lastProductionPage?.supply.state
  const productionDiscoverError = productionDiscoveryQuery.isError
    ? getDiscoveryErrorMessageForDisplay("load", productionDiscoveryQuery.error)
    : null
  const productionDiscoverLoading = isProductionDiscovery && filtersReady && (
    productionDiscoveryQuery.isPending || productionDiscoveryQuery.isFetchingNextPage
  )
  const discoveryWatch = isProductionDiscovery
    ? discoveryWatchQuery.data ?? null
    : null
  const updateProductionQuota = useCallback((quota: DiscoveryDecisionQuota): void => {
    queryClient.setQueryData<InfiniteData<DiscoveryPageResult>>(
      productionDiscoveryQueryKey,
      (current) => {
        if (!current || current.pages.length === 0) return current
        const lastPageIndex = current.pages.length - 1
        return {
          ...current,
          pages: current.pages.map((page, index) =>
            index === lastPageIndex ? { ...page, quota } : page
          )
        }
      }
    )
  }, [productionDiscoveryQueryKey, queryClient])
  useFocusEffect(useCallback(() => {
    let active = true
    const generation = filterPreferencesGenerationRef.current
    setFiltersReadyForUserId(null)
    const accountPreferences = sessionActor.profile.discoveryPreferences
    const inMemoryFallback = localFiltersFallbackRef.current
    if (isProductionDiscovery && inMemoryFallback) {
      setFilters(resolveDiscoveryFiltersForFocus(accountPreferences, inMemoryFallback))
      setFiltersReadyForUserId(sessionActor.profile.userId)
      return () => {
        active = false
      }
    }
    const loadFocusedFilters = isProductionDiscovery
      ? loadLocalDiscoveryFiltersFallback(
          AsyncStorage,
          sessionActor.profile.userId
        ).then((localFallback) => {
          if (localFallback) {
            localFiltersFallbackRef.current = localFallback
          }
          return resolveDiscoveryFiltersForFocus(
            accountPreferences,
            localFallback
          )
        })
      : loadDiscoveryFilters(AsyncStorage, sessionActor.profile.userId)
    void loadFocusedFilters
      .then((savedFilters) => {
        if (
          !active ||
          generation !== filterPreferencesGenerationRef.current
        ) return
        setFilters(savedFilters)
        setFiltersReadyForUserId(sessionActor.profile.userId)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [
    isProductionDiscovery,
    sessionActor.profile.discoveryPreferences,
    sessionActor.profile.userId
  ]))

  // Outgoing invites are optimistic locally, then cleared by server decisions or TTL.
  const [pendingInvites, setPendingInvites] = useState<PendingInviteMemory[]>([])
  const [discoverFeedback, setDiscoverFeedback] =
    useState<DiscoverFeedback | null>(null)
  const cardDragX = useRef(new Animated.ValueXY()).current
  const feedbackAnim = useRef(new Animated.Value(0)).current
  const feedbackCounterRef = useRef(0)
  const firstDiscoveryDecisionCapturedRef = useRef(false)

  const [refreshing, setRefreshing] = useState(false)
  const refreshInFlightRef = useRef(false)
  const refreshProductionDiscover = useCallback(async (): Promise<void> => {
    if (!isProductionDiscovery || !filtersReady) return
    const result = await productionDiscoveryQuery.refetch()
    if (result.error) throw result.error
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [filtersReady, isProductionDiscovery, productionDiscoveryQuery.refetch])

  const handleRefresh = useCallback(async () => {
    if (isProductionDiscovery && !filtersReady) return
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    setRefreshing(true)
    try {
      const result = await runDiscoveryRefresh(() =>
        isProductionDiscovery
          ? refreshProductionDiscover()
          : requestRefresh()
      )
      if (result.status === "error") {
        throw new Error(result.message)
      }
    } catch (error) {
      showToast({
        title: "Discover needs a moment",
        body: getDiscoveryErrorMessageForDisplay("refresh", error),
        type: "warning"
      })
    } finally {
      refreshInFlightRef.current = false
      setRefreshing(false)
    }
  }, [
    filtersReady,
    isProductionDiscovery,
    requestRefresh,
    refreshProductionDiscover
  ])

  useEffect(() => {
    if (!discoveryWatch) return
    if (!isDiscoveryWatchActive(discoveryWatch)) {
      queryClient.setQueryData(
        buildDiscoveryWatchQueryKey({
          baseHttpUrl: MOBILE_HTTP_BASE_URL,
          userId: sessionActor.profile.userId
        }),
        null
      )
      return
    }
    const timeoutId = setTimeout(
      () => {
        queryClient.setQueryData(
          buildDiscoveryWatchQueryKey({
            baseHttpUrl: MOBILE_HTTP_BASE_URL,
            userId: sessionActor.profile.userId
          }),
          null
        )
      },
      Date.parse(discoveryWatch.expiresAt) - Date.now()
    )
    return () => clearTimeout(timeoutId)
  }, [discoveryWatch, queryClient, sessionActor.profile.userId])

  const handleActivateDiscoveryWatch = useCallback(async () => {
    if (!isProductionDiscovery || discoveryWatchBusy) return
    setDiscoveryWatchBusy(true)
    try {
      const watch = await activateDiscoveryWatch(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      queryClient.setQueryData(
        buildDiscoveryWatchQueryKey({
          baseHttpUrl: MOBILE_HTTP_BASE_URL,
          userId: sessionActor.profile.userId
        }),
        watch
      )
    } catch {
      showToast({
        title: "Vibe Card wasn’t saved",
        body: "Try again when you’re connected.",
        type: "warning"
      })
    } finally {
      setDiscoveryWatchBusy(false)
    }
  }, [
    discoveryWatchBusy,
    isProductionDiscovery,
    queryClient,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  const handleCancelDiscoveryWatch = useCallback(async () => {
    if (!isProductionDiscovery || discoveryWatchBusy) return
    setDiscoveryWatchBusy(true)
    try {
      await cancelDiscoveryWatch(
        MOBILE_HTTP_BASE_URL,
        sessionActor.session.sessionToken
      )
      queryClient.setQueryData(
        buildDiscoveryWatchQueryKey({
          baseHttpUrl: MOBILE_HTTP_BASE_URL,
          userId: sessionActor.profile.userId
        }),
        null
      )
    } catch {
      showToast({
        title: "Vibe Card is still active",
        body: "Try cancelling again when you’re connected.",
        type: "warning"
      })
    } finally {
      setDiscoveryWatchBusy(false)
    }
  }, [
    discoveryWatchBusy,
    isProductionDiscovery,
    queryClient,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  useEffect(() => {
    if (!isProductionDiscovery || !filtersReady) return
    setSeenThisSessionUserIds(new Set())
  }, [filters, filtersReady, isProductionDiscovery])

  const skippedUserIds = useMemo(
    () => new Set(skippedConnections.map((entry) => entry.userId)),
    [skippedConnections]
  )

  const savedUserIds = useMemo(
    () => new Set(savedConnections.map((entry) => entry.userId)),
    [savedConnections]
  )

  const pendingInviteUserIds = useMemo(
    () => new Set(pendingInvites.map((invite) => invite.userId)),
    [pendingInvites]
  )

  const discoverSourceUsers = useMemo<DiscoveryCandidate[]>(
    () =>
      isProductionDiscovery
        ? productionProfiles.map(createProductionDiscoveryCandidate)
        : nearbyUsers.map(createLiveDiscoveryCandidate),
    [isProductionDiscovery, nearbyUsers, productionProfiles]
  )

  const discoverDeck = useMemo<DiscoveryCandidate[]>(() => {
    if (isProductionDiscovery && !isSafetyListReady) return []
    const locallyBlockedUserIds = new Set(
      discoverSourceUsers
        .filter((user) => isUserBlocked(user.userId))
        .map((user) => user.userId)
    )
    return buildAvailableDiscoveryCandidates(discoverSourceUsers, {
      blockedUserIds: locallyBlockedUserIds,
      skippedUserIds,
      savedUserIds,
      seenUserIds: seenThisSessionUserIds,
      pendingInviteUserIds
    })
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    discoverSourceUsers,
    blockedUserKey,
    isProductionDiscovery,
    isSafetyListReady,
    pendingInviteUserIds,
    savedUserIds,
    seenThisSessionUserIds,
    skippedUserIds
  ])

  const discoveryQuotaExhausted =
    isProductionDiscovery && productionQuota?.remaining === 0
  const visibleDiscoverDeck = discoveryQuotaExhausted ? [] : discoverDeck
  const featuredCandidate = visibleDiscoverDeck[0] ?? null

  useEffect(() => {
    if (
      !isProductionDiscovery ||
      !discoveryWatch ||
      discoveryQuotaExhausted ||
      discoverDeck.length === 0
    ) return
    void cancelDiscoveryWatch(
      MOBILE_HTTP_BASE_URL,
      sessionActor.session.sessionToken
    ).then(() => {
      queryClient.setQueryData(
        buildDiscoveryWatchQueryKey({
          baseHttpUrl: MOBILE_HTTP_BASE_URL,
          userId: sessionActor.profile.userId
        }),
        null
      )
    }).catch(() => undefined)
  }, [
    discoverDeck.length,
    discoveryQuotaExhausted,
    discoveryWatch,
    isProductionDiscovery,
    queryClient,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  useEffect(() => {
    if (
      !isProductionDiscovery ||
      productionDiscoveryQuery.isFetchingNextPage ||
      !productionDiscoveryQuery.hasNextPage ||
      discoveryQuotaExhausted ||
      discoverDeck.length > 3
    ) return
    void productionDiscoveryQuery.fetchNextPage().catch(() => undefined)
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    discoverDeck.length,
    isProductionDiscovery,
    discoveryQuotaExhausted,
    productionDiscoveryQuery.fetchNextPage,
    productionDiscoveryQuery.hasNextPage,
    productionDiscoveryQuery.isFetchingNextPage
  ])

  const senderDisplayName = useMemo(() => {
    if (!incomingInvite) return null
    const sender =
      lobbyState.snapshot?.users.find(
        (user) => user.userId === incomingInvite.senderUserId
      ) ?? null
    return sender?.displayName ?? incomingInvite.senderUserId
  }, [incomingInvite, lobbyState.snapshot?.users])

  useEffect(() => {
    let active = true
    void (async () => {
      const restored = await loadPendingInvitesForUser({
        actorUserId: myUserId,
        now: Date.now(),
        ttlMs: PENDING_INVITE_TTL_MS
      })
      if (!active) return
      setPendingInvites((current) => {
        const restoredUserIds = new Set(restored.map((invite) => invite.userId))
        return [
          ...restored,
          ...current.filter((invite) => !restoredUserIds.has(invite.userId))
        ]
      })
    })()
    return () => {
      active = false
    }
  }, [myUserId])

  const persistPendingInvites = useCallback(
    (invites: PendingInviteMemory[]): void => {
      void replacePendingInvitesForUser({
        actorUserId: myUserId,
        invites,
        now: Date.now(),
        ttlMs: PENDING_INVITE_TTL_MS
      })
    },
    [myUserId]
  )

  const addPendingInvite = useCallback((invite: PendingInviteMemory): void => {
    setPendingInvites((current) => {
      const withoutDuplicate = current.filter(
        (entry) => entry.userId !== invite.userId
      )
      const next = [...withoutDuplicate, invite]
      void recordPendingInviteForUser({
        actorUserId: myUserId,
        invite,
        now: Date.now(),
        ttlMs: PENDING_INVITE_TTL_MS
      })
      return next
    })
  }, [myUserId])

  useEffect(() => {
    if (pendingInvites.length === 0) return
    const now = Date.now()
    const nextExpiry = Math.min(
      ...pendingInvites.map((invite) => invite.sentAt + PENDING_INVITE_TTL_MS)
    )
    const timer = setTimeout(() => {
      setPendingInvites((current) => {
        const next = current.filter(
          (invite) => Date.now() - invite.sentAt < PENDING_INVITE_TTL_MS
        )
        if (next.length !== current.length) {
          persistPendingInvites(next)
        }
        return next
      })
    }, Math.max(16, nextExpiry - now + 16))
    return () => clearTimeout(timer)
  }, [pendingInvites, persistPendingInvites])

  // Clear pending invites if their targets leave the nearby pool.
  useEffect(() => {
    if (pendingInvites.length === 0) return
    if (!lobbyState.isJoined) return
    const nearbyUserIds = new Set(nearbyUsers.map((user) => user.userId))
    setPendingInvites((current) => {
      const next = current.filter((invite) => nearbyUserIds.has(invite.userId))
      if (next.length !== current.length) {
        persistPendingInvites(next)
      }
      return next
    })
  }, [
    lobbyState.isJoined,
    nearbyUsers,
    pendingInvites.length,
    persistPendingInvites
  ])

  useEffect(() => {
    const decision = lobbyState.interaction.latestInviteDecision
    if (!decision) return
    const otherUserId =
      decision.senderUserId === myUserId
        ? decision.recipientUserId
        : decision.senderUserId
    setPendingInvites((current) => {
      const next = current.filter((invite) => invite.userId !== otherUserId)
      if (next.length !== current.length) {
        persistPendingInvites(next)
      }
      return next
    })
  }, [
    lobbyState.interaction.latestInviteDecision,
    myUserId,
    persistPendingInvites
  ])

  useEffect(() => {
    setSeenThisSessionUserIds((current) => {
      const nearbyUserIds = new Set(nearbyUsers.map((user) => user.userId))
      const next = new Set(
        [...current].filter((userId) => nearbyUserIds.has(userId))
      )
      return next.size === current.size ? current : next
    })
  }, [nearbyUsers])

  // Resolve participant display names then navigate to MiniRoom.
  useEffect(() => {
    if (isProductionDiscovery) {
      clearReadyMiniRoom()
      return
    }
    if (!readyMiniRoom) return

    const nextMiniRoomId = readyMiniRoom.miniRoom.miniRoomId
    if (lastNavigatedMiniRoomIdRef.current === nextMiniRoomId) {
      return
    }
    lastNavigatedMiniRoomIdRef.current = nextMiniRoomId

    const ids = readyMiniRoom.miniRoom.participantUserIds
    const partnerUserId = ids.find((id) => id !== myUserId) ?? ids[0] ?? ""
    setPendingInvites((current) => {
      const next = current.filter((invite) => invite.userId !== partnerUserId)
      if (next.length !== current.length) {
        persistPendingInvites(next)
      }
      return next
    })
    const presence = lobbyState.snapshot?.users ?? []
    const partnerPresence = presence.find((u) => u.userId === partnerUserId)
    const partnerNearby = nearbyUsers.find((u) => u.userId === partnerUserId)
    const partnerParticipant = readyMiniRoom.participants.find(
      (participant) => participant.userId === partnerUserId
    )
    const partnerDisplayName =
      partnerParticipant?.displayName ??
      partnerPresence?.displayName ??
      partnerNearby?.displayName ??
      "Someone"
    const partnerAvatarPresetId =
      partnerParticipant?.avatar.presetId ?? partnerPresence?.avatar.presetId

    const participants: MiniRoomParticipantsRouteParam = {
      you: { userId: myUserId, displayName: myDisplayName },
      partner: {
        userId: partnerUserId,
        displayName: partnerDisplayName,
        avatarSnapshot: createCandidateAvatarSnapshot({
          userId: partnerUserId,
          displayName: partnerDisplayName,
          avatarPresetId: partnerAvatarPresetId,
          avatarSelection: partnerParticipant?.avatar ?? partnerPresence?.avatar
        })
      }
    }

    navigation.navigate("MiniRoom", { readyMiniRoom, participants })
  }, [
    lobbyState.snapshot?.users,
    myDisplayName,
    myUserId,
    navigation,
    nearbyUsers,
    persistPendingInvites,
    readyMiniRoom,
    clearReadyMiniRoom,
    isProductionDiscovery
  ])

  useFocusEffect(
    useCallback(() => {
      const readyMiniRoomId = readyMiniRoom?.miniRoom.miniRoomId
      if (
        readyMiniRoomId &&
        lastNavigatedMiniRoomIdRef.current === readyMiniRoomId
      ) {
        clearReadyMiniRoom()
      }
    }, [clearReadyMiniRoom, readyMiniRoom])
  )

  useEffect(() => {
    if (!lobbyState.isJoined && lobbyState.snapshot === null) {
      lastNavigatedMiniRoomIdRef.current = null
    }
  }, [lobbyState.isJoined, lobbyState.snapshot])

  const triggerHaptic = useCallback((tone: DiscoverFeedbackTone): void => {
    Vibration.vibrate(tone === "warm" ? 18 : 10)
  }, [])

  const showDiscoverFeedback = useCallback(
    (text: string, tone: DiscoverFeedbackTone): void => {
      feedbackCounterRef.current += 1
      const nextId = feedbackCounterRef.current
      setDiscoverFeedback({ id: nextId, text, tone })
      feedbackAnim.stopAnimation()
      feedbackAnim.setValue(0)
      Animated.sequence([
        Animated.timing(feedbackAnim, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.delay(1050),
        Animated.timing(feedbackAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true
        })
      ]).start(() => {
        setDiscoverFeedback((current) =>
          current?.id === nextId ? null : current
        )
      })
    },
    [feedbackAnim]
  )

  const showInviteDeliveryFailure = useCallback((): void => {
    showToast({
      title: "Invite not sent",
      body: "Wait a moment, then try again.",
      type: "warning"
    })
    showDiscoverFeedback("Invite not sent. Try again in a moment.", "soft")
  }, [showDiscoverFeedback])

  const markCandidateSeen = useCallback((userId: string): void => {
    setSeenThisSessionUserIds((current) =>
      applyOptimisticDiscoveryDecision(current, userId)
    )
  }, [])

  useEffect(() => {
    const completion = route.params?.completedProductionDecision
    if (!completion || !isProductionDiscovery) return
    setSeenThisSessionUserIds((current) =>
      applyProductionDetailDecision(current, completion).seenUserIds
    )
    updateProductionQuota(completion.quota)
    if (!firstDiscoveryDecisionCapturedRef.current) {
      firstDiscoveryDecisionCapturedRef.current = true
      captureProductEvent("activation_first_discovery_decision", {
        decision: completion.decision,
        mode: "production"
      })
    }
    navigation.setParams({ completedProductionDecision: undefined })
  }, [
    isProductionDiscovery,
    navigation,
    route.params?.completedProductionDecision,
    updateProductionQuota
  ])

  const restoreCandidateAfterDecisionFailure = useCallback((userId: string): void => {
    setSeenThisSessionUserIds((current) =>
      rollbackOptimisticDiscoveryDecision(current, userId)
    )
    cardDragX.setValue({ x: 0, y: 0 })
  }, [cardDragX])

  const decideProductionCandidate = useCallback(
    async (
      candidate: DiscoveryCandidate,
      decision: "like" | "pass"
    ): Promise<boolean> => {
      const started = beginInFlightDiscoveryDecision(
        inFlightDecisionUserIdsRef.current,
        candidate.userId
      )
      if (!started.accepted) return false
      inFlightDecisionUserIdsRef.current = started.nextUserIds
      setInFlightDecisionUserIds(started.nextUserIds)
      markCandidateSeen(candidate.userId)
      try {
        const result = await decideDiscoverProfile(
          MOBILE_HTTP_BASE_URL,
          sessionActor.session.sessionToken,
          candidate.userId,
          decision
        )
        updateProductionQuota(result.quota)
        captureProductEvent("discovery_decision", {
          decision,
          mode: "production"
        })
        if (!firstDiscoveryDecisionCapturedRef.current) {
          firstDiscoveryDecisionCapturedRef.current = true
          captureProductEvent("activation_first_discovery_decision", {
            decision,
            mode: "production"
          })
        }
        if (decision === "pass") {
          showDiscoverFeedback("Passed for now.", "soft")
          return true
        }

        const match = createMatchFromDiscoveryResult({
          currentUser: {
            userId: myUserId,
            displayName: myDisplayName
          },
          matchedUser: {
            userId: candidate.userId,
            displayName: candidate.displayName
          },
          result
        })

        if (match) {
          void hydrateFromServer(sessionActor.session.sessionToken)
          showDiscoverFeedback("It’s a match.", "warm")
          setTimeout(() => {
            navigation.navigate("MatchResult", { match })
          }, 260)
          return true
        }

        showDiscoverFeedback("Like sent.", "warm")
        return true
      } catch (error) {
        if (error instanceof DiscoveryDecisionQuotaExhaustedError) {
          updateProductionQuota(error.quota)
        }
        const title = error instanceof DiscoveryDecisionQuotaExhaustedError
          ? "Today’s Discover limit reached"
          : getDiscoveryErrorMessageForDisplay("decision", error)
        showToast({
          title,
          type: "warning"
        })
        showDiscoverFeedback("Try that again in a moment.", "soft")
        restoreCandidateAfterDecisionFailure(candidate.userId)
        return false
      } finally {
        const finishedUserIds = finishInFlightDiscoveryDecision(
          inFlightDecisionUserIdsRef.current,
          candidate.userId
        )
        inFlightDecisionUserIdsRef.current = finishedUserIds
        setInFlightDecisionUserIds(finishedUserIds)
      }
    },
    [
      hydrateFromServer,
      markCandidateSeen,
      myDisplayName,
      myUserId,
      navigation,
      restoreCandidateAfterDecisionFailure,
      sessionActor.session.sessionToken,
      showDiscoverFeedback,
      updateProductionQuota
    ]
  )

  const handlePrimaryLike = useCallback(() => {
    if (!featuredCandidate) return
    if (
      featuredCandidate.blocked ||
      (!isProductionDiscovery && !isLiveInviteAvailable(featuredCandidate))
    ) return
    if (isProductionDiscovery) {
      triggerHaptic("warm")
      void decideProductionCandidate(featuredCandidate, "like")
      return
    }
    triggerHaptic("warm")
    const inviteSent = sendInvite(featuredCandidate.userId)
    if (!inviteSent) {
      showInviteDeliveryFailure()
      return
    }
    showDiscoverFeedback("Invite sent. A shared room opens if they accept.", "warm")
    captureProductEvent("discovery_decision", {
      decision: "like",
      mode: sessionActor.session.mode
    })
    if (!firstDiscoveryDecisionCapturedRef.current) {
      firstDiscoveryDecisionCapturedRef.current = true
      captureProductEvent("activation_first_discovery_decision", {
        decision: "like",
        mode: sessionActor.session.mode
      })
    }
    addPendingInvite({
      userId: featuredCandidate.userId,
      displayName: featuredCandidate.displayName,
      sentAt: Date.now()
    })
    markCandidateSeen(featuredCandidate.userId)
  }, [
    addPendingInvite,
    decideProductionCandidate,
    featuredCandidate,
    isProductionDiscovery,
    markCandidateSeen,
    sessionActor.session.mode,
    sendInvite,
    showDiscoverFeedback,
    showInviteDeliveryFailure,
    triggerHaptic
  ])

  const handleSkipFeatured = useCallback(() => {
    if (!featuredCandidate) return
    if (inFlightDecisionUserIdsRef.current.has(featuredCandidate.userId)) return
    triggerHaptic("soft")
    if (isProductionDiscovery) {
      void decideProductionCandidate(featuredCandidate, "pass")
      return
    }
    showDiscoverFeedback("Skipped for now.", "soft")
    markCandidateSeen(featuredCandidate.userId)
    void skipDiscoveryCandidate({
      ownerUserId: sessionActor.profile.userId,
      userId: featuredCandidate.userId
    })
    captureProductEvent("discovery_decision", {
      decision: "pass",
      mode: sessionActor.session.mode
    })
    if (!firstDiscoveryDecisionCapturedRef.current) {
      firstDiscoveryDecisionCapturedRef.current = true
      captureProductEvent("activation_first_discovery_decision", {
        decision: "pass",
        mode: sessionActor.session.mode
      })
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    decideProductionCandidate,
    featuredCandidate,
    isProductionDiscovery,
    markCandidateSeen,
    sessionActor.session.mode,
    showDiscoverFeedback,
    triggerHaptic
  ])

  const isPendingForFeatured =
    !!featuredCandidate &&
    pendingInviteUserIds.has(featuredCandidate.userId)

  const likeDisabled =
    !featuredCandidate ||
    (!isProductionDiscovery && !isLiveInviteAvailable(featuredCandidate)) ||
    featuredCandidate.blocked ||
    isPendingForFeatured ||
    inFlightDecisionUserIds.has(featuredCandidate.userId) ||
    (!isProductionDiscovery &&
      (!lobbyState.isJoined || connectionStatus !== "connected"))

  // Handle Like fired from ProfilePreview via navigation param bounce.
  useEffect(() => {
    const target = route.params?.pendingLikeUserId
    if (!target) return
    const targetUser = discoverSourceUsers.find((user) => user.userId === target)
    if (isProductionDiscovery) {
      if (targetUser) {
        void decideProductionCandidate(targetUser, "like")
      } else {
        showDiscoverFeedback("This profile is no longer available in Discover.", "soft")
      }
      navigation.setParams({ pendingLikeUserId: undefined })
      return
    }
    const inviteSent = sendInvite(target)
    if (!inviteSent) {
      showInviteDeliveryFailure()
      navigation.setParams({ pendingLikeUserId: undefined })
      return
    }
    addPendingInvite({
      userId: target,
      displayName: targetUser?.displayName ?? "Someone",
      sentAt: Date.now()
    })
    markCandidateSeen(target)
    navigation.setParams({ pendingLikeUserId: undefined })
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    addPendingInvite,
    decideProductionCandidate,
    discoverSourceUsers,
    isProductionDiscovery,
    markCandidateSeen,
    navigation,
    route.params?.pendingLikeUserId,
    sendInvite,
    showInviteDeliveryFailure
  ])

  // Handle Pass fired from ProfilePreview through the same Discover decision path.
  useEffect(() => {
    const target = route.params?.pendingPassUserId
    if (!target) return
    const targetUser = discoverSourceUsers.find((user) => user.userId === target)
    if (isProductionDiscovery) {
      if (targetUser) {
        void decideProductionCandidate(targetUser, "pass")
      } else {
        showDiscoverFeedback("This profile is no longer available in Discover.", "soft")
      }
      navigation.setParams({ pendingPassUserId: undefined })
      return
    }
    if (!isProductionDiscovery) {
      triggerHaptic("soft")
      showDiscoverFeedback("Passed for now.", "soft")
      markCandidateSeen(target)
      void skipDiscoveryCandidate({
        ownerUserId: sessionActor.profile.userId,
        userId: target
      })
      captureProductEvent("discovery_decision", {
        decision: "pass",
        mode: sessionActor.session.mode
      })
    }
    navigation.setParams({ pendingPassUserId: undefined })
  }, [
    decideProductionCandidate,
    discoverSourceUsers,
    isProductionDiscovery,
    markCandidateSeen,
    navigation,
    route.params?.pendingPassUserId,
    sessionActor.profile.userId,
    sessionActor.session.mode,
    showDiscoverFeedback,
    triggerHaptic
  ])

  const nearbyCount = useMemo(
    () => isProductionDiscovery && !isSafetyListReady
      ? 0
      : discoverSourceUsers.filter((u) => !u.blocked && !isUserBlocked(u.userId)).length,
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [blockedUserKey, discoverSourceUsers, isProductionDiscovery, isSafetyListReady]
  )
  const discoverableCount = discoverDeck.length
  const pendingInviteCount = pendingInvites.length
  const pendingInviteNames = pendingInvites
    .slice(0, 2)
    .map((invite) => invite.displayName.split(" ")[0])
    .join(", ")
  const progressLabel =
    productionDiscoverLoading
      ? "Finding people who match your vibe"
      : productionDiscoverError
        ? productionDiscoverError
        : discoveryQuotaExhausted
          ? "Today’s Discover limit reached"
        : discoverableCount > 0
      ? `${discoverableCount} ${discoverableCount === 1 ? "person" : "people"} to meet`
      : nearbyCount > 0
        ? "You've seen everyone for now"
        : null
  const showDiscoveryLoading = isProductionDiscovery && productionProfiles.length === 0 && (
    !filtersReady || productionDiscoverLoading || !isSafetyListReady
  )

  const handleOpenFilters = useCallback(() => {
    setFiltersVisible(true)
  }, [])

  const handleCloseFilters = useCallback(() => {
    setFiltersVisible(false)
  }, [])

  const handleApplyFilters = useCallback((next: DiscoverFilters) => {
    filterPreferencesGenerationRef.current += 1
    const generation = filterPreferencesGenerationRef.current
    localFiltersFallbackRef.current = isProductionDiscovery ? next : null
    setFilters(next)
    setFiltersReadyForUserId(sessionActor.profile.userId)
    setFiltersVisible(false)
    setSeenThisSessionUserIds(new Set())
    void (async () => {
      await persistDiscoveryFilters(
        AsyncStorage,
        sessionActor.profile.userId,
        next
      ).catch(() => undefined)
      if (!isProductionDiscovery) return
      await persistLocalDiscoveryFiltersFallback(
        AsyncStorage,
        sessionActor.profile.userId,
        next
      ).catch(() => undefined)
      if (!onUpdateDiscoveryPreferences) return
      try {
        await onUpdateDiscoveryPreferences({
          ...next,
          radiusKm: sessionActor.profile.discoveryPreferences?.radiusKm ?? 25
        })
        if (generation !== filterPreferencesGenerationRef.current) return
        localFiltersFallbackRef.current = null
        await clearLocalDiscoveryFiltersFallback(
          AsyncStorage,
          sessionActor.profile.userId
        ).catch(() => undefined)
      } catch {
        showToast({
          title: "Your filters are active on this device.",
          body: "Blumi could not sync them to your account yet.",
          type: "warning"
        })
      }
    })()
  }, [
    isProductionDiscovery,
    onUpdateDiscoveryPreferences,
    sessionActor.profile.discoveryPreferences?.radiusKm,
    sessionActor.profile.userId
  ])

  const handleOpenProfileEdit = useCallback(() => {
    navigation.navigate("You")
  }, [navigation])

  const activeFilterCount = useMemo(
    () => countActiveDiscoverFilters(filters),
    [filters]
  )
  const scrollContentStyle = useMemo(
    () => [
      styles.scroll,
      {
        paddingBottom: viewportMetrics.bottomContentInset + uiTheme.spacing.lg
      }
    ],
    [viewportMetrics.bottomContentInset]
  )
  return (
    <View style={styles.root}>
      <SoftBlobBackground variant="homeLiquid" />
      <SafeAreaView contentGutter={false} style={styles.safe} edges={["top", "left", "right"]}>
        <ScrollView
          canCancelContentTouches={false}
          contentContainerStyle={scrollContentStyle}
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={uiTheme.colors.primary}
              colors={[uiTheme.colors.primary]}
            />
          }
        >
          <View style={styles.homeHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your Blumi profile"
              onPress={handleOpenProfileEdit}
              style={({ pressed }) => [
                styles.homeProfileChip,
                pressed ? styles.homeProfileChipPressed : null
              ]}
            >
              <View style={styles.homeProfileSheen} pointerEvents="none" />
              <View style={styles.homeAvatarPreview}>
                <CandidateAvatarPreview
                  size={48}
                  snapshot={myAvatarSnapshot}
                  stage="profile"
                />
              </View>
              <View style={styles.homeProfileText}>
                <Text style={styles.homeProfileName} numberOfLines={1}>
                  {myDisplayName}
                </Text>
                <Text style={styles.homeProfileMeta} numberOfLines={1}>
                  Edit your vibe
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open discover filters"
              style={({ pressed }) => [
                styles.filterButton,
                pressed ? styles.filterButtonPressed : null
              ]}
              onPress={handleOpenFilters}
              hitSlop={6}
            >
              <View style={styles.filterButtonGlow} pointerEvents="none" />
              <View style={styles.filterButtonInner} pointerEvents="none" />
              <View style={styles.filterDotGrid} pointerEvents="none">
                <View style={styles.filterDot} />
                <View style={styles.filterDot} />
                <View style={styles.filterDot} />
                <View style={styles.filterDot} />
              </View>
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {!isProductionDiscovery && incomingInvite && senderDisplayName ? (
            <IncomingInviteCallout
              senderDisplayName={senderDisplayName}
              senderUserId={incomingInvite.senderUserId}
              onAccept={() => decideInvite("accepted")}
              onDecline={() => decideInvite("declined")}
            />
          ) : null}

          {isDemoSession ? (
            <DemoLobbyView sessionActor={sessionActor} />
          ) : (
            <View>
              <DiscoveryDeckView
                profiles={visibleDiscoverDeck}
                swipeAnim={cardDragX}
                onSwipeRight={handlePrimaryLike}
                onSwipeLeft={handleSkipFeatured}
                progressLabel={progressLabel ?? "Fresh vibes soon"}
                likeDisabled={likeDisabled}
                actionsDisabled={discoveryQuotaExhausted || (featuredCandidate ? inFlightDecisionUserIds.has(featuredCandidate.userId) : false)}
                  emptyContent={(
                  productionDiscoverError ? (
                    <DiscoverErrorCard
                      message={productionDiscoverError}
                      refreshing={refreshing}
                      onRetry={() => {
                        void handleRefresh()
                      }}
                    />
                  ) : showDiscoveryLoading ? (
                    <LoadingDiscoveryDeck />
                  ) : (
                    <EmptyDiscoveryDeck
                      avatarName={myDisplayName}
                      avatarSeed={myUserId}
                      avatarSelection={sessionActor.profile.avatar}
                      state={discoveryQuotaExhausted
                        ? "quota-exhausted"
                        : productionSupplyState === "low"
                          ? "low-supply"
                          : "exhausted"}
                      quota={productionQuota}
                      watchActive={discoveryWatch?.status === "active"}
                      watchBusy={discoveryWatchBusy}
                      onActivateWatch={() => {
                        void handleActivateDiscoveryWatch()
                      }}
                      onCancelWatch={() => {
                        void handleCancelDiscoveryWatch()
                      }}
                      refreshing={refreshing}
                      onRefresh={() => {
                        void handleRefresh()
                      }}
                    />
                  )
                )}
              />
            </View>
          )}

          {discoverFeedback ? (
            <Animated.View
              style={[
                styles.feedbackPill,
                discoverFeedback.tone === "warm"
                  ? styles.feedbackPillWarm
                  : styles.feedbackPillSoft,
                {
                  opacity: feedbackAnim,
                  transform: [
                    {
                      translateY: feedbackAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 0]
                      })
                    }
                  ]
                }
              ]}
            >
              <Text
                style={[
                  styles.feedbackText,
                  discoverFeedback.tone === "warm"
                    ? styles.feedbackTextWarm
                    : null
                ]}
              >
                {discoverFeedback.text}
              </Text>
            </Animated.View>
          ) : null}

          {!isProductionDiscovery && pendingInviteCount > 0 ? (
            <View style={styles.pendingInviteStrip}>
              <View style={styles.pendingInviteIcon}>
                <Ionicons name="heart" size={17} color={uiTheme.colors.primary} />
              </View>
              <View style={styles.pendingInviteCopy}>
                <Text style={styles.pendingInviteTitle}>
                  {pendingInviteCount === 1
                    ? `${pendingInviteNames} has your room invite`
                    : `${pendingInviteCount} room invites are out`}
                </Text>
                <Text style={styles.pendingInviteBody}>
                  Keep discovering. A shared room opens when someone accepts.
                </Text>
              </View>
              <PendingInviteCountdown pendingInvites={pendingInvites} />
            </View>
          ) : null}

        </ScrollView>
      </SafeAreaView>

      <DiscoverFiltersBottomSheet
        visible={filtersVisible}
        initialFilters={filters}
        onClose={handleCloseFilters}
        onApply={handleApplyFilters}
      />
    </View>
  )
}

function PendingInviteCountdown(props: { pendingInvites: PendingInviteMemory[] }) {
  const [now, setNow] = useState(() => Date.now())
  const remainingSeconds = useMemo(() => {
    if (props.pendingInvites.length === 0) return 0
    const remainingMs = Math.min(
      ...props.pendingInvites.map(
        (invite) => PENDING_INVITE_TTL_MS - (now - invite.sentAt)
      )
    )
    return Math.max(0, Math.ceil(remainingMs / 1000))
  }, [now, props.pendingInvites])

  useEffect(() => {
    if (props.pendingInvites.length === 0) return undefined
    if (remainingSeconds === 0) return undefined
    const timer = setTimeout(() => setNow(Date.now()), 1000)
    return () => clearTimeout(timer)
  }, [props.pendingInvites.length, remainingSeconds])

  return <Text style={styles.pendingInviteTime}>{remainingSeconds}s</Text>
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiTheme.colors.background,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: uiTheme.spacing.lg,
    paddingTop: uiTheme.spacing.md,
    gap: uiTheme.spacing.sm,
  },
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTheme.spacing.md,
    marginBottom: uiTheme.spacing.md,
  },
  homeProfileChip: {
    flex: 1,
    minHeight: 58,
    maxWidth: 238,
    borderRadius: 29,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: uiTheme.ambientGlass.surface,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
    overflow: "hidden",
  },
  homeProfileChipPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  homeProfileSheen: {
    position: "absolute",
    left: 26,
    right: 26,
    top: 1,
    height: 1.5,
    borderRadius: 999,
    backgroundColor: uiTheme.ambientGlass.sheen
  },
  homeAvatarPreview: {
    alignItems: "center",
    backgroundColor: uiTheme.ambientGlass.surfaceStrong,
    borderColor: uiTheme.ambientGlass.edgeLight,
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    width: 42
  },
  homeProfileText: {
    flex: 1,
    gap: 2,
  },
  homeProfileName: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    fontWeight: "900",
  },
  homeProfileMeta: {
    ...uiTheme.font.caption,
    color: "rgba(54, 40, 68, 0.62)",
    fontWeight: "700",
  },
  filterButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.ambientGlass.surface,
    borderWidth: 1,
    borderColor: uiTheme.ambientGlass.edgeLight,
    position: "relative",
    overflow: "hidden",
  },
  filterButtonGlow: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
  },
  filterButtonInner: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: uiTheme.ambientGlass.surfaceQuiet,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
  },
  filterButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  filterDotGrid: {
    width: 18,
    height: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  filterDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(48, 35, 62, 0.46)",
  },
  filterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: uiTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: uiTheme.colors.surface,
  },
  filterBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: uiTheme.spacing.xl,
    marginTop: uiTheme.spacing.sm,
  },
  cardTransition: {
    width: "100%",
  },
  swipeWrapper: {
    position: "relative",
    width: "100%",
  },
  swipeStamp: {
    position: "absolute",
    top: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: uiTheme.radius.lg,
    borderWidth: 3,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    ...uiTheme.shadow.float,
  },
  swipeStampLike: {
    left: 22,
    transform: [{ rotate: "-14deg" }],
    borderColor: uiTheme.colors.success,
  },
  swipeStampLikeText: {
    color: uiTheme.colors.success,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  swipeStampPass: {
    right: 22,
    transform: [{ rotate: "14deg" }],
    borderColor: uiTheme.colors.danger,
  },
  swipeStampPassText: {
    color: uiTheme.colors.danger,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  feedbackPill: {
    alignSelf: "center",
    paddingHorizontal: uiTheme.spacing.md,
    paddingVertical: uiTheme.spacing.sm,
    borderRadius: uiTheme.radius.full,
    borderWidth: 1,
    marginTop: -uiTheme.spacing.xs,
  },
  feedbackPillSoft: {
    backgroundColor: uiTheme.colors.glass,
    borderColor: uiTheme.colors.glassBorder,
  },
  feedbackPillWarm: {
    backgroundColor: uiTheme.colors.primarySoft,
    borderColor: "#FAD0E3",
  },
  feedbackText: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  feedbackTextWarm: {
    color: uiTheme.colors.primaryDeep,
  },
  pendingInviteStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTheme.spacing.sm,
    paddingHorizontal: uiTheme.spacing.lg,
    paddingVertical: uiTheme.spacing.md,
    borderRadius: uiTheme.radius.xl,
    backgroundColor: uiTheme.colors.glass,
    borderWidth: 1,
    borderColor: uiTheme.colors.glassBorder,
    ...uiTheme.shadow.float,
  },
  pendingInviteIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiTheme.colors.primarySoft,
  },
  pendingInviteCopy: {
    flex: 1,
    gap: 2,
  },
  pendingInviteTitle: {
    ...uiTheme.font.bodySmall,
    color: uiTheme.colors.textPrimary,
    fontWeight: "800",
  },
  pendingInviteBody: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textSecondary,
    lineHeight: 17,
  },
  pendingInviteTime: {
    ...uiTheme.font.captionBold,
    color: uiTheme.colors.primaryDeep,
    minWidth: 28,
    textAlign: "right",
  },
  nearbyHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -uiTheme.spacing.xs,
  },
  nearbyDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: uiTheme.colors.success,
  },
  nearbyHint: {
    ...uiTheme.font.caption,
    color: uiTheme.colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
})
