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
