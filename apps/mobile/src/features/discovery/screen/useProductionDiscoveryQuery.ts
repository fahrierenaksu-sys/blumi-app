import { useCallback, useEffect, useMemo } from "react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData
} from "@tanstack/react-query"
import type { DiscoveryDecisionQuota } from "@blumi/contracts"
import type { DiscoverFilters } from "../../../components/DiscoverFiltersBottomSheet"
import { MOBILE_HTTP_BASE_URL } from "../../../config/env"
import {
  DiscoveryCursorResetError,
  type DiscoveryPageResult
} from "../discoveryApi"
import {
  buildDiscoveryPageQueryKey,
  createDiscoveryPageQueryOptions,
  createDiscoveryWatchQueryOptions,
  flattenDiscoveryPages,
  shouldPrefetchDiscoveryPage,
  shouldStartDiscoveryWatch
} from "../discoveryQueryOptions"
import { getDiscoveryErrorMessageForDisplay } from "../discoveryErrorCopy"
import type { SessionActor } from "../../session/sessionModel"

// The production Discover deck: an infinite, cursor-paged query plus the
// low-supply Vibe Card watch. Both stay disabled until filters are ready.
export function useProductionDiscoveryQuery(input: {
  sessionActor: SessionActor
  isProductionDiscovery: boolean
  filters: DiscoverFilters
  filtersReady: boolean
}) {
  const { sessionActor, isProductionDiscovery, filters, filtersReady } = input
  const queryClient = useQueryClient()
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
      enabled: shouldStartDiscoveryWatch({
        isProductionDiscovery,
        filtersReady,
        isInitialPagePending: productionDiscoveryQuery.isPending
      })
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
  const refreshProductionDiscover = useCallback(async (): Promise<void> => {
    if (!isProductionDiscovery || !filtersReady) return
    const result = await productionDiscoveryQuery.refetch()
    if (result.error) throw result.error
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [filtersReady, isProductionDiscovery, productionDiscoveryQuery.refetch])

  return {
    productionDiscoveryQuery,
    productionProfiles,
    productionQuota,
    productionSupplyState,
    productionDiscoverError,
    productionDiscoverLoading,
    discoveryWatch,
    updateProductionQuota,
    refreshProductionDiscover
  }
}

export type ProductionDiscoveryQuery = ReturnType<
  typeof useProductionDiscoveryQuery
>["productionDiscoveryQuery"]

// Prefetch admission: fetch the next cursor page only once the safety list is
// ready, the quota allows decisions, and the visible deck is running low.
export function useDiscoveryPrefetchAdmission(input: {
  productionDiscoveryQuery: ProductionDiscoveryQuery
  isProductionDiscovery: boolean
  isSafetyListReady: boolean
  discoveryQuotaExhausted: boolean
  availableCandidateCount: number
}) {
  const {
    productionDiscoveryQuery,
    isProductionDiscovery,
    isSafetyListReady,
    discoveryQuotaExhausted,
    availableCandidateCount
  } = input
  useEffect(() => {
    if (!shouldPrefetchDiscoveryPage({
      isProductionDiscovery,
      isSafetyListReady,
      isFetchingNextPage: productionDiscoveryQuery.isFetchingNextPage,
      hasNextPage: Boolean(productionDiscoveryQuery.hasNextPage),
      isQuotaExhausted: discoveryQuotaExhausted,
      availableCandidateCount
    })) return
    void productionDiscoveryQuery.fetchNextPage().catch(() => undefined)
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    availableCandidateCount,
    isProductionDiscovery,
    isSafetyListReady,
    discoveryQuotaExhausted,
    productionDiscoveryQuery.fetchNextPage,
    productionDiscoveryQuery.hasNextPage,
    productionDiscoveryQuery.isFetchingNextPage
  ])
}
