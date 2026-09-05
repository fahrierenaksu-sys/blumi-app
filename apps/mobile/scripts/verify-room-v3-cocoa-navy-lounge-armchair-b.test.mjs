import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const assetRoot = path.join(
  repoRoot,
  "apps/mobile/src/features/roomV2/assets/runtime/candidates/cocoa_navy_lounge_armchair_b"
)
const manifestPath = path.join(assetRoot, "manifest.json")

test("Cocoa Navy lounge armchair B has four distinct alpha-safe rotations", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  const rotations = Object.entries(manifest.assetsByRotation)
  assert.deepEqual(
    rotations.map(([rotation]) => rotation).sort(),
    ["back", "front", "left", "right"]
  )

  const hashes = []
  for (const [rotation, relativePath] of rotations) {
    const filePath = path.join(assetRoot, relativePath)
    const bytes = fs.readFileSync(filePath)
    assert.deepEqual([...bytes.subarray(0, 8)], [
      137, 80, 78, 71, 13, 10, 26, 10
    ])
    assert.equal(bytes[25] === 4 || bytes[25] === 6, true, `${rotation} lacks alpha`) // PNG color type
    const hash = crypto.createHash("sha256").update(bytes).digest("hex")
    assert.equal(hash, manifest.sha256ByRotation[rotation])
    hashes.push(hash)
  }
  assert.equal(new Set(hashes).size, 4)
  assert.deepEqual(manifest.floorContactByRotation, {
    front: 1102,
    back: 1102,
    left: 1102,
    right: 1102,
    convention: "opaque_max_y_inclusive_pixels_after_v2_normalization"
  })
  assert.equal(
    manifest.review.independentReviewStatus,
    "PASS_EVIDENCE_ONLY_WITH_RUNTIME_HOLD"
  )
  assert.equal(manifest.review.reviewedAssetVersion, "v2")
  assert.equal(manifest.interaction.seatSpec.capacity, 1)
  assert.equal(manifest.interaction.seatSpec.seatPoints[0].seatHeight, 0.09)
  assert.equal(manifest.interaction.needsRuntimeFitReview, true)
  assert.equal(manifest.runtimeReady, false)
  assert.equal(manifest.promotionEligible, false)
})
