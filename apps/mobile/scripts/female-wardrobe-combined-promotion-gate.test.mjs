import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"

import { PNG } from "pngjs"

import {
  FRAME_DURATION_MS,
  STATES,
  assertCatalogMatchesRuntimeSource,
  createCandidateAssetResolver,
  createPairwisePlan,
  generateCombinedEvidence,
  loadRuntimePromotionContract,
  verifyGeneratedEvidence,
  verifyPromotedInventory
} from "./female-wardrobe-combined-promotion-gate.mjs"

const FIXTURE = {
  tops: ["cream", "blush", "sage"],
  bottoms: [
    { slug: "denim", occlusionRole: "bottomBehindShoes" },
    { slug: "black", occlusionRole: "bottomOverShoeUpper" },
    { slug: "yellow", occlusionRole: "bottomBehindShoes" },
    { slug: "coral", occlusionRole: "bottomOverShoeUpper" }
  ],
  shoes: ["milk", "onyx"]
}

const createPng = (path, color, box) => {
  const png = new PNG({ width: 256, height: 384 })
  const [left, top, right, bottom] = box
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * png.width + x) * 4
      png.data.set([...color, 255], offset)
    }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, PNG.sync.write(png))
}

const createSparsePng = (path, color, points) => {
  const png = new PNG({ width: 256, height: 384 })
  for (const [x, y] of points) {
    const offset = (y * png.width + x) * 4
    png.data.set([...color, 255], offset)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, PNG.sync.write(png))
}

const createPngWithIsland = (path, color, box, islandBox) => {
  const png = new PNG({ width: 256, height: 384 })
  for (const [left, top, right, bottom] of [box, islandBox]) {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * png.width + x) * 4
        png.data.set([...color, 255], offset)
      }
    }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, PNG.sync.write(png))
}

const assetPath = (roomRoot, kind, slug, state) => state === "static"
  ? join(roomRoot, `avatar_room_${kind}_female_${slug}_v2.png`)
  : join(roomRoot, "motion", `room_avatar_${kind}_female_${slug}_v2_${state}.png`)

const buildFixture = (root) => {
  const roomRoot = join(root, "room")
  for (const [stateIndex, state] of STATES.entries()) {
    const basePath = state === "static"
      ? join(roomRoot, "avatar_room_base_female_v2.png")
      : join(roomRoot, "motion", `room_avatar_base_female_v2_${state}.png`)
    createPng(basePath, [244, 190, 166], [76, 207, 180, 349])
    for (const [index, slug] of FIXTURE.tops.entries()) {
      createPng(assetPath(roomRoot, "top", slug, state), [210, 70 + index * 35, 130], [88, 207 + stateIndex % 2, 169, 292])
    }
    for (const [index, bottom] of FIXTURE.bottoms.entries()) {
      createPng(assetPath(roomRoot, "bottom", bottom.slug, state), [70, 100 + index * 30, 210], [94, 282, 162, 338])
    }
    for (const [index, slug] of FIXTURE.shoes.entries()) {
      createPng(assetPath(roomRoot, "shoes", slug, state), [110 + index * 40, 80, 55], [98, 321, 158, 350])
    }
  }
  return roomRoot
}

test("pairwise plan is reduced, deterministic, and covers every cross-slot pair", () => {
  const first = createPairwisePlan(FIXTURE)
  const second = createPairwisePlan(FIXTURE)
  assert.deepEqual(first, second)
  assert.equal(first.length, FIXTURE.tops.length * FIXTURE.bottoms.length)
  assert.ok(first.length < FIXTURE.tops.length * FIXTURE.bottoms.length * FIXTURE.shoes.length)

  for (const top of FIXTURE.tops) {
    for (const bottom of FIXTURE.bottoms) {
      assert.ok(first.some((row) => row.top === top && row.bottom === bottom.slug))
    }
    for (const shoe of FIXTURE.shoes) {
      assert.ok(first.some((row) => row.top === top && row.shoes === shoe))
    }
  }
  for (const bottom of FIXTURE.bottoms) {
    for (const shoe of FIXTURE.shoes) {
      assert.ok(first.some((row) => row.bottom === bottom.slug && row.shoes === shoe))
    }
  }
})

