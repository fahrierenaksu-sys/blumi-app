import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

const stagingRoot = resolve("docs/avatar-motion-pipeline/male-motion-wave-staging/frames")
const roomRoot = resolve("apps/mobile/src/features/avatarV2/assets/room")
const liveMotionRoot = join(roomRoot, "motion")
const wave2Root = resolve("docs/avatar-motion-pipeline/male-wave2-static-qa")

const items = [
  ["Cream Basic Tee", "top", "avatar_room_top_male_cream_basic_tee_v1.png"],
  ["Dusty Navy Tee", "top", "avatar_room_top_male_dusty_navy_tee_v1.png"],
  ["Powder Blue Crew Tee", "top", "avatar_room_top_male_powder_blue_crew_tee_v1.png"],
  ["Sage Basic Tee", "top", "avatar_room_top_male_sage_basic_tee_v1.png"],
  ["Mist Blue Oxford Shirt", "top", "avatar_room_top_male_mist_blue_oxford_shirt_v1_alpha.png"],
  ["Soft Sage Linen Shirt", "top", "avatar_room_top_male_soft_sage_linen_shirt_v1_alpha.png"],
  ["Cocoa Varsity Jacket", "top", "avatar_room_top_male_cocoa_varsity_jacket_v1_alpha.png"],
  ["Dusty Navy Chore Jacket", "top", "avatar_room_top_male_dusty_navy_chore_jacket_v1_alpha.png"],
  ["Navy Straight Pants", "bottom", "avatar_room_bottom_male_navy_straight_pants_v1.png"],
  ["Mid Blue Straight Jeans", "bottom", "avatar_room_bottom_male_mid_blue_straight_jeans_v1_alpha.png"],
  ["Charcoal Tapered Chinos", "bottom", "avatar_room_bottom_male_charcoal_tapered_chinos_v1_alpha.png"],
  ["Warm Sand Relaxed Pants", "bottom", "avatar_room_bottom_male_warm_sand_relaxed_pants_v1_alpha.png"]
]

const readPng = (path) => PNG.sync.read(readFileSync(path))
const staticPath = (filename) => existsSync(join(roomRoot, filename))
  ? join(roomRoot, filename)
  : join(wave2Root, filename)
const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3] ?? 0
const prefixFor = (staticName) => basename(staticName, ".png")
  .replace(/^avatar_room_/, "room_avatar_")
  .replace(/_alpha$/, "")
const framePath = (prefix, pose, frame) => join(
  stagingRoot,
  `${prefix}_${pose}_front_f${String(frame).padStart(2, "0")}.png`
)

const alphaBounds = (image) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) <= 16) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  assert.ok(maxX >= minX && maxY >= minY, "motion layer must contain visible pixels")
  return [minX, minY, maxX, maxY]
}

const residueCounts = (image) => {
  let transparentRgb = 0
  let chroma = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset] ?? 0
    const green = image.data[offset + 1] ?? 0
    const blue = image.data[offset + 2] ?? 0
    const alpha = image.data[offset + 3] ?? 0
    if (alpha === 0 && (red !== 0 || green !== 0 || blue !== 0)) transparentRgb += 1
    if (
      alpha > 0 &&
      alpha < 96 &&
      (green - Math.max(red, blue) > 20 || Math.min(red, blue) - green > 20)
    ) chroma += 1
  }
  return { transparentRgb, chroma }
}

const coverage = (layer, reference, bounds) => {
  const [minX, minY, maxX, maxY] = bounds
  let required = 0
  let covered = 0
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(reference, x, y) <= 16) continue
      required += 1
      if (alphaAt(layer, x, y) > 16) covered += 1
    }
  }
  return covered / required
}

const overlap = (left, right, bounds) => {
  const [minX, minY, maxX, maxY] = bounds
  let count = 0
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(left, x, y) > 16 && alphaAt(right, x, y) > 16) count += 1
    }
  }
  return count
}

const alphaDifference = (left, right) => {
  let count = 0
  for (let pixel = 0; pixel < left.width * left.height; pixel += 1) {
    if (Math.abs((left.data[pixel * 4 + 3] ?? 0) - (right.data[pixel * 4 + 3] ?? 0)) > 16) count += 1
  }
  return count
}

const lowerBodySkinLeakCount = (layer, body, canonicalPants) => {
  let count = 0
  for (let y = 288; y <= 346; y += 1) {
    for (let x = 106; x <= 150; x += 1) {
      if (
        alphaAt(body, x, y) > 16 &&
        alphaAt(canonicalPants, x, y) > 16 &&
        alphaAt(layer, x, y) < alphaAt(canonicalPants, x, y)
      ) count += 1
    }
  }
  return count
}

test("all approved male tops and bottoms stage four walking frames plus one seated frame", () => {
  const missing = []
  for (const [, , staticName] of items) {
    const prefix = prefixFor(staticName)
    const paths = [
      ...[1, 2, 3, 4].map((frame) => framePath(prefix, "walking", frame)),
      framePath(prefix, "sitting", 1)
    ]
    for (const path of paths) {
      if (!existsSync(path) || statSync(path).size === 0) missing.push(path)
    }
  }
  assert.deepEqual(missing, [], `missing or zero-byte staged motion:\n${missing.join("\n")}`)
})

