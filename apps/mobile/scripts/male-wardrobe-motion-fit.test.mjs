import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../../..")
const promotion = JSON.parse(readFileSync(resolve(
  root,
  "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/" +
    "male-wardrobe-66-runtime-promotion-evidence-v1.json",
), "utf8"))
const requiredStates = [
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01",
]

test("all promoted male assets have an exact hash-bound 4W+1S state set", () => {
  assert.equal(promotion.itemCount, 66)
  for (const item of promotion.items) {
    assert.deepEqual(Object.keys(item.frames).sort(), [...requiredStates].sort(), item.slug)
    for (const state of requiredStates) {
      assert.match(item.frames[state].runtimeSha256, /^[a-f0-9]{64}$/)
    }
  }
})

test("pose-sensitive garments and shoes use a dedicated sitting fit", () => {
  for (const item of promotion.items) {
    if (!["top", "bottom", "shoes"].includes(item.category)) continue
    const walking = new Set(
      [1, 2, 3, 4].map((index) =>
        item.frames[`walking_front_f0${index}`].runtimeSha256),
    )
    assert.equal(
      walking.has(item.frames.sitting_front_f01.runtimeSha256),
      false,
      `${item.slug} sitting fit reuses a walking frame`,
    )
  }
})
