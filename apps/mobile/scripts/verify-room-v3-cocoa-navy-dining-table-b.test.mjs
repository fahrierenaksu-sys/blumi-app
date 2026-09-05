import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const assetRoot = path.join(
  repoRoot,
  "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_navy_dining_table_b"
)

test("Cocoa Navy dining table B has four distinct alpha-safe grounded rotations", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(assetRoot, "manifest.json"), "utf8")
  )
  const rotations = Object.entries(manifest.assetsByRotation)
  assert.deepEqual(
    rotations.map(([rotation]) => rotation).sort(),
    ["back", "front", "left", "right"]
  )

  const hashes = []
  for (const [rotation, relativePath] of rotations) {
    const bytes = fs.readFileSync(path.join(assetRoot, relativePath))
    assert.deepEqual([...bytes.subarray(0, 8)], [
      137, 80, 78, 71, 13, 10, 26, 10
    ])
    assert.equal(bytes[25] === 4 || bytes[25] === 6, true, `${rotation} lacks alpha`)
    const hash = crypto.createHash("sha256").update(bytes).digest("hex")
    assert.equal(hash, manifest.sha256ByRotation[rotation])
    hashes.push(hash)
  }

  assert.equal(new Set(hashes).size, 4)
  assert.deepEqual(
    Object.values(manifest.alphaBoundsByRotation).map((bounds) => bounds.maxYInclusive),
    [988, 988, 988, 988]
  )
  assert.equal(manifest.placement.surface, "floor")
  assert.equal(manifest.footprint.blocksMovement, true)
  assert.equal(manifest.review.independentReviewStatus, "PASS_EVIDENCE_ONLY_WITH_RUNTIME_HOLD")
  assert.equal(manifest.review.reviewer, "/root/room_integration_test_plan")
  assert.equal(manifest.runtimeReady, false)
  assert.equal(manifest.promotionEligible, false)
})
