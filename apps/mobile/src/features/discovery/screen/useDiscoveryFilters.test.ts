import assert from "node:assert/strict"
import test from "node:test"
import { createFakeReactRuntime, loadSourceWithFakeReact } from "../../../testing/hookHarness"
import { DEFAULT_DISCOVERY_FILTERS } from "../discoveryFiltersModel"
import type { useDiscoveryFilters as UseDiscoveryFilters } from "./useDiscoveryFilters"

// Tab swipe jank (2026-10-03): every focus of Discover reloaded its filters
// into a new object, which re-rendered Discover, cleared the cards seen this
// session and rebuilt the deck on every swipe back to it.

function mount(discoveryPreferences: Record<string, unknown> | undefined) {
  const runtime = createFakeReactRuntime()
  let focusEffect: (() => void | (() => void)) | null = null
  const storage = {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined
  }
  const { useDiscoveryFilters } = loadSourceWithFakeReact<{ useDiscoveryFilters: typeof UseDiscoveryFilters }>(
    "features/discovery/screen/useDiscoveryFilters.ts",
    runtime,
    {
      modules: {
        "@react-native-async-storage/async-storage": { __esModule: true, default: storage },
        "@react-navigation/native": {
          useFocusEffect: (effect: () => void | (() => void)) => { focusEffect = effect }
        },
        "../../../components/DiscoverFiltersBottomSheet": { DEFAULT_DISCOVER_FILTERS: DEFAULT_DISCOVERY_FILTERS },
        "../../../ui/toast": { showToast: () => undefined }
      },
      real: ["../discoveryFiltersModel", "../lobbyPresentationModel"]
    }
  )
  const sessionActor = { profile: { userId: "user-a", discoveryPreferences } }
  const input = {
    sessionActor,
    isProductionDiscovery: true,
    lobbyCopy: {},
    onFiltersApplied: () => undefined
  } as unknown as Parameters<typeof UseDiscoveryFilters>[0]
  runtime.render(() => useDiscoveryFilters(input))
  const read = () => runtime.output as ReturnType<typeof UseDiscoveryFilters>
  return {
    runtime,
    read,
    /** The page gains focus (a swipe or tap lands on Discover). */
    async focus() {
      const cleanup = focusEffect?.()
      await new Promise((resolve) => setImmediate(resolve))
      return cleanup
    }
  }
}

test("refocusing Discover with unchanged filters keeps the same filters object and renders nothing", async () => {
  const discover = mount({ ageMin: 21, ageMax: 40, genders: ["woman"], vibes: ["cozy"] })
  await discover.focus()
  const first = discover.read().filters
  assert.equal(discover.read().filtersReady, true)
  assert.equal(first.ageMin, 21)
  const renders = discover.runtime.renderCount
  await discover.focus()
  await discover.focus()
  assert.equal(discover.read().filters, first, "same object, so the deck keeps its seen cards")
  assert.equal(discover.runtime.renderCount, renders, "no Discover render for an unchanged reload")
})
