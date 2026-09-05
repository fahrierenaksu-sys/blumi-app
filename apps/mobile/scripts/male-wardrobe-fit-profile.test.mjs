import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const root = resolve(import.meta.dirname, "../../..")
const evidenceRoot =
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27"
const review = JSON.parse(readFileSync(
  resolve(root, evidenceRoot, "male-wardrobe-66-final-independent-review-v1.json"),
  "utf8",
))
const promotion = JSON.parse(readFileSync(
  resolve(root, evidenceRoot, "male-wardrobe-66-runtime-promotion-evidence-v1.json"),
  "utf8",
))

const alphaBounds = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [minX, minY, maxX, maxY]
}

test("the exact current 66 passes independent family-specific fit gates", () => {
  assert.equal(review.verdict, "PASS")
  assert.equal(review.reviewedItemCount, 66)
  assert.deepEqual(review.categoryCounts, {
    top: 27,
    bottom: 19,
    shoes: 8,
    hair: 7,
    accessory: 5,
  })
  for (const gate of [
    "canonicalBaseConsistency",
    "topFit",
    "bottomWaistCrotchHemShoeFit",
    "shoes",
    "hairHeadFit",
    "accessoryLayerOrder",
    "alphaHaloQuality",
  ]) {
    assert.equal(review.gates[gate], "PASS", gate)
  }
})

test("every promoted static layer stays on the canonical canvas with visible art", () => {
  for (const item of promotion.items) {
    const frame = item.frames.static
    const image = PNG.sync.read(readFileSync(resolve(root, frame.runtimePath)))
    assert.deepEqual([image.width, image.height], [256, 384], item.slug)
    const [minX, minY, maxX, maxY] = alphaBounds(image)
    assert.ok(minX >= 0 && minY >= 0, `${item.slug} missing visible pixels`)
    assert.ok(maxX < 256 && maxY < 384, `${item.slug} escapes canonical canvas`)
  }
})
