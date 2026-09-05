import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import pngjs from "pngjs"

const { PNG } = pngjs
const root = process.cwd()
const roomRoot = join(root, "apps/mobile/src/features/avatarV2/assets/room")
const qaRoot = join(root, "docs/avatar-motion-pipeline/male-hair-shoes-wave3-qa")

const hairFiles = [
  "avatar_room_hair_front_male_cocoa_textured_quiff_v1_alpha.png",
  "avatar_room_hair_front_male_soft_black_side_part_v1_alpha.png",
  "avatar_room_hair_front_male_chestnut_short_waves_v1_alpha.png"
]
const shoeFiles = [
  "avatar_room_shoes_male_cloud_white_trainers_v1_alpha.png",
  "avatar_room_shoes_male_cocoa_penny_loafers_v1_alpha.png",
  "avatar_room_shoes_male_dusty_blue_canvas_sneakers_v1_alpha.png"
]
const repairedMilkTea = "avatar_room_shoes_male_milk_tea_court_v1_repaired_alpha.png"

const readPng = (directory, filename) =>
  PNG.sync.read(readFileSync(join(directory, filename)))

const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3] ?? 0

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
  assert.ok(maxX >= minX && maxY >= minY, "asset must contain visible pixels")
  return [minX, minY, maxX + 1, maxY + 1]
}

const overlapBounds = (first, second) => {
  const pixels = []
  for (let y = 0; y < first.height; y += 1) {
    for (let x = 0; x < first.width; x += 1) {
      if (alphaAt(first, x, y) > 16 && alphaAt(second, x, y) > 16) {
        pixels.push([x, y])
      }
    }
  }
  assert.ok(pixels.length > 0, "layers must overlap")
  const xs = pixels.map(([x]) => x)
  const ys = pixels.map(([, y]) => y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1]
}

const alphaDifferenceCount = (first, second) => {
  let differences = 0
  for (let y = 0; y < first.height; y += 1) {
    for (let x = 0; x < first.width; x += 1) {
      const firstVisible = alphaAt(first, x, y) > 16
      const secondVisible = alphaAt(second, x, y) > 16
      if (firstVisible !== secondVisible) differences += 1
    }
  }
  return differences
}

test("wave 3 writes all six non-empty static candidates on the canonical canvas", () => {
  for (const filename of [...hairFiles, ...shoeFiles]) {
    assert.ok(statSync(join(qaRoot, filename)).size > 0, `${filename} must not be 0-byte`)
    const image = readPng(qaRoot, filename)
    assert.equal(image.width, 256)
    assert.equal(image.height, 384)
  }
})

test("new hair stays inside the head envelope and never exceeds approved face clearance", () => {
  const approved = readPng(roomRoot, "avatar_room_hair_front_male_espresso_crop_v1.png")
  for (const filename of hairFiles) {
    const image = readPng(qaRoot, filename)
    const [minX, minY, maxX, maxY] = alphaBounds(image)
    assert.ok(minX >= 68 && maxX <= 189, `${filename} horizontal head anchor`)
    assert.ok(minY >= 96 && maxY <= 201, `${filename} vertical head anchor`)

    let faceSpill = 0
    for (let y = 138; y < 204; y += 1) {
      for (let x = 78; x < 179; x += 1) {
        if (alphaAt(approved, x, y) <= 8 && alphaAt(image, x, y) > 8) {
          faceSpill += 1
        }
      }
    }
    assert.equal(faceSpill, 0, `${filename} must preserve approved eye/face clearance`)
  }
})

test("new shoes keep exact baseline and pant-over-shoe contact", () => {
  const pants = readPng(roomRoot, "avatar_room_bottom_male_navy_straight_pants_v1.png")
  for (const filename of shoeFiles) {
    const shoes = readPng(qaRoot, filename)
    assert.deepEqual(alphaBounds(shoes), [105, 326, 151, 348], `${filename} shoe envelope`)
    assert.deepEqual(
      overlapBounds(pants, shoes),
      [107, 326, 149, 334],
      `${filename} pant hem must render over shoe upper`
    )
    assert.ok(alphaAt(shoes, 116, 346) >= 200, `${filename} left sole contact`)
    assert.ok(alphaAt(shoes, 140, 346) >= 200, `${filename} right sole contact`)
    assert.ok(alphaAt(shoes, 128, 340) <= 16, `${filename} feet must remain separated`)
  }
})

test("trainer, loafer, and canvas sneaker use genuinely distinct alpha silhouettes", () => {
  const shoes = shoeFiles.map((filename) => [filename, readPng(qaRoot, filename)])
  for (let firstIndex = 0; firstIndex < shoes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < shoes.length; secondIndex += 1) {
      const [firstName, first] = shoes[firstIndex]
      const [secondName, second] = shoes[secondIndex]
      const differences = alphaDifferenceCount(first, second)
      assert.ok(
        differences >= 80,
        `${firstName} and ${secondName} need separate model contours; alpha diff=${differences}`
      )
    }
  }
})

test("the existing Milk Tea Court static candidate is repaired without geometry drift", () => {
  const original = readPng(roomRoot, "avatar_room_shoes_male_milk_tea_court_v1.png")
  const repaired = readPng(qaRoot, repairedMilkTea)
  assert.deepEqual(alphaBounds(original), [105, 326, 151, 348])
  assert.deepEqual(alphaBounds(repaired), alphaBounds(original))

  for (let y = 0; y < original.height; y += 1) {
    for (let x = 0; x < original.width; x += 1) {
      assert.equal(
        alphaAt(repaired, x, y),
        alphaAt(original, x, y),
        `alpha geometry changed at ${x},${y}`
      )
    }
  }
})

test("all candidates keep transparent RGB and chroma-fringe hygiene", () => {
  for (const filename of [...hairFiles, ...shoeFiles, repairedMilkTea]) {
    const image = readPng(qaRoot, filename)
    let transparentRgbResidue = 0
    let greenFringe = 0
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const red = image.data[offset] ?? 0
      const green = image.data[offset + 1] ?? 0
      const blue = image.data[offset + 2] ?? 0
      const alpha = image.data[offset + 3] ?? 0
      if (alpha === 0 && (red !== 0 || green !== 0 || blue !== 0)) {
        transparentRgbResidue += 1
      }
      if (alpha >= 11 && alpha < 240 && green > red + 12 && green > blue + 12) {
        greenFringe += 1
      }
    }
    assert.equal(transparentRgbResidue, 0, `${filename} transparent RGB residue`)
    assert.equal(greenFringe, 0, `${filename} green fringe`)
  }
})

test("each generated style has a distinct raster identity", () => {
  const hashes = [...hairFiles, ...shoeFiles].map((filename) =>
    createHash("sha256").update(readFileSync(join(qaRoot, filename))).digest("hex")
  )
  assert.equal(new Set(hashes).size, hashes.length)
})
