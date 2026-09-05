import assert from "node:assert/strict"
import { readFileSync, statSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const stagingRoot = resolve("docs/avatar-motion-pipeline/male-motion-wave-staging/frames")
const motionRoot = resolve("apps/mobile/src/features/avatarV2/assets/room/motion")

const complexTops = [
  "mist_blue_oxford_shirt",
  "soft_sage_linen_shirt",
  "cocoa_varsity_jacket",
  "dusty_navy_chore_jacket"
]
const bottoms = [
  "navy_straight_pants",
  "mid_blue_straight_jeans",
  "charcoal_tapered_chinos",
  "warm_sand_relaxed_pants"
]
const allItems = [
  ...["cream_basic_tee", "dusty_navy_tee", "powder_blue_crew_tee", "sage_basic_tee", ...complexTops]
    .map((slug) => ["top", slug]),
  ...bottoms.map((slug) => ["bottom", slug])
]

const readPng = (path) => PNG.sync.read(readFileSync(path))
const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3] ?? 0
const framePath = (kind, slug, pose, frame) => join(
  stagingRoot,
  `room_avatar_${kind}_male_${slug}_v1_${pose}_front_f${String(frame).padStart(2, "0")}.png`
)
const referencePath = (kind, pose, frame) => join(
  motionRoot,
  `room_avatar_${kind}_male_${kind === "top" ? "powder_blue_crew_tee" : "navy_straight_pants"}_v1_${pose}_front_f${String(frame).padStart(2, "0")}.png`
)

