import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON,
  ROOM_V3_CATALOG_MANIFEST_COUNTS,
  createRoomV3CatalogManifest,
  createRoomV3UniversalCoreManifest,
  getRoomV3RuntimeCatalogManifest,
  validateRoomV3CatalogManifest
} from "./roomV3CatalogManifest"
import { ROOM_V3_FURNITURE_CATEGORIES } from "./roomV3ProductionPlan"

test("Room V3 catalog manifest is deterministic, complete, and explicitly placed", () => {
  const first = createRoomV3CatalogManifest()
  const second = createRoomV3CatalogManifest()

  assert.deepEqual(first, second)
  assert.equal(first.length, 540)
  assert.equal(new Set(first.map((entry) => entry.id)).size, 540)
  assert.equal(new Set(first.map((entry) => entry.thumbnailKey)).size, 540)
  assert.ok(
    first.every(
      (entry) =>
        entry.placement.surface === entry.placementSurface &&
        entry.placement.rule === entry.placementRule &&
        entry.blockedReason === ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON
    )
  )
  assert.deepEqual(ROOM_V3_CATALOG_MANIFEST_COUNTS, {
    homeCollectionCount: 6,
    categoryCount: 45,
    themedProductCount: 540,
    universalCoreProductCount: 45,
    totalManifestEntryCount: 585,
    themedDirectionalProductCount: 396,
    themedSingleViewProductCount: 144,
    universalCoreCategoryCount: 45
  })
})

test("every themed category has stable variants and no asset can enter runtime", () => {
  const manifest = createRoomV3CatalogManifest()
  const variantsByThemeAndCategory = new Map<string, string[]>()

  for (const entry of manifest) {
    assert.equal(entry.runtimeEligible, false)
    assert.equal(entry.assetStatus, "unpromoted")
    assert.equal(entry.promotionStatus, "blocked")
    assert.equal(entry.productionStatus, "planned")
    assert.ok(entry.directions.length === 1 || entry.directions.length === 4)

    const key = `${entry.homeTheme}/${entry.categoryId}`
    variantsByThemeAndCategory.set(key, [
      ...(variantsByThemeAndCategory.get(key) ?? []),
      entry.variant
    ])
  }

  assert.equal(variantsByThemeAndCategory.size, 6 * 45)
  assert.ok(
    [...variantsByThemeAndCategory.values()].every((variants) =>
      variants.join(",") === "a,b"
    )
  )
  assert.deepEqual(getRoomV3RuntimeCatalogManifest(manifest), [])
})

test("Universal Core covers exactly one neutral entry for every category", () => {
  const universalCore = createRoomV3UniversalCoreManifest()
  const categoryCounts = new Map<string, number>()

  assert.equal(universalCore.length, 45)
  for (const entry of universalCore) {
    categoryCounts.set(entry.categoryId, (categoryCounts.get(entry.categoryId) ?? 0) + 1)
    assert.equal(entry.collectionId, "universal_core")
    assert.deepEqual(entry.compatibleOptionalRoomDirectionIds, ["ink_velvet_night_loft"])
    assert.equal(entry.placement.surface, entry.placementSurface)
    assert.equal(entry.placement.rule, entry.placementRule)
    assert.equal(entry.runtimeEligible, false)
    assert.equal(entry.blockedReason, ROOM_V3_CATALOG_MANIFEST_BLOCKED_REASON)
  }

  assert.equal(categoryCounts.size, 45)
  assert.ok([...categoryCounts.values()].every((count) => count === 1))
  assert.deepEqual(
    [...categoryCounts.keys()].sort(),
    ROOM_V3_FURNITURE_CATEGORIES.map((category) => category.id).sort()
  )
  assert.equal(validateRoomV3CatalogManifest(universalCore).isValid, true)
})

test("manifest factories return independent nested metadata copies", () => {
  const first = createRoomV3CatalogManifest()
  const second = createRoomV3CatalogManifest()

  first[0].directions.push("front")
  first[0].requiredMaterialFamilies.push("test-only")
  first[0].placement.rule = "wall_region"

  assert.notDeepEqual(first[0].directions, second[0].directions)
  assert.notDeepEqual(
    first[0].requiredMaterialFamilies,
    second[0].requiredMaterialFamilies
  )
  assert.notEqual(first[0].placement.rule, second[0].placement.rule)
})
