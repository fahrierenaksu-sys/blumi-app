import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { PNG } from "pngjs"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const root = resolve(repositoryRoot, "docs/avatar-motion-pipeline/female-accessory-occlusion-staging/2026-07-15")
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
const read = (path) => PNG.sync.read(readFileSync(path))
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const states = [
  "static",
  "walking_front_f01",
  "walking_front_f02",
  "walking_front_f03",
  "walking_front_f04",
  "sitting_front_f01"
]

const basePath = (state) => state === "static"
  ? resolve(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room/avatar_room_base_female_v2.png")
  : resolve(repositoryRoot, `apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_base_female_v2_${state}.png`)
const sourcePath = (state) => join(
  resolve(repositoryRoot, "docs/avatar-motion-pipeline/female-shoes-accessories-staging/2026-07-15/accessory/cherry_micro_bag"),
  `${state}.png`,
)
const publishedPartPath = (slug, state, part) => state === "static"
  ? resolve(repositoryRoot, `apps/mobile/src/features/avatarV2/assets/room/avatar_room_accessory_female_${slug}_v2_part_${part}.png`)
  : resolve(repositoryRoot, `apps/mobile/src/features/avatarV2/assets/room/motion/room_avatar_accessory_female_${slug}_v2_part_${part}_${state}.png`)

test("occlusion repair staging preserves the three original monolithic live assets", () => {
  assert.equal(manifest.liveOverwrite, false)
  assert.equal(manifest.independentReviewVerdict, "PASS")
  assert.equal(manifest.promotion, "PROMOTED_AFTER_INDEPENDENT_REVIEW")
  assert.deepEqual(
    manifest.items.map((item) => item.slug).sort(),
    ["cherry_micro_bag", "pearl_drop_earrings", "sunny_star_clips"]
  )
  assert.equal(manifest.items.every((item) => item.producerVerdict === "PASS_CANDIDATE"), true)
  assert.equal(manifest.items.every((item) => item.liveAssetsUntouched === true), true)
})

test("reviewed split parts are exported byte-for-byte to production static and 4W+1S assets", () => {
  for (const item of manifest.items) {
    for (const state of states) {
      for (const filename of item.parts) {
        const part = filename.replace(/\.png$/, "")
        assert.equal(
          digest(join(root, item.slug, state, filename)),
          digest(publishedPartPath(item.slug, state, part)),
          `${item.slug} ${state} ${part}`,
        )
      }
    }
  }
})

test("micro bag strap-back never paints over the canonical right forearm zone", () => {
  for (const state of states) {
    const back = read(join(root, "cherry_micro_bag", state, "strap-back.png"))
    const body = read(basePath(state))
    assert.deepEqual([back.width, back.height], [256, 384])
    let overlap = 0
    for (let y = 235; y < 350; y += 1) {
      for (let x = 145; x < 230; x += 1) {
        const offset = (y * 256 + x) * 4 + 3
        if ((back.data[offset] ?? 0) > 16 && (body.data[offset] ?? 0) > 16) overlap += 1
      }
    }
    assert.equal(overlap, 0, `${state} strap/forearm overlap`)
    assert.notEqual(
      digest(join(root, "cherry_micro_bag", state, "strap-back.png")),
      digest(join(root, "cherry_micro_bag", state, "bag-front.png"))
    )
  }
})

test("micro bag moves body intersections behind the body without losing authored pixels", () => {
  for (const state of states) {
    const source = read(sourcePath(state))
    const front = read(join(root, "cherry_micro_bag", state, "bag-front.png"))
    const back = read(join(root, "cherry_micro_bag", state, "bag-back.png"))
    const body = read(basePath(state))
    assert.deepEqual([back.width, back.height], [256, 384])

    let sourceBottom = -1
    for (let y = 0; y < 384; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        if ((source.data[(y * 256 + x) * 4 + 3] ?? 0) > 0) sourceBottom = y + 1
      }
    }
    const authoredFrontStart = sourceBottom - 36

    let frontForearmOverlap = 0
    let backPixels = 0
    let contaminatedPixels = 0
    for (let y = 0; y < 384; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4
        const frontAlpha = front.data[offset + 3] ?? 0
        const backAlpha = back.data[offset + 3] ?? 0
        const bodyAlpha = body.data[offset + 3] ?? 0
        const inForearmEnvelope = state === "sitting_front_f01"
          && x >= 166 && y >= 295 && y < 322
        const inOccludedStrapEnvelope = x >= 145 && x < 230
          && y >= 235 && y < 350 && bodyAlpha > 16
        if (frontAlpha > 16 && bodyAlpha > 16 && inForearmEnvelope) frontForearmOverlap += 1
        if (backAlpha > 16) {
          backPixels += 1
          if (!inForearmEnvelope && !inOccludedStrapEnvelope) contaminatedPixels += 1
          assert.deepEqual(
            Array.from(back.data.subarray(offset, offset + 4)),
            Array.from(source.data.subarray(offset, offset + 4)),
            `${state} back split must preserve the authored bag pixels`,
          )
        }
        assert.equal(frontAlpha > 0 && backAlpha > 0, false, `${state} split layers must be disjoint`)
        if (y >= authoredFrontStart) {
          const actual = backAlpha > 0
            ? back.data.subarray(offset, offset + 4)
            : front.data.subarray(offset, offset + 4)
          assert.deepEqual(
            Array.from(actual),
            Array.from(source.data.subarray(offset, offset + 4)),
            `${state} authored bag-front pixels must not be lost`,
          )
        }
      }
    }

    assert.equal(frontForearmOverlap, 0, `${state} front/forearm overlap`)
    assert.equal(contaminatedPixels, 0, `${state} back split contamination`)
    assert.ok(backPixels > 0, `${state} needs an occluded back split`)
  }
})

