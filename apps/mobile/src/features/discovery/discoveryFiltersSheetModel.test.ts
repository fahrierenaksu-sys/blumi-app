import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryFilters } from "@blumi/contracts"
import { DEFAULT_DISCOVERY_FILTERS } from "./discoveryFiltersModel"
import {
  DISCOVERY_AUDIENCE_OPTIONS,
  clampDiscoveryAge,
  formatDiscoveryAgeRange,
  getDiscoveryAgeAtSliderOffset,
  getDiscoveryAgeSliderOffset,
  getDiscoveryAudience,
  hasVisibleDiscoveryFilterChanges,
  resetVisibleDiscoveryFilters,
  resolveDiscoveryAgeEdge,
  shouldStackDiscoveryAudience,
  withDiscoveryAgeEdge,
  withDiscoveryAudience
} from "./discoveryFiltersSheetModel"

const withLegacyVibes: DiscoveryFilters = {
  ageMin: 24,
  ageMax: 35,
  genders: ["woman"],
  vibes: ["Bookish", "Night owl"]
}

test("show me offers everyone, women and men, and both genders read as everyone", () => {
  assert.deepEqual(DISCOVERY_AUDIENCE_OPTIONS, ["everyone", "woman", "man"])
  assert.equal(getDiscoveryAudience([]), "everyone")
  assert.equal(getDiscoveryAudience(["woman"]), "woman")
  assert.equal(getDiscoveryAudience(["man", "man"]), "man")
  assert.equal(getDiscoveryAudience(["woman", "man"]), "everyone")
})

test("choosing an audience stores the matching genders and keeps everything else", () => {
  assert.deepEqual(withDiscoveryAudience(withLegacyVibes, "man"), { ...withLegacyVibes, genders: ["man"] })
  assert.deepEqual(withDiscoveryAudience(withLegacyVibes, "everyone"), { ...withLegacyVibes, genders: [] })
  // Re-selecting the current audience changes nothing, not even stored [woman, man].
  const both: DiscoveryFilters = { ...withLegacyVibes, genders: ["woman", "man"] }
  assert.equal(withDiscoveryAudience(both, "everyone"), both)
  assert.equal(withDiscoveryAudience(withLegacyVibes, "woman"), withLegacyVibes)
})

test("age ends stay whole, in range, and never cross", () => {
  assert.equal(clampDiscoveryAge(17), 18)
  assert.equal(clampDiscoveryAge(120), 99)
  assert.equal(clampDiscoveryAge(30.6), 31)
  assert.equal(clampDiscoveryAge(Number.NaN), 18)
  assert.equal(resolveDiscoveryAgeEdge("min", 40, 35), 35)
  assert.equal(resolveDiscoveryAgeEdge("max", 20, 24), 24)
  assert.equal(resolveDiscoveryAgeEdge("min", 10, 35), 18)
  assert.equal(resolveDiscoveryAgeEdge("max", 140, 24), 99)

  assert.deepEqual(withDiscoveryAgeEdge(withLegacyVibes, "min", 30), { ...withLegacyVibes, ageMin: 30 })
  assert.deepEqual(withDiscoveryAgeEdge(withLegacyVibes, "max", 20), { ...withLegacyVibes, ageMax: 24 })
  assert.equal(withDiscoveryAgeEdge(withLegacyVibes, "min", 24), withLegacyVibes, "no-op keeps identity")
})

test("reset clears only what the sheet shows and keeps stored vibes", () => {
  const reset = resetVisibleDiscoveryFilters(withLegacyVibes)
  assert.deepEqual(reset, { ageMin: 18, ageMax: 99, genders: [], vibes: ["Bookish", "Night owl"] })
  assert.equal(hasVisibleDiscoveryFilterChanges(reset), false, "vibes alone do not enable Reset")
  assert.equal(hasVisibleDiscoveryFilterChanges(DEFAULT_DISCOVERY_FILTERS), false)
  assert.equal(hasVisibleDiscoveryFilterChanges({ ...DEFAULT_DISCOVERY_FILTERS, ageMax: 40 }), true)
  assert.equal(hasVisibleDiscoveryFilterChanges({ ...DEFAULT_DISCOVERY_FILTERS, genders: ["man"] }), true)
  assert.equal(hasVisibleDiscoveryFilterChanges({ ...DEFAULT_DISCOVERY_FILTERS, genders: ["woman", "man"] }), false)
})

test("every sheet edit passes legacy vibes through to the saved filters", () => {
  let draft = withLegacyVibes
  draft = withDiscoveryAudience(draft, "everyone")
  draft = withDiscoveryAgeEdge(draft, "min", 21)
  draft = withDiscoveryAgeEdge(draft, "max", 45)
  draft = resetVisibleDiscoveryFilters(draft)
  assert.deepEqual(draft.vibes, ["Bookish", "Night owl"])
})

test("the age range reads as one value", () => {
  assert.equal(formatDiscoveryAgeRange(18, 99), "18–99")
  assert.equal(formatDiscoveryAgeRange(30, 30), "30")
})

test("slider offsets map whole ages to the track and back", () => {
  const width = 243
  assert.equal(getDiscoveryAgeSliderOffset(18, width), 0)
  assert.equal(getDiscoveryAgeSliderOffset(99, width), width)
  assert.equal(getDiscoveryAgeSliderOffset(200, width), width)
  assert.equal(getDiscoveryAgeSliderOffset(40, 0), 0, "unmeasured track")
  for (let age = 18; age <= 99; age += 1) {
    assert.equal(getDiscoveryAgeAtSliderOffset(getDiscoveryAgeSliderOffset(age, width), width), age)
  }
  assert.equal(getDiscoveryAgeAtSliderOffset(-50, width), 18)
  assert.equal(getDiscoveryAgeAtSliderOffset(width + 50, width), 99)
  assert.equal(getDiscoveryAgeAtSliderOffset(Number.NaN, width), 18)
  assert.equal(getDiscoveryAgeAtSliderOffset(100, 0), 18)
})

test("show me segments share a row unless the text would not fit (320–430 pt)", () => {
  const longest = "Kadınlar".length
  for (const windowWidth of [320, 375, 390, 430]) {
    assert.equal(shouldStackDiscoveryAudience({ windowWidth, fontScale: 1, longestLabelLength: longest }), false, `${windowWidth} pt at default size`)
    assert.equal(shouldStackDiscoveryAudience({ windowWidth, fontScale: 2, longestLabelLength: longest }), true, `${windowWidth} pt at accessibility sizes`)
  }
  assert.equal(shouldStackDiscoveryAudience({ windowWidth: 320, fontScale: 1.235, longestLabelLength: longest }), true)
  assert.equal(shouldStackDiscoveryAudience({ windowWidth: 390, fontScale: 1.235, longestLabelLength: longest }), false)
  assert.equal(shouldStackDiscoveryAudience({ windowWidth: 390, fontScale: Number.NaN, longestLabelLength: longest }), false)
  assert.equal(shouldStackDiscoveryAudience({ windowWidth: 0, fontScale: 1, longestLabelLength: longest }), true)
})
