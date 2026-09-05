import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import test from "node:test"

interface DecodedPng {
  width: number
  height: number
  data: Uint8Array
}

interface PngModule {
  PNG: {
    sync: {
      read(buffer: Buffer): DecodedPng
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { PNG } = require("pngjs") as PngModule
const assetRoot = join(process.cwd(), "src/features/avatarV2/assets/room")
const motionAssetRoot = join(assetRoot, "motion")

const assetNames = {
  top: "avatar_room_top_male_powder_blue_crew_tee_v1.png",
  pants: "avatar_room_bottom_male_navy_straight_pants_v1.png",
  shoes: "avatar_room_shoes_male_milk_tea_court_v1.png"
} as const

const readAsset = (name: string): DecodedPng =>
  PNG.sync.read(readFileSync(join(assetRoot, name)))

const readMotionAsset = (name: string): DecodedPng =>
  PNG.sync.read(readFileSync(join(motionAssetRoot, name)))

const alphaAt = (image: DecodedPng, x: number, y: number): number =>
  image.data[(y * image.width + x) * 4 + 3] ?? 0

const hasGreenContaminationAt = (image: DecodedPng, x: number, y: number): boolean => {
  const offset = (y * image.width + x) * 4
  const red = image.data[offset] ?? 0
  const green = image.data[offset + 1] ?? 0
  const blue = image.data[offset + 2] ?? 0
  return alphaAt(image, x, y) >= 11 && green > red + 12 && green > blue + 12
}

const countGreenContamination = (image: DecodedPng): number => {
  let count = 0
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (hasGreenContaminationAt(image, x, y)) count += 1
    }
  }
  return count
}

const transparentRgbResidue = (image: DecodedPng): string[] => {
  const residue: string[] = []
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      if (
        (image.data[offset + 3] ?? 0) === 0 &&
        ((image.data[offset] ?? 0) !== 0 ||
          (image.data[offset + 1] ?? 0) !== 0 ||
          (image.data[offset + 2] ?? 0) !== 0)
      ) {
        residue.push(`${x},${y}`)
      }
    }
  }
  return residue
}

const luminanceAt = (image: DecodedPng, x: number, y: number): number => {
  const offset = (y * image.width + x) * 4
  return (
    (image.data[offset] ?? 0) * 0.2126 +
    (image.data[offset + 1] ?? 0) * 0.7152 +
    (image.data[offset + 2] ?? 0) * 0.0722
  )
}

const meanOpaqueLuminance = (
  image: DecodedPng,
  y: number,
  minX: number,
  maxX: number
): number => {
  const samples: number[] = []
  for (let x = minX; x <= maxX; x += 1) {
    if (alphaAt(image, x, y) < 200) continue
    samples.push(luminanceAt(image, x, y))
  }

  assert.ok(samples.length > 0, `row ${y} must contain opaque collar pixels`)
  return samples.reduce((sum, sample) => sum + sample, 0) / samples.length
}

const meanImageLuminance = (image: DecodedPng): number => {
  let total = 0
  let samples = 0
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) < 200) continue
      total += luminanceAt(image, x, y)
      samples += 1
    }
  }
  assert.ok(samples > 0, "asset must contain opaque color samples")
  return total / samples
}

const alphaBounds = (image: DecodedPng): readonly [number, number, number, number] => {
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

const overlapBounds = (
  first: DecodedPng,
  second: DecodedPng
): readonly [number, number, number, number] => {
  const threshold = 16
  const overlap = new Uint8Array(first.width * first.height * 4)

  for (let y = 0; y < first.height; y += 1) {
    for (let x = 0; x < first.width; x += 1) {
      if (alphaAt(first, x, y) <= threshold || alphaAt(second, x, y) <= threshold) {
        continue
      }
      overlap[(y * first.width + x) * 4 + 3] = 255
    }
  }

  return alphaBounds({ width: first.width, height: first.height, data: overlap })
}

const envelopeIntersectionBounds = (
  first: DecodedPng,
  second: DecodedPng
): readonly [number, number, number, number] => {
  const [firstMinX, firstMinY, firstMaxX, firstMaxY] = alphaBounds(first)
  const [secondMinX, secondMinY, secondMaxX, secondMaxY] = alphaBounds(second)
  const bounds = [
    Math.max(firstMinX, secondMinX),
    Math.max(firstMinY, secondMinY),
    Math.min(firstMaxX, secondMaxX),
    Math.min(firstMaxY, secondMaxY)
  ] as const
  assert.ok(
    bounds[0] < bounds[2] && bounds[1] < bounds[3],
    "layer envelopes must share a contact band"
  )
  return bounds
}

const opaqueComponentCount = (image: DecodedPng, bounds: readonly [number, number, number, number]): number => {
  const [minX, minY, maxX, maxY] = bounds
  const visited = new Set<string>()
  let components = 0
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const key = `${x},${y}`
      if (visited.has(key) || alphaAt(image, x, y) <= 10) continue
      components += 1
      const queue = [[x, y]]
      visited.add(key)
      while (queue.length) {
        const [currentX, currentY] = queue.shift()!
        for (const [nextX, nextY] of [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1]
        ]) {
          if (
            nextX < minX || nextX >= maxX || nextY < minY || nextY >= maxY ||
            alphaAt(image, nextX, nextY) <= 10
          ) continue
          const nextKey = `${nextX},${nextY}`
          if (visited.has(nextKey)) continue
          visited.add(nextKey)
          queue.push([nextX, nextY])
        }
      }
    }
  }
  return components
}

