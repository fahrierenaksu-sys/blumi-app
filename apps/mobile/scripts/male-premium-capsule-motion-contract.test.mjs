import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const root = resolve(import.meta.dirname, "../../..")
const evidence = join(root, "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16")
const motionRoot = join(evidence, "motion-candidates")
const room = join(root, "apps/mobile/src/features/avatarV2/assets/room")
const states = ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]
const RETIRED_SLUGS = new Set([
  "cropped_cocoa_moto_jacket",
  "diagonal_seam_zip_mock_neck",
  "slim_oval_glasses",
  "soft_rectangular_glasses",
  "translucent_wrap_glasses",
  "medium_curtain_middle_part"
])

const residue = (image) => {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) assert.deepEqual([...image.data.slice(offset, offset + 3)], [0, 0, 0])
  }
}

const staticManifest = () => JSON.parse(readFileSync(join(evidence, "static-batch-manifest.json"), "utf8"))

test("retained 23 premium clothing layers have clean, distinct 4W+1S motion candidates and live frames", () => {
  const items = staticManifest().items
    .map(({ item }) => item)
    .filter(({ slug }) => !RETIRED_SLUGS.has(slug))
    .filter(({ category }) => category === "top" || category === "bottom")
  assert.equal(items.length, 23)
  const manifestPath = join(evidence, "full-motion-manifest.json")
  assert.equal(existsSync(manifestPath), true, "full clothing motion manifest")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.phase, "full-motion-staging")
  assert.deepEqual(
    manifest.items
      .filter((item) => !RETIRED_SLUGS.has(item.slug))
      .map((item) => item.slug)
      .sort(),
    items.map((item) => item.slug).sort()
  )

  for (const { category, slug } of items) {
    const frames = states.map((state) => {
      const path = join(motionRoot, slug, `${state}.png`)
      assert.equal(existsSync(path), true, `${slug} ${state}`)
      const image = PNG.sync.read(readFileSync(path))
      assert.deepEqual([image.width, image.height], [256, 384])
      residue(image)
      const live = join(room, "motion", `room_avatar_${category}_male_${slug}_v1_${state}.png`)
      assert.equal(existsSync(live), true, `${slug} live ${state}`)
      return image.data.toString("base64")
    })
    assert.equal(new Set(frames.slice(0, 4)).size, 4, `${slug} needs four distinct walking frames`)
    assert.notEqual(frames[0], frames[4], `${slug} sitting must be pose-specific`)
  }
})

test("retained hairstyle features have contact proof and keyed fixed-head 4W+1S coverage", () => {
  const items = staticManifest().items
    .map(({ item }) => item)
    .filter(({ slug }) => !RETIRED_SLUGS.has(slug))
    .filter(({ category }) => category === "accessory" || category === "hair_front")
  assert.equal(items.length, 4)

  for (const { category, slug } of items) {
    assert.equal(
      existsSync(join(evidence, "feature-motion-qa", slug, "motion-contact-sheet.png")),
      true,
      `${slug} contact sheet`
    )
    for (const state of states) {
      const live = join(room, `avatar_room_${category}_male_${slug}_v1.png`)
      assert.equal(existsSync(live), true, `${slug} fixed-head live source`)
    }
  }
})
