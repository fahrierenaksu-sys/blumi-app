import assert from "node:assert/strict"
import test from "node:test"
import type { DiscoveryPreferences } from "@blumi/contracts"
import {
  toDiscoveryFilters,
  toDiscoveryPreferences
} from "./settingsPreferencesModel"

const currentPreferences: DiscoveryPreferences = {
  ageMin: 24,
  ageMax: 42,
  genders: ["woman"],
  vibes: ["Bookish"],
  radiusKm: 50
}

test("settings projects discovery preferences to filters without sharing arrays", () => {
  const filters = toDiscoveryFilters(currentPreferences)

  assert.deepEqual(filters, {
    ageMin: 24,
    ageMax: 42,
    genders: ["woman"],
    vibes: ["Bookish"]
  })
  assert.notEqual(filters.genders, currentPreferences.genders)
  assert.notEqual(filters.vibes, currentPreferences.vibes)
})

test("settings preserves radius when saving edited discovery filters", () => {
  const next = toDiscoveryPreferences(
    {
      ageMin: 26,
      ageMax: 38,
      genders: ["man"],
      vibes: ["Outdoors"]
    },
    currentPreferences
  )

  assert.deepEqual(next, {
    ageMin: 26,
    ageMax: 38,
    genders: ["man"],
    vibes: ["Outdoors"],
    radiusKm: 50
  })
})

test("settings uses the product default radius for a new preference record", () => {
  assert.equal(
    toDiscoveryPreferences(
      { ageMin: 18, ageMax: 99, genders: [], vibes: [] },
      undefined
    ).radiusKm,
    25
  )
})
