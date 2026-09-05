import assert from "node:assert/strict"
import test from "node:test"

const {
  resolveRoomV2ProviderRuntimeConfig
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2ProviderRuntime") as typeof import("./roomV2ProviderRuntime")

test("QA provider runtime keeps storage and ownership isolated from production", () => {
  const qa = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "qa-owner",
    storageNamespace: "qa",
    isDevelopmentRuntime: true,
    inventoryIsReady: false,
    inventoryOwnedItemIds: ["room_v2_legacy_probe"],
    qaOnlyOwnedRoomItemIds: [
      "universal_orbit_floor_lamp_a",
      "not_a_catalog_item",
      "universal_orbit_floor_lamp_a"
    ]
  })

  assert.equal(
    qa.storageKey,
    "@blumi/room_v2/user_room_decor:v2:qa-owner:qa"
  )
  assert.equal(
    qa.migrationMarkerKey,
    "@blumi/room_v2/migrated:v2:qa-owner:qa"
  )
  assert.deepEqual(qa.ownedRoomItemIds, [
    "room_v2_legacy_probe",
    "universal_orbit_floor_lamp_a"
  ])
  assert.equal(qa.inventoryReadyForRoomEdits, true)

  const production = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "qa-owner",
    storageNamespace: "production",
    isDevelopmentRuntime: true,
    inventoryIsReady: false,
    inventoryOwnedItemIds: ["room_v2_legacy_probe"],
    qaOnlyOwnedRoomItemIds: ["universal_orbit_floor_lamp_a"]
  })

  assert.equal(
    production.storageKey,
    "@blumi/room_v2/user_room_decor:v2:qa-owner"
  )
  assert.equal(
    production.migrationMarkerKey,
    "@blumi/room_v2/migrated:v2:qa-owner"
  )
  assert.deepEqual(production.ownedRoomItemIds, ["room_v2_legacy_probe"])
  assert.equal(production.inventoryReadyForRoomEdits, false)
})

test("provider runtime config fails closed for an ownerless scope", () => {
  const result = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "  ",
    storageNamespace: "qa",
    isDevelopmentRuntime: true,
    inventoryIsReady: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: ["universal_orbit_floor_lamp_a"]
  })

  assert.equal(result.storageKey, null)
  assert.equal(result.migrationMarkerKey, null)
  assert.deepEqual(result.ownedRoomItemIds, ["universal_orbit_floor_lamp_a"])
  assert.equal(result.inventoryReadyForRoomEdits, true)
})

test("room onboarding can place only the free starter bed before inventory hydration", () => {
  const result = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "starter-owner",
    storageNamespace: "production",
    isDevelopmentRuntime: false,
    inventoryIsReady: false,
    allowStarterOnboardingEdits: true,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: []
  })

  assert.ok(result.ownedRoomItemIds.includes("room_v2_cozy_bed"))
  assert.equal(result.inventoryReadyForRoomEdits, true)
})

test("hydrated inventory does not gain the starter bed outside onboarding", () => {
  const result = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "returning-owner",
    storageNamespace: "production",
    isDevelopmentRuntime: false,
    inventoryIsReady: true,
    allowStarterOnboardingEdits: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: []
  })

  assert.deepEqual(result.ownedRoomItemIds, [])
  assert.equal(result.inventoryReadyForRoomEdits, true)
})

test("an explicitly authorized native UI QA runtime can persist isolated candidate ownership in Release", () => {
  const result = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "native-ui-qa-owner",
    storageNamespace: "qa",
    isDevelopmentRuntime: false,
    isQaRuntimeAuthorized: true,
    inventoryIsReady: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: [
      "universal_cloud_loveseat_a",
      "universal_cloud_loveseat_a",
      "not_a_catalog_item"
    ]
  })

  assert.deepEqual(result.ownedRoomItemIds, ["universal_cloud_loveseat_a"])
  assert.equal(result.inventoryReadyForRoomEdits, true)
  assert.equal(
    result.storageKey,
    "@blumi/room_v2/user_room_decor:v2:native-ui-qa-owner:qa"
  )
})

test("an unauthorized Release runtime cannot gain QA ownership", () => {
  const result = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "release-owner",
    storageNamespace: "qa",
    isDevelopmentRuntime: false,
    isQaRuntimeAuthorized: false,
    inventoryIsReady: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: ["universal_cloud_loveseat_a"]
  })

  assert.deepEqual(result.ownedRoomItemIds, [])
  assert.equal(result.inventoryReadyForRoomEdits, false)
})

test("VNext QA owns the starter bed only in its isolated namespace", () => {
  const qa = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "vnext-qa-owner",
    storageNamespace: "qa",
    isDevelopmentRuntime: false,
    isQaRuntimeAuthorized: true,
    inventoryIsReady: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: [],
    isVNextRuntimeProof: true
  })

  assert.deepEqual(qa.ownedRoomItemIds, ["room_v2_cozy_bed"])
  assert.equal(qa.inventoryReadyForRoomEdits, true)

  const production = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "vnext-production-owner",
    storageNamespace: "production",
    isDevelopmentRuntime: false,
    isQaRuntimeAuthorized: false,
    inventoryIsReady: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: [],
    isVNextRuntimeProof: true
  })

  assert.deepEqual(production.ownedRoomItemIds, [])
  assert.equal(production.inventoryReadyForRoomEdits, false)
})

test("full-wave QA ownership never leaks the onboarding starter bed", () => {
  const result = resolveRoomV2ProviderRuntimeConfig({
    storageScopeId: "full-wave-qa-owner",
    storageNamespace: "qa",
    isDevelopmentRuntime: false,
    isQaRuntimeAuthorized: true,
    inventoryIsReady: false,
    inventoryOwnedItemIds: [],
    qaOnlyOwnedRoomItemIds: ["universal_cloud_loveseat_a"],
    allowStarterOnboardingEdits: false,
    isVNextRuntimeProof: false,
    excludedRoomItemIds: ["room_v2_cozy_bed"]
  })

  assert.deepEqual(result.ownedRoomItemIds, ["universal_cloud_loveseat_a"])
  assert.ok(!result.ownedRoomItemIds.includes("room_v2_cozy_bed"))
  assert.equal(result.inventoryReadyForRoomEdits, true)
})
