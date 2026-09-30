import type { ComponentProps } from "react"
import { StyleSheet, View } from "react-native"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"
import type { BlockStoreView } from "../../safety/blockStore"
import type { DiscoverSwipeValues } from "../useDiscoverSwipeValues"
import type { SessionActor } from "../../session/sessionModel"
import { getAppLocale } from "../../session/appLocale"
import { DiscoveryDeckView } from "../DiscoveryDeckView"
import {
  DiscoverErrorCard,
  EmptyDiscoveryDeck,
  LoadingDiscoveryDeck
} from "../EmptyDiscoveryDeck"
import type { DiscoveryCandidate } from "../discoveryCandidateModel"
import type { DiscoveryPageResult } from "../discoveryApi"
import {
  getDiscoverNotReadyMessage,
  resolveDiscoverErrorCardMessage,
  type ProductionDiscoveryPlaceholderState
} from "./discoveryScreenModel"
import type {
  ProductionDiscoveryQuery,
  useProductionDiscoveryQuery
} from "./useProductionDiscoveryQuery"

// The non-demo Discover deck: the shared swipe deck, its loading / empty /
// error placeholders, and the startup-failure overlay. While the startup
// failure shows, the deck underneath is hidden from touch and accessibility.
export function DiscoverDeckSurface(props: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
  visibleDiscoverDeck: DiscoveryCandidate[]
  featuredCandidate: DiscoveryCandidate | null
  showcaseRequest: ComponentProps<typeof DiscoveryDeckView>["showcaseRequest"]
  cardDragX: DiscoverSwipeValues
  handlePrimaryLike: () => void
  handleSkipFeatured: () => void
  progressLabel: string | null
  likeDisabled: boolean
  discoveryQuotaExhausted: boolean
  inFlightDecisionUserIds: ReadonlySet<string>
  startupScope: string
  startupComplete: boolean
  startupImagesReady: boolean
  showStartupFailure: boolean
  onFrontDisplay: (part: "layout" | "surface" | "avatar") => void
  onFrontError: () => void
  retryStartupImages: () => void
  productionDiscoveryQuery: ProductionDiscoveryQuery
  productionDiscoverError: string | null
  productionSupplyState: DiscoveryPageResult["supply"]["state"] | undefined
  productionQuota: DiscoveryDecisionQuota | null
  discoveryPlaceholderState: ProductionDiscoveryPlaceholderState
  isSafetyListReady: boolean
  safetyHydrationStatus: BlockStoreView["hydrationStatus"]
  safetyRetrying: boolean
  handleRetrySafetyList: () => void
  refreshing: boolean
  handleRefresh: () => Promise<void>
  discoveryWatch: ReturnType<typeof useProductionDiscoveryQuery>["discoveryWatch"]
  discoveryWatchBusy: boolean
  handleActivateDiscoveryWatch: () => Promise<void>
  handleCancelDiscoveryWatch: () => Promise<void>
}) {
  const {
    sessionActor,
    isProductionDiscovery,
    visibleDiscoverDeck,
    featuredCandidate,
    showcaseRequest,
    cardDragX,
    handlePrimaryLike,
    handleSkipFeatured,
    progressLabel,
    likeDisabled,
    discoveryQuotaExhausted,
    inFlightDecisionUserIds,
    startupScope,
    startupComplete,
    startupImagesReady,
    showStartupFailure,
    onFrontDisplay,
    onFrontError,
    retryStartupImages,
    productionDiscoveryQuery,
    productionDiscoverError,
    productionSupplyState,
    productionQuota,
    discoveryPlaceholderState,
    isSafetyListReady,
    safetyHydrationStatus,
    safetyRetrying,
    handleRetrySafetyList,
    refreshing,
    handleRefresh,
    discoveryWatch,
    discoveryWatchBusy,
    handleActivateDiscoveryWatch,
    handleCancelDiscoveryWatch
  } = props
  const myUserId = sessionActor.profile.userId
  const myDisplayName = sessionActor.profile.displayName
  return (
    <View>
      <View pointerEvents={showStartupFailure ? "none" : "auto"}
        accessibilityElementsHidden={showStartupFailure}
        importantForAccessibility={showStartupFailure ? "no-hide-descendants" : "auto"}
        style={showStartupFailure ? { opacity: 0 } : undefined}>
      <DiscoveryDeckView
        profiles={visibleDiscoverDeck}
        onFrontDisplay={onFrontDisplay}
        onFrontImageError={onFrontError}
        key={startupScope}
        deferSecondaryImages={isProductionDiscovery && !startupComplete && !startupImagesReady}
        showcaseRequest={showcaseRequest}
        swipeAnim={cardDragX}
        onSwipeRight={handlePrimaryLike}
        onSwipeLeft={handleSkipFeatured}
        progressLabel={progressLabel ?? "Fresh vibes soon"}
        likeDisabled={likeDisabled}
        actionsDisabled={discoveryQuotaExhausted || (featuredCandidate ? inFlightDecisionUserIds.has(featuredCandidate.userId) : false)}
          emptyContent={(
          productionDiscoverError || discoveryPlaceholderState === "error" || showStartupFailure ? (
            <DiscoverErrorCard
              message={resolveDiscoverErrorCardMessage({
                locale: getAppLocale(),
                placeholderState: discoveryPlaceholderState,
                safetyHydrationFailed: safetyHydrationStatus === "failed",
                productionDiscoverError
              })}
              refreshing={refreshing || safetyRetrying}
              onRetry={() => {
                retryStartupImages()
                if (safetyHydrationStatus === "failed") handleRetrySafetyList()
                if (productionDiscoverError || showStartupFailure) void productionDiscoveryQuery.refetch()
              }}
            />
          ) : discoveryPlaceholderState === "loading" ? (
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
      {showStartupFailure ? (
        <View style={StyleSheet.absoluteFill}>
          <DiscoverErrorCard
            message={getDiscoverNotReadyMessage(getAppLocale())}
            refreshing={productionDiscoveryQuery.isFetching}
            onRetry={() => {
              retryStartupImages()
              if (!isSafetyListReady) handleRetrySafetyList()
              if (!productionDiscoveryQuery.data || productionDiscoverError) void productionDiscoveryQuery.refetch()
            }}
          />
        </View>
      ) : null}
    </View>
  )
}
