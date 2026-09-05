import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../../..")
const candidateRoot = path.join(
  repoRoot,
  "apps/mobile/src/features/roomV2/assets/runtime/candidates"
)
const pilots = [
  ["cocoa_dining_chair_a", "cocoa_navy_dining_chair_a", "dining_chair"],
  ["cocoa_dining_chair_b", "cocoa_navy_dining_chair_b", "dining_chair"],
  ["cocoa_dining_table_a", "cocoa_navy_dining_table_a", "dining_table"],
  ["cocoa_lounge_armchair_b", "cocoa_navy_lounge_armchair_a", "lounge_armchair"]
]

test("Cocoa Navy furniture pilots have trusted four-way runtime candidates and blocked promotion", () => {
  for (const [directory, expectedId, expectedCategory] of pilots) {
    const assetRoot = path.join(candidateRoot, directory)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(assetRoot, "manifest.json"), "utf8")
    )
    assert.equal(manifest.id, expectedId)
    assert.equal(manifest.category, expectedCategory)
    assert.equal(manifest.review.independentReviewStatus, "PASS_EVIDENCE_ONLY_WITH_RUNTIME_HOLD")
    assert.equal(manifest.runtimeReady, false)
    assert.equal(manifest.promotionEligible, false)

    const hashes = []
    for (const [rotation, relativePath] of Object.entries(manifest.assetsByRotation)) {
      const bytes = fs.readFileSync(path.join(assetRoot, relativePath))
      assert.deepEqual([...bytes.subarray(0, 8)], [
        137, 80, 78, 71, 13, 10, 26, 10
      ])
      assert.equal(bytes[25] === 4 || bytes[25] === 6, true, `${directory}/${rotation} lacks alpha`)
      const hash = crypto.createHash("sha256").update(bytes).digest("hex")
      assert.equal(hash, manifest.sha256ByRotation[rotation])
      hashes.push(hash)
      assert.equal(manifest.alphaBoundsByRotation[rotation].maxYInclusive, 975)
    }

    assert.deepEqual(Object.keys(manifest.assetsByRotation).sort(), [
      "back",
      "front",
      "left",
      "right"
    ])
    assert.equal(new Set(hashes).size, 4)
    assert.equal(manifest.placement.surface, "floor")
    assert.equal(manifest.footprint.rotationAware, true)
    assert.equal(manifest.footprint.blocksMovement, true)

    if (expectedCategory === "dining_chair" || expectedCategory === "lounge_armchair") {
      assert.equal(manifest.interaction.interactionType, "seat")
      assert.equal(manifest.interaction.capacity, 1)
      assert.equal(manifest.interaction.seatSpec.seatPoints.length, 1)
    } else {
      assert.equal(manifest.interaction.interactionType, "none")
      assert.equal(manifest.placement.tabletopSupport.surface, "tabletop")
    }
  }
})
