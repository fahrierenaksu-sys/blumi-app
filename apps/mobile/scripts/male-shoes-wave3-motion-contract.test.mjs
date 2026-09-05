import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import pngjs from "pngjs"

const { PNG } = pngjs
const root = process.cwd()
const motionRoot = join(root, "apps/mobile/src/features/avatarV2/assets/room/motion")
const stagingRoot = join(root, "docs/avatar-motion-pipeline/male-shoes-wave3-motion-staging")

const styles = [
  "cloud_white_trainers",
  "cocoa_penny_loafers",
  "dusty_blue_canvas_sneakers"
]
const poses = [
  ...Array.from({ length: 4 }, (_, index) => `walking_front_f${String(index + 1).padStart(2, "0")}`),
  "sitting_front_f01"
]
const qaFiles = [
  "2026-07-14-male-shoes-wave3-motion-full-body.png",
  "2026-07-14-male-shoes-wave3-motion-hem-closeups.png",
  "2026-07-14-male-shoes-wave3-motion-alpha-diffs.png",
  "2026-07-14-male-shoes-wave3-motion-manifest.sha256",
  "2026-07-14-male-shoes-wave3-motion-report.md"
]

const filenameFor = (style, pose) =>
  `room_avatar_shoes_male_${style}_v1_${pose}.png`

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

const alphaDifferenceCount = (first, second) => {
  let differences = 0
  for (let offset = 3; offset < first.data.length; offset += 4) {
    if ((first.data[offset] > 16) !== (second.data[offset] > 16)) differences += 1
  }
  return differences
}

const overlapCount = (first, second) => {
  let count = 0
  for (let offset = 3; offset < first.data.length; offset += 4) {
    if (first.data[offset] > 16 && second.data[offset] > 16) count += 1
  }
  return count
}

const alphaComponents = (image, threshold = 16) => {
  const visited = new Set()
  const components = []
  const keyFor = (x, y) => y * image.width + x
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const startKey = keyFor(x, y)
      if (visited.has(startKey) || alphaAt(image, x, y) <= threshold) continue
      const queue = [[x, y]]
      visited.add(startKey)
      const pixels = []
      while (queue.length > 0) {
        const [currentX, currentY] = queue.pop()
        pixels.push([currentX, currentY])
        for (const [nextX, nextY] of [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1]
        ]) {
          if (nextX < 0 || nextX >= image.width || nextY < 0 || nextY >= image.height) continue
          const nextKey = keyFor(nextX, nextY)
          if (visited.has(nextKey) || alphaAt(image, nextX, nextY) <= threshold) continue
          visited.add(nextKey)
          queue.push([nextX, nextY])
        }
      }
      components.push(pixels)
    }
  }
  return components.sort((first, second) => second.length - first.length)
}

test("RED gate: all three shoes stage four walk frames and one seated frame", () => {
  for (const style of styles) {
    for (const pose of poses) {
      const filename = filenameFor(style, pose)
      assert.ok(statSync(join(stagingRoot, filename)).size > 0, `${filename} must not be 0-byte`)
      const image = readPng(stagingRoot, filename)
      assert.deepEqual([image.width, image.height], [256, 384], `${filename} canonical canvas`)
    }
  }
  for (const filename of qaFiles) {
    assert.ok(statSync(join(stagingRoot, filename)).size > 0, `${filename} must not be 0-byte`)
  }
})

test("each staged frame inherits the canonical Milk Tea pose envelope and baseline", () => {
  for (const pose of poses) {
    const reference = readPng(
      motionRoot,
      `room_avatar_shoes_male_milk_tea_court_v1_${pose}.png`
    )
    const expectedBounds = alphaBounds(reference)
    for (const style of styles) {
      const image = readPng(stagingRoot, filenameFor(style, pose))
      assert.deepEqual(alphaBounds(image), expectedBounds, `${style} ${pose} rig envelope`)
    }
  }
})