test("micro bag split parts are pairwise-disjoint and exactly reconstruct the authored source", () => {
  for (const state of states) {
    const authored = read(sourcePath(state))
    const parts = ["bag-back.png", "strap-back.png", "bag-front.png"].map(
      (part) => read(join(root, "cherry_micro_bag", state, part))
    )
    for (let offset = 0; offset < authored.data.length; offset += 4) {
      const owners = parts.filter((part) => (part.data[offset + 3] ?? 0) > 0)
      assert.ok(owners.length <= 1, `${state} pixel ${offset / 4} has multiple owners`)
      const actual = owners[0]?.data.subarray(offset, offset + 4) ?? new Uint8Array([0, 0, 0, 0])
      assert.deepEqual(
        Array.from(actual),
        Array.from(authored.data.subarray(offset, offset + 4)),
        `${state} pixel ${offset / 4} must reconstruct exactly`,
      )
    }
  }
})

test("earring pearls stay outside the face core and sunny clips stay on one hair-side anchor", () => {
  for (const state of states) {
    const pearls = read(join(root, "pearl_drop_earrings", state, "pearl-front.png"))
    const clips = read(join(root, "sunny_star_clips", state, "clips-front.png"))
    let pearlFaceCore = 0
    let clipRight = 0
    for (let y = 0; y < 384; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4 + 3
        if ((pearls.data[offset] ?? 0) > 16 && x >= 100 && x <= 156) pearlFaceCore += 1
        if ((clips.data[offset] ?? 0) > 16 && x >= 124) clipRight += 1
      }
    }
    assert.equal(pearlFaceCore, 0, `${state} pearl in face core`)
    assert.equal(clipRight, 0, `${state} clip over forehead/right face`)
  }
})

test("all staged layers are RGBA-clean and publish full-body plus close-up evidence", () => {
  for (const item of manifest.items) {
    for (const state of states) {
      for (const filename of item.parts) {
        const image = read(join(root, item.slug, state, filename))
        assert.deepEqual([image.width, image.height], [256, 384])
        for (let offset = 0; offset < image.data.length; offset += 4) {
          const alpha = image.data[offset + 3] ?? 0
          if (alpha === 0) {
            assert.deepEqual(
              [image.data[offset], image.data[offset + 1], image.data[offset + 2]],
              [0, 0, 0]
            )
          }
        }
      }
    }
    const fullBody = read(join(root, item.slug, "full-body-contact-sheet.png"))
    assert.deepEqual([fullBody.width, fullBody.height], [256 * states.length, 420])

    const closeup = read(join(root, item.slug, "closeup-contact-sheet.png"))
    assert.equal(closeup.width % states.length, 0)
    assert.ok(closeup.width / states.length >= 200, `${item.slug} close-up panel width`)
    assert.ok(closeup.height >= 200, `${item.slug} close-up crop height`)
  }
})
