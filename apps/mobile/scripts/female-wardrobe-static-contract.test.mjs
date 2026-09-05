import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { PNG } from "pngjs"

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const assetRoot = join(workspaceRoot, "src/features/avatarV2/assets/room")
const motionRoot = join(assetRoot, "motion")
const fitManifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "../../docs/avatar-motion-pipeline/female-fit-zones.json"), "utf8")
)
const [trouserHemMinY, trouserHemMaxY] = fitManifest.zones.bottomHem.trousers

const tops = [
  "avatar_room_top_female_cream_basic_tee_v2.png",
  "avatar_room_top_female_blush_lace_cardigan_v2.png",
  "avatar_room_top_female_sage_ribbon_knit_jacket_v2.png",
  "avatar_room_top_female_cherry_heart_milkmaid_blouse_v2.png",
  "avatar_room_top_female_powder_blue_ribbon_corset_top_v2.png",
  "avatar_room_top_female_noir_rose_heart_cardigan_v2.png"
]

const bottoms = [
  "avatar_room_bottom_female_denim_skort_shorts_v2.png",
  "avatar_room_bottom_female_striped_crochet_shorts_v2.png",
  "avatar_room_bottom_female_layered_lace_ruffle_mini_skirt_v2.png",
  "avatar_room_bottom_female_black_palm_embellished_pants_v2.png",
  "avatar_room_bottom_female_coral_embellished_laceup_pants_v2.png",
  "avatar_room_bottom_female_smoky_floral_mesh_pants_v2.png",
  "avatar_room_bottom_female_yellow_bow_lace_ruffle_skirt_v2.png"
]

const shoes = [
  "avatar_room_shoes_female_milk_tea_court_sneakers_v2.png",
  "avatar_room_shoes_female_cherry_satin_ballets_v2.png",
  "avatar_room_shoes_female_onyx_heart_mary_janes_v2.png",
  "avatar_room_shoes_female_rosewood_platform_loafers_v2.png",
  "avatar_room_shoes_female_pearl_slingback_sandals_v2.png"
]

const accessories = [
  "avatar_room_accessory_female_buttercream_neck_scarf_v2.png",
  "avatar_room_accessory_female_cherry_bow_headband_v2.png",
  "avatar_room_accessory_female_cherry_micro_bag_v2.png",
  "avatar_room_accessory_female_golden_heart_locket_v2.png",
  "avatar_room_accessory_female_ivory_ribbon_beret_v2.png",
  "avatar_room_accessory_female_pearl_drop_earrings_v2.png",
  "avatar_room_accessory_female_sage_heart_glasses_v2.png",
  "avatar_room_accessory_female_sunny_star_clips_v2.png"
]

const hairCapsule = [
  "copper_bow_waves",
  "golden_waves",
  "ink_twin_braids",
  "ink_pageboy_star",
  "pale_golden_bow_bob"
]

const readPng = (root, filename) =>
  PNG.sync.read(readFileSync(join(root, filename)))

const alphaAt = (image, x, y) =>
  image.data[(y * image.width + x) * 4 + 3] ?? 0

const alphaBounds = (image, threshold = 16) => {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (alphaAt(image, x, y) <= threshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return [minX, minY, maxX, maxY]
}

const alphaCentroidX = (image, threshold = 16) => {
  let weightedX = 0
  let weight = 0
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = alphaAt(image, x, y)
      if (alpha <= threshold) continue
      weightedX += x * alpha
      weight += alpha
    }
  }
  return weight === 0 ? 128 : weightedX / weight
}

const componentSizes = (image, threshold = 16) => {
  const visited = new Uint8Array(image.width * image.height)
  const components = []
  const visit = (startX, startY) => {
    const queue = [[startX, startY]]
    visited[startY * image.width + startX] = 1
    let size = 0
    while (queue.length > 0) {
      const [x, y] = queue.pop()
      size += 1
      for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) continue
        const index = nextY * image.width + nextX
        if (visited[index] === 1 || alphaAt(image, nextX, nextY) <= threshold) continue
        visited[index] = 1
        queue.push([nextX, nextY])
      }
    }
    return size
  }
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x
      if (visited[index] === 1 || alphaAt(image, x, y) <= threshold) continue
      components.push(visit(x, y))
    }
  }
  return components.sort((a, b) => b - a)
}

const transparentRgbResidue = (image) => {
  let count = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (
      image.data[offset + 3] === 0 &&
      (image.data[offset] !== 0 || image.data[offset + 1] !== 0 || image.data[offset + 2] !== 0)
    ) count += 1
  }
  return count
}

const body = readPng(assetRoot, "avatar_room_base_female_v2.png")

const bodyCoverage = (layer, [minX, minY, maxX, maxY]) => {
  let required = 0
  let covered = 0
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(body, x, y) <= 16) continue
      required += 1
      if (alphaAt(layer, x, y) > 16) covered += 1
    }
  }
  return required === 0 ? 1 : covered / required
}

const motionStem = (filename) => filename
  .replace(/^avatar_room_/, "room_avatar_")
  .replace(/\.png$/, "")

