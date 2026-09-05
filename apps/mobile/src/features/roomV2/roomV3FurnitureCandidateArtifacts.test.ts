import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import {
  ROOM_V3_FURNITURE_PILOT_CANDIDATES,
  validateRoomV3FurnitureCandidate
} from "./roomV3FurnitureCandidateGate"

interface PngImage {
  width: number
  height: number
  data: Uint8Array
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { PNG } = require("pngjs") as {
  PNG: { sync: { read(bytes: Uint8Array): PngImage } }
}

const CANDIDATE_ASSET_ROOT = resolve(process.cwd(), "src/features/roomV2")

test("candidate furniture direction declarations resolve to real transparent PNG artifacts", () => {
  const diningChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_dining_chair_a"
  )
  const loungeArmchair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_lounge_armchair_a"
  )
  const regeneratedDiningChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_dining_chair_b"
  )
  const normalizedDiningChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_dining_chair_d"
  )
  const normalizedLoungeArmchair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "cocoa_lounge_armchair_b"
  )
  const universalSideTable = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_petal_side_table_a"
  )
  const universalLoveseat = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_cloud_loveseat_a"
  )
  const universalFloorLamp = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_orbit_floor_lamp_a"
  )
  const universalWorkDesk = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_tidy_work_desk_a"
  )
  const universalCoffeeTable = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_arc_coffee_table_b"
  )
  const universalAccentChair = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find(
    (candidate) => candidate.id === "universal_cloud_accent_chair_b"
  )

  assert.ok(diningChair)
  assert.ok(loungeArmchair)
  assert.ok(regeneratedDiningChair)
  assert.ok(normalizedDiningChair)
  assert.ok(normalizedLoungeArmchair)
  assert.ok(universalSideTable)
  assert.ok(universalLoveseat)
  assert.ok(universalFloorLamp)
  assert.ok(universalWorkDesk)
  assert.ok(universalCoffeeTable)
  assert.ok(universalAccentChair)

  const diningDirectionArtifacts = Object.entries(diningChair.assetPathsByRotation)
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: diningChair.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(diningDirectionArtifacts.length, 4)
  assert.ok(diningDirectionArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    diningDirectionArtifacts.map((artifact) => artifact.actual),
    diningDirectionArtifacts.map((artifact) => artifact.expected)
  )

  const regeneratedDirectionArtifacts = Object.entries(
    regeneratedDiningChair.assetPathsByRotation
  )
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: regeneratedDiningChair.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(regeneratedDirectionArtifacts.length, 4)
  assert.ok(regeneratedDirectionArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    regeneratedDirectionArtifacts.map((artifact) => artifact.actual),
    regeneratedDirectionArtifacts.map((artifact) => artifact.expected)
  )

  const normalizedDirectionArtifacts = Object.entries(
    normalizedDiningChair.assetPathsByRotation
  )
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: normalizedDiningChair.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(normalizedDirectionArtifacts.length, 4)
  assert.ok(normalizedDirectionArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    normalizedDirectionArtifacts.map((artifact) => artifact.actual),
    normalizedDirectionArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    normalizedDirectionArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const loungeDirectionArtifacts = Object.entries(normalizedLoungeArmchair.assetPathsByRotation)
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: normalizedLoungeArmchair.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(loungeDirectionArtifacts.length, 4)
  assert.ok(loungeDirectionArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    loungeDirectionArtifacts.map((artifact) => artifact.actual),
    loungeDirectionArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    loungeDirectionArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const universalSideTableArtifacts = Object.entries(universalSideTable.assetPathsByRotation)
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: universalSideTable.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(universalSideTableArtifacts.length, 4)
  assert.ok(universalSideTableArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    universalSideTableArtifacts.map((artifact) => artifact.actual),
    universalSideTableArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    universalSideTableArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const universalLoveseatArtifacts = Object.entries(universalLoveseat.assetPathsByRotation)
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: universalLoveseat.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(universalLoveseatArtifacts.length, 4)
  assert.ok(universalLoveseatArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    universalLoveseatArtifacts.map((artifact) => artifact.actual),
    universalLoveseatArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    universalLoveseatArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const universalFloorLampArtifacts = Object.entries(universalFloorLamp.assetPathsByRotation)
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: universalFloorLamp.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(universalFloorLampArtifacts.length, 4)
  assert.ok(universalFloorLampArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    universalFloorLampArtifacts.map((artifact) => artifact.actual),
    universalFloorLampArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    universalFloorLampArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const universalWorkDeskArtifacts = Object.entries(universalWorkDesk.assetPathsByRotation)
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: universalWorkDesk.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(universalWorkDeskArtifacts.length, 4)
  assert.ok(universalWorkDeskArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    universalWorkDeskArtifacts.map((artifact) => artifact.actual),
    universalWorkDeskArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    universalWorkDeskArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const universalCoffeeTableArtifacts = Object.entries(
    universalCoffeeTable.assetPathsByRotation
  )
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: universalCoffeeTable.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(universalCoffeeTableArtifacts.length, 4)
  assert.ok(universalCoffeeTableArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    universalCoffeeTableArtifacts.map((artifact) => artifact.actual),
    universalCoffeeTableArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    universalCoffeeTableArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  const universalAccentChairArtifacts = Object.entries(
    universalAccentChair.assetPathsByRotation
  )
    .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
      Boolean(entry[1])
    )
    .map(([rotation, path]) => ({
      actual: readCandidatePng(path),
      expected: universalAccentChair.artifactBaselinesByRotation?.[rotation]
    }))

  assert.equal(universalAccentChairArtifacts.length, 4)
  assert.ok(universalAccentChairArtifacts.every((artifact) => artifact.expected))
  assert.deepEqual(
    universalAccentChairArtifacts.map((artifact) => artifact.actual),
    universalAccentChairArtifacts.map((artifact) => artifact.expected)
  )
  assert.deepEqual(
    universalAccentChairArtifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
    [1_110, 1_110, 1_110, 1_110]
  )

  for (const id of [
    "universal_round_dining_table_a",
    "universal_soft_media_console_b",
    "universal_open_bookshelf_a"
  ]) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find((entry) => entry.id === id)
    assert.ok(candidate)
    const artifacts = Object.entries(candidate.assetPathsByRotation)
      .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
        Boolean(entry[1])
      )
      .map(([rotation, path]) => ({
        actual: readCandidatePng(path),
        expected: candidate.artifactBaselinesByRotation?.[rotation]
      }))

    assert.equal(artifacts.length, 4)
    assert.ok(artifacts.every((artifact) => artifact.expected))
    assert.deepEqual(
      artifacts.map((artifact) => artifact.actual),
      artifacts.map((artifact) => artifact.expected)
    )
    assert.deepEqual(
      artifacts.map((artifact) => artifact.actual.alphaBounds.maxYInclusive),
      [1_110, 1_110, 1_110, 1_110]
    )
  }

  const loungeValidation = validateRoomV3FurnitureCandidate(loungeArmchair)
  assert.equal(Object.keys(loungeArmchair.assetPathsByRotation).length, 3)
  assert.ok(loungeValidation.issueIds.includes("missing_directional_asset"))
})

test("new universal four-direction wave resolves to its declared transparent PNG baselines", () => {
  const newUniversalWaveIds = [
    "universal_dining_chair_a",
    "universal_desk_chair_a",
    "universal_storage_cabinet_a",
    "universal_dresser_a",
    "universal_console_table_a",
    "universal_large_standing_plant_a",
    "universal_wall_artwork_a",
    "universal_ceiling_light_a",
    "universal_curtain_set_a",
    "universal_decorative_object_set_a"
  ] as const

  for (const id of newUniversalWaveIds) {
    const candidate = ROOM_V3_FURNITURE_PILOT_CANDIDATES.find((entry) => entry.id === id)
    assert.ok(candidate, `Missing candidate declaration: ${id}`)
    const artifacts = Object.entries(candidate.assetPathsByRotation)
      .filter((entry): entry is ["front" | "back" | "left" | "right", string] =>
        Boolean(entry[1])
      )
      .map(([rotation, path]) => ({
        actual: readCandidatePng(path),
        expected: candidate.artifactBaselinesByRotation?.[rotation]
      }))

    assert.equal(artifacts.length, candidate.requiresDirectionalAssets === false ? 1 : 4)
    assert.ok(artifacts.every((artifact) => artifact.expected))
    assert.deepEqual(
      artifacts.map((artifact) => artifact.actual),
      artifacts.map((artifact) => artifact.expected)
    )
  }
})

function readCandidatePng(relativeAssetPath: string): {
  width: number
  height: number
  sha256: string
  alphaBounds: { minX: number; minY: number; maxXInclusive: number; maxYInclusive: number }
  transparentPixelCount: number
  partialAlphaPixelCount: number
} {
  const absoluteAssetPath = resolve(CANDIDATE_ASSET_ROOT, relativeAssetPath)
  assert.ok(existsSync(absoluteAssetPath), `Missing candidate asset: ${relativeAssetPath}`)

  const bytes = readFileSync(absoluteAssetPath)
  const png = PNG.sync.read(bytes)
  let transparentPixelCount = 0
  let partialAlphaPixelCount = 0
  let minX = png.width
  let minY = png.height
  let maxXInclusive = -1
  let maxYInclusive = -1

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3] ?? 255
      if (alpha === 0) {
        transparentPixelCount += 1
        continue
      }
      if (alpha < 255) partialAlphaPixelCount += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxXInclusive = Math.max(maxXInclusive, x)
      maxYInclusive = Math.max(maxYInclusive, y)
    }
  }

  return {
    width: png.width,
    height: png.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    alphaBounds: { minX, minY, maxXInclusive, maxYInclusive },
    transparentPixelCount,
    partialAlphaPixelCount
  }
}
