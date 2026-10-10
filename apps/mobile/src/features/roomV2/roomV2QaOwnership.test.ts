import assert from "node:assert/strict"
import test from "node:test"

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { resolveRoomV2QaOwnedItemIds } = require("./roomV2QaOwnership") as typeof import("./roomV2QaOwnership")

test("QA-only room ownership is development-only, canonical, deduplicated, immutable and never grants retired candidates", () => {
  const candidates = [
    "universal_wall_clock_a",
    "universal_wall_clock_a",
    "universal_cloud_sectional_sofa_a",
    "not_a_catalog_item",
    "  ",
    "universal_table_lamp_a",
    "room_vnext_lamp",
    "room_v3_bed_blumi_starter",
    "room_v3_bed_blumi_starter"
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
  assert.deepEqual(ids, ["room_v3_bed_blumi_starter"])
  candidates[0] = "mutated"
  assert.deepEqual(ids, ["room_v3_bed_blumi_starter"])
})
