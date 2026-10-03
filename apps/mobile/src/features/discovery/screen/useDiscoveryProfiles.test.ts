import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryDecisionQuota, DiscoveryFilters } from "@blumi/contracts"
import type { InfiniteData } from "@tanstack/react-query"
import type { DiscoveryPageResult } from "../discoveryApi"
import type { SessionActor } from "../../session/sessionModel"
import type * as ProductionQuery from "./useProductionDiscoveryQuery"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"

function mount() {
  const runtime = createFakeReactRuntime()
  const quota: DiscoveryDecisionQuota = {
    limit: 10, used: 0, remaining: 10, extensionDecisions: 0,
    rewardedAd: { available: false, extensionDecisions: 10 },
    resetsAt: "2030-01-01T00:00:00.000Z"
  }
  let data: InfiniteData<DiscoveryPageResult> | undefined = {
    pages: [{ profiles: [{ userId: "fixture-profile", displayName: "Fixture" }],
      quota, supply: { state: "healthy", scope: "global" }, page: { nextCursor: null, hasMore: false } }],
    pageParams: [undefined]
  } as unknown as InfiniteData<DiscoveryPageResult>
  const refetch = async () => ({ error: null })
  const queryClient = {
    setQueryData: (_key: unknown, update: (current: typeof data) => typeof data) => { data = update(data) },
    resetQueries: async () => undefined
  }
  const { useProductionDiscoveryQuery } = loadSourceWithFakeReact<typeof ProductionQuery>(
    "features/discovery/screen/useProductionDiscoveryQuery.ts", runtime, {
      modules: {
        "@tanstack/react-query": {
          useQueryClient: () => queryClient,
          useInfiniteQuery: () => ({ data, refetch, error: null, isError: false, isPending: false, isFetchingNextPage: false }),
          useQuery: () => ({ data: null })
        },
        "../../../config/env": { MOBILE_HTTP_BASE_URL: "https://fixture.invalid" }
      },
      real: ["../discoveryApi", "../discoveryQueryOptions", "../discoveryDeckModel", "../discoveryErrorCopy"]
    }
  )
  let sessionActor = { profile: { userId: "fixture-owner" }, session: { sessionToken: "fixture-session", mode: "production" } } as unknown as SessionActor
  const filters: DiscoveryFilters = { ageMin: 18, ageMax: 99, genders: ["woman", "man"], vibes: [] }
  const render = () => runtime.render(() => useProductionDiscoveryQuery({ sessionActor, filters, filtersReady: true, isProductionDiscovery: true }))
  return { render, quota, setData: (next: typeof data) => { data = next }, data: () => data!,
    switchOwner: () => { sessionActor = { ...sessionActor, profile: { ...sessionActor.profile, userId: "fixture-other" } } },
    unmount: () => runtime.unmount() }
}

test("actual quota replies update the counter while preserving the profile input passed to the deck", () => {
  const f = mount()
  try {
    const first = f.render()
    first.updateProductionQuota({ ...f.quota, used: 1, remaining: 9 })
    const next = f.render()
    assert.equal(next.productionQuota?.remaining, 9)
    assert.equal(next.productionProfiles, first.productionProfiles)
    next.updateProductionQuota({ ...f.quota, used: 0, remaining: 10 })
    const late = f.render()
    assert.equal(late.productionQuota?.remaining, 9)
    assert.equal(late.productionProfiles, first.productionProfiles)
    const current = f.data()
    f.setData({ ...current, pages: current.pages.map((page) => ({ ...page,
      profiles: page.profiles.map((profile) => ({ ...profile, displayName: "Updated fixture" })) })) })
    const changed = f.render()
    assert.notEqual(changed.productionProfiles, first.productionProfiles)
    assert.equal(changed.productionProfiles[0].displayName, "Updated fixture")
  } finally { f.unmount() }
})

test("missing data for a different discovery query clears previous profiles immediately", () => {
  const f = mount()
  try {
    assert.equal(f.render().productionProfiles.length, 1)
    f.switchOwner()
    f.setData(undefined)
    const empty = f.render().productionProfiles
    assert.equal(empty.length, 0)
    assert.equal(f.render().productionProfiles, empty)
  } finally { f.unmount() }
})