test("pants cover the shoe upper while the lower body has no leak or contact gap", () => {
  for (const pose of poses) {
    const base = readPng(motionRoot, `room_avatar_base_male_light_v1_${pose}.png`)
    const pants = readPng(motionRoot, `room_avatar_bottom_male_navy_straight_pants_v1_${pose}.png`)
    for (const style of styles) {
      const shoes = readPng(stagingRoot, filenameFor(style, pose))
      assert.ok(overlapCount(pants, shoes) >= 150, `${style} ${pose} pant-over-shoe overlap`)

      let exposedBodyPixels = 0
      for (let y = 316; y < 349; y += 1) {
        for (let x = 80; x < 176; x += 1) {
          if (
            alphaAt(base, x, y) > 16 &&
            alphaAt(pants, x, y) <= 16 &&
            alphaAt(shoes, x, y) <= 16
          ) {
            exposedBodyPixels += 1
          }
        }
      }
      assert.equal(exposedBodyPixels, 0, `${style} ${pose} body leak/gap`)
    }
  }
})

test("motion frames are genuinely pose-specific", () => {
  for (const style of styles) {
    const walkingHashes = poses.slice(0, 4).map((pose) =>
      createHash("sha256")
        .update(readFileSync(join(stagingRoot, filenameFor(style, pose))))
        .digest("hex")
    )
    assert.equal(new Set(walkingHashes).size, 4, `${style} needs four distinct walk frames`)
  }
})

test("the deterministic manifest covers exactly all 15 staged frames", () => {
  const manifestPath = join(stagingRoot, "2026-07-14-male-shoes-wave3-motion-manifest.sha256")
  const entries = readFileSync(manifestPath, "utf8").trim().split("\n")
  assert.equal(entries.length, 15)
  const expectedFiles = new Set(styles.flatMap((style) => poses.map((pose) => filenameFor(style, pose))))
  for (const entry of entries) {
    const [expectedHash, filename] = entry.split(/\s{2}/)
    assert.ok(expectedFiles.delete(filename), `${filename} manifest identity`)
    const actualHash = createHash("sha256")
      .update(readFileSync(join(stagingRoot, filename)))
      .digest("hex")
    assert.equal(actualHash, expectedHash, `${filename} manifest hash`)
  }
  assert.equal(expectedFiles.size, 0)
})

test("trainer, loafer, and canvas contours remain distinct in every pose", () => {
  for (const pose of poses) {
    const images = styles.map((style) => [style, readPng(stagingRoot, filenameFor(style, pose))])
    for (let firstIndex = 0; firstIndex < images.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < images.length; secondIndex += 1) {
        const [firstName, first] = images[firstIndex]
        const [secondName, second] = images[secondIndex]
        const difference = alphaDifferenceCount(first, second)
        assert.ok(
          difference >= 70,
          `${pose}: ${firstName}/${secondName} must not collapse to a recolor mask; alpha diff=${difference}`
        )
      }
    }
  }
})

test("Canvas has exactly two raw-alpha shoe components and no detached satellites", () => {
  for (const pose of poses) {
    const canvas = readPng(
      stagingRoot,
      filenameFor("dusty_blue_canvas_sneakers", pose)
    )
    const components = alphaComponents(canvas, 0)
    assert.equal(
      components.length,
      2,
      `${pose} must contain only the intended left/right Canvas shoes; component sizes=${components.map((component) => component.length).join("/")}`
    )
    assert.ok(components.every((component) => component.length >= 100), `${pose} main shoe size`)
  }
})

test("all motion assets have clean transparent RGB and no chroma fringe", () => {
  for (const style of styles) {
    for (const pose of poses) {
      const image = readPng(stagingRoot, filenameFor(style, pose))
      let residue = 0
      let fringe = 0
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const red = image.data[offset] ?? 0
        const green = image.data[offset + 1] ?? 0
        const blue = image.data[offset + 2] ?? 0
        const alpha = image.data[offset + 3] ?? 0
        if (alpha === 0 && (red !== 0 || green !== 0 || blue !== 0)) residue += 1
        if (alpha >= 11 && alpha < 240 && green > red + 12 && green > blue + 12) fringe += 1
      }
      assert.equal(residue, 0, `${style} ${pose} transparent RGB residue`)
      assert.equal(fringe, 0, `${style} ${pose} chroma fringe`)
    }
  }
})