const allWearables = [
  ...tops.map((filename) => ["top", filename]),
  ...bottoms.map((filename) => ["bottom", filename]),
  ...shoes.map((filename) => ["shoes", filename]),
  ...accessories.map((filename) => ["accessory", filename])
]

test("female non-dress wardrobe stays on the canonical 256x384 RGBA canvas", () => {
  for (const [category, filename] of allWearables) {
    const image = readPng(assetRoot, filename)
    assert.equal(image.width, 256, `${category} ${filename} width`)
    assert.equal(image.height, 384, `${category} ${filename} height`)
    assert.equal(transparentRgbResidue(image), 0, `${category} ${filename} transparent RGB`)
    assert.notDeepEqual(alphaBounds(image), [256, 384, -1, -1], `${category} ${filename} empty`)
    assert.equal(filename.includes("dress"), false, `${filename} is outside this contract`)
  }
})

test("female static tops cover the torso core without detached islands", () => {
  for (const filename of tops) {
    const image = readPng(assetRoot, filename)
    const components = componentSizes(image)
    assert.equal(components.length, 1, `${filename} detached garment islands`)
    assert.ok(bodyCoverage(image, [104, 232, 152, 286]) >= 0.85, `${filename} torso contact`)
  }
})

test("cream tee closes the front center seam before the lower layer begins", () => {
  const image = readPng(assetRoot, "avatar_room_top_female_cream_basic_tee_v2.png")
  let required = 0
  let covered = 0
  for (let y = 284; y <= 292; y += 1) {
    for (let x = 125; x <= 130; x += 1) {
      required += 1
      if (alphaAt(image, x, y) > 16) covered += 1
    }
  }
  assert.ok(covered / required >= 0.95, "cream tee center hem must not expose the lower layer")
})

test("female static bottoms cover the waist and preserve category-specific legs", () => {
  const trouserNames = new Set([
    "avatar_room_bottom_female_black_palm_embellished_pants_v2.png",
    "avatar_room_bottom_female_coral_embellished_laceup_pants_v2.png",
    "avatar_room_bottom_female_smoky_floral_mesh_pants_v2.png"
  ])
  for (const filename of bottoms) {
    const image = readPng(assetRoot, filename)
    const components = componentSizes(image)
    assert.ok(components.length <= 2, `${filename} detached garment islands`)
    assert.ok(bodyCoverage(image, [104, 286, 152, 300]) >= 0.7, `${filename} waist contact`)
    if (trouserNames.has(filename)) {
      assert.ok(bodyCoverage(image, [104, 300, 152, 325]) >= 0.95, `${filename} leg contact`)
      const maxY = alphaBounds(image)[3]
      assert.ok(maxY >= trouserHemMinY && maxY <= trouserHemMaxY, `${filename} trouser hem`)
    }
  }
})

test("female shoes have two grounded feet and a stable sole baseline", () => {
  for (const filename of shoes) {
    const image = readPng(assetRoot, filename)
    assert.equal(componentSizes(image).length, 2, `${filename} must have two shoe components`)
    const [, , , maxY] = alphaBounds(image)
    assert.ok(maxY >= 346 && maxY <= 349, `${filename} sole baseline ${maxY}`)
  }
})

test("every promoted female non-dress wearable has a real 4W+1S motion set", () => {
  for (const [, filename] of allWearables) {
    const stem = motionStem(filename)
    for (const frame of ["f01", "f02", "f03", "f04"]) {
      const image = readPng(motionRoot, `${stem}_walking_front_${frame}.png`)
      assert.equal(image.width, 256, `${filename} ${frame} width`)
      assert.equal(image.height, 384, `${filename} ${frame} height`)
    }
    const sitting = readPng(motionRoot, `${stem}_sitting_front_f01.png`)
    assert.equal(sitting.width, 256, `${filename} sitting width`)
    assert.equal(sitting.height, 384, `${filename} sitting height`)
  }
})

