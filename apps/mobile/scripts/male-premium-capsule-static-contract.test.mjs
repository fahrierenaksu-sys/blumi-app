import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const repo = resolve(import.meta.dirname, "../../..")
const room = resolve(repo, "apps/mobile/src/features/avatarV2/assets/room")
const evidence = resolve(repo, "docs/avatar-motion-pipeline/male-premium-capsule/2026-07-16")
const RETIRED_SLUGS = new Set([
  "cropped_cocoa_moto_jacket",
  "diagonal_seam_zip_mock_neck",
  "slim_oval_glasses",
  "soft_rectangular_glasses",
  "translucent_wrap_glasses",
  "medium_curtain_middle_part"
])

const assetPath = ({ category, slug }) =>
  resolve(room, `avatar_room_${category}_male_${slug}_v1.png`)

const transparentResidue = (png) => {
  const residue = []
  for (let offset = 0; offset < png.data.length; offset += 4) {
    if (png.data[offset + 3] !== 0) continue
    if (png.data[offset] || png.data[offset + 1] || png.data[offset + 2]) residue.push(offset / 4)
  }
  return residue
}

test("retained premium male capsule static fits are alpha-clean and proofed", () => {
  const manifestPath = resolve(evidence, "static-batch-manifest.json")
  assert.equal(existsSync(manifestPath), true, "full static manifest is required")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.rigId, "blumi_2_5d_layered_v1")
  assert.equal(manifest.fitProfileId, "blumi_male_room_avatar_v1")
  assert.equal(manifest.phase, "static-fit")
  assert.equal(manifest.items.length, 33)
  assert.deepEqual(
    Object.fromEntries(
      ["top", "bottom", "accessory", "hair_front"].map((category) => [
        category,
        manifest.items.filter(({ item }) => item.category === category).length
      ])
    ),
    { top: 14, bottom: 11, accessory: 3, hair_front: 5 }
  )
  assert.equal(existsSync(resolve(repo, manifest.staticContactSheet)), true)
  assert.equal(existsSync(resolve(repo, manifest.staticCloseupSheet)), true)

  assert.deepEqual(
    manifest.items
      .filter(({ item }) => RETIRED_SLUGS.has(item.slug))
      .map(({ item }) => item.slug)
      .sort(),
    [...RETIRED_SLUGS].sort(),
    "historical retired records stay explicit"
  )

  for (const record of manifest.items.filter(({ item }) => RETIRED_SLUGS.has(item.slug))) {
    assert.equal(
      existsSync(assetPath(record.item)),
      false,
      `${record.item.slug} retired static asset`,
    )
  }

  for (const record of manifest.items.filter(({ item }) => !RETIRED_SLUGS.has(item.slug))) {
    const file = assetPath(record.item)
    assert.equal(existsSync(file), true, `${record.item.slug} static asset`)
    const png = PNG.sync.read(readFileSync(file))
    assert.equal(png.width, 256, `${record.item.slug} width`)
    assert.equal(png.height, 384, `${record.item.slug} height`)
    assert.deepEqual(transparentResidue(png), [], `${record.item.slug} transparent RGB residue`)
  }
})