test("male starter capsule keeps the approved anchored alpha envelopes", () => {
  const top = readAsset(assetNames.top)
  const pants = readAsset(assetNames.pants)
  const shoes = readAsset(assetNames.shoes)

  for (const image of [top, pants, shoes]) {
    assert.equal(image.width, 256)
    assert.equal(image.height, 384)
  }

  assert.deepEqual(alphaBounds(top), [86, 214, 169, 296])
  assert.deepEqual(alphaBounds(pants), [100, 285, 155, 333])
  assert.deepEqual(alphaBounds(shoes), [102, 322, 154, 351])
})

test("male base matches the room rig scale and stays as light as the female foundation", () => {
  const maleBody = readAsset("avatar_room_base_male_light_v1.png")
  const femaleBody = readAsset("avatar_room_base_female_v2.png")
  const maleBounds = alphaBounds(maleBody)
  const femaleBounds = alphaBounds(femaleBody)

  assert.equal(maleBounds[1], femaleBounds[1], "both body rigs must share the neck anchor")
  assert.ok(
    Math.abs(maleBounds[3] - femaleBounds[3]) <= 2,
    "both body rigs must share the room baseline"
  )
  assert.ok(
    Math.abs((maleBounds[3] - maleBounds[1]) - (femaleBounds[3] - femaleBounds[1])) <= 2,
    "male and female body drivers must keep the same room-scale height"
  )
  assert.ok(
    meanImageLuminance(maleBody) >= meanImageLuminance(femaleBody),
    "the approved light male base must not render darker than the female foundation"
  )
})

test("male starter PNGs keep fully transparent pixels colorless", () => {
  const staticAssets = [
    "avatar_room_base_male_light_v1.png",
    "avatar_room_face_male_warm_friendly_v1.png",
    "avatar_room_hair_front_male_espresso_crop_v1.png",
    "avatar_room_top_male_cream_basic_tee_v1.png",
    assetNames.top,
    "avatar_room_bottom_male_sage_cuffed_shorts_v1.png",
    assetNames.pants,
    assetNames.shoes
  ]
  const fittedMotionPrefixes = [
    "room_avatar_base_male_light_v1",
    "room_avatar_top_male_powder_blue_crew_tee_v1",
    "room_avatar_bottom_male_navy_straight_pants_v1",
    "room_avatar_bottom_male_sage_cuffed_shorts_v1",
    "room_avatar_shoes_male_milk_tea_court_v1"
  ]
  const motionAssets = fittedMotionPrefixes.flatMap((prefix) => [
    ...["01", "02", "03", "04"].map(
      (frame) => `${prefix}_walking_front_f${frame}.png`
    ),
    `${prefix}_sitting_front_f01.png`
  ])

  for (const filename of staticAssets) {
    const image = readAsset(filename)
    assert.deepEqual(
      transparentRgbResidue(image),
      [],
      `${filename} transparent RGB residue`
    )
    if (filename === assetNames.top || filename.includes("sage_cuffed_shorts")) {
      assert.equal(countGreenContamination(image), 0, `${filename} chroma-key fringe`)
    }
  }
  for (const filename of motionAssets) {
    assert.deepEqual(
      transparentRgbResidue(readMotionAsset(filename)),
      [],
      `${filename} transparent RGB residue`
    )
  }
})

test("neck, waist, hem envelopes, and sole keep their exact contact contract", () => {
  const top = readAsset(assetNames.top)
  const pants = readAsset(assetNames.pants)
  const shoes = readAsset(assetNames.shoes)

  assert.ok(alphaAt(top, 128, 218) <= 48, "neck opening must expose the neck through y218")
  assert.ok(alphaAt(top, 128, 220) >= 224, "crew neckline must close exactly once at y220")
  assert.ok(alphaAt(top, 128, 221) >= 200, "crew neckline must hug the neck base")
  assert.deepEqual(overlapBounds(top, pants), [103, 285, 152, 296])
  assert.deepEqual(envelopeIntersectionBounds(pants, shoes), [102, 322, 154, 333])
  assert.equal(alphaBounds(shoes)[3], 351, "shoe sole baseline must not drift")
})