for (const [label, kind, staticName] of items) {
  test(`${label}: staged motion is clean, fitted, and pose-specific`, () => {
    const prefix = prefixFor(staticName)
    const walking = [1, 2, 3, 4].map((frame) => readPng(framePath(prefix, "walking", frame)))
    const sitting = readPng(framePath(prefix, "sitting", 1))
    const allFrames = [...walking, sitting]
    const sourceResidue = residueCounts(readPng(staticPath(staticName)))

    for (const frame of allFrames) {
      assert.equal(frame.width, 256)
      assert.equal(frame.height, 384)
      const frameResidue = residueCounts(frame)
      assert.equal(frameResidue.transparentRgb, 0)
      assert.ok(
        frameResidue.chroma <= sourceResidue.chroma + 2,
        `motion resampling must not materially introduce low-alpha chroma residue: ${frameResidue.chroma} > ${sourceResidue.chroma + 2}`
      )
    }

    assert.equal(new Set(walking.map((frame) => frame.data.toString("base64"))).size, 4)
    for (let index = 1; index < walking.length; index += 1) {
      assert.ok(alphaDifference(walking[index - 1], walking[index]) >= 100)
    }
    assert.ok(alphaDifference(walking[0], sitting) >= 200)

    for (let index = 0; index < walking.length; index += 1) {
      const frame = walking[index]
      const referenceTop = readPng(join(
        liveMotionRoot,
        `room_avatar_top_male_powder_blue_crew_tee_v1_walking_front_f0${index + 1}.png`
      ))
      const referenceBottom = readPng(join(
        liveMotionRoot,
        `room_avatar_bottom_male_navy_straight_pants_v1_walking_front_f0${index + 1}.png`
      ))
      const referenceShoes = readPng(join(
        liveMotionRoot,
        `room_avatar_shoes_male_milk_tea_court_v1_walking_front_f0${index + 1}.png`
      ))
      const [minX, minY, maxX, maxY] = alphaBounds(frame)

      if (kind === "top") {
        assert.ok(minX >= 76 && maxX <= 180 && minY >= 212 && maxY <= 308)
        assert.ok(coverage(frame, referenceTop, [100, 226, 156, 286]) >= 0.94)
        assert.ok(overlap(frame, referenceBottom, [84, 284, 176, 304]) >= 150)
      } else {
        const referenceBody = readPng(join(
          liveMotionRoot,
          `room_avatar_base_male_light_v1_walking_front_f0${index + 1}.png`
        ))
        assert.ok(minX >= 82 && maxX <= 174 && minY >= 284 && maxY <= 346)
        assert.ok(coverage(frame, referenceBottom, [96, 288, 160, 334]) >= 0.82)
        assert.ok(overlap(frame, referenceTop, [84, 284, 176, 304]) >= 150)
        assert.ok(overlap(frame, referenceShoes, [80, 316, 176, 352]) >= 120)
        assert.equal(
          lowerBodySkinLeakCount(frame, referenceBody, referenceBottom),
          0,
          `${label} walking f0${index + 1} leaks the body through the crotch-to-hem corridor`
        )
      }
    }

    const sittingBounds = alphaBounds(sitting)
    if (kind === "top") {
      const sittingTop = readPng(join(liveMotionRoot, "room_avatar_top_male_powder_blue_crew_tee_v1_sitting_front_f01.png"))
      const sittingBottom = readPng(join(liveMotionRoot, "room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01.png"))
      assert.ok(coverage(sitting, sittingTop, [96, 226, 160, 288]) >= 0.94)
      assert.ok(overlap(sitting, sittingBottom, [80, 284, 176, 306]) >= 150)
    } else {
      const sittingBottom = readPng(join(liveMotionRoot, "room_avatar_bottom_male_navy_straight_pants_v1_sitting_front_f01.png"))
      const sittingBody = readPng(join(liveMotionRoot, "room_avatar_base_male_light_v1_sitting_front_f01.png"))
      const sittingShoes = readPng(join(liveMotionRoot, "room_avatar_shoes_male_milk_tea_court_v1_sitting_front_f01.png"))
      const widestWalking = Math.max(...walking.map((frame) => {
        const [minX, , maxX] = alphaBounds(frame)
        return maxX - minX + 1
      }))
      assert.ok(sittingBounds[2] - sittingBounds[0] + 1 >= widestWalking + 20)
      assert.ok(coverage(sitting, sittingBottom, [86, 288, 170, 338]) >= 0.82)
      assert.ok(overlap(sitting, sittingShoes, [76, 316, 180, 352]) >= 160)
      assert.equal(
        lowerBodySkinLeakCount(sitting, sittingBody, sittingBottom),
        0,
        `${label} sitting f01 leaks the body through the crotch-to-hem corridor`
      )
    }
  })
}
