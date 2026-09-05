import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { PNG } from "pngjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const assetRoot = join(
  scriptDirectory,
  "../src/features/avatarV2/assets/room"
)

const shirtFiles = [
  "avatar_room_top_male_powder_blue_crew_tee_v1.png",
  "avatar_room_top_male_cream_basic_tee_v1.png",
  "avatar_room_top_male_sage_basic_tee_v1.png",
  "avatar_room_top_male_dusty_navy_tee_v1.png"
]

const readPng = (filename) =>
  PNG.sync.read(readFileSync(join(assetRoot, filename)))

const alphaAt = (image, x, y) =>
  image.data[(y * image.width + x) * 4 + 3] ?? 0

const alphaBounds = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return [minX, minY, maxX + 1, maxY + 1]
}

const torsoCoverage = (image) => {
  let covered = 0
  let total = 0
  for (let y = 232; y <= 286; y += 1) {
    for (let x = 104; x <= 152; x += 1) {
      total += 1
      if (alphaAt(image, x, y) >= 64) covered += 1
    }
  }
  return covered / total
}

const transparentRgbResidue = (image) => {
  let residue = 0
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const offset = pixel * 4
    if (
      (image.data[offset + 3] ?? 0) === 0 &&
      ((image.data[offset] ?? 0) !== 0 ||
        (image.data[offset + 1] ?? 0) !== 0 ||
        (image.data[offset + 2] ?? 0) !== 0)
    ) {
      residue += 1
    }
  }
  return residue
}

test("four male basic T-shirts share the approved static rig envelope", () => {
  for (const filename of shirtFiles) {
    const image = readPng(filename)
    assert.equal(image.width, 256, `${filename} width`)
    assert.equal(image.height, 384, `${filename} height`)
    assert.deepEqual(
      alphaBounds(image),
      [88, 216, 168, 294],
      `${filename} alpha envelope`
    )
    assert.ok(alphaAt(image, 128, 218) <= 48, `${filename} opens the neck through y218`)
    assert.ok(alphaAt(image, 128, 219) >= 224, `${filename} closes once at y219`)
    assert.ok(torsoCoverage(image) >= 0.96, `${filename} wraps the torso core`)
    assert.equal(transparentRgbResidue(image), 0, `${filename} transparent RGB residue`)
  }
})

test("every palette remains visually distinct at the torso center", () => {
  const colors = shirtFiles.map((filename) => {
    const image = readPng(filename)
    const offset = (250 * image.width + 128) * 4
    return [...image.data.slice(offset, offset + 3)].join(",")
  })

  assert.equal(new Set(colors).size, shirtFiles.length)
})