test("front neckline has one contour without a stacked rear collar band", () => {
  const top = readAsset(assetNames.top)
  const shirtBodyLuminance = meanOpaqueLuminance(top, 224, 120, 136)
  const distinctCollarRows = [219, 220, 221, 222, 223].filter(
    (y) => Math.abs(meanOpaqueLuminance(top, y, 120, 136) - shirtBodyLuminance) > 8
  )

  assert.ok(
    distinctCollarRows.length <= 1,
    `neckline may have one front contour, not stacked bands; distinct rows: ${distinctCollarRows.join(", ")}`
  )
})

test("male crew tee walking frames are fitted deformations, not static fallbacks", () => {
  const expectedBounds = [
    [88, 216, 168, 294],
    [87, 216, 168, 295],
    [86, 216, 169, 295],
    [87, 216, 170, 295]
  ] as const
  const hashes = new Set<string>()
  const staticHash = createHash("sha256")
    .update(readFileSync(join(assetRoot, assetNames.top)))
    .digest("hex")

  expectedBounds.forEach((bounds, index) => {
    const frame = String(index + 1).padStart(2, "0")
    const filename = `room_avatar_top_male_powder_blue_crew_tee_v1_walking_front_f${frame}.png`
    const file = readFileSync(join(motionAssetRoot, filename))
    const image = readMotionAsset(filename)

    assert.equal(image.width, 256)
    assert.equal(image.height, 384)
    assert.deepEqual(alphaBounds(image), bounds)
    assert.equal(
      Array.from({ length: image.width * image.height }, (_, pixel) => pixel).filter((pixel) =>
        hasGreenContaminationAt(image, pixel % image.width, Math.floor(pixel / image.width))
      ).length,
      0,
      `${filename} must not contain chroma-key fringe`
    )
    const hash = createHash("sha256").update(file).digest("hex")
    assert.notEqual(hash, staticHash, `${filename} must not reuse the static layer`)
    hashes.add(hash)
  })

  assert.equal(hashes.size, 4, "every tee frame must follow its own torso pose")
})

test("male straight pants walking frames deform without footwear contamination", () => {
  const expectedBounds = [
    [101, 286, 157, 340],
    [101, 287, 157, 341],
    [102, 286, 157, 342],
    [101, 286, 156, 340]
  ] as const
  const hashes = new Set<string>()

  expectedBounds.forEach((bounds, index) => {
    const frame = String(index + 1).padStart(2, "0")
    const filename = `room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f${frame}.png`
    const file = readFileSync(join(motionAssetRoot, filename))
    const image = readMotionAsset(filename)

    assert.deepEqual(alphaBounds(image), bounds)
    const lightOpaquePixels = Array.from(
      { length: image.width * image.height },
      (_, pixel) => pixel
    ).filter((pixel) => {
      const offset = pixel * 4
      return (
        (image.data[offset + 3] ?? 0) >= 64 &&
        (image.data[offset] ?? 0) >= 190 &&
        (image.data[offset + 1] ?? 0) >= 190 &&
        (image.data[offset + 2] ?? 0) >= 190
      )
    }).length
    assert.ok(lightOpaquePixels <= 8, `${filename} must not contain pale shoe pixels`)
    assert.equal(
      Array.from({ length: image.width * image.height }, (_, pixel) => pixel).filter((pixel) =>
        hasGreenContaminationAt(image, pixel % image.width, Math.floor(pixel / image.width))
      ).length,
      0,
      `${filename} must not contain chroma-key fringe`
    )
    hashes.add(createHash("sha256").update(file).digest("hex"))
  })

  assert.equal(hashes.size, 4, "every pants frame must follow its own leg pose")
})

