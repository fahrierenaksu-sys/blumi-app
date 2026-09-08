import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"
import { PNG } from "pngjs"

const repo = resolve(new URL("../../..", import.meta.url).pathname)
const room = join(repo, "apps/mobile/src/features/avatarV2/assets/room")
const motion = join(room, "motion")

const read = path => PNG.sync.read(readFileSync(path))
const alpha = (image, x, y) => image.data[(y * image.width + x) * 4 + 3]
const bounds = image => {
  let minX = image.width, minY = image.height, maxX = -1, maxY = -1
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (alpha(image, x, y) <= 0) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX + 1, maxY + 1]
}

const components = image => {
  const visited = new Uint8Array(image.width * image.height)
  let count = 0
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const start = y * image.width + x
    if (visited[start] || alpha(image, x, y) <= 16) continue
    count += 1
    visited[start] = 1
    const queue = [[x, y]]
    while (queue.length) {
      const [cx, cy] = queue.pop()
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue
        const index = ny * image.width + nx
        if (visited[index] || alpha(image, nx, ny) <= 16) continue
        visited[index] = 1
        queue.push([nx, ny])
      }
    }
  }
  return count
}

const baseFiles = [
  join(room, "avatar_room_base_female_v2.png"),
  join(room, "avatar_room_base_male_light_v1.png"),
  ...readdirSync(motion)
    .filter(name => /^room_avatar_base_(female_v2|male_light_v1)_/.test(name))
    .map(name => join(motion, name)),
]

const shoeFiles = [
  ...readdirSync(room).filter(name => /^avatar_room_shoes_(female|male)_.*\.png$/.test(name)).map(name => join(room, name)),
  ...readdirSync(motion).filter(name => /^room_avatar_shoes_(female|male)_.*\.png$/.test(name)).map(name => join(motion, name)),
]

const shoeBaseline = file => {
  const name = file.split("/").pop()
  if (name.includes("sitting")) return [346, 347]
  if (name.includes("female")) return [346, 349]
  if (name.includes("walking_front_f01")) return [346, 353]
  if (name.includes("avatar_room_shoes_male")) return [349, 353]
  return [346, 350]
}

test("canonical female and male bases keep one shared chibi canvas and body baseline", () => {
  for (const file of baseFiles) {
    const image = read(file)
    const [minX, minY, maxX, maxY] = bounds(image)
    assert.deepEqual([image.width, image.height], [256, 384], file)
    assert.ok(minY >= 200 && minY <= 220, `${file} head/neck starts outside canonical band`)
    const sitting = file.includes("sitting_front")
    assert.ok(sitting ? maxY >= 342 && maxY <= 343 : maxY === 343, `${file} body feet baseline drifted`)
    assert.ok(sitting ? minX >= 64 && maxX <= 192 : minX >= 70 && maxX <= 186, `${file} body width drifted beyond chibi envelope`)
  }
})

test("every female and male shoe stays inside the old DateVibe/Blumi foot envelope", () => {
  for (const file of shoeFiles) {
    const image = read(file)
    const [minX, minY, maxX, maxY] = bounds(image)
    const [baselineMin, baselineMax] = shoeBaseline(file)
    const female = file.includes("female")
    assert.deepEqual([image.width, image.height], [256, 384], file)
    assert.ok(minX >= 88 && maxX <= 168, `${file} shoe crossed the canonical foot corridor`)
    assert.ok(maxX - minX <= (female ? 74 : 80), `${file} shoe is oversized for the base foot`)
    assert.ok(minY >= (file.includes("sitting") ? 318 : 312), `${file} shoe collar rose above the foot anchor`)
    assert.ok(maxY >= baselineMin && maxY <= baselineMax, `${file} sole baseline ${maxY} is outside ${baselineMin}-${baselineMax}`)
    const leftFoot = Array.from({ length: 256 }, (_, x) => x).some(x => {
      if (x >= 128) return false
      for (let y = 312; y < 353; y += 1) if (alpha(image, x, y) > 16) return true
      return false
    })
    const rightFoot = Array.from({ length: 256 }, (_, x) => x).some(x => {
      if (x < 128) return false
      for (let y = 312; y < 353; y += 1) if (alpha(image, x, y) > 16) return true
      return false
    })
    assert.equal(leftFoot && rightFoot, true, `${file} must preserve two readable feet`)
  }
})
