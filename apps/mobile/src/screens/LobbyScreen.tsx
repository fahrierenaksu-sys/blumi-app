import { useCallback, useMemo } from "react"
import {
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native"
import { PageSafeArea as SafeAreaView } from "../ui/layout/PageContainer"
import { IncomingInviteCallout } from "../components/IncomingInviteCallout"
import { DiscoverFiltersBottomSheet } from "../components/DiscoverFiltersBottomSheet"
import { MOBILE_HTTP_BASE_URL } from "../config/env"
import type { DiscoveryPreferences } from "@blumi/contracts"
import { useLobbyFlow } from "../features/lobby/useLobbyFlow"
import { getLobbyFeedbackCopy } from "../features/lobby/lobbyFeedbackCopy"
import { useLegacyLobbyInvites } from "../features/lobby/useLegacyLobbyInvites"
import { useLegacyMiniRoomNavigation } from "../features/lobby/useLegacyMiniRoomNavigation"
import { PendingInviteStrip } from "../features/lobby/PendingInviteStrip"
import { getAppLocale } from "../features/session/appLocale"
import type { SessionActor } from "../features/session/sessionModel"
import type { RootStackParamList } from "../navigation/RootNavigator"
import { DiscoveryBackground } from "../features/discovery/DiscoveryBackground"
import {
  resolveDiscoveryLikeDisabled,
  resolveDiscoveryProgressLabel,
  resolveProductionDiscoveryPlaceholderState
} from "../features/discovery/screen/discoveryScreenModel"
import { useDiscoverySafetyList } from "../features/discovery/screen/useDiscoverySafetyList"
import { useDiscoveryFilters } from "../features/discovery/screen/useDiscoveryFilters"
import {
  useDiscoveryPrefetchAdmission,
  useProductionDiscoveryQuery
} from "../features/discovery/screen/useProductionDiscoveryQuery"
import { useDiscoveryRefresh } from "../features/discovery/screen/useDiscoveryRefresh"
import {
  useDiscoveryDeck,
  useDiscoverySeenCandidates
} from "../features/discovery/screen/useDiscoveryDeck"
import { useDiscoveryWatch } from "../features/discovery/screen/useDiscoveryWatch"
import {
  DiscoveryFeedbackPill,
  useDiscoveryFeedback
} from "../features/discovery/screen/DiscoveryFeedbackPill"
import { useDiscoveryDecisions } from "../features/discovery/screen/useDiscoveryDecisions"
import { useDiscoveryStartup } from "../features/discovery/screen/useDiscoveryStartup"
import { DiscoverHomeHeader } from "../features/discovery/screen/DiscoverHomeHeader"
import { DiscoverDeckSurface } from "../features/discovery/screen/DiscoverDeckSurface"
import { uiTheme } from "../ui/theme"
import { DemoLobbyView } from "./DemoLobbyView"
import { useAppViewportMetrics } from "../ui/layout/useAppViewportMetrics"

interface LobbyScreenProps {
  sessionActor: SessionActor
  onResetSession: () => Promise<void>
  onUpdateDiscoveryPreferences?: (
    preferences: DiscoveryPreferences
  ) => Promise<void>
}

// Discover. Production sessions use the server Discover deck and never the
// retired public lobby (F-08); demo sessions render DemoLobbyView, and the
// legacy lobby invite hooks stay inert in production.
export function LobbyScreen(props: LobbyScreenProps) {
  const { sessionActor, onResetSession, onUpdateDiscoveryPreferences } = props
  const lobbyCopy = getLobbyFeedbackCopy(getAppLocale())
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "Lobby">>()
  const viewportMetrics = useAppViewportMetrics({ bottomNavVisible: true })

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
  const isDemoSession = sessionActor.session.mode === "demo"
  const isProductionDiscovery = sessionActor.session.mode === "production"
  const showcaseRequest = useMemo(() => isProductionDiscovery ? ({
    baseHttpUrl: MOBILE_HTTP_BASE_URL,
    viewerUserId: sessionActor.profile.userId,
    sessionToken: sessionActor.session.sessionToken
  }) : undefined, [
    isProductionDiscovery,
    sessionActor.profile.userId,
    sessionActor.session.sessionToken
  ])

  const {
    blockedUserIds,
    isSafetyListReady,
    safetyHydrationStatus,
    safetyRetrying,
    handleRetrySafetyList
  } = useDiscoverySafetyList({ sessionActor, isProductionDiscovery })
  const {
    seenThisSessionUserIds,
    setSeenThisSessionUserIds,
    resetSeenCandidates,
    markCandidateSeen
  } = useDiscoverySeenCandidates()
  const {
    filters,
    filtersReady,
    filtersVisible,
    activeFilterCount,
    handleOpenFilters,
    handleCloseFilters,
    handleApplyFilters
  } = useDiscoveryFilters({
    sessionActor,
    isProductionDiscovery,
    lobbyCopy,
    onUpdateDiscoveryPreferences,
    onFiltersApplied: resetSeenCandidates
  })
  const {
    productionDiscoveryQuery,
    productionProfiles,
    productionQuota,
    productionSupplyState,
    productionDiscoverError,
    productionDiscoverLoading,
    discoveryWatch,
    updateProductionQuota,
    refreshProductionDiscover
  } = useProductionDiscoveryQuery({
    sessionActor,
    isProductionDiscovery,
    filters,
    filtersReady
  })
  const { refreshing, handleRefresh } = useDiscoveryRefresh({
    isProductionDiscovery,
    filtersReady,
    refreshProductionDiscover,
    requestRefresh,
    lobbyCopy
  })
  const {
    pendingInvites,
    pendingInviteUserIds,
    addPendingInvite,
    dropPendingInviteFor
  } = useLegacyLobbyInvites({ myUserId, lobbyState, nearbyUsers })
  const {
    discoverSourceUsers,
    discoverDeck,
    discoveryQuotaExhausted,
    visibleDiscoverDeck,
    featuredCandidate,
    nearbyCount
  } = useDiscoveryDeck({
    ownerUserId: sessionActor.profile.userId,
    isProductionDiscovery,
    filters,
    filtersReady,
    productionProfiles,
    productionQuota,
    nearbyUsers,
    isSafetyListReady,
    blockedUserIds,
    pendingInviteUserIds,
    seenThisSessionUserIds,
    setSeenThisSessionUserIds
  })
  const {
    discoveryWatchBusy,
    handleActivateDiscoveryWatch,
    handleCancelDiscoveryWatch
  } = useDiscoveryWatch({
    sessionActor,
    isProductionDiscovery,
    discoveryWatch,
    discoveryQuotaExhausted,
    discoverDeckLength: discoverDeck.length,
    lobbyCopy
  })
  useDiscoveryPrefetchAdmission({
    productionDiscoveryQuery,
    isProductionDiscovery,
    isSafetyListReady,
    discoveryQuotaExhausted,
    availableCandidateCount: discoverDeck.length
  })

  const senderDisplayName = useMemo(() => {
    if (!incomingInvite) return null
    const sender =
      lobbyState.snapshot?.users.find(
        (user) => user.userId === incomingInvite.senderUserId
      ) ?? null
    return sender?.displayName ?? incomingInvite.senderUserId
  }, [incomingInvite, lobbyState.snapshot?.users])

  useLegacyMiniRoomNavigation({
    isProductionDiscovery,
    myUserId,
    myDisplayName,
    navigation,
    lobbyState,
    nearbyUsers,
    readyMiniRoom,
    clearReadyMiniRoom,
    dropPendingInviteFor
  })

  const { discoverFeedback, feedbackAnim, showDiscoverFeedback } = useDiscoveryFeedback()
  const {
    cardDragX,
    inFlightDecisionUserIds,
    handlePrimaryLike,
    handleSkipFeatured
  } = useDiscoveryDecisions({
    sessionActor,
    isProductionDiscovery,
    navigation,
    route,
    lobbyCopy,
    featuredCandidate,
    discoverSourceUsers,
    markCandidateSeen,
    setSeenThisSessionUserIds,
    updateProductionQuota,
    showDiscoverFeedback,
    sendInvite,
    addPendingInvite
  })

  const isPendingForFeatured =
    !!featuredCandidate &&
    pendingInviteUserIds.has(featuredCandidate.userId)
  const likeDisabled = resolveDiscoveryLikeDisabled({
    featuredCandidate,
    isProductionDiscovery,
    isPendingForFeatured,
    inFlightDecisionUserIds,
    isLobbyJoined: lobbyState.isJoined,
    connectionStatus
  })
  const pendingInviteCount = pendingInvites.length
  const progressLabel = resolveDiscoveryProgressLabel({
    productionDiscoverLoading,
    productionDiscoverError,
    discoveryQuotaExhausted,
    discoverableCount: discoverDeck.length,
    nearbyCount,
    copy: lobbyCopy
  })
  const discoveryPlaceholderState = resolveProductionDiscoveryPlaceholderState({
    isProductionDiscovery,
    filtersReady,
    isSafetyListReady,
    safetyHydrationFailed: safetyHydrationStatus === "failed",
    hasCachedProfiles: productionProfiles.length > 0,
    queryLoading: productionDiscoverLoading,
    hasError: productionDiscoverError !== null
  })
  const {
    startupScope,
    startupComplete,
    startupImagesReady,
    showStartupFailure,
    onBackgroundDisplay,
    onBackgroundError,
    onFrontDisplay,
    onFrontError,
    retryStartupImages
  } = useDiscoveryStartup({
    sessionActor,
    isProductionDiscovery,
    isSafetyListReady,
    filtersReady,
    isInitialPagePending: productionDiscoveryQuery.isPending,
    visibleDiscoverDeck,
    discoveryPlaceholderState
  })

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
      <DiscoveryBackground key={startupScope} onDisplay={onBackgroundDisplay} onError={onBackgroundError} />
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
          <DiscoverHomeHeader
            activeFilterCount={activeFilterCount}
            handleOpenFilters={handleOpenFilters}
          />

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
            <DiscoverDeckSurface
              sessionActor={sessionActor}
              isProductionDiscovery={isProductionDiscovery}
              visibleDiscoverDeck={visibleDiscoverDeck}
              featuredCandidate={featuredCandidate}
              showcaseRequest={showcaseRequest}
              cardDragX={cardDragX}
              handlePrimaryLike={handlePrimaryLike}
              handleSkipFeatured={handleSkipFeatured}
              progressLabel={progressLabel}
              likeDisabled={likeDisabled}
              discoveryQuotaExhausted={discoveryQuotaExhausted}
              inFlightDecisionUserIds={inFlightDecisionUserIds}
              startupScope={startupScope}
              startupComplete={startupComplete}
              startupImagesReady={startupImagesReady}
              showStartupFailure={showStartupFailure}
              onFrontDisplay={onFrontDisplay}
              onFrontError={onFrontError}
              retryStartupImages={retryStartupImages}
              productionDiscoveryQuery={productionDiscoveryQuery}
              productionDiscoverError={productionDiscoverError}
              productionSupplyState={productionSupplyState}
              productionQuota={productionQuota}
              discoveryPlaceholderState={discoveryPlaceholderState}
              isSafetyListReady={isSafetyListReady}
              safetyHydrationStatus={safetyHydrationStatus}
              safetyRetrying={safetyRetrying}
              handleRetrySafetyList={handleRetrySafetyList}
              refreshing={refreshing}
              handleRefresh={handleRefresh}
              discoveryWatch={discoveryWatch}
              discoveryWatchBusy={discoveryWatchBusy}
              handleActivateDiscoveryWatch={handleActivateDiscoveryWatch}
              handleCancelDiscoveryWatch={handleCancelDiscoveryWatch}
            />
          )}

          {discoverFeedback ? (
            <DiscoveryFeedbackPill
              discoverFeedback={discoverFeedback}
              feedbackAnim={feedbackAnim}
            />
          ) : null}

          {!isProductionDiscovery && pendingInviteCount > 0 ? (
            <PendingInviteStrip pendingInvites={pendingInvites} />
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
})
