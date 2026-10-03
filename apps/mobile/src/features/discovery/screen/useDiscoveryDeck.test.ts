import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import type { useDiscoveryDeck as UseDiscoveryDeck } from "./useDiscoveryDeck"

// Characterizes the Discover deck's invalidation: it rebuilds when the block
// list's content changes, never when only the safety view object changes.
type DeckInput = Parameters<typeof UseDiscoveryDeck>[0]

const SAVED = { saved: [], skipped: [] }
const nearby = (userId: string) => ({ userId, displayName: userId, spotId: `spot-${userId}`, canInvite: true, blocked: false })

function mount() {
  const runtime = createFakeReactRuntime()
  const { useDiscoveryDeck } = loadSourceWithFakeReact<{ useDiscoveryDeck: typeof UseDiscoveryDeck }>(
    "features/discovery/screen/useDiscoveryDeck.ts",
    runtime,
    {
      modules: {
        "../../connections/savedConnectionsStore": { useSavedConnections: () => SAVED }
      },
      real: ["../discoveryCandidateModel", "../discoveryDeckModel"]
    }
  )
  const nearbyUsers = [nearby("a"), nearby("b"), nearby("c")]
  const seen = new Set<string>()
  const pending = new Set<string>()
  let input = {
    ownerUserId: "owner",
    isProductionDiscovery: false,
    filters: {},
    filtersReady: true,
    productionProfiles: [],
    productionQuota: null,
    nearbyUsers,
    isSafetyListReady: true,
    blockedUserIds: [] as readonly string[],
    pendingInviteUserIds: pending,
    seenThisSessionUserIds: seen,
    setSeenThisSessionUserIds: () => undefined
  } as unknown as DeckInput
  const render = (next: Record<string, unknown> = {}) => {
    input = { ...input, ...next } as DeckInput
    return runtime.render(() => useDiscoveryDeck(input))
  }
  return { render }
}

test("the deck keeps its identity while the block list content is unchanged", () => {
  const f = mount()
  const blockedUserIds = ["b"]
  const first = f.render({ blockedUserIds })
  assert.deepEqual(first.discoverDeck.map(({ userId }) => userId), ["a", "c"])
  assert.equal(first.nearbyCount, 2)
  // A new safety view (for example a hydration status change) with the same list.
  const second = f.render({ blockedUserIds })
  assert.equal(second.discoverDeck, first.discoverDeck)
})

test("blocking someone rebuilds the deck and the nearby count without them", () => {
  const f = mount()
  const first = f.render({ blockedUserIds: [] })
  assert.equal(first.nearbyCount, 3)
  const next = f.render({ blockedUserIds: ["a"] })
  assert.notEqual(next.discoverDeck, first.discoverDeck)
  assert.deepEqual(next.discoverDeck.map(({ userId }) => userId), ["b", "c"])
  assert.equal(next.nearbyCount, 2)
})

test("production discovery stays empty until the safety list is ready", () => {
  const f = mount()
  const result = f.render({ isProductionDiscovery: true, isSafetyListReady: false, blockedUserIds: [] })
  assert.deepEqual(result.discoverDeck, [])
  assert.equal(result.nearbyCount, 0)
})

const productionProfile = (userId: string) => ({
  userId, displayName: userId, vibeTags: [], signals: [],
  avatar: { presetId: "avatar_v2_body_default", revision: 1 }
})

test("appending a page preserves existing card inputs while refreshed profiles replace them", () => {
  const f = mount()
  const profile = productionProfile("first")
  const first = f.render({ isProductionDiscovery: true, productionProfiles: [profile] })
  const appended = f.render({ productionProfiles: [profile, productionProfile("next")] })
  assert.equal(appended.featuredCandidate, first.featuredCandidate)
  const refreshed = f.render({ productionProfiles: [{ ...profile, displayName: "Updated" }] })
  assert.notEqual(refreshed.featuredCandidate, first.featuredCandidate)
  assert.equal(refreshed.featuredCandidate?.displayName, "Updated")
  assert.deepEqual(refreshed.discoverDeck.map(({ userId }) => userId), ["first"])
})

test("stable projections still obey blocked, seen, pending and exhausted quota gates", () => {
  const f = mount()
  const profiles = [productionProfile("first"), productionProfile("next")]
  const first = f.render({ isProductionDiscovery: true, productionProfiles: profiles })
  const blocked = f.render({ blockedUserIds: ["first"] })
  assert.equal(blocked.featuredCandidate, first.discoverDeck[1])
  assert.deepEqual(blocked.visibleDiscoverDeck.map(({ userId }) => userId), ["next"])
  const seen = f.render({ blockedUserIds: [], seenThisSessionUserIds: new Set(["next"]) })
  assert.equal(seen.featuredCandidate, first.featuredCandidate)
  const pending = f.render({ pendingInviteUserIds: new Set(["first"]) })
  assert.deepEqual(pending.visibleDiscoverDeck, [])
  const exhausted = f.render({ seenThisSessionUserIds: new Set(), pendingInviteUserIds: new Set(), productionQuota: { remaining: 0 } })
  assert.deepEqual(exhausted.visibleDiscoverDeck, [])
  assert.equal(exhausted.featuredCandidate, null)
})

test("owner and mode switches drop cached projections even when sources are reused", () => {
  const f = mount()
  const profiles = [productionProfile("first")]
  const first = f.render({ isProductionDiscovery: true, productionProfiles: profiles })
  const switched = f.render({ ownerUserId: "other-owner" })
  assert.notEqual(switched.featuredCandidate, first.featuredCandidate)
  const empty = f.render({ productionProfiles: [] })
  assert.deepEqual(empty.discoverSourceUsers, [])
  const returned = f.render({ productionProfiles: profiles })
  assert.notEqual(returned.featuredCandidate, switched.featuredCandidate)
  f.render({ isProductionDiscovery: false })
  assert.notEqual(f.render({ isProductionDiscovery: true }).featuredCandidate, returned.featuredCandidate)
})
