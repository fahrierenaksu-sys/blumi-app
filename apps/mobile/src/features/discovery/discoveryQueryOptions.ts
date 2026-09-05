import type { DiscoveryFilters } from "@blumi/contracts"
import type { QueryFunctionContext } from "@tanstack/react-query"
import {
  fetchDiscoverPage,
  DiscoveryCursorResetError,
  DiscoveryRefreshLimitError,
  fetchDiscoveryWatch,
  type DiscoveryPageResult,
  type DiscoverProfileRecord
} from "./discoveryApi"

const DISCOVERY_PAGE_LIMIT = 12
const DISCOVERY_STALE_TIME_MS = 30_000

interface DiscoveryQueryScope {
  baseHttpUrl: string
  userId: string
}

export interface DiscoveryPageQueryInput extends DiscoveryQueryScope {
  sessionToken: string
  filters: Pick<DiscoveryFilters, "ageMin" | "ageMax"> & {
    genders: readonly DiscoveryFilters["genders"][number][]
    vibes: readonly string[]
  }
  enabled?: boolean
  fetcher?: typeof fetch
}

export interface DiscoveryWatchQueryInput extends DiscoveryQueryScope {
  sessionToken: string
  enabled?: boolean
  fetcher?: typeof fetch
}

export function buildDiscoveryPageQueryKey(input: {
  baseHttpUrl: string
  userId: string
  filters: DiscoveryPageQueryInput["filters"]
  cursor: string | undefined
  sessionToken?: string
}) {
  return [
    "discovery",
    "page",
    input.baseHttpUrl,
    input.userId,
    input.filters.ageMin,
    input.filters.ageMax,
    [...input.filters.genders],
    [...input.filters.vibes],
    input.cursor ?? null
  ] as const
}

export function buildDiscoveryWatchQueryKey(input: DiscoveryQueryScope) {
  return [
    "discovery",
    "watch",
    input.baseHttpUrl,
    input.userId
  ] as const
}

export function createDiscoveryPageQueryOptions(input: DiscoveryPageQueryInput) {
  const baseKey = buildDiscoveryPageQueryKey({
    baseHttpUrl: input.baseHttpUrl,
    userId: input.userId,
    filters: input.filters,
    cursor: undefined
  })

  return {
    queryKey: baseKey,
    initialPageParam: undefined as string | undefined,
    retry: (failureCount: number, error: Error) => !(error instanceof DiscoveryCursorResetError || error instanceof DiscoveryRefreshLimitError) && failureCount < 2,
    enabled: input.enabled ?? true,
    staleTime: DISCOVERY_STALE_TIME_MS,
    queryFn: ({
      pageParam,
      signal
    }: QueryFunctionContext<typeof baseKey, string | undefined>) =>
      fetchDiscoverPage(
        input.baseHttpUrl,
        input.sessionToken,
        {
          ageMin: input.filters.ageMin,
          ageMax: input.filters.ageMax,
          genders: [...input.filters.genders],
          vibes: [...input.filters.vibes]
        },
        { limit: DISCOVERY_PAGE_LIMIT, cursor: pageParam },
        input.fetcher ?? fetch,
        signal
      ),
    getNextPageParam: (lastPage: DiscoveryPageResult) =>
      lastPage.page.hasMore ? lastPage.page.nextCursor ?? undefined : undefined
  }
}

export function createDiscoveryWatchQueryOptions(input: DiscoveryWatchQueryInput) {
  return {
    queryKey: buildDiscoveryWatchQueryKey(input),
    enabled: input.enabled ?? true,
    staleTime: DISCOVERY_STALE_TIME_MS,
    queryFn: ({ signal }: QueryFunctionContext) =>
      fetchDiscoveryWatch(
        input.baseHttpUrl,
        input.sessionToken,
        input.fetcher ?? fetch,
        signal
      )
  }
}

export function flattenDiscoveryPages<T extends Pick<DiscoverProfileRecord, "userId">>(
  pages: { profiles: T[] }[]
): T[] {
  const byUserId = new Map<string, T>()
  for (const page of pages) {
    for (const profile of page.profiles) byUserId.set(profile.userId, profile)
  }
  return [...byUserId.values()]
}
