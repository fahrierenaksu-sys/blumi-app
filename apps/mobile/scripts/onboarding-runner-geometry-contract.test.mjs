import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"

const MALE_ASSET_ROOT = path.resolve(
  "src/features/session/assets/onboarding-runners-v8-fluid-runtime"
)

async function getVisibleBounds(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 16) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return {
    width: info.width,
    height: info.height,
    visibleHeight: maxY - minY + 1,
    centerX: (minX + maxX) / 2,
    bottom: maxY,
    alphaAtCorners: [
      data[3],
      data[(info.width - 1) * 4 + 3],
      data[((info.height - 1) * info.width) * 4 + 3],
      data[((info.height * info.width) - 1) * 4 + 3]
    ]
  }
}

test("male runner ships seventeen clean, registered, distinct gait frames matching the female master", async () => {
  const hashes = new Set()

  for (let frame = 1; frame <= 17; frame += 1) {
    const suffix = `f${String(frame).padStart(2, "0")}.png`
    const filePath = path.join(MALE_ASSET_ROOT, `blumi_intro_run_male_${suffix}`)
    const male = await getVisibleBounds(filePath)
    const hash = createHash("sha256").update(await readFile(filePath)).digest("hex")

    assert.deepEqual([male.width, male.height], [256, 384])
    assert.ok(Math.abs(male.centerX - 130) <= 0.5)
    assert.equal(male.visibleHeight, 258)
    assert.equal(male.bottom, 360)
    assert.deepEqual(male.alphaAtCorners, [0, 0, 0, 0])
    hashes.add(hash)
  }

  assert.equal(hashes.size, 17)
})

test("the shipped male cycle is recorded as approved runtime art", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(MALE_ASSET_ROOT, "manifest.json"), "utf8")
  )

  assert.equal(manifest.frames.length, 17)
  assert.equal(manifest.master, "female-v3-runtime")
  assert.equal(manifest.source, "onboarding-runners-v6-smooth-runtime")
  assert.deepEqual(manifest.frame_durations_ms, [
    27, 51, 26, 31, 50, 54, 45, 67, 42, 54, 43, 34, 41, 29, 30, 52, 44
  ])
  assert.equal(manifest.loop_duration_ms, 720)
  assert.equal(manifest.normalized_visible_height, 258)
  assert.equal(manifest.normalized_center_x, 130)
  assert.equal(manifest.normalized_bottom, 360)
})
