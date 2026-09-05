import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const candidateRoot = resolve("docs/avatar-motion-pipeline/male-wave2-static-qa")
const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")

const tops = [
  {
    label: "Mist Blue Oxford Shirt",
    filename: "avatar_room_top_male_mist_blue_oxford_shirt_v1_alpha.png",
    composite: "mist_blue_oxford_shirt_composite.png",
    bounds: [86, 218, 170, 294],
    centerCloseY: 229,
  },
  {
    label: "Soft Sage Linen Shirt",
    filename: "avatar_room_top_male_soft_sage_linen_shirt_v1_alpha.png",
    composite: "soft_sage_linen_shirt_composite.png",
    bounds: [84, 218, 171, 294],
    centerCloseY: 229,
  },
  {
    label: "Cocoa Varsity Jacket",
    filename: "avatar_room_top_male_cocoa_varsity_jacket_v1_alpha.png",
    composite: "cocoa_varsity_jacket_composite.png",
    bounds: [84, 218, 171, 294],
    centerCloseY: 226,
  },
  {
    label: "Dusty Navy Chore Jacket",
    filename: "avatar_room_top_male_dusty_navy_chore_jacket_v1_alpha.png",
    composite: "dusty_navy_chore_jacket_composite.png",
    bounds: [84, 218, 171, 294],
    centerCloseY: 226,
  },
]

const pants = [
  {
    label: "Mid Blue Straight Jeans",
    filename: "avatar_room_bottom_male_mid_blue_straight_jeans_v1_alpha.png",
    composite: "mid_blue_straight_jeans_composite.png",
  },
  {
    label: "Charcoal Tapered Chinos",
    filename: "avatar_room_bottom_male_charcoal_tapered_chinos_v1_alpha.png",
    composite: "charcoal_tapered_chinos_composite.png",
  },
  {
    label: "Warm Sand Relaxed Pants",
    filename: "avatar_room_bottom_male_warm_sand_relaxed_pants_v1_alpha.png",
    composite: "warm_sand_relaxed_pants_composite.png",
  },
]

const readPng = (root, filename) =>
  PNG.sync.read(readFileSync(resolve(root, filename)))

const body = readPng(roomRoot, "avatar_room_base_male_light_v1.png")
const referenceTop = readPng(roomRoot, "avatar_room_top_male_powder_blue_crew_tee_v1.png")
const referenceBottom = readPng(roomRoot, "avatar_room_bottom_male_navy_straight_pants_v1.png")
const referenceShoes = readPng(roomRoot, "avatar_room_shoes_male_milk_tea_court_v1.png")

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
  let start = null

  for (let x = minX; x <= maxX + 1; x += 1) {
    const opaque = x <= maxX && alphaAt(image, x, y) >= threshold
    if (opaque && start === null) start = x
    if (!opaque && start !== null) {
      runs.push([start, x - 1])
      start = null
    }
  }

  return runs
}

const coverage = (layer, reference, [minX, minY, maxX, maxY]) => {
  let required = 0
  let covered = 0

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(reference, x, y) <= 16) continue
      required += 1
      if (alphaAt(layer, x, y) > 16) covered += 1
    }
  }

  return covered / required
}

const overlap = (first, second, [minX, minY, maxX, maxY]) => {
  let count = 0
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(first, x, y) > 16 && alphaAt(second, x, y) > 16) count += 1
    }
  }
  return count
}

const transparentRgbResidue = (image) => {
  let count = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (
      image.data[offset + 3] === 0 &&
      (image.data[offset] !== 0 || image.data[offset + 1] !== 0 || image.data[offset + 2] !== 0)
    ) {
      count += 1
    }
  }
  return count
}

const lowAlphaChromaResidue = (image) => {
  const coordinates = []
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      const red = image.data[offset] ?? 0
      const green = image.data[offset + 1] ?? 0
      const blue = image.data[offset + 2] ?? 0
      const alpha = image.data[offset + 3] ?? 0
      if (alpha === 0 || alpha >= 96) continue
      const greenDominance = green - Math.max(red, blue)
      const magentaDominance = Math.min(red, blue) - green
      if (greenDominance > 20 || magentaDominance > 20) coordinates.push([x, y])
    }
  }
  return coordinates
}

const alphaSignature = (image) => {
  const alpha = Buffer.alloc(image.width * image.height)
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    alpha[pixel] = image.data[pixel * 4 + 3] ?? 0
  }
  return alpha.toString("base64")
}

for (const item of [...tops, ...pants]) {
  test(`${item.label}: canonical transparent candidate and composite canvases`, () => {
    const candidate = readPng(candidateRoot, item.filename)
    const composite = readPng(candidateRoot, item.composite)

    assert.equal(candidate.width, 256)
    assert.equal(candidate.height, 384)
    assert.equal(composite.width, 256)
    assert.equal(composite.height, 384)
    assert.equal(transparentRgbResidue(candidate), 0)
    assert.deepEqual(lowAlphaChromaResidue(candidate), [])
  })
}

