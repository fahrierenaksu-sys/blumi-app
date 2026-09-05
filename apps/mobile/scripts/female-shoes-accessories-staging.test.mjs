import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const root = resolve("docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15")
const manifest = JSON.parse(readFileSync(join(root, "item-verdicts.json"), "utf8"))
const read = (path) => PNG.sync.read(readFileSync(path))
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const bbox = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) <= 16) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [minX, minY, maxX, maxY]
}

test("staging covers exactly five shoes and twelve accessories without touching live paths", () => {
  assert.equal(manifest.liveOverwrite, false)
  assert.equal(manifest.items.filter((item) => item.category === "shoes").length, 5)
  assert.equal(manifest.items.filter((item) => item.category === "accessory").length, 12)
  assert.equal(manifest.items.every((item) => item.technicalVerdict === "PASS"), true)
})

test("every staged shoe has an independent F04 aligned to the canonical female F04 body", () => {
  const body = read(resolve("apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_base_female_v2_walking_front_f04.png"))
  const [bodyLeft, , bodyRight] = bbox(body)
  const bodyCenter = (bodyLeft + bodyRight) / 2
  for (const item of manifest.items.filter((entry) => entry.category === "shoes")) {
    const slug = item.id.replace("room_avatar_shoes_female_", "").replace("_v2", "")
    const dir = join(root, "shoes", slug)
    const f02 = join(dir, "walking_front_f02.png")
    const f04 = join(dir, "walking_front_f04.png")
    assert.notEqual(digest(f02), digest(f04), `${slug} duplicated F02`)
    const [left, , right] = bbox(read(f04))
    assert.ok(Math.abs((left + right) / 2 - bodyCenter) <= 2, `${slug} F04 center drift`)
  }
})

test("body-anchored accessories are pose-specific while approved head items retain their anchor class", () => {
  const bodyItems = manifest.items.filter((item) => item.anchorClass === "body")
  const headItems = manifest.items.filter((item) => item.anchorClass === "head")
  assert.equal(bodyItems.length, 3)
  assert.equal(headItems.length, 9)
  for (const item of bodyItems) {
    const slug = item.id.replace("room_avatar_accessory_female_", "").replace("_v2", "")
    const dir = join(root, "accessory", slug)
    const hashes = ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]
      .map((state) => digest(join(dir, `${state}.png`)))
    assert.equal(new Set(hashes).size, hashes.length, `${slug} has a copied body pose`)
  }
  assert.equal(headItems.every((item) => item.method === "preserved-approved-head-anchor"), true)
})