test("catalog contract fails closed when a new runtime wearable is omitted", () => {
  const source = [
    ...FIXTURE.tops.map((slug) => `id: \"room_avatar_top_female_${slug}_v2\"`),
    ...FIXTURE.bottoms.map(({ slug }) => `id: \"room_avatar_bottom_female_${slug}_v2\"`),
    ...FIXTURE.shoes.map((slug) => `id: \"room_avatar_shoes_female_${slug}_v2\"`),
    "id: \"room_avatar_top_female_white_lace_cami_mini_dress_v2\"",
    "id: \"room_avatar_top_female_cream_knit_v2\""
  ].join("\n")
  const contract = {
    quarantinedFemaleItemIds: ["room_avatar_top_female_cream_knit_v2"],
    pantsOverShoeUpperIds: FIXTURE.bottoms
      .filter(({ occlusionRole }) => occlusionRole === "bottomOverShoeUpper")
      .map(({ slug }) => `room_avatar_bottom_female_${slug}_v2`)
  }
  assert.doesNotThrow(() => assertCatalogMatchesRuntimeSource({ catalog: FIXTURE, source, contract }))
  assert.throws(
    () => assertCatalogMatchesRuntimeSource({ catalog: FIXTURE, source: `${source}\nid: \"room_avatar_top_female_new_live_top_v2\"`, contract }),
    /new_live_top/
  )
})

test("runtime promotion contract is the single source for quarantine and 120ms playback", () => {
  const contract = loadRuntimePromotionContract()
  assert.equal(contract.frameDurationMs, 120)
  assert.deepEqual(contract.walkingStates, [
    "walking_front_f01",
    "walking_front_f02",
    "walking_front_f03",
    "walking_front_f04"
  ])
  assert.equal(contract.sittingState, "sitting_front_f01")
  assert.deepEqual(contract.quarantinedFemaleItemIds.sort(), [
    "room_avatar_bottom_female_denim_straight_v2",
    "room_avatar_top_female_cherry_heart_milkmaid_blouse_v2",
    "room_avatar_top_female_cream_knit_v2"
  ])
})