for (const item of tops) {
  test(`${item.label}: one front opening, wrapped shoulders, torso, and waist`, () => {
    const image = readPng(candidateRoot, item.filename)
    const firstClosedCenterRow = Array.from({ length: 21 }, (_, index) => 212 + index)
      .find((y) => alphaAt(image, 128, y) >= 192)

    assert.deepEqual(alphaBounds(image), item.bounds)
    assert.equal(alphaAt(image, 128, 218), 0, "front view must not show a rear collar band")
    assert.equal(alphaAt(image, 128, 222), 0, "front opening must remain clear below the neck")
    assert.equal(firstClosedCenterRow, item.centerCloseY)
    assert.equal(opaqueRuns(image, 219, 96, 160).length, 2, "neck opening must split the shoulder contour")
    assert.equal(opaqueRuns(image, 230, 84, 172).length, 1, "front torso must close into one worn contour")
    assert.equal(coverage(image, body, [96, 219, 116, 246]), 1)
    assert.equal(coverage(image, body, [140, 219, 160, 246]), 1)
    assert.equal(coverage(image, body, [104, 232, 152, 286]), 1)
    assert.ok(overlap(image, referenceBottom, [95, 286, 160, 300]) >= 240)
  })
}

for (const item of pants) {
  test(`${item.label}: waist, lower body, and shoe upper stay in deliberate contact`, () => {
    const image = readPng(candidateRoot, item.filename)
    const composite = readPng(candidateRoot, item.composite)

    assert.deepEqual(alphaBounds(image), [102, 287, 153, 334])
    assert.equal(coverage(image, body, [100, 294, 156, 325]), 1)
    assert.ok(overlap(image, referenceTop, [95, 286, 160, 300]) >= 290)
    assert.ok(overlap(image, referenceShoes, [90, 318, 170, 350]) >= 280)
    assert.equal(opaqueRuns(image, 310, 90, 170).length, 2)
    assert.equal(opaqueRuns(image, 331, 90, 170).length, 2)

    let opaqueHemPixels = 0
    let pantsAboveShoePixels = 0
    for (let y = 326; y <= 334; y += 1) {
      for (let x = 96; x <= 160; x += 1) {
        if (alphaAt(image, x, y) < 250 || alphaAt(referenceShoes, x, y) <= 16) continue
        opaqueHemPixels += 1
        const offset = (y * image.width + x) * 4
        const colorDistance = [0, 1, 2].reduce(
          (distance, channel) =>
            distance + Math.abs(image.data[offset + channel] - composite.data[offset + channel]),
          0
        )
        if (colorDistance <= 12) pantsAboveShoePixels += 1
      }
    }
    assert.ok(opaqueHemPixels >= 120)
    assert.equal(
      pantsAboveShoePixels / opaqueHemPixels >= 0.98,
      true,
      "the rendered composite must keep pant hems above shoe uppers"
    )
  })
}

test("straight, tapered, and relaxed pants have distinct fitted silhouettes", () => {
  const signatures = pants.map((item) =>
    alphaSignature(readPng(candidateRoot, item.filename))
  )

  assert.equal(
    new Set(signatures).size,
    pants.length,
    "three style names currently reuse one identical alpha silhouette; taper and relaxed width are not represented"
  )
})

for (const y of [310, 331]) {
  test(`straight, tapered, and relaxed contours stay distinct at y${y}`, () => {
    const contourSignatures = pants.map((item) =>
      JSON.stringify(opaqueRuns(readPng(candidateRoot, item.filename), y, 90, 170))
    )

    assert.equal(
      new Set(contourSignatures).size,
      pants.length,
      `all three named cuts reuse the same y${y} contour: ${contourSignatures[0]}`
    )
  })
}

test("straight, tapered, and relaxed cuts keep their intended contour through the lower leg", () => {
  const [straight, tapered, relaxed] = pants.map((item) =>
    readPng(candidateRoot, item.filename)
  )
  const reviewRows = Array.from({ length: 22 }, (_, index) => 310 + index)
  const totalLegWidth = (image, y) => {
    const runs = opaqueRuns(image, y, 90, 170)
    assert.equal(runs.length, 2, `expected two separated legs at y${y}`)
    return runs.reduce((total, [start, end]) => total + end - start + 1, 0)
  }
  const widths = (image) => reviewRows.map((y) => totalLegWidth(image, y))
  const straightWidths = widths(straight)
  const taperedWidths = widths(tapered)
  const relaxedWidths = widths(relaxed)

  assert.ok(
    Math.max(...straightWidths) - Math.min(...straightWidths) <= 1,
    `straight cut must remain parallel from y310-y331: ${straightWidths.join(",")}`
  )
  assert.ok(
    taperedWidths.every((width, index) => index === 0 || width <= taperedWidths[index - 1]),
    `tapered cut must narrow monotonically from y310-y331: ${taperedWidths.join(",")}`
  )
  assert.ok(
    Math.max(...relaxedWidths) - Math.min(...relaxedWidths) <= 1,
    `relaxed cut must retain its volume through y331: ${relaxedWidths.join(",")}`
  )

  for (const [index, y] of reviewRows.entries()) {
    assert.ok(
      taperedWidths[index] < straightWidths[index] &&
        straightWidths[index] < relaxedWidths[index],
      `expected tapered < straight < relaxed at y${y}; received ${taperedWidths[index]} < ${straightWidths[index]} < ${relaxedWidths[index]}`
    )
  }
})
