import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const slug = "blush_lace_cardigan"
const stagingRoot = resolve(
  "docs/avatar-motion-pipeline/female-premium-top-motion-staging",
  slug
)
const extractedRoot = join(stagingRoot, "extracted")
const metrics = JSON.parse(readFileSync(join(stagingRoot, "metrics.json"), "utf8"))

const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const framePath = (pose) => join(
  extractedRoot,
  `room_avatar_top_female_${slug}_v2_${pose}.png`
)

test("Blush Cardigan staging contains five distinct 4W+1S female-rig frames", () => {
  assert.equal(metrics.frames.length, 5)
  const hashes = metrics.frames.map(({ pose, targetBbox }) => {
    const image = PNG.sync.read(readFileSync(framePath(pose)))
    assert.deepEqual([image.width, image.height], [256, 384])

    let minX = image.width
    let minY = image.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0
        if (alpha === 0) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    assert.deepEqual([minX, minY, maxX + 1, maxY + 1], targetBbox)
    return digest(framePath(pose))
  })
  assert.equal(new Set(hashes).size, 5)
})

test("Blush Cardigan staging has transparent-RGB hygiene and no chroma residue", () => {
  for (const { pose } of metrics.frames) {
    const image = PNG.sync.read(readFileSync(framePath(pose)))
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const red = image.data[offset] ?? 0
      const green = image.data[offset + 1] ?? 0
      const blue = image.data[offset + 2] ?? 0
      const alpha = image.data[offset + 3] ?? 0
      if (alpha === 0) assert.deepEqual([red, green, blue], [0, 0, 0])
      else assert.equal(green > red + 30 && green > blue + 30, false)
    }
  }
})

test("Blush Cardigan producer is staging-only and required evidence exists", () => {
  const producer = readFileSync(
    resolve("apps/mobile/scripts/prepare_female_premium_top_motion_staging.py"),
    "utf8"
  )
  assert.match(producer, /female-premium-top-motion-staging/)
  assert.doesNotMatch(producer, /save\(live_path/)
  assert.equal(metrics.liveAssetsUntouched, true)

  for (const filename of [
    "4w1s-full-body-overlay.png",
    "4w1s-neckline-sleeve-waist-closeups.png"
  ]) {
    const evidence = PNG.sync.read(readFileSync(join(stagingRoot, filename)))
    assert.ok(evidence.width >= 1024)
    assert.ok(evidence.height >= 300)
  }
})
