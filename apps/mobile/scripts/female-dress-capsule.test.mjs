import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { PNG } from "pngjs"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const roomRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room")
const motionRoot = join(roomRoot, "motion")
const profileRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/layers")
const thumbnailRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/shop-thumbnails")
const sourceRoot = join(repositoryRoot, "docs/avatar-motion-pipeline/render-sources/female-dresses")
const manifestPath = join(sourceRoot, "female-dress-capsule-manifest.json")

const EXPECTED_DRESSES = [
  "rose_ribbon_tea_dress",
  "moonlit_velvet_ballet_dress",
  "buttercup_picnic_pinafore_dress",
  "lavender_garden_ribbon_dress"
]

const readPng = (path) => PNG.sync.read(readFileSync(path))
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const assertPng = (path, [width, height]) => {
  assert.equal(existsSync(path), true, `missing ${path}`)
  const image = readPng(path)
  assert.equal(image.width, width, `${path} width`)
  assert.equal(image.height, height, `${path} height`)
  assert.equal(image.colorType, 6, `${path} must be RGBA`)
  return image
}

const opaqueBounds = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if ((image.data[offset + 3] ?? 0) < 24) continue
    const pixel = offset / 4
    const x = pixel % image.width
    const y = Math.floor(pixel / image.width)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

test("four premium female dress pairs have complete canonical source and catalog assets", () => {
  assert.equal(existsSync(manifestPath), true, "dress capsule manifest must exist")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.deepEqual(manifest.dresses.map((dress) => dress.slug), EXPECTED_DRESSES)

  for (const dress of manifest.dresses) {
    assert.equal(dress.outfitKey, dress.slug)
    assert.equal(dress.top.layerOrder, 50)
    assert.equal(dress.bottom.layerOrder, 40)
    assert.equal(dress.bottom.occlusionRole, "bottomBehindShoes")
    assert.equal(existsSync(join(repositoryRoot, dress.source.alpha)), true, `${dress.slug} source alpha`)

    const top = assertPng(join(repositoryRoot, dress.top.static), [256, 384])
    const bottom = assertPng(join(repositoryRoot, dress.bottom.static), [256, 384])
    assertPng(join(repositoryRoot, dress.top.profile), [512, 768])
    assertPng(join(repositoryRoot, dress.bottom.profile), [512, 768])
    assertPng(join(repositoryRoot, dress.top.thumbnail), [512, 768])

    const [topLeft, topY, topRight, topBottom] = opaqueBounds(top)
    const [bottomLeft, bottomY, bottomRight, bottomBottom] = opaqueBounds(bottom)
    assert.ok(topLeft >= 68 && topRight <= 188, `${dress.slug} top leaves the female rig envelope`)
    assert.ok(bottomLeft >= 68 && bottomRight <= 188, `${dress.slug} skirt leaves the female rig envelope`)
    assert.ok(topY <= 214, `${dress.slug} neckline starts below canonical neck zone`)
    assert.ok(topBottom >= 264 && bottomY <= 278, `${dress.slug} atomic waist seam does not overlap`)
    assert.ok(bottomBottom <= 337, `${dress.slug} skirt conflicts with footwear zone`)

    for (const pose of ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]) {
      const motionTopPath = join(motionRoot, `room_avatar_top_female_${dress.slug}_v2_${pose}.png`)
      const motionBottomPath = join(motionRoot, `room_avatar_bottom_female_${dress.slug}_v2_${pose}.png`)
      const motionTop = assertPng(motionTopPath, [256, 384])
      const motionBottom = assertPng(motionBottomPath, [256, 384])
      const [, , , motionHem] = opaqueBounds(motionBottom)
      assert.ok(motionHem <= 338, `${dress.slug} ${pose} hem enters the footwear sole zone`)
      assert.ok(opaqueBounds(motionTop)[0] >= 66, `${dress.slug} ${pose} top leaves the shoulder envelope`)

      if (pose === "walking_front_f02" || pose === "walking_front_f03" || pose === "walking_front_f04") {
        assert.notEqual(
          digest(motionTopPath),
          digest(join(roomRoot, `avatar_room_top_female_${dress.slug}_v2.png`)),
          `${dress.slug} ${pose} top cannot be a static copy`
        )
        assert.notEqual(
          digest(motionBottomPath),
          digest(join(roomRoot, `avatar_room_bottom_female_${dress.slug}_v2.png`)),
          `${dress.slug} ${pose} bottom cannot be a static copy`
        )
      }
    }
  }
})