test("male sage shorts walking frames keep a connected waist hinge without seam gaps", () => {
  const expectedBounds = [
    [97, 286, 160, 318],
    [102, 287, 154, 341],
    [103, 287, 154, 341],
    [103, 287, 155, 341]
  ] as const
  const waistSpans = [
    [99, 157],
    [105, 152],
    [107, 150],
    [106, 153]
  ] as const

  expectedBounds.forEach((bounds, index) => {
    const frame = String(index + 1).padStart(2, "0")
    const image = readMotionAsset(
      `room_avatar_bottom_male_sage_cuffed_shorts_v1_walking_front_f${frame}.png`
    )
    assert.deepEqual(alphaBounds(image), bounds)
    assert.equal(
      opaqueComponentCount(image, [96, 282, 164, 342]),
      1,
      `${frame} must keep one connected shorts silhouette`
    )
    for (let x = waistSpans[index]![0]; x <= waistSpans[index]![1]; x += 1) {
      assert.ok(alphaAt(image, x, 292) > 10, `${frame} waistband must not have a transparent seam`)
    }
    assert.equal(countGreenContamination(image), 0, `${frame} shorts must not contain chroma-key fringe`)
  })

  const sitting = readMotionAsset(
    "room_avatar_bottom_male_sage_cuffed_shorts_v1_sitting_front_f01.png"
  )
  assert.deepEqual(alphaBounds(sitting), [100, 287, 158, 341])
  assert.equal(opaqueComponentCount(sitting, [94, 282, 162, 342]), 1)
  assert.equal(countGreenContamination(sitting), 0, "sitting shorts must not contain chroma-key fringe")
})

test("male court shoes walk behind the pant hems without static-frame reuse", () => {
  const expectedBounds = [
    [102, 322, 154, 351],
    [102, 320, 152, 349],
    [103, 320, 153, 349],
    [102, 320, 152, 349]
  ] as const
  const hashes = new Set<string>()

  expectedBounds.forEach((bounds, index) => {
    const frame = String(index + 1).padStart(2, "0")
    const shoesFilename = `room_avatar_shoes_male_milk_tea_court_v1_walking_front_f${frame}.png`
    const pantsFilename = `room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f${frame}.png`
    const file = readFileSync(join(motionAssetRoot, shoesFilename))
    const shoes = readMotionAsset(shoesFilename)
    const pants = readMotionAsset(pantsFilename)
    const body = readMotionAsset(
      `room_avatar_base_male_light_v1_walking_front_f${frame}.png`
    )

    assert.deepEqual(alphaBounds(shoes), bounds)
    assert.ok(overlapBounds(pants, shoes)[1] <= 328, "pant hem must overlap the shoe upper")
    assert.equal(
      Array.from({ length: shoes.width * shoes.height }, (_, pixel) => pixel).filter((pixel) =>
        hasGreenContaminationAt(shoes, pixel % shoes.width, Math.floor(pixel / shoes.width))
      ).length,
      0,
      `${shoesFilename} must not contain chroma-key fringe`
    )
    let uncoveredBodyPixels = 0
    for (let y = 294; y <= 343; y += 1) {
      for (let x = 100; x <= 155; x += 1) {
        if (
          alphaAt(body, x, y) > 10 &&
          alphaAt(pants, x, y) <= 10 &&
          alphaAt(shoes, x, y) <= 10
        ) {
          uncoveredBodyPixels += 1
        }
      }
    }
    assert.equal(uncoveredBodyPixels, 0, `${frame} pants and shoes must fully cover the base legs`)
    hashes.add(createHash("sha256").update(file).digest("hex"))
  })

  assert.equal(hashes.size, 4, "each shoe frame must follow its matching foot pose")
})

test("male sitting starter layers use a seated fit with the same neck and waist anchors", () => {
  const body = readMotionAsset(
    "room_avatar_base_male_light_v1_sitting_front_f01.png"
  )
  const top = readMotionAsset(
    "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"
  )
  const pants = readMotionAsset(
    "room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01.png"
  )
  const shoes = readMotionAsset(
    "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"
  )

  assert.deepEqual(alphaBounds(top), [86, 216, 169, 296])
  assert.deepEqual(alphaBounds(pants), [89, 278, 167, 336])
  assert.deepEqual(alphaBounds(shoes), [93, 329, 163, 346])
  assert.ok(alphaAt(top, 128, 218) <= 48)
  assert.ok(alphaAt(top, 128, 222) >= 224)
  assert.deepEqual(
    overlapBounds(top, pants),
    [103, 280, 153, 296],
    "shirt must wrap over the seated waistband"
  )
  assert.deepEqual(
    overlapBounds(pants, shoes),
    [93, 329, 163, 333],
    "seated pant hems must cover the shoe uppers without covering the toes"
  )

  let uncoveredBodyPixels = 0
  for (let y = 294; y <= 342; y += 1) {
    for (let x = 100; x <= 156; x += 1) {
      if (
        alphaAt(body, x, y) > 10 &&
        alphaAt(pants, x, y) <= 10 &&
        alphaAt(shoes, x, y) <= 10
      ) {
        uncoveredBodyPixels += 1
      }
    }
  }
  assert.equal(uncoveredBodyPixels, 0, "seated pants and shoes must fully cover the base legs")
})
