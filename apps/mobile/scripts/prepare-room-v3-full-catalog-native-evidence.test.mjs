import assert from "node:assert/strict"
import test from "node:test"

import {
  FULL_CATALOG_BATCHES,
  getFullCatalogBatchSceneCount,
  parseFullCatalogAttachmentName
} from "./prepare-room-v3-full-catalog-native-evidence.mjs"
import { getCanonicalUniversalCoreIds } from "./verify-room-v3-universal-core-assets.mjs"

test("parses the exact shell and batch identity from an XCTest attachment name", () => {
  assert.deepEqual(
    parseFullCatalogAttachmentName(
      "room_shell_forest_terracotta_creative_loft_catalog_batch_06_0_842B842F-5360-4751-8275-31D30207940C.png"
    ),
    {
      shellSlug: "forest_terracotta_creative_loft",
      shellId: "room_v3_shell_forest_terracotta_creative_loft",
      batchIndex: 6,
      fileName: "forest_terracotta_creative_loft_catalog_batch_06.png"
    }
  )
})

test("rejects attachment names that cannot be bound to a shell and batch", () => {
  assert.throws(
    () => parseFullCatalogAttachmentName("room_shell_unknown.png"),
    /Unexpected full-catalog attachment name/
  )
})

test("the native six-batch plan covers the canonical 45-SKU catalog exactly once", async () => {
  assert.equal(FULL_CATALOG_BATCHES.length, 6)
  assert.ok(FULL_CATALOG_BATCHES.every((batch) => batch.length > 0 && batch.length <= 8))

  const plannedIds = FULL_CATALOG_BATCHES.flat()
  const canonicalIds = await getCanonicalUniversalCoreIds()
  assert.equal(plannedIds.length, 45)
  assert.equal(new Set(plannedIds).size, 45)
  assert.deepEqual([...plannedIds].sort(), [...canonicalIds].sort())
})

test("reports the real rendered scene count when a tabletop support is added", () => {
  assert.equal(getFullCatalogBatchSceneCount(1), 8)
  assert.equal(getFullCatalogBatchSceneCount(2), 8)
  assert.equal(getFullCatalogBatchSceneCount(3), 9)
  assert.equal(getFullCatalogBatchSceneCount(4), 8)
  assert.equal(getFullCatalogBatchSceneCount(5), 9)
  assert.equal(getFullCatalogBatchSceneCount(6), 5)
})
