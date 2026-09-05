import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const assetRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")

const tees = [
  ["Cream Basic Tee", "avatar_room_top_male_cream_basic_tee_v1.png"],
  ["Dusty Navy Tee", "avatar_room_top_male_dusty_navy_tee_v1.png"],
  ["Powder Blue Crew Tee", "avatar_room_top_male_powder_blue_crew_tee_v1.png"],
  ["Sage Basic Tee", "avatar_room_top_male_sage_basic_tee_v1.png"]
]

const readAsset = (filename) =>
  PNG.sync.read(readFileSync(resolve(assetRoot, filename)))

const body = readAsset("avatar_room_base_male_light_v1.png")
const pants = readAsset("avatar_room_bottom_male_navy_straight_pants_v1.png")

const alphaAt = (image, x, y) =>
  image.data[(y * image.width + x) * 4 + 3] ?? 0

const alphaBounds = (image, threshold = 16) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) <= threshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return [minX, minY, maxX, maxY]
}

const opaqueRuns = (image, y, minX, maxX, threshold = 64) => {
  const runs = []
  let runStart = null

  for (let x = minX; x <= maxX + 1; x += 1) {
    const opaque = x <= maxX && alphaAt(image, x, y) >= threshold
    if (opaque && runStart === null) runStart = x
    if (!opaque && runStart !== null) {
      runs.push([runStart, x - 1])
      runStart = null
    }
  }

  return runs
}

const bodyCoverage = (layer, [minX, minY, maxX, maxY]) => {
  let required = 0
  let covered = 0

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(body, x, y) <= 16) continue
      required += 1
      if (alphaAt(layer, x, y) > 16) covered += 1
    }
  }

  return covered / required
}

const layerOverlap = (first, second, [minX, minY, maxX, maxY]) => {
  let overlap = 0

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(first, x, y) > 16 && alphaAt(second, x, y) > 16) {
        overlap += 1
      }
    }
  }

  return overlap
}

const transparentRgbResidue = (image) => {
  let residue = 0

  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (
      image.data[offset + 3] === 0 &&
      (image.data[offset] !== 0 ||
        image.data[offset + 1] !== 0 ||
        image.data[offset + 2] !== 0)
    ) {
      residue += 1
    }
  }

  return residue
}

for (const [label, filename] of tees) {
  test(`${label}: canonical 256x384 static envelope and clean alpha`, () => {
    const image = readAsset(filename)

    assert.equal(image.width, 256)
    assert.equal(image.height, 384)
    assert.deepEqual(alphaBounds(image), [88, 216, 167, 293])
    assert.equal(transparentRgbResidue(image), 0)
  })

  test(`${label}: one front neckline contour without a rear collar band`, () => {
    const image = readAsset(filename)
    const firstClosedCenterRow = Array.from({ length: 17 }, (_, index) => 212 + index)
      .find((y) => alphaAt(image, 128, y) >= 192)

    assert.equal(firstClosedCenterRow, 219)
    assert.ok(alphaAt(image, 128, 218) <= 48)
    assert.ok(alphaAt(image, 128, 219) >= 224)
    assert.deepEqual(opaqueRuns(image, 218, 96, 160), [
      [109, 124],
      [132, 146]
    ])
    assert.deepEqual(opaqueRuns(image, 219, 96, 160), [[106, 149]])
  })

  test(`${label}: shoulder, torso, and waistband stay in body contact`, () => {
    const image = readAsset(filename)

    assert.equal(bodyCoverage(image, [96, 219, 160, 242]), 1)
    assert.ok(bodyCoverage(image, [104, 232, 152, 286]) >= 0.98)
    assert.ok(layerOverlap(image, pants, [105, 288, 150, 293]) >= 160)

    for (const y of [232, 250, 278, 286]) {
      assert.equal(
        opaqueRuns(image, y, 84, 172).length,
        1,
        `garment silhouette must stay continuous at y${y}`
      )
    }
  })
}

test("the four basic tees preserve one approved rig silhouette but distinct palettes", () => {
  const images = tees.map(([, filename]) => readAsset(filename))
  const alphaSignatures = images.map((image) => {
    const alpha = Buffer.alloc(image.width * image.height)
    for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
      alpha[pixel] = image.data[pixel * 4 + 3] ?? 0
    }
    return alpha.toString("base64")
  })
  const centerColors = images.map((image) => {
    const offset = (250 * image.width + 128) * 4
    return Buffer.from(image.data.slice(offset, offset + 3)).toString("hex")
  })

  assert.equal(new Set(alphaSignatures).size, 1)
  assert.equal(new Set(centerColors).size, tees.length)
})
