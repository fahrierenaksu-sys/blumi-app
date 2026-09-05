import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

test("QA persistence contract covers all candidates without production ownership", () => {
  const artifact = JSON.parse(readFileSync(resolve(
    import.meta.dirname,
    "../../../docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_qa_persistence_contract.json"
  ), "utf8"))
  assert.equal(artifact.schemaVersion, "blumi-room-v3-universal-core-qa-persistence-contract-v1")
  assert.equal(artifact.status, "contract_only")
  assert.equal(artifact.promotionEligible, false)
  assert.equal(artifact.simulatorEvidenceIncluded, false)
  assert.deepEqual(artifact.summary, {
    candidateCount: 45,
    qaNamespaceRows: 45,
    productionNamespaceRejectedRows: 45,
    roundTripReadyRows: 45
  })
  assert.ok(artifact.rows.every((row) => row.qaStorageKey.endsWith(":qa")))
  assert.ok(artifact.rows.every((row) => row.qaStorageKey !== row.productionStorageKey))
})
