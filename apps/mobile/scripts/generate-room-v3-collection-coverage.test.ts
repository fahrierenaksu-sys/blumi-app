import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  createRoomV3CollectionCoverageMatrix,
  summarizeRoomV3CollectionCoverage
} from "../src/features/roomV2/roomV3CollectionCoverage"

const outputPath = resolve(
  import.meta.dirname,
  "../../../docs/room-v3-qa/2026-07-18-universal-core-wave/collection_coverage_matrix.json"
)

test("collection coverage JSON is current, complete, and promotion-blocked", () => {
  const artifact = JSON.parse(readFileSync(outputPath, "utf8"))
  const rows = createRoomV3CollectionCoverageMatrix()

  assert.equal(artifact.schemaVersion, "blumi-room-v3-collection-coverage-v1")
  assert.equal(artifact.status, "evidence_only")
  assert.equal(artifact.promotionEligible, false)
  assert.deepEqual(artifact.summary, summarizeRoomV3CollectionCoverage(rows))
  assert.deepEqual(artifact.rows, rows)
})
