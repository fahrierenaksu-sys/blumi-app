import assert from "node:assert/strict"
import test from "node:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { resolveRoomV2QaOwnedItemIds } = require("./roomV2QaOwnership") as typeof import("./roomV2QaOwnership")

test("QA-only room ownership is development-only, canonical, deduplicated, and immutable", () => {
  const candidates = [
    "universal_wall_clock_a",
    "universal_wall_clock_a",
    "universal_cloud_sectional_sofa_a",
    "not_a_catalog_item",
    "  ",
    "universal_table_lamp_a",
    "room_v2_cozy_bed"
  ]
  assert.deepEqual(
    resolveRoomV2QaOwnedItemIds({
      isDevelopmentRuntime: false,
      storageNamespace: "qa",
      candidateIds: candidates
    }),
    []
  )
  assert.deepEqual(
    resolveRoomV2QaOwnedItemIds({
      isDevelopmentRuntime: true,
      storageNamespace: "production",
      candidateIds: candidates
    }),
    []
  )
  const ids = resolveRoomV2QaOwnedItemIds({
    isDevelopmentRuntime: true,
    storageNamespace: "qa",
    candidateIds: candidates
  })
  assert.deepEqual(ids, [
    "universal_wall_clock_a",
    "universal_cloud_sectional_sofa_a",
    "universal_table_lamp_a",
    "room_v2_cozy_bed"
  ])
  candidates[0] = "mutated"
  assert.deepEqual(ids, [
    "universal_wall_clock_a",
    "universal_cloud_sectional_sofa_a",
    "universal_table_lamp_a",
    "room_v2_cozy_bed"
  ])
})
