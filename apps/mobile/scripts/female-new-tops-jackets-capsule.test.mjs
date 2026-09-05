import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const root = resolve("docs/avatar-motion-pipeline/female-new-tops-jackets/2026-07-16")
const manifestPath = `${root}/capsule-manifest.json`
const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")
const motionRoot = `${roomRoot}/motion`
const profileRoot = resolve("apps/mobile/src/features/avatarV2/assets/layers")
const thumbnailRoot = resolve("apps/mobile/src/features/avatarV2/assets/shop-thumbnails")

const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")

const readPng = (path) => PNG.sync.read(readFileSync(path))

const alphaIoU = (left, right) => {
  let intersection = 0
  let union = 0
  for (let offset = 3; offset < left.data.length; offset += 4) {
    const a = (left.data[offset] ?? 0) > 16
    const b = (right.data[offset] ?? 0) > 16
    if (a && b) intersection += 1
    if (a || b) union += 1
  }
  return union ? intersection / union : 0
}

const assertClosedWaistSeam = ({ top, bottom, label }) => {
  let joinedColumns = 0
  for (let x = 102; x < 154; x += 1) {
    const topRows = []
    const bottomRows = []
    for (let y = 240; y < 290; y += 1) {
      if ((top.data[(y * top.width + x) * 4 + 3] ?? 0) > 16) topRows.push(y)
    }
    for (let y = 280; y < 306; y += 1) {
      if ((bottom.data[(y * bottom.width + x) * 4 + 3] ?? 0) > 16) bottomRows.push(y)
    }
    if (topRows.length && bottomRows.length && Math.min(...bottomRows) - Math.max(...topRows) <= 5) {
      joinedColumns += 1
    }
  }
  assert.ok(joinedColumns >= 44, `${label}: top and bottom leave a visible bare waist band`)
}

test("female tops and jackets capsule has the requested seven-item manifest", () => {
  assert.equal(existsSync(manifestPath), true, "run stage_female_new_tops_jackets_capsule.py first")
  assert.equal(
    existsSync(`${root}/capsule-4w1s-contact-sheet.png`),
    true,
    "an all-seven Static + 4W + 1S contact sheet is required for independent review"
  )
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  assert.equal(manifest.items.length, 7)
  assert.equal(manifest.items.filter(({ capsule }) => capsule === "top").length, 4)
  assert.equal(manifest.items.filter(({ capsule }) => capsule === "jacket").length, 3)
  assert.deepEqual(
    manifest.items.map(({ slug }) => slug),
    [
      "rosebud_picnic_peplum",
      "lilac_cloud_wrap_top",
      "buttercream_bow_tee",
      "azure_garden_halter",
      "ivory_tweed_crop_jacket",
      "cherry_varsity_cardigan",
      "midnight_velvet_bolero"
    ]
  )
  const combined = readPng(`${root}/capsule-4w1s-contact-sheet.png`)
  assert.equal(combined.width, 1536)
  assert.ok(combined.height >= 2940)
})

test("each new top and jacket has static, 4W+1S, profile, thumbnail, and visual evidence", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  for (const item of manifest.items) {
    const staticPath = `${roomRoot}/avatar_room_top_female_${item.slug}_v2.png`
    assert.equal(existsSync(item.sourceAlphaPath), true, `${item.slug}: retained alpha source`)
    assert.equal(existsSync(staticPath), true, `${item.slug}: static layer`)
    assert.equal(existsSync(`${profileRoot}/avatar_top_${item.slug}.png`), true, `${item.slug}: profile layer`)
    assert.equal(existsSync(`${thumbnailRoot}/avatar_v2_top_${item.slug}.png`), true, `${item.slug}: thumbnail`)
    assert.equal(existsSync(`${root}/${item.slug}/4w1s-full-body-overlay.png`), true, `${item.slug}: full body sheet`)
    assert.equal(existsSync(`${root}/${item.slug}/4w1s-neckline-sleeve-waist-closeups.png`), true, `${item.slug}: close-up sheet`)
    const staticEvidence = `${root}/${item.slug}/static-full-body-overlay.png`
    assert.equal(existsSync(staticEvidence), true, `${item.slug}: static checkpoint`)
    assert.ok(
      statSync(staticEvidence).mtimeMs >= statSync(staticPath).mtimeMs,
      `${item.slug}: static checkpoint must be regenerated with the current static layer`
    )

    const staticImage = readPng(staticPath)
    const staticBottom = readPng(`${roomRoot}/avatar_room_bottom_female_denim_skort_shorts_v2.png`)
    assert.deepEqual([staticImage.width, staticImage.height], [256, 384])
    assertClosedWaistSeam({
      top: staticImage,
      bottom: staticBottom,
      label: `${item.slug}: static`
    })
    const profile = readPng(`${profileRoot}/avatar_top_${item.slug}.png`)
    assert.deepEqual([profile.width, profile.height], [512, 768])
    const thumbnail = readPng(`${thumbnailRoot}/avatar_v2_top_${item.slug}.png`)
    assert.deepEqual([thumbnail.width, thumbnail.height], [512, 768])

    const paths = [staticPath]
    const motionHashes = []
    for (const pose of ["walking_front_f01", "walking_front_f02", "walking_front_f03", "walking_front_f04", "sitting_front_f01"]) {
      const path = `${motionRoot}/room_avatar_top_female_${item.slug}_v2_${pose}.png`
      assert.equal(existsSync(path), true, `${item.slug}: ${pose}`)
      const image = readPng(path)
      assert.deepEqual([image.width, image.height], [256, 384])
      const bottom = readPng(`${motionRoot}/room_avatar_bottom_female_denim_skort_shorts_v2_${pose}.png`)
      assertClosedWaistSeam({ top: image, bottom, label: `${item.slug}: ${pose}` })
      paths.push(path)
      motionHashes.push(hash(path))
    }
    assert.equal(new Set(motionHashes).size, 5, `${item.slug}: every motion state differs`)
    assert.ok(
      alphaIoU(staticImage, readPng(`${motionRoot}/room_avatar_top_female_${item.slug}_v2_walking_front_f01.png`)) >= 0.68,
      `${item.slug}: static silhouette must remain coherent with W1`
    )

    for (const path of paths) {
      const image = readPng(path)
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const [red, green, blue, alpha] = image.data.subarray(offset, offset + 4)
        if (alpha === 0) assert.deepEqual([red, green, blue], [0, 0, 0], `${path}: transparent RGB is clean`)
        assert.equal(green > red + 30 && green > blue + 30, false, `${path}: no chroma residue`)
      }
    }
  }
})
