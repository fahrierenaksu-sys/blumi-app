import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

test("generated Universal Core QA runtime evidence stays metadata-only and honest", () => {
  const artifact = JSON.parse(readFileSync(resolve(
    import.meta.dirname,
    "../../../docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_qa_runtime_evidence.json"
  ), "utf8"))
  assert.equal(artifact.schemaVersion, "room-v3-universal-core-qa-runtime-evidence-v1")
  assert.equal(artifact.status, "evidence_only")
  assert.equal(artifact.promotionEligible, false)
  assert.equal(artifact.products.length, 45)
  assert.equal(artifact.summary.placementValidCount, 44)
  assert.equal(artifact.summary.placementBlockedCount, 1)
  assert.equal(artifact.simulatorEvidenceIncluded, false)
  assert.equal(artifact.persistenceEvidenceIncluded, false)
  assert.equal(artifact.independentReviewIncluded, false)
  assert.ok(artifact.gaps.includes("cross_sku_collision_not_checked"))
})