test("inventory gate requires Static + W1-W4 + S1 for every non-dress item", () => {
  const root = mkdtempSync(join(tmpdir(), "blumi-combined-gate-"))
  try {
    const roomRoot = buildFixture(root)
    const result = verifyPromotedInventory({ roomRoot, catalog: FIXTURE })
    assert.equal(result.itemCount, 9)
    assert.equal(result.assetCount, 9 * STATES.length)

    rmSync(assetPath(roomRoot, "top", "cream", "walking_front_f03"))
    assert.throws(
      () => verifyPromotedInventory({ roomRoot, catalog: FIXTURE }),
      /cream.*walking_front_f03/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("inventory gate rejects sparse pixels and disconnected sticker islands in fit zones", () => {
  const root = mkdtempSync(join(tmpdir(), "blumi-combined-contact-gate-"))
  try {
    const roomRoot = buildFixture(root)
    const sparseTop = assetPath(roomRoot, "top", "cream", "static")
    createSparsePng(sparseTop, [210, 70, 130], [[110, 212], [120, 216], [130, 220]])
    assert.throws(
      () => verifyPromotedInventory({ roomRoot, catalog: FIXTURE }),
      /cream static.*contact density/i
    )

    buildFixture(root)
    const islandBottom = assetPath(roomRoot, "bottom", "denim", "walking_front_f01")
    const points = []
    for (let y = 284; y < 304; y += 4) {
      for (let x = 98; x < 158; x += 4) points.push([x, y])
    }
    createSparsePng(islandBottom, [70, 100, 210], points)
    assert.throws(
      () => verifyPromotedInventory({ roomRoot, catalog: FIXTURE }),
      /denim walking_front_f01.*contact density|contiguous seam/i
    )

    buildFixture(root)
    const stickerShoe = assetPath(roomRoot, "shoes", "milk", "walking_front_f02")
    createPng(stickerShoe, [110, 80, 55], [110, 320, 144, 345])
    assert.throws(
      () => verifyPromotedInventory({ roomRoot, catalog: FIXTURE }),
      /milk walking_front_f02.*contiguous seam/i
    )

    buildFixture(root)
    const validBottomWithIsland = assetPath(roomRoot, "bottom", "black", "static")
    createPngWithIsland(
      validBottomWithIsland,
      [70, 130, 210],
      [98, 282, 158, 338],
      [159, 316, 162, 320]
    )
    assert.throws(
      () => verifyPromotedInventory({ roomRoot, catalog: FIXTURE }),
      /black static.*detached alpha island/i
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("candidate manifest requires complete Static + 4W + 1S per explicitly overridden item", () => {
  const root = mkdtempSync(join(tmpdir(), "blumi-combined-candidate-"))
  try {
    const roomRoot = buildFixture(root)
    const candidatePaths = STATES.map((state) => {
      const path = join(root, "candidate", `cream-${state}.png`)
      createPng(path, [245, 120, 160], [88, 207, 169, 292])
      return { kind: "top", slug: "cream", state, path: `candidate/cream-${state}.png` }
    })
    const manifestPath = join(root, "candidate-manifest.json")
    writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      overrides: candidatePaths
    }, null, 2)}\n`)

    const resolver = createCandidateAssetResolver({
      roomRoot,
      catalog: FIXTURE,
      manifestPath
    })
    assert.equal(resolver.resolve("top", "cream", "static"), join(root, "candidate", "cream-static.png"))
    assert.equal(
      resolver.resolve("bottom", "denim", "static"),
      assetPath(roomRoot, "bottom", "denim", "static")
    )
    const outputRoot = join(root, "candidate-output")
    const result = generateCombinedEvidence({
      roomRoot,
      outputRoot,
      catalog: FIXTURE,
      candidateManifestPath: manifestPath
    })
    assert.equal(result.frameDurationMs, 120)
    const evidence = JSON.parse(readFileSync(join(outputRoot, "manifest.json"), "utf8"))
    assert.equal(evidence.sourceMode, "candidate")
    assert.equal(
      evidence.inventory.sourceDigests.filter(({ source }) => source === "candidate").length,
      STATES.length
    )

    const incomplete = JSON.parse(readFileSync(manifestPath, "utf8"))
    incomplete.overrides.pop()
    writeFileSync(manifestPath, `${JSON.stringify(incomplete, null, 2)}\n`)
    assert.throws(
      () => createCandidateAssetResolver({ roomRoot, catalog: FIXTURE, manifestPath }),
      /cream.*complete Static \+ 4W \+ 1S/i
    )

    const duplicated = { schemaVersion: 1, overrides: [...candidatePaths, candidatePaths[0]] }
    duplicated.overrides.push(duplicated.overrides[0])
    writeFileSync(manifestPath, `${JSON.stringify(duplicated, null, 2)}\n`)
    assert.throws(
      () => createCandidateAssetResolver({ roomRoot, catalog: FIXTURE, manifestPath }),
      /duplicate candidate override/i
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("combined gate rejects a long-pant to low-shoe exposed base band", () => {
  const root = mkdtempSync(join(tmpdir(), "blumi-combined-seam-gap-"))
  try {
    const roomRoot = buildFixture(root)
    for (const state of STATES) {
      createPng(assetPath(roomRoot, "bottom", "black", state), [70, 130, 210], [94, 282, 162, 316])
      createPng(assetPath(roomRoot, "shoes", "milk", state), [110, 80, 55], [98, 322, 158, 350])
    }
    assert.throws(
      () => generateCombinedEvidence({ roomRoot, outputRoot: join(root, "out"), catalog: FIXTURE }),
      /black.*exposed ankle\/base band/i
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("evidence generation is hermetic, deterministic, and fixed to 120ms", () => {
  const root = mkdtempSync(join(tmpdir(), "blumi-combined-evidence-"))
  try {
    const roomRoot = buildFixture(root)
    const outputA = join(root, "out-a")
    const outputB = join(root, "out-b")
    const first = generateCombinedEvidence({ roomRoot, outputRoot: outputA, catalog: FIXTURE })
    const second = generateCombinedEvidence({ roomRoot, outputRoot: outputB, catalog: FIXTURE })

    assert.equal(first.frameDurationMs, FRAME_DURATION_MS)
    assert.deepEqual(first.outputDigests, second.outputDigests)
    assert.equal(first.rows, FIXTURE.tops.length * FIXTURE.bottoms.length)
    assert.equal(first.columns, STATES.length)
    assert.deepEqual(verifyGeneratedEvidence({ roomRoot, outputRoot: outputA, catalog: FIXTURE }), first)

    const manifestPath = join(outputA, "manifest.json")
    const tampered = JSON.parse(readFileSync(manifestPath, "utf8"))
    tampered.frameDurationMs = 121
    writeFileSync(manifestPath, `${JSON.stringify(tampered, null, 2)}\n`)
    assert.throws(
      () => verifyGeneratedEvidence({ roomRoot, outputRoot: outputA, catalog: FIXTURE }),
      /120ms/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
