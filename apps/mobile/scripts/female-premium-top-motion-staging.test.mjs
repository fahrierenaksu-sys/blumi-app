import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const root = resolve("docs/avatar-motion-pipeline/female-premium-top-motion-staging")
const stagedItems = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((slug) => {
    try {
      readFileSync(join(root, slug, "metrics.json"))
      return true
    } catch {
      return false
    }
  })

const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")
const motionRoot = join(roomRoot, "motion")

const outerHandCorePixelsBySide = (base) => {
  const sidePixels = (leftSide) => {
    const anchorXs = []
    for (let y = 220; y < base.height; y += 1) {
      for (let x = 0; x < base.width; x += 1) {
        if (leftSide ? x >= 98 : x <= 158) continue
        if ((base.data[(y * base.width + x) * 4 + 3] ?? 0) > 16) anchorXs.push([x, y])
      }
    }
    const maxY = Math.max(...anchorXs.map(([, y]) => y))
    const minY = maxY - 15
    const pixels = []
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = leftSide ? 0 : 149; x < (leftSide ? 108 : base.width); x += 1) {
        if ((base.data[(y * base.width + x) * 4 + 3] ?? 0) > 16) pixels.push([x, y])
      }
    }
    const distinctXs = [...new Set(pixels.map(([x]) => x))].sort((left, right) => left - right)
    const splitIndex = leftSide
      ? Math.max(0, Math.floor(distinctXs.length * 0.65) - 1)
      : Math.min(distinctXs.length - 1, Math.floor(distinctXs.length * 0.35))
    const splitX = distinctXs[splitIndex]
    return pixels.filter(([x]) => leftSide ? x <= splitX : x >= splitX)
  }
  return {
    left: sidePixels(true),
    right: sidePixels(false),
  }
}

const alphaIoU = (left, right) => {
  let intersection = 0
  let union = 0
  for (let offset = 3; offset < left.data.length; offset += 4) {
    const leftVisible = (left.data[offset] ?? 0) > 16
    const rightVisible = (right.data[offset] ?? 0) > 16
    if (leftVisible && rightVisible) intersection += 1
    if (leftVisible || rightVisible) union += 1
  }
  return intersection / union
}

for (const slug of stagedItems) {
  const itemRoot = join(root, slug)
  const metrics = JSON.parse(readFileSync(join(itemRoot, "metrics.json"), "utf8"))
  const framePath = (pose) => join(
    itemRoot,
    "extracted",
    `room_avatar_top_female_${slug}_v2_${pose}.png`
  )

  test(`${slug}: five distinct 4W+1S frames match recorded anchors`, () => {
    assert.equal(metrics.frames.length, 5)
    const hashes = metrics.frames.map(({ pose, targetBbox }) => {
      const image = PNG.sync.read(readFileSync(framePath(pose)))
      assert.deepEqual([image.width, image.height], [256, 384])
      let minX = image.width
      let minY = image.height
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) === 0) continue
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
      assert.deepEqual([minX, minY, maxX + 1, maxY + 1], targetBbox)
      return digest(framePath(pose))
    })
    assert.equal(new Set(hashes).size, 5)
  })

  test(`${slug}: staged static stays coherent with W1 and canonical hands remain visible`, () => {
    const staticPath = join(itemRoot, "extracted", `avatar_room_top_female_${slug}_v2.png`)
    const staticImage = PNG.sync.read(readFileSync(staticPath))
    const walkOne = PNG.sync.read(readFileSync(framePath("walking_front_f01")))
    assert.deepEqual([staticImage.width, staticImage.height], [256, 384])
    assert.ok(alphaIoU(staticImage, walkOne) >= 0.8, "static and W1 silhouette must not pop")

    const poses = ["static_front_f01", ...metrics.frames.map(({ pose }) => pose)]
    for (const pose of poses) {
      const top = pose === "static_front_f01"
        ? staticImage
        : PNG.sync.read(readFileSync(framePath(pose)))
      const basePath = pose === "static_front_f01"
        ? join(roomRoot, "avatar_room_base_female_v2.png")
        : join(motionRoot, `room_avatar_base_female_v2_${pose}.png`)
      const base = PNG.sync.read(readFileSync(basePath))
      if (["blush_lace_cardigan", "noir_rose_heart_cardigan"].includes(slug)) {
        const handPixelsBySide = outerHandCorePixelsBySide(base)
        for (const [side, handPixels] of Object.entries(handPixelsBySide)) {
          assert.ok(handPixels.length >= 50, `${pose} ${side}: hand core must be measurable`)
          const covered = handPixels.filter(([x, y]) => (
            (top.data[(y * top.width + x) * 4 + 3] ?? 0) > 16
          )).length
          const visibleRatio = (handPixels.length - covered) / handPixels.length
          assert.ok(
            visibleRatio >= 0.95,
            `${pose} ${side}: at least 95% of distal outer-hand core must stay visible; got ${visibleRatio}`
          )
        }
      }
    }
  })

  test(`${slug}: transparent RGB and chroma hygiene pass`, () => {
    const paths = [
      join(itemRoot, "extracted", `avatar_room_top_female_${slug}_v2.png`),
      ...metrics.frames.map(({ pose }) => framePath(pose)),
    ]
    for (const path of paths) {
      const image = PNG.sync.read(readFileSync(path))
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const red = image.data[offset] ?? 0
        const green = image.data[offset + 1] ?? 0
        const blue = image.data[offset + 2] ?? 0
        const alpha = image.data[offset + 3] ?? 0
        if (alpha === 0) assert.deepEqual([red, green, blue], [0, 0, 0])
        else assert.equal(green > red + 30 && green > blue + 30, false)
      }
    }
  })

  test(`${slug}: staging evidence is complete and live guard is true`, () => {
    assert.equal(metrics.liveAssetsUntouched, true)
    for (const filename of [
      "4w1s-full-body-overlay.png",
      "4w1s-neckline-sleeve-waist-closeups.png"
    ]) {
      const image = PNG.sync.read(readFileSync(join(itemRoot, filename)))
      assert.ok(image.width >= 1536, "evidence must show Static + 4W + 1S")
      assert.ok(image.height >= 300)
    }
  })

  if (slug === "powder_blue_ribbon_corset_top") {
    test(`${slug}: front bow remains readable after default hair occlusion`, () => {
      assert.deepEqual(metrics.frontIdentityBbox, [117, 241, 139, 258])
      assert.ok(metrics.visibleIdentityPixels >= 80)
    })
  }
}

test("premium female top producer contains no live-save path", () => {
  const producer = readFileSync(
    resolve("apps/mobile/scripts/prepare_female_premium_top_motion_staging.py"),
    "utf8"
  )
  assert.match(producer, /female-premium-top-motion-staging/)
  assert.doesNotMatch(producer, /save\(live_path/)
})
