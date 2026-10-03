import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"
import type { DiscoverFilters } from "../../../components/DiscoverFiltersBottomSheet"
import { useSavedConnections } from "../../connections/savedConnectionsStore"
import {
  buildAvailableDiscoveryCandidates,
  createLiveDiscoveryCandidate,
  createProductionDiscoveryCandidate,
  createDiscoveryCandidateSelector,
  type DiscoveryCandidate
} from "../discoveryCandidateModel"
import { applyOptimisticDiscoveryDecision } from "../discoveryDeckModel"
import type { DiscoverProfileRecord } from "../discoveryApi"
import type { UseLobbyFlowResult } from "../../lobby/useLobbyFlow"

export type SeenCandidateIds = Set<string>
export type SetSeenCandidateIds = Dispatch<SetStateAction<SeenCandidateIds>>

// Cards decided (or skipped) during this Discover session. Owned separately
// so filters, decisions and the deck can all reset or extend it.
export function useDiscoverySeenCandidates() {
  const [seenThisSessionUserIds, setSeenThisSessionUserIds] = useState<Set<string>>(
    () => new Set()
  )
  const resetSeenCandidates = useCallback((): void => {
    setSeenThisSessionUserIds(new Set())
  }, [])
  const markCandidateSeen = useCallback((userId: string): void => {
    setSeenThisSessionUserIds((current) =>
      applyOptimisticDiscoveryDecision(current, userId)
    )
  }, [])
  return {
    seenThisSessionUserIds,
    setSeenThisSessionUserIds,
    resetSeenCandidates,
    markCandidateSeen
  }
}

export function useDiscoveryDeck(input: {
  ownerUserId: string
  isProductionDiscovery: boolean
  filters: DiscoverFilters
  filtersReady: boolean
  productionProfiles: readonly DiscoverProfileRecord[]
  productionQuota: DiscoveryDecisionQuota | null
  nearbyUsers: UseLobbyFlowResult["nearbyUsers"]
  isSafetyListReady: boolean
  /** Content-stable: keeps its identity while the block list is unchanged. */
  blockedUserIds: readonly string[]
  pendingInviteUserIds: ReadonlySet<string>
  seenThisSessionUserIds: Set<string>
  setSeenThisSessionUserIds: SetSeenCandidateIds
}) {
  const {
    ownerUserId,
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
  } = input
  const { saved: savedConnections, skipped: skippedConnections } = useSavedConnections(
    ownerUserId
  )

  useEffect(() => {
    if (!isProductionDiscovery || !filtersReady) return
    setSeenThisSessionUserIds(new Set())
  }, [filters, filtersReady, isProductionDiscovery, setSeenThisSessionUserIds])

  const skippedUserIds = useMemo(
    () => new Set(skippedConnections.map((entry) => entry.userId)),
    [skippedConnections]
  )

  const savedUserIds = useMemo(
    () => new Set(savedConnections.map((entry) => entry.userId)),
    [savedConnections]
  )

  const blockedUserIdSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds])

  // Account and source mode changes drop all projections. Within that scope,
  // unchanged profiles keep the same card inputs across cursor-page appends.
  const candidateScope = useMemo(
    () => ({ ownerUserId, isProductionDiscovery }),
    [ownerUserId, isProductionDiscovery]
  )
  const selectorsRef = useRef<{
    production: ReturnType<typeof createDiscoveryCandidateSelector<DiscoverProfileRecord>>
    live: ReturnType<typeof createDiscoveryCandidateSelector<UseLobbyFlowResult["nearbyUsers"][number]>>
  } | null>(null)
  if (selectorsRef.current === null) {
    selectorsRef.current = {
      production: createDiscoveryCandidateSelector(createProductionDiscoveryCandidate),
      live: createDiscoveryCandidateSelector(createLiveDiscoveryCandidate)
    }
  }
  const discoverSourceUsers = useMemo<DiscoveryCandidate[]>(
    () => {
      const selectors = selectorsRef.current
      if (selectors === null) return []
      return isProductionDiscovery
        ? selectors.production(productionProfiles, candidateScope)
        : selectors.live(nearbyUsers, candidateScope)
    },
    [candidateScope, isProductionDiscovery, nearbyUsers, productionProfiles]
  )

  // The inactive mode must not retain another account's previous sources.
  useEffect(() => {
    const selectors = selectorsRef.current
    if (selectors === null) return
    const inactive = isProductionDiscovery ? selectors.live : selectors.production
    inactive([], candidateScope)
  }, [candidateScope, isProductionDiscovery])

  const discoverDeck = useMemo<DiscoveryCandidate[]>(() => {
    if (isProductionDiscovery && !isSafetyListReady) return []
    return buildAvailableDiscoveryCandidates(discoverSourceUsers, {
      blockedUserIds: blockedUserIdSet,
      skippedUserIds,
      savedUserIds,
      seenUserIds: seenThisSessionUserIds,
      pendingInviteUserIds
    })
  }, [
    discoverSourceUsers,
    blockedUserIdSet,
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
    // Production Discover never uses lobby presence (legacy lobby retired,
    // owner decision 2026-09-30), so lobby churn must not reset seen cards.
    if (isProductionDiscovery) return
    setSeenThisSessionUserIds((current) => {
      const nearbyUserIds = new Set(nearbyUsers.map((user) => user.userId))
      const next = new Set(
        [...current].filter((userId) => nearbyUserIds.has(userId))
      )
      return next.size === current.size ? current : next
    })
  }, [isProductionDiscovery, nearbyUsers, setSeenThisSessionUserIds])

  const nearbyCount = useMemo(
    () => isProductionDiscovery && !isSafetyListReady
      ? 0
      : discoverSourceUsers.filter((u) => !u.blocked && !blockedUserIdSet.has(u.userId)).length,
    [blockedUserIdSet, discoverSourceUsers, isProductionDiscovery, isSafetyListReady]
  )

  return {
    discoverSourceUsers,
    discoverDeck,
    discoveryQuotaExhausted,
    visibleDiscoverDeck,
    featuredCandidate,
    nearbyCount
  }
}
