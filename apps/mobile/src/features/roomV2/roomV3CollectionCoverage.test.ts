import assert from "node:assert/strict"
import test from "node:test"
import {
  createRoomV3CollectionCoverageMatrix,
  summarizeRoomV3CollectionCoverage
} from "./roomV3CollectionCoverage"

test("full brief matrix keeps six homes, 45 categories and two themed variants", () => {
  const rows = createRoomV3CollectionCoverageMatrix()
  const themed = rows.filter((row) => row.wave === "themed")
  const byHomeCategory = new Map<string, string[]>()

  assert.equal(themed.length, 540)
  for (const row of themed) {
    const key = `${row.homeId}/${row.categoryId}`
    byHomeCategory.set(key, [
      ...(byHomeCategory.get(key) ?? []),
      row.variant
    ])
  }

  assert.equal(byHomeCategory.size, 6 * 45)
  assert.ok(
    [...byHomeCategory.values()].every((variants) => variants.join(",") === "a,b")
  )
})

test("coverage ledger marks the real Cocoa Navy pilots as asset candidates", () => {
  const rows = createRoomV3CollectionCoverageMatrix()
  const pilotRows = rows.filter(
    (row) => row.status === "candidate_asset_pending_runtime"
  )
  assert.deepEqual(pilotRows.map((row) => row.productId).sort(), [
    "room_v3_cocoa_navy_modern_studio_dining_chair_a",
    "room_v3_cocoa_navy_modern_studio_dining_chair_b",
    "room_v3_cocoa_navy_modern_studio_dining_table_a",
    "room_v3_cocoa_navy_modern_studio_dining_table_b",
    "room_v3_cocoa_navy_modern_studio_lounge_armchair_a",
    "room_v3_cocoa_navy_modern_studio_lounge_armchair_b"
  ])
  assert.ok(pilotRows.every((row) => row.directions.length === 4))
  assert.match(
    pilotRows.find((row) => row.productId.endsWith("lounge_armchair_b"))?.assetPath ?? "",
    /cocoa_navy_lounge_armchair_b/
  )
  assert.match(
    pilotRows.find((row) => row.productId.endsWith("dining_table_b"))?.assetPath ?? "",
    /cocoa_navy_dining_table_b/
  )
  assert.match(
    pilotRows.find((row) => row.productId.endsWith("dining_chair_a"))?.assetPath ?? "",
    /cocoa_dining_chair_a/
  )
  assert.match(
    pilotRows.find((row) => row.productId.endsWith("dining_chair_b"))?.assetPath ?? "",
    /cocoa_dining_chair_b/
  )
  assert.match(
    pilotRows.find((row) => row.productId.endsWith("dining_table_a"))?.assetPath ?? "",
    /cocoa_dining_table_a/
  )
  assert.match(
    pilotRows.find((row) => row.productId.endsWith("lounge_armchair_a"))?.assetPath ?? "",
    /cocoa_lounge_armchair_b/
  )
})

test("Universal Core keeps the verified single-view cushion set as a floor prop", () => {
  const rows = createRoomV3CollectionCoverageMatrix()
  const cushion = rows.find(
    (row) => row.productId === "room_v3_universal_core_cushion_set_a"
  )
  const summary = summarizeRoomV3CollectionCoverage()

  assert.deepEqual(
    {
      placementSurface: cushion?.placementSurface,
      status: cushion?.status
    },
    {
      placementSurface: "floor",
      status: "renderer_gallery_only"
    }
  )
  assert.deepEqual(summary, {
    homeCount: 6,
    categoryCount: 45,
    themedRows: 540,
    universalCoreRows: 45,
    totalRows: 585,
    themedCompleteRows: 6,
    themedPendingRows: 534,
    universalCoreRendererRows: 45,
    universalCorePlacementBlockedRows: 0
  })
})