test("promoted female hair capsule keeps head anchors and alpha-clean 4W+1S layers", () => {
  for (const slug of hairCapsule) {
    const staticLayers = [
      `avatar_room_hair_back_female_${slug}_v2.png`,
      `avatar_room_hair_front_female_${slug}_v2.png`
    ]
    const sourceBounds = []
    for (const filename of staticLayers) {
      const image = readPng(assetRoot, filename)
      assert.equal(image.width, 256, `${filename} width`)
      assert.equal(image.height, 384, `${filename} height`)
      assert.equal(transparentRgbResidue(image), 0, `${filename} transparent RGB`)
      const bounds = alphaBounds(image)
      assert.notDeepEqual(bounds, [256, 384, -1, -1], `${filename} empty`)
      assert.ok(Math.abs(alphaCentroidX(image) - 128) <= 2, `${filename} centerline`)
      sourceBounds.push(bounds)
    }
    for (const [frame, [dx, dy]] of Object.entries({ f01: [0, 0], f02: [-1, -1], f03: [0, -2], f04: [1, -1] })) {
      for (const [part, bounds] of [["back", sourceBounds[0]], ["front", sourceBounds[1]]]) {
        const filename = `room_avatar_hair_${part}_female_${slug}_v2_walking_front_${frame}.png`
        const image = readPng(motionRoot, filename)
        assert.equal(image.width, 256, `${filename} width`)
        assert.equal(image.height, 384, `${filename} height`)
        assert.equal(transparentRgbResidue(image), 0, `${filename} transparent RGB`)
        assert.deepEqual(
          alphaBounds(image),
          [bounds[0] + dx, bounds[1] + dy, bounds[2] + dx, bounds[3] + dy],
          `${filename} head anchor`
        )
      }
    }
    for (const [part, bounds] of [["back", sourceBounds[0]], ["front", sourceBounds[1]]]) {
      const filename = `room_avatar_hair_${part}_female_${slug}_v2_sitting_front_f01.png`
      const image = readPng(motionRoot, filename)
      assert.equal(transparentRgbResidue(image), 0, `${filename} transparent RGB`)
      assert.deepEqual(alphaBounds(image), bounds, `${filename} static anchor`)
    }
  }
})

test("live female body and head layers keep transparent RGB normalized", () => {
  const staticLayers = [
    "avatar_room_base_female_v2.png",
    ...readdirSync(assetRoot).filter((filename) =>
      /^avatar_room_hair_(back|front)_female_.*_v2\.png$/.test(filename)
    )
  ]
  for (const filename of staticLayers) {
    const image = readPng(assetRoot, filename)
    assert.equal(image.width, 256, `${filename} width`)
    assert.equal(image.height, 384, `${filename} height`)
    assert.equal(transparentRgbResidue(image), 0, `${filename} transparent RGB`)
    assert.notDeepEqual(alphaBounds(image), [256, 384, -1, -1], `${filename} empty`)
  }

  const motionLayers = readdirSync(motionRoot).filter((filename) =>
    /^room_avatar_(base|hair_(back|front))_female_.*_(walking_front_f0[1-4]|sitting_front_f01)\.png$/.test(filename)
  )
  assert.ok(motionLayers.length > 0, "female base/head motion layers must exist")
  for (const filename of motionLayers) {
    const image = readPng(motionRoot, filename)
    assert.equal(image.width, 256, `${filename} width`)
    assert.equal(image.height, 384, `${filename} height`)
    assert.equal(transparentRgbResidue(image), 0, `${filename} transparent RGB`)
    assert.notDeepEqual(alphaBounds(image), [256, 384, -1, -1], `${filename} empty`)
  }
})

test("female head features follow the canonical head anchor in every motion frame", () => {
  const excluded = new Set([
    "avatar_room_face_female_soft_doll_foundation_v2.png",
    "avatar_room_eyes_female_mocha_doe_v2.png",
    "avatar_room_nose_female_soft_button_v2.png",
    "avatar_room_mouth_female_peach_whisper_smile_v2.png"
  ])
  const features = readdirSync(assetRoot)
    .filter((filename) => /^avatar_room_(face|eyes|nose|mouth)_female_.*_v2\.png$/.test(filename))
    .filter((filename) => !excluded.has(filename))
  const offsets = {
    f01: [0, 0],
    f02: [-1, -1],
    f03: [0, -2],
    f04: [1, -1]
  }
  for (const filename of features) {
    const sourceBounds = alphaBounds(readPng(assetRoot, filename))
    const stem = motionStem(filename)
    for (const [frame, [dx, dy]] of Object.entries(offsets)) {
      const actual = alphaBounds(readPng(motionRoot, `${stem}_walking_front_${frame}.png`))
      assert.deepEqual(
        actual,
        [sourceBounds[0] + dx, sourceBounds[1] + dy, sourceBounds[2] + dx, sourceBounds[3] + dy],
        `${filename} ${frame} must follow head offset`
      )
    }
    assert.deepEqual(
      alphaBounds(readPng(motionRoot, `${stem}_sitting_front_f01.png`)),
      sourceBounds,
      `${filename} sitting frame must return to the static anchor`
    )
  }
})

test("cream tee follows the measured front-body walk anchor", () => {
  const filename = "avatar_room_top_female_cream_basic_tee_v2.png"
  const sourceBounds = alphaBounds(readPng(assetRoot, filename))
  const stem = motionStem(filename)
  const offsets = {
    f01: [0, 0],
    f02: [-1, 0],
    f03: [0, 1],
    f04: [1, 0]
  }
  const hashes = []
  for (const [frame, [dx, dy]] of Object.entries(offsets)) {
    const image = readPng(motionRoot, `${stem}_walking_front_${frame}.png`)
    assert.deepEqual(
      alphaBounds(image),
      [sourceBounds[0] + dx, sourceBounds[1] + dy, sourceBounds[2] + dx, sourceBounds[3] + dy],
      `${filename} ${frame} must follow the front-body offset`
    )
    hashes.push(image.data.toString("hex"))
  }
  assert.equal(new Set(hashes).size, 4, "cream tee walk frames must not be stale duplicates")
})
