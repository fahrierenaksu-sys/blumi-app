import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

import { measureBottomShoeSeam } from "./female-wardrobe-combined-promotion-gate.mjs"

const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")
const states = ["static", "walking_front_f01"]
const trousers = [
  "midnight_ribbon_wide_leg_pants",
  "buttercream_pearl_tailored_pants"
]

const readPng = (path) => PNG.sync.read(readFileSync(path))

const runtimePath = (kind, slug, state) => state === "static"
  ? `${roomRoot}/avatar_room_${kind}_female_${slug}_v2.png`
  : `${roomRoot}/motion/room_avatar_${kind}_female_${slug}_v2_${state}.png`

const basePath = (state) => state === "static"
  ? `${roomRoot}/avatar_room_base_female_v2.png`
  : `${roomRoot}/motion/room_avatar_base_female_v2_${state}.png`

test("Milk Tea sneaker keeps both new trouser hems continuously anchored in static and W1", () => {
  for (const state of states) {
    const base = readPng(basePath(state))
    const shoes = readPng(runtimePath("shoes", "milk_tea_court_sneakers", state))
    for (const slug of trousers) {
      const metrics = measureBottomShoeSeam({
        base,
        bottom: readPng(runtimePath("bottom", slug, state)),
        shoes
      })
      assert.ok(
        metrics.exposedBasePixels <= 2 && metrics.maxExposedBand <= 1,
        `${slug}/${state}: Milk Tea medial collar leaves a base band ` +
          `(pixels=${metrics.exposedBasePixels}, max=${metrics.maxExposedBand})`
      )
    }
  }
})

test("fresh heel pairs keep both new trouser hems continuously anchored in static and W1", () => {
  for (const state of states) {
    const base = readPng(basePath(state))
    for (const heel of ["rose_satin_bow_heels", "ivory_pearl_slingback_heels"]) {
      const shoes = readPng(runtimePath("shoes", heel, state))
      for (const slug of trousers) {
        const metrics = measureBottomShoeSeam({
          base,
          bottom: readPng(runtimePath("bottom", slug, state)),
          shoes
        })
        assert.ok(
          metrics.exposedBasePixels <= 2 && metrics.maxExposedBand <= 1,
          `${slug}/${heel}/${state}: medial upper leaves a base band ` +
            `(pixels=${metrics.exposedBasePixels}, max=${metrics.maxExposedBand})`
        )
      }
    }
  }
})
