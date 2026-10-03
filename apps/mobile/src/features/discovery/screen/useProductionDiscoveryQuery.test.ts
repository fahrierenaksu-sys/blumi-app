import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { useDiscoveryPrefetchAdmission as UseDiscoveryPrefetchAdmission } from "./useProductionDiscoveryQuery"

function mountPrefetch() {
  const runtime = createFakeReactRuntime()
  const { useDiscoveryPrefetchAdmission } = loadSourceWithFakeReact<{
    useDiscoveryPrefetchAdmission: typeof UseDiscoveryPrefetchAdmission
  }>("features/discovery/screen/useProductionDiscoveryQuery.ts", runtime, {
    real: ["../discoveryQueryOptions"],
    inertUnknown: true
  })
  let requests = 0
  const fetchNextPage = async () => { requests += 1 }
  let query = {
    fetchNextPage,
    hasNextPage: true,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false
  }
  const render = (patch: Partial<typeof query> = {}) => {
    query = { ...query, ...patch }
    runtime.render(() => useDiscoveryPrefetchAdmission({
      productionDiscoveryQuery: query as unknown as Parameters<typeof UseDiscoveryPrefetchAdmission>[0]["productionDiscoveryQuery"],
      isProductionDiscovery: true,
      isSafetyListReady: true,
      discoveryQuotaExhausted: false,
      availableCandidateCount: 2
    }))
  }
  return { render, requests: () => requests, unmount: () => runtime.unmount() }
}

test("a failed next page stops automatic prefetch until explicit recovery clears the error", () => {
  const view = mountPrefetch()
  try {
    view.render()
    assert.equal(view.requests(), 1)
    view.render({ isFetching: true, isFetchingNextPage: true })
    // TanStack retains hasNextPage and the current cards after all bounded
    // retries fail. This transition used to start the same request again.
    view.render({ isFetching: false, isFetchingNextPage: false, isFetchNextPageError: true })
    view.render()
    assert.equal(view.requests(), 1, "failed pagination must not restart itself")
    view.render({ isFetchNextPageError: false })
    assert.equal(view.requests(), 2, "a refreshed deck may prefetch again")
  } finally { view.unmount() }
})

test("successful pagination can continue filling a low-supply deck", () => {
  const view = mountPrefetch()
  try {
    view.render()
    view.render({ isFetching: true, isFetchingNextPage: true })
    view.render({ isFetching: false, isFetchingNextPage: false })
    assert.equal(view.requests(), 2)
    view.render({ isFetching: true, isFetchingNextPage: true })
    view.render({ isFetching: false, isFetchingNextPage: false, hasNextPage: false })
    assert.equal(view.requests(), 2)
  } finally { view.unmount() }
})

test("a low-supply deck waits for a whole-deck refresh before requesting the next page", () => {
  const view = mountPrefetch()
  try {
    view.render({ isFetching: true, isFetchingNextPage: false })
    assert.equal(view.requests(), 0, "prefetch must not cancel an active refresh")
    view.render({ isFetching: false })
    assert.equal(view.requests(), 1)
  } finally { view.unmount() }
})
