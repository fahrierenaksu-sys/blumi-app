import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const legacyRoot = resolve("docs/avatar-motion-pipeline/female-cream-tee-motion-staging")
const stagingRoot = resolve(
  "docs/avatar-motion-pipeline/female-premium-top-motion-staging/cream_basic_tee"
)
const extractedRoot = join(stagingRoot, "extracted")
const metrics = JSON.parse(readFileSync(join(stagingRoot, "metrics.json"), "utf8"))
const targetBounds = metrics.frames.slice(0, 4).map(({ targetBbox }) => targetBbox)

const framePath = (frame) => join(
  extractedRoot,
  `room_avatar_top_female_cream_basic_tee_v2_walking_front_f${String(frame).padStart(2, "0")}.png`
)
const staticPath = join(extractedRoot, "avatar_room_top_female_cream_basic_tee_v2.png")

const readPng = (path) => PNG.sync.read(readFileSync(path))
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const visibleBounds = (image) => {
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
  return [minX, minY, maxX + 1, maxY + 1]
}

test("Cream Tee walk pilot contains four distinct pose-specific staging frames", () => {
  const hashes = []
  for (let frame = 1; frame <= 4; frame += 1) {
    const path = framePath(frame)
    const image = readPng(path)
    assert.deepEqual([image.width, image.height], [256, 384])
    assert.deepEqual(visibleBounds(image), targetBounds[frame - 1])
    hashes.push(digest(path))
  }
  assert.equal(new Set(hashes).size, 4, "each 4W panel must retain its own pose render")
})

test("Cream Tee staging alpha is transparent-RGB clean and chroma-free", () => {
  for (const path of [staticPath, ...Array.from({ length: 4 }, (_, index) => framePath(index + 1))]) {
    const image = readPng(path)
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const red = image.data[offset] ?? 0
      const green = image.data[offset + 1] ?? 0
      const blue = image.data[offset + 2] ?? 0
      const alpha = image.data[offset + 3] ?? 0
      if (alpha === 0) {
        assert.deepEqual([red, green, blue], [0, 0, 0])
      } else {
        assert.equal(green > red + 32 && green > blue + 32, false)
      }
    }
  }
})

test("Cream Tee producer is staging-only", () => {
  const producer = readFileSync(
    resolve("apps/mobile/scripts/prepare_female_premium_top_motion_staging.py"),
    "utf8"
  )
  assert.match(producer, /female-cream-tee-motion-staging/)
  assert.doesNotMatch(producer, /MOTION\s*\/\s*f["']room_avatar_top_female_cream_basic_tee/)
  assert.doesNotMatch(producer, /save\(MOTION/)
})

test("Cream Tee staging publishes both required visual review surfaces", () => {
  for (const filename of [
    "4w1s-full-body-overlay.png",
    "4w1s-neckline-sleeve-waist-closeups.png"
  ]) {
    const image = readPng(join(stagingRoot, filename))
    assert.ok(image.width >= 1536)
    assert.ok(image.height >= 300)
  }
})

test("Cream Tee premium static is pixel-identical to W1", () => {
  assert.equal(digest(staticPath), digest(framePath(1)))
})

test("Cream Tee approved candidate is distinct from rejected legacy chroma evidence", () => {
  assert.equal(metrics.liveAssetsUntouched, true)
  assert.equal(metrics.frames.length, 5)
  assert.ok(
    readFileSync(join(legacyRoot, "cream-tee-sit-source-rejected-has-body.png")).length > 0,
    "rejected body-contaminated source must remain historical evidence"
  )
  assert.notEqual(
    metrics.sitSourceSha256,
    digest(join(legacyRoot, "cream-tee-sit-source-rejected-has-body.png")),
    "approved sitting source must never resolve to rejected legacy evidence"
  )
})