const connectedComponentSizes = (image, threshold = 32, erode = false) => {
  const visible = new Set()
  for (let y = 210; y < 309; y += 1) {
    for (let x = 70; x < 186; x += 1) {
      if (alphaAt(image, x, y) > threshold) visible.add(`${x},${y}`)
    }
  }
  if (erode) {
    const source = new Set(visible)
    for (const key of [...visible]) {
      const [x, y] = key.split(",").map(Number)
      const neighbors = [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map((dx) => `${x + dx},${y + dy}`)
      )
      if (neighbors.some((neighbor) => !source.has(neighbor))) visible.delete(key)
    }
  }

  const sizes = []
  while (visible.size > 0) {
    const seed = visible.values().next().value
    visible.delete(seed)
    const queue = [seed]
    let size = 0
    while (queue.length > 0) {
      const current = queue.pop()
      const [x, y] = current.split(",").map(Number)
      size += 1
      for (const neighbor of [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`]) {
        if (!visible.delete(neighbor)) continue
        queue.push(neighbor)
      }
    }
    sizes.push(size)
  }
  return sizes.sort((left, right) => right - left)
}

const maxInteriorRowColorJump = (image) => {
  let maxJump = 0
  for (let y = 230; y < 289; y += 1) {
    const jumps = []
    for (let x = 105; x < 152; x += 1) {
      const currentOffset = (y * image.width + x) * 4
      const nextOffset = ((y + 1) * image.width + x) * 4
      if ((image.data[currentOffset + 3] ?? 0) <= 200 || (image.data[nextOffset + 3] ?? 0) <= 200) continue
      jumps.push(
        [0, 1, 2].reduce((sum, channel) =>
          sum + Math.abs((image.data[currentOffset + channel] ?? 0) - (image.data[nextOffset + channel] ?? 0)), 0
        ) / 3
      )
    }
    if (jumps.length > 0) maxJump = Math.max(maxJump, jumps.reduce((sum, jump) => sum + jump, 0) / jumps.length)
  }
  return maxJump
}

const exposedBodyPixels = (candidate, reference, body, bounds) => {
  let count = 0
  for (let y = bounds[1]; y < bounds[3]; y += 1) {
    for (let x = bounds[0]; x < bounds[2]; x += 1) {
      if (alphaAt(reference, x, y) > 16 && alphaAt(body, x, y) > 16 && alphaAt(candidate, x, y) <= 16) {
        count += 1
      }
    }
  }
  return count
}

test("complex top W2-W4 stays connected after one-pixel erosion with no torso skin leak or band fracture", () => {
  for (const slug of complexTops) {
    for (const frame of [2, 3, 4]) {
      const candidate = readPng(framePath("top", slug, "walking", frame))
      const reference = readPng(referencePath("top", "walking", frame))
      const body = readPng(join(motionRoot, `room_avatar_base_male_light_v1_walking_front_f${String(frame).padStart(2, "0")}.png`))
      const components = connectedComponentSizes(candidate, 32, true)
      assert.equal(components.length, 1, `${slug} f0${frame} sleeve/torso component split: ${components}`)
      assert.equal(
        exposedBodyPixels(candidate, reference, body, [110, 235, 147, 283]),
        0,
        `${slug} f0${frame} torso skin leak`
      )
      assert.ok(
        maxInteriorRowColorJump(candidate) < 14,
        `${slug} f0${frame} horizontal color band: ${maxInteriorRowColorJump(candidate).toFixed(2)}`
      )
    }
  }
})

for (const slug of bottoms) {
  test(`${slug}: pants cover the canonical inner-leg body corridor in 4W+1S`, () => {
    const leaks = []
    for (const [pose, frames] of [["walking", [1, 2, 3, 4]], ["sitting", [1]]]) {
      for (const frame of frames) {
        const candidate = readPng(framePath("bottom", slug, pose, frame))
        const reference = readPng(referencePath("bottom", pose, frame))
        const body = readPng(join(motionRoot, `room_avatar_base_male_light_v1_${pose}_front_f${String(frame).padStart(2, "0")}.png`))
        leaks.push(exposedBodyPixels(candidate, reference, body, [116, 300, 141, 338]))
      }
    }
    assert.deepEqual(leaks, [0, 0, 0, 0, 0], `${slug} naked body pixels in W1-W4,S: ${leaks.join("/")}`)
  })
}

test("all 12 walking cycles are byte-distinct and move without centroid teleport", () => {
  for (const [kind, slug] of allItems) {
    const frames = [1, 2, 3, 4].map((frame) => readPng(framePath(kind, slug, "walking", frame)))
    assert.equal(new Set(frames.map((frame) => frame.data.toString("base64"))).size, 4, `${slug} repeated frame`)
    const centroids = frames.map((image) => {
      let weight = 0
      let weightedX = 0
      let weightedY = 0
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const alpha = alphaAt(image, x, y)
          if (alpha <= 16) continue
          weight += alpha
          weightedX += x * alpha
          weightedY += y * alpha
        }
      }
      return [weightedX / weight, weightedY / weight]
    })
    for (let index = 0; index < centroids.length; index += 1) {
      const current = centroids[index]
      const next = centroids[(index + 1) % centroids.length]
      assert.ok(Math.hypot(current[0] - next[0], current[1] - next[1]) < 3, `${slug} centroid teleport`)
    }
  }
})

test("independent package scan finds no zero-byte or transparent-RGB residue", () => {
  for (const [kind, slug] of allItems) {
    const paths = [
      ...[1, 2, 3, 4].map((frame) => framePath(kind, slug, "walking", frame)),
      framePath(kind, slug, "sitting", 1)
    ]
    for (const path of paths) {
      assert.ok(statSync(path).size > 0, `${basename(path)} is zero-byte`)
      const image = readPng(path)
      let residue = 0
      for (let offset = 0; offset < image.data.length; offset += 4) {
        if (
          (image.data[offset + 3] ?? 0) === 0 &&
          ((image.data[offset] ?? 0) !== 0 || (image.data[offset + 1] ?? 0) !== 0 || (image.data[offset + 2] ?? 0) !== 0)
        ) residue += 1
      }
      assert.equal(residue, 0, `${basename(path)} transparent-RGB residue`)
    }
  }
})
