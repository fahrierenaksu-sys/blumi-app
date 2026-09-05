import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomV3UniversalCoreInventoryStatus
} from "./roomV3UniversalCoreInventory"

test("Universal Core inventory reports category coverage without hiding blocked candidates", () => {
  const status = getRoomV3UniversalCoreInventoryStatus()

  assert.equal(status.totalCategoryCount, 45)
  assert.equal(status.candidateRecordCount, 45)
  assert.equal(status.alternateCandidateCount, 1)
  assert.deepEqual(status.alternateCandidateIds, ["universal_soft_media_console_a"])
  assert.equal(status.representedCategoryCount, 45)
  assert.deepEqual(status.missingCategoryIds, [])
  assert.deepEqual(status.duplicateCategoryIds, [])
  assert.equal(status.blockedCandidateCount, 45)
  assert.equal(status.runtimeReadyCandidateCount, 0)
})
