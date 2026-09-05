import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { PNG } from "pngjs"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const roomRoot = resolve(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room")
const motionRoot = join(roomRoot, "motion")

const projectionSource = readFileSync(
  resolve(repositoryRoot, "apps/mobile/src/features/avatarV2/room/avatarRoomProjection.ts"),
  "utf8"
)

const promotedSlugs = (kind) => [...projectionSource.matchAll(
  new RegExp(`${kind}Id: \\\"room_avatar_${kind}_female_([^\\\"]+)_v2\\\"`, "g")
)]
  .map((match) => match[1])
  .filter((slug) => !slug.includes("dress"))

const tops = promotedSlugs("top")
const shoes = promotedSlugs("shoes")

const bottoms = [
  "black_palm_embellished_pants",
  "smoky_floral_mesh_pants",
  "layered_lace_ruffle_mini_skirt",
  "yellow_bow_lace_ruffle_skirt"
]

const readPng = (path) => PNG.sync.read(readFileSync(path))
const digest = (value) => createHash("sha256").update(value).digest("hex")
const rgbaPath = (kind, slug, frame) => join(
  motionRoot,
  `room_avatar_${kind}_female_${slug}_v2_walking_front_f${frame}.png`
)

const opaqueBounds = (image, threshold = 16) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.data[(y * image.width + x) * 4 + 3] ?? 0
      if (alpha <= threshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [minX, minY, maxX, maxY]
}

const isExactTranslation = (source, candidate, dx, dy) => {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4
      const targetX = x + dx
      const targetY = y + dy
      for (let channel = 0; channel < 4; channel += 1) {
        const expected = targetX >= 0 && targetX < source.width && targetY >= 0 && targetY < source.height
          ? candidate.data[(targetY * candidate.width + targetX) * 4 + channel]
          : 0
        if ((source.data[sourceOffset + channel] ?? 0) !== (expected ?? 0)) return false
      }
    }
  }
  return true
}

const connectedComponents = (image) => {
  const visited = new Set()
  const components = []
  const key = (x, y) => y * image.width + x
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      if ((image.data[offset + 3] ?? 0) <= 16 || visited.has(key(x, y))) continue
      const queue = [[x, y]]
      visited.add(key(x, y))
      let size = 0
      while (queue.length > 0) {
        const [currentX, currentY] = queue.pop()
        size += 1
        for (const [nextX, nextY] of [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1]
        ]) {
          if (nextX < 0 || nextX >= image.width || nextY < 0 || nextY >= image.height) continue
          const nextKey = key(nextX, nextY)
          const nextOffset = (nextY * image.width + nextX) * 4
          if ((image.data[nextOffset + 3] ?? 0) <= 16 || visited.has(nextKey)) continue
          visited.add(nextKey)
          queue.push([nextX, nextY])
        }
      }
      components.push(size)
    }
  }
  return components.sort((left, right) => right - left)
}

test("female tops use pose-specific silhouettes instead of translated static copies", () => {
  assert.ok(tops.length >= 6, "female non-dress top projection unexpectedly shrank")
  for (const slug of tops) {
    const source = readPng(join(roomRoot, `avatar_room_top_female_${slug}_v2.png`))
    const frame2 = readPng(rgbaPath("top", slug, "02"))
    const frame3 = readPng(rgbaPath("top", slug, "03"))
    const frame4 = readPng(rgbaPath("top", slug, "04"))
    assert.equal(isExactTranslation(source, frame2, -1, 0), false, `${slug} F02 is only a translation`)
    assert.equal(isExactTranslation(source, frame3, 0, 1), false, `${slug} F03 is only a translation`)
    assert.equal(isExactTranslation(source, frame4, 1, 0), false, `${slug} F04 is only a translation`)
  }
})

test("female shoe F04 follows its own body anchor instead of duplicating F02", () => {
  assert.ok(shoes.length >= 5, "female shoe projection unexpectedly shrank")
  const base4 = readPng(join(motionRoot, "room_avatar_base_female_v2_walking_front_f04.png"))
  const [baseLeft, , baseRight] = opaqueBounds(base4)
  const baseCenter = (baseLeft + baseRight) / 2
  for (const slug of shoes) {
    const frame2 = readFileSync(rgbaPath("shoes", slug, "02"))
    const frame4Path = rgbaPath("shoes", slug, "04")
    const frame4 = readFileSync(frame4Path)
    assert.notEqual(digest(frame4), digest(frame2), `${slug} F04 duplicates F02`)
    const [left, , right] = opaqueBounds(readPng(frame4Path))
    assert.ok(Math.abs((left + right) / 2 - baseCenter) <= 2, `${slug} F04 center drifts from body`)
  }
})

test("known-problem female bottoms have no tiny alpha islands or green chroma fringe", () => {
  for (const slug of bottoms) {
    for (const frame of ["01", "02", "03", "04"]) {
      const image = readPng(rgbaPath("bottom", slug, frame))
      const components = connectedComponents(image)
      assert.equal(components.some((size, index) => index > 1 && size <= 10), false, `${slug} F${frame} has tiny alpha islands`)
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const [red, green, blue, alpha] = image.data.subarray(offset, offset + 4)
        assert.equal(alpha > 0 && green > red + 48 && green > blue + 48, false, `${slug} F${frame} has green chroma fringe`)
      }
    }
  }
})
