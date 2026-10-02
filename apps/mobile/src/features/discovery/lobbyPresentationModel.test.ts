import assert from "node:assert/strict"
import test from "node:test"
import { countActiveDiscoverFilters } from "./lobbyPresentationModel"
import { DEFAULT_DISCOVERY_FILTERS } from "./discoveryFiltersModel"

test("discovery filter count only reports changed filter groups", () => {
  assert.equal(countActiveDiscoverFilters(DEFAULT_DISCOVERY_FILTERS), 0)
  assert.equal(
    countActiveDiscoverFilters({
      ...DEFAULT_DISCOVERY_FILTERS,
      ageMin: 24,
      genders: ["woman"]
    }),
    2
  )
  assert.equal(
    countActiveDiscoverFilters({
      ...DEFAULT_DISCOVERY_FILTERS,
      vibes: ["Bookish"]
    }),
    1
  )
})
