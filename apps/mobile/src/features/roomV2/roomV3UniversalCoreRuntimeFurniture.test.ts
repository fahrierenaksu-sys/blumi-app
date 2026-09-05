import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import type { FurnitureItem, RoomFurnitureRotation } from "./roomV2.types"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = (module, filename) => {
  module.exports = filename
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { PNG } = require("pngjs") as {
  PNG: {
    sync: {
      read: (buffer: Buffer) => {
        width: number
        height: number
        data: Uint8Array
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && /\.(png|webp)$/.test(request)) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_INCOMPLETE_DIRECTIONAL_IDS,
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
  createRoomV3UniversalCoreRuntimeFurniture
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")
const {
  ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreInventory") as typeof import("./roomV3UniversalCoreInventory")
const {
  ROOM_V3_FURNITURE_CATEGORIES
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3ProductionPlan") as typeof import("./roomV3ProductionPlan")
const {
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID,
  ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreArtifactRegistry") as typeof import("./roomV3UniversalCoreArtifactRegistry")
const {
  resolveRoomV3UniversalCoreQaPreviewFurniture
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaPreview") as typeof import("./roomV3UniversalCoreQaPreview")
const {
  getRoomV3SeatPoints
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3Contracts") as typeof import("./roomV3Contracts")
const {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2.mock") as typeof import("./roomV2.mock")
const {
  resolveRoomV2Scene,
  resolvePlacedFurnitureRenderItem,
  validateRoomV2DraftPlacements,
  validateRoomV2FurniturePlacement
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2Selectors") as typeof import("./roomV2Selectors")
const {
  getRoomV2DraftPlacementCandidates
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2DraftPlacementCandidates") as typeof import("./roomV2DraftPlacementCandidates")
const {
  UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID,
  UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES,
  UNIVERSAL_CORE_ROOM_ITEM_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("@blumi/domain") as typeof import("@blumi/domain")
const {
  createRoomWorldGeometryFromRoomV2Scene,
  createRoomWorldHotspotsFromRoomV2Scene
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomWorld/roomWorldRoomV2Projection") as typeof import("../roomWorld/roomWorldRoomV2Projection")
const {
  resolveRoomWorldSeatSelection,
  createRoomWorldMovementPlan,
  createRoomWorldSeatMovementPlan,
  createRoomWorldSeatExitMovementPlan,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomWorld/roomWorldRuntime") as typeof import("../roomWorld/roomWorldRuntime")

const categoryById = new Map(
  ROOM_V3_FURNITURE_CATEGORIES.map((category) => [category.id, category])
)

function getRequiredRotationsForItem(
  item: FurnitureItem
): readonly RoomFurnitureRotation[] {
  const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
    item.id as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
  ]
  if (!categoryId) {
    throw new Error(`missing category mapping for ${item.id}`)
  }
  const category = categoryById.get(categoryId)
  return category?.requiresDirectionalAssets
    ? ["front", "back", "left", "right"]
    : ["front"]
}

function createTrustedRegistry(): any {
  return {
    verifierId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
    artifactManifestId: ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    verifiedCandidateIds: [...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
    verifiedAssetHashesByCandidateId: Object.fromEntries(
      ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.map((id) => [
        id,
        { ...ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[id] }
      ])
    )
  }
}

function getRenderedAlphaSize(input: {
  source: unknown
  renderWidth: number
  renderHeight: number
}): { width: number; height: number } {
  assert.equal(typeof input.source, "string", "test asset hooks must expose a local PNG path")
  const png = PNG.sync.read(readFileSync(input.source as string))
  let minX = png.width
  let maxX = -1
  let minY = png.height
  let maxY = -1
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3]! > 8) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }
  assert.ok(maxY >= minY, `${input.source} must contain visible pixels`)
  const scale = Math.min(
    input.renderWidth * 1254 / png.width,
    input.renderHeight * 714 / png.height
  )
  return {
    width: (maxX - minX + 1) * scale / 1254,
    height: (maxY - minY + 1) * scale / 714
  }
}

test("Universal Core runtime furniture remains empty without a trusted artifact registry", () => {
  assert.deepEqual(createRoomV3UniversalCoreRuntimeFurniture(), [])
  assert.deepEqual(createRoomV3UniversalCoreRuntimeFurniture(null), [])
  assert.deepEqual(
    createRoomV3UniversalCoreRuntimeFurniture({
      ...createTrustedRegistry(),
      verifierId: "untrusted-input" as never
    }),
    []
  )
  assert.deepEqual(
    createRoomV3UniversalCoreRuntimeFurniture({
      ...createTrustedRegistry(),
      verifiedCandidateIds: ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.slice(1)
    }),
    []
  )
  const malformedHashRegistry = createTrustedRegistry()
  Object.assign(
    malformedHashRegistry.verifiedAssetHashesByCandidateId[
      "universal_petal_side_table_a"
    ],
    { front: 42 }
  )
  assert.deepEqual(
    createRoomV3UniversalCoreRuntimeFurniture(malformedHashRegistry),
    []
  )
  const malformedFormatRegistry = createTrustedRegistry()
  malformedFormatRegistry.verifiedAssetHashesByCandidateId[
    "universal_petal_side_table_a"
  ].front = "not-a-sha256"
  assert.deepEqual(
    createRoomV3UniversalCoreRuntimeFurniture(malformedFormatRegistry),
    []
  )
  const wrongButWellFormedHashRegistry = createTrustedRegistry()
  wrongButWellFormedHashRegistry.verifiedAssetHashesByCandidateId[
    "universal_petal_side_table_a"
  ].front = "0".repeat(64)
  assert.deepEqual(
    createRoomV3UniversalCoreRuntimeFurniture(wrongButWellFormedHashRegistry),
    []
  )
})

test("mobile art and server economy share one canonical 45-item ownership boundary", () => {
  assert.equal(
    ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
    UNIVERSAL_CORE_ROOM_ITEM_IDS
  )
  assert.equal(
    ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
    UNIVERSAL_CORE_ROOM_ARTIFACT_MANIFEST_ID
  )
})

test("all 45 Shop titles match the names shown in the room editor", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  assert.equal(furniture.length, UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.length)

  for (const item of furniture) {
    const economyItem = UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.find(
      (candidate) => candidate.itemId === item.id
    )
    assert.ok(economyItem, `${item.id} needs shared Shop metadata`)
    assert.equal(economyItem.title, item.name, `${item.id} must have one player-facing name`)
  }
})

test("Universal Core QA preview stays empty unless development, profile, and flag all agree", () => {
  const trustedRegistry = createTrustedRegistry()

  for (const input of [
    {
      isDevelopmentRuntime: false,
      buildProfile: "development",
      rawPreviewFlag: "1"
    },
    {
      isDevelopmentRuntime: true,
      buildProfile: "production",
      rawPreviewFlag: "1"
    },
    {
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawPreviewFlag: undefined
    },
    {
      isDevelopmentRuntime: true,
      buildProfile: "development",
      rawPreviewFlag: "0"
    }
  ]) {
    const result = resolveRoomV3UniversalCoreQaPreviewFurniture({
      ...input,
      artifactRegistry: trustedRegistry
    })
    assert.equal(result.enabled, false)
    assert.equal(result.reason, "disabled")
    assert.deepEqual(result.catalog, [])
  }
})

test("Universal Core QA preview rejects untrusted registries and never promotes candidates", () => {
  const untrustedRegistry = {
    ...createTrustedRegistry(),
    verifierId: "untrusted-input"
  }
  const result = resolveRoomV3UniversalCoreQaPreviewFurniture({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: untrustedRegistry
  })

  assert.equal(result.enabled, false)
  assert.equal(result.reason, "untrusted_registry")
  assert.deepEqual(result.catalog, [])
})

test("Universal Core QA preview returns isolated blocked candidates only for the explicit dev gate", () => {
  const result = resolveRoomV3UniversalCoreQaPreviewFurniture({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createTrustedRegistry()
  })

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.equal(result.catalog.length, ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length)
  assert.ok(result.catalog.every((item) => (
    item.sourceStatus === "candidate" &&
    item.qaStatus === "blocked" &&
    item.ownedByDefault !== true &&
    item.locked === true
  )))

  const first = result.catalog[0]
  assert.ok(first)
  const secondResult = resolveRoomV3UniversalCoreQaPreviewFurniture({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawPreviewFlag: "1",
    artifactRegistry: createTrustedRegistry()
  })
  assert.notEqual(first, secondResult.catalog[0])
  first.name = "mutated QA candidate"
  assert.notEqual(first.name, secondResult.catalog[0]?.name)
})

test("trusted Universal Core registry creates deterministic output for each complete canonical candidate", () => {
  const first = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const second = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const incompleteDirectionalIds = new Set<string>(
    ROOM_V3_UNIVERSAL_CORE_RUNTIME_INCOMPLETE_DIRECTIONAL_IDS
  )
  assert.equal(incompleteDirectionalIds.size, 0)
  const expectedRuntimeIds = ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.filter(
    (id) => !incompleteDirectionalIds.has(id)
  )

  // The trusted manifest and runtime now cover the complete 45-product wave.
  assert.equal(first.length, 45)
  assert.deepEqual(first.map((item) => item.id), [...expectedRuntimeIds])
  assert.equal(new Set(first.map((item) => item.id)).size, 45)
  assert.deepEqual(
    ROOM_V3_UNIVERSAL_CORE_RUNTIME_INCOMPLETE_DIRECTIONAL_IDS.every(
      (id) => !first.some((item) => item.id === id)
    ),
    true
  )
  assert.deepEqual(first, second)

  for (const item of first) {
    const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
      item.id as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
    ]
    if (!categoryId) throw new Error(`missing category mapping for ${item.id}`)
    const category = categoryById.get(categoryId)

    assert.ok(category)
    assert.equal(item.collectionId, "universal_core")
    assert.equal(item.homeTheme, "universal_core")
    assert.equal(item.placementSurface, category.placementSurface)
    assert.equal(item.sourceStatus, "candidate")
    assert.equal(item.qaStatus, "pending")

    for (const rotation of getRequiredRotationsForItem(item)) {
      const asset = item.assetsByRotation?.[rotation] ?? item.asset
      assert.equal(typeof asset.source, "string")
      const actualHash = createHash("sha256")
        .update(readFileSync(asset.source as string))
        .digest("hex")
      const expectedHashes =
        ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID[
          item.id as keyof typeof ROOM_V3_UNIVERSAL_CORE_ARTIFACT_HASHES_BY_CANDIDATE_ID
        ] as Partial<Record<RoomFurnitureRotation, string>>
      assert.equal(
        actualHash,
        expectedHashes[rotation],
        `${item.id}:${rotation} runtime file must match the trusted registry`
      )
    }
  }
})

test("Universal Core applies avatar-calibrated category scales without desynchronizing collision, proximity, seat, or tabletop contracts", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const loveseat = furniture.find((item) => item.id === "universal_cloud_loveseat_a")
  const consoleTable = furniture.find((item) => item.id === "universal_console_table_a")
  const sideTable = furniture.find((item) => item.id === "universal_petal_side_table_a")

  assert.ok(loveseat)
  assert.ok(loveseat.width > 0.28)
  assert.ok(loveseat.footprint)
  assert.ok(loveseat.placementFootprint)
  assert.ok((loveseat.placementFootprint.width ?? 0) < loveseat.footprint.width)
  assert.ok(
    (loveseat.footprintByRotation?.left?.width ?? 0) <
    (loveseat.footprintByRotation?.front?.width ?? 0)
  )
  const loveseatSeat = getRoomV3SeatPoints({
    seatSpec: loveseat.seatSpec,
    x: 0.5,
    y: 0.79,
    width: loveseat.width,
    height: loveseat.height,
    rotation: "front"
  })[0]
  assert.ok(loveseatSeat)
  assert.ok(loveseatSeat.seatHeight >= 0.07 && loveseatSeat.seatHeight <= 0.09)

  const diningChair = furniture.find((item) => item.id === "universal_dining_chair_a")
  const accentChair = furniture.find((item) => item.id === "universal_cloud_accent_chair_b")
  assert.ok(accentChair)
  assert.equal(
    accentChair.seatSpec?.seatPoints[0]?.y,
    -0.16,
    "the accent-chair hotspot must settle on the visible cushion instead of hovering against the backrest"
  )
  assert.ok(diningChair)
  assert.equal(
    diningChair.seatSpec?.seatPoints[0]?.y,
    -0.16,
    "the dining-chair hotspot must land on the visible cushion rather than the backrest"
  )
  assert.deepEqual(diningChair.frontOcclusionByRotation?.front, {
    left: 0.02,
    top: 0.5,
    width: 0.96,
    height: 0.47
  })

  const bed = furniture.find((item) => item.id === "universal_cloud_bed_b")
  assert.ok(bed)
  assert.ok(
    bed.seatSpec?.seatPoints.every((seat) =>
      Math.abs(seat.x) === 0.1 &&
      seat.y === 0.02 &&
      Math.abs(seat.approachPoint?.x ?? 0) === 0.1 &&
      Math.abs(seat.exitPoint?.x ?? 0) === 0.1
    ),
    "the bed hotspots must sit inside the reachable front edge, not beside the headboard or outside the frame"
  )
  assert.deepEqual(bed.frontOcclusionByRotation?.front, {
    left: 0.02,
    top: 0.75,
    width: 0.96,
    height: 0.22
  })

  assert.ok(consoleTable)
  assert.ok(consoleTable.width > sideTable!.width)
  assert.ok(consoleTable.footprint)
  assert.ok(consoleTable.placementFootprint)
  // Support bounds are normalized inside the resized furniture render, so
  // changing them would incorrectly move tabletop decor.
  assert.deepEqual(consoleTable.surfaceSupports?.[0]?.localBounds, {
    minX: 0.1,
    maxX: 0.9,
    minY: 0.14,
    maxY: 0.26
  })

  assert.ok(sideTable)
  const smallestTabletopWidth = sideTable.width * (
    (sideTable.surfaceSupports?.[0]?.localBounds.maxX ?? 0) -
    (sideTable.surfaceSupports?.[0]?.localBounds.minX ?? 0)
  )
  for (const tabletopItem of furniture.filter(
    (item) => item.placementSurface === "tabletop"
  )) {
    assert.ok(
      tabletopItem.width <= smallestTabletopWidth,
      `${tabletopItem.id} must fit the smallest supported tabletop without visible overhang`
    )
    assert.ok(tabletopItem.height < 0.2)
  }
})

test("floor speaker and ceiling light remain visible at room scale while the speaker blocks movement", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const speaker = furniture.find((item) => item.id === "universal_small_speaker_a")
  const ceilingLight = furniture.find((item) => item.id === "universal_ceiling_light_a")

  assert.ok(speaker)
  assert.ok(speaker.width >= 0.04 && speaker.height >= 0.08)
  assert.equal(speaker.blocksMovement, true)
  assert.ok(speaker.footprint)
  assert.ok(
    (speaker.footprintByRotation?.right?.width ?? 0) <
    (speaker.footprintByRotation?.front?.width ?? 0)
  )

  assert.ok(ceilingLight)
  assert.ok(ceilingLight.width > speaker.width)
})

test("large room fixtures keep avatar-readable visible bounds after transparent-canvas rendering", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const visibleSize = (itemId: string): { width: number; height: number } => {
    const item = furniture.find((candidate) => candidate.id === itemId)
    assert.ok(item, `${itemId} must exist`)
    return getRenderedAlphaSize({
      source: item.asset.source,
      renderWidth: item.width,
      renderHeight: item.height
    })
  }

  const floorLamp = visibleSize("universal_orbit_floor_lamp_a")
  const wardrobe = visibleSize("universal_rounded_wardrobe_a")
  const consoleTable = visibleSize("universal_console_table_a")
  const wallClock = visibleSize("universal_wall_clock_a")
  const wallArtwork = visibleSize("universal_wall_artwork_a")
  const rugItem = furniture.find((candidate) => candidate.id === "universal_rug_a")
  const roomDivider = visibleSize("universal_room_divider_a")

  assert.ok(floorLamp.height >= 0.28, "a floor lamp must read near avatar height")
  assert.ok(wardrobe.height >= 0.24, "a wardrobe must read as a full-height fixture")
  assert.ok(consoleTable.width >= 0.16, "a console table must remain furniture-sized")
  assert.ok(wallClock.height >= 0.055, "a wall clock must remain legible in the room")
  assert.ok(wallArtwork.height >= 0.075, "wall artwork must remain legible in the room")
  assert.ok(rugItem)
  assert.equal(rugItem.sceneProjection, "floor_plane")
  assert.ok(rugItem.width >= 0.35, "a rug must establish a usable furniture zone")
  assert.ok(rugItem.height <= 0.14, "a rug must remain flat on the floor plane")
  assert.ok(
    rugItem.width / rugItem.height >= 4,
    "a top-down rug must be projected into the locked 2.5D floor plane"
  )
  assert.ok(roomDivider.height >= 0.22, "a room divider must read near avatar height")
})

test("social seating shares one human-scale seat-height band while keeping each silhouette's real capacity", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const standardSeating = [
    "universal_cloud_loveseat_a",
    "universal_long_sofa_a",
    "universal_lounge_armchair_a",
    "universal_cloud_accent_chair_b",
    "universal_dining_chair_a",
    "universal_desk_chair_a",
    "universal_bench_a",
    "universal_cloud_bed_b"
  ].map((itemId) => furniture.find((item) => item.id === itemId))

  assert.ok(standardSeating.every((item) => item?.seatSpec))
  for (const item of standardSeating) {
    const seatHeights = item?.seatSpec?.seatPoints.map((seat) => seat.seatHeight) ?? []
    assert.ok(
      seatHeights.every((height) => height !== undefined && height >= 0.07 && height <= 0.09),
      `${item?.id} must keep the authored seat-to-floor drop that prevents perched sitting art`
    )
  }

  const pouf = furniture.find((item) => item.id === "universal_soft_pouf_b")
  assert.ok(pouf?.seatSpec)
  assert.ok(
    pouf.seatSpec.seatPoints.every(
      (seat) => seat.seatHeight !== undefined &&
        seat.seatHeight >= 0.07 && seat.seatHeight <= 0.08
    ),
    "the pouf needs its authored lower seat-to-floor drop"
  )

  const allSeatIds = furniture
    .filter((item) => item.interactionType === "seat")
    .map((item) => item.id)
  assert.deepEqual(
    new Set([...standardSeating.map((item) => item?.id), pouf.id]),
    new Set(allSeatIds),
    "every seating SKU must be covered by one deliberate height family"
  )

  const loveseat = standardSeating.find((item) => item?.id === "universal_cloud_loveseat_a")
  const sofa = standardSeating.find((item) => item?.id === "universal_long_sofa_a")
  assert.ok(loveseat && sofa)
  assert.equal(loveseat.seatSpec?.capacity, 2)
  assert.equal(sofa.seatSpec?.capacity, 2)
  assert.ok(
    sofa.width > loveseat.width && sofa.width <= loveseat.width * 1.5,
    "a long sofa should read as broader than a loveseat, not like a giant prop on mobile"
  )
  assert.ok(
    sofa.height <= 0.23,
    "a long sofa backrest must not make the avatar look miniature"
  )
})

test("social seating reads as one real-home scale family after transparent-canvas contain rendering", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const socialSeatIds = [
    "universal_cloud_loveseat_a",
    "universal_long_sofa_a",
    "universal_lounge_armchair_a",
    "universal_cloud_accent_chair_b",
    "universal_dining_chair_a",
    "universal_desk_chair_a"
  ] as const
  const renderedSizes = new Map(
    socialSeatIds.map((itemId) => {
      const item = furniture.find((candidate) => candidate.id === itemId)
      assert.ok(item, `${itemId} must exist`)
      return [
        itemId,
        getRenderedAlphaSize({
          source: item.asset.source,
          renderWidth: item.width,
          renderHeight: item.height
        })
      ] as const
    })
  )

  for (const itemId of socialSeatIds) {
    const rendered = renderedSizes.get(itemId)
    assert.ok(rendered)
    assert.ok(
      rendered.height >= 0.13 && rendered.height <= 0.22,
      `${itemId} visible height ${rendered.height.toFixed(4)} must stay in the real-home seating band`
    )
  }

  const loveseat = renderedSizes.get("universal_cloud_loveseat_a")!
  const longSofa = renderedSizes.get("universal_long_sofa_a")!
  const widestSingleSeat = Math.max(
    renderedSizes.get("universal_lounge_armchair_a")!.width,
    renderedSizes.get("universal_cloud_accent_chair_b")!.width,
    renderedSizes.get("universal_dining_chair_a")!.width,
    renderedSizes.get("universal_desk_chair_a")!.width
  )
  assert.ok(
    loveseat.width >= widestSingleSeat * 1.38,
    "a two-seat loveseat must visibly read wider than every one-seat chair"
  )
  assert.ok(
    longSofa.width >= widestSingleSeat * 2.35 &&
      longSofa.width <= widestSingleSeat * 2.75,
    "a long sofa must read as roughly two-and-a-half chair widths, not a resized armchair"
  )
})

test("directional runtime metadata preserves vertical scale while rotating projected floor depth", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())

  for (const item of furniture.filter(
    (candidate) => candidate.assetsByRotation && candidate.category !== "rug"
  )) {
    const renderedHeights = ["front", "back", "left", "right"].map((rotation) => {
      const typedRotation = rotation as RoomFurnitureRotation
      const renderSize = item.renderSizeByRotation?.[typedRotation] ?? item
      return renderSize.height
    })
    assert.ok(
      renderedHeights.every((height) => height > 0 && height <= 0.45),
      `${item.id} keeps a bounded rotation-aware projected height`
    )
  }
})

test("the complete Universal Core keeps a believable home-scale hierarchy instead of equal-sized props", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const byId = new Map(furniture.map((item) => [item.id, item]))
  const item = (id: string) => {
    const result = byId.get(id)
    assert.ok(result, `${id} must exist in the complete 45-piece wave`)
    return result
  }

  const loveseat = item("universal_cloud_loveseat_a")
  const sofa = item("universal_long_sofa_a")
  const bed = item("universal_cloud_bed_b")
  const coffeeTable = item("universal_arc_coffee_table_b")
  const sideTable = item("universal_petal_side_table_a")
  const diningTable = item("universal_round_dining_table_a")
  const workDesk = item("universal_tidy_work_desk_a")
  const nightstand = item("universal_nightstand_a")
  const wardrobe = item("universal_rounded_wardrobe_a")
  const bookshelf = item("universal_open_bookshelf_a")
  const floorLamp = item("universal_orbit_floor_lamp_a")
  const plant = item("universal_large_standing_plant_a")

  // A real room reads through family relationships: the coffee table stays
  // below and narrower than seating, a bed is the largest horizontal piece,
  // and storage/standing accents grow vertically rather than into the room.
  assert.ok(coffeeTable.width < loveseat.width)
  assert.ok(coffeeTable.height < loveseat.height)
  assert.ok(sideTable.width < coffeeTable.width)
  assert.ok(diningTable.width >= coffeeTable.width)
  assert.ok(workDesk.width >= coffeeTable.width)
  assert.ok(nightstand.width < bed.width * 0.4)
  assert.ok(sofa.width > loveseat.width && sofa.width <= loveseat.width * 1.5)
  assert.ok(bed.width < sofa.width && bed.height > sofa.height)
  assert.ok(wardrobe.height > sofa.height)
  assert.ok(bookshelf.height > sofa.height)
  assert.ok(floorLamp.height > loveseat.height && floorLamp.height < wardrobe.height)
  assert.ok(plant.height > loveseat.height && plant.height < wardrobe.height)

  for (const floorItem of furniture.filter((candidate) => candidate.placementSurface === "floor")) {
    const maxMobileWidth = floorItem.layer === "floor" ? 0.7 : 0.5
    assert.ok(
      floorItem.width > 0 && floorItem.width <= maxMobileWidth,
      `${floorItem.id} has a mobile-safe width`
    )
    assert.ok(floorItem.height > 0 && floorItem.height <= 0.42, `${floorItem.id} has a mobile-safe height`)
    if (floorItem.blocksMovement) {
      assert.ok(floorItem.footprint, `${floorItem.id} has a physical floor footprint`)
      assert.ok(floorItem.placementFootprint, `${floorItem.id} has a tight placement base`)
      assert.ok(
        (floorItem.placementFootprint?.width ?? 0) <= (floorItem.footprint?.width ?? 0) &&
          (floorItem.placementFootprint?.height ?? 0) <= (floorItem.footprint?.height ?? 0),
        `${floorItem.id} must allow close arranging without weakening avatar collision`
      )
    }
  }
})

test("avatar-calibrated scale preserves valid seating and tabletop layouts", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const validateLayout = (placedItems: {
    instanceId: string
    itemId: string
    x: number
    y: number
    rotation: "front" | "back" | "left" | "right"
  }[]) => {
    const decor = {
      roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
      placedItems
    }
    return validateRoomV2DraftPlacements({
      scene: resolveRoomV2Scene({
        roomShellCatalog: ROOM_V2_SHELL_CATALOG,
        furnitureCatalog: furniture,
        decor,
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
      }),
      decor,
      furnitureCatalog: furniture
    })
  }
  const desk = furniture.find((item) => item.id === "universal_tidy_work_desk_a")
  const tableLamp = furniture.find((item) => item.id === "universal_table_lamp_a")
  assert.ok(desk && tableLamp)
  const deskSupport = desk.surfaceSupports?.[0]?.localBounds
  assert.ok(deskSupport)
  const tabletopLampY = (deskY: number): number => {
    const deskTop = deskY - desk.height * (desk.anchor?.y ?? 1)
    const supportMinY = deskTop + deskSupport.minY * desk.height
    const lampContactHeight = Math.max(tableLamp.height * 0.12, 0.004)
    return Number((supportMinY + lampContactHeight + 0.001).toFixed(4))
  }

  // A front-facing social pair: their resized blockers must remain separate,
  // while the two seats still have normalized avatar approach/exit routes.
  assert.deepEqual(
    validateLayout([
      {
        instanceId: "scale-qa-loveseat",
        itemId: "universal_cloud_loveseat_a",
        x: 0.4,
        y: 0.78,
        rotation: "front"
      },
      {
        instanceId: "scale-qa-chair",
        itemId: "universal_cloud_accent_chair_b",
        x: 0.7,
        y: 0.78,
        rotation: "right"
      }
    ]),
    { isValid: true, invalidItems: [] }
  )

  // A coffee table belongs close to the sofa's front edge. The arrangement
  // base can touch the visual furniture relationship without letting either
  // item's larger physical movement blocker overlap or trapping the avatar.
  assert.deepEqual(
    validateLayout([
      {
        instanceId: "scale-qa-sofa",
        itemId: "universal_long_sofa_a",
        x: 0.46,
        y: 0.78,
        rotation: "front"
      },
      {
        instanceId: "scale-qa-coffee-table",
        itemId: "universal_arc_coffee_table_b",
        x: 0.46,
        y: 0.715,
        rotation: "front"
      }
    ]),
    { isValid: true, invalidItems: [] }
  )

  // Tabletop coordinates are anchored to the resized desk image. The lamp is
  // deliberately placed inside that converted support band, not on the floor.
  assert.deepEqual(
    validateLayout([
      {
        instanceId: "scale-qa-desk",
        itemId: "universal_tidy_work_desk_a",
        x: 0.5,
        y: 0.78,
        rotation: "front"
      },
      {
        instanceId: "scale-qa-lamp",
        itemId: "universal_table_lamp_a",
        x: 0.5,
        y: tabletopLampY(0.78),
        rotation: "front"
      }
    ]),
    { isValid: true, invalidItems: [] }
  )

  // This is the same five-item isolated QA fixture captured in the native
  // My Room scale evidence. It keeps the social pair, work zone, and floor
  // lighting in separate walkable regions of the locked shell.
  assert.deepEqual(
    validateLayout([
      {
        instanceId: "scale-qa-loveseat",
        itemId: "universal_cloud_loveseat_a",
        x: 0.38,
        y: 0.78,
        rotation: "front"
      },
      {
        instanceId: "scale-qa-chair",
        itemId: "universal_cloud_accent_chair_b",
        x: 0.7,
        y: 0.78,
        rotation: "right"
      },
      {
        instanceId: "scale-qa-desk",
        itemId: "universal_tidy_work_desk_a",
        x: 0.55,
        y: 0.62,
        rotation: "front"
      },
      {
        instanceId: "scale-qa-lamp",
        itemId: "universal_table_lamp_a",
        x: 0.55,
        y: tabletopLampY(0.62),
        rotation: "front"
      },
      {
        instanceId: "scale-qa-floor-lamp",
        itemId: "universal_orbit_floor_lamp_a",
        x: 0.7,
        y: 0.65,
        rotation: "front"
      }
    ]),
    { isValid: true, invalidItems: [] }
  )
})

test("runtime entries preserve real directional policy and seat routing metadata", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const directional = furniture.filter((item) => item.assetsByRotation)
  const staticSurface = furniture.filter((item) => !item.assetsByRotation)

  assert.equal(directional.length, 33)
  assert.equal(staticSurface.length, 12)

  for (const item of directional) {
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(Object.keys(item.assetsByRotation ?? {}).sort(), [
      "back",
      "front",
      "left",
      "right"
    ])
    assert.equal(item.asset, item.assetsByRotation?.front)
    assert.equal(
      new Set(Object.values(item.assetsByRotation ?? {}).map((asset) => asset.key)).size,
      4
    )
  }

  for (const item of staticSurface) {
    assert.equal(item.assetsByRotation, undefined)
    assert.equal(item.rotationPolicy, undefined)
    assert.ok(item.asset.key.endsWith(".png"))
  }

  // Production-plan floor categories are directional by contract. A
  // front-only asset can therefore never leak into the runtime registry.
  for (const item of furniture) {
    const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
      item.id as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
    ]
    if (!categoryId) throw new Error(`missing category mapping for ${item.id}`)
    const category = categoryById.get(categoryId)
    assert.ok(category)
    if (category?.requiresDirectionalAssets) {
      assert.ok(item.assetsByRotation)
      assert.equal(item.rotationPolicy, "directional_assets_required")
      assert.deepEqual(Object.keys(item.assetsByRotation).sort(), [
        "back",
        "front",
        "left",
        "right"
      ])
    }
  }

  for (const item of furniture.filter((candidate) => candidate.interactionType === "seat")) {
    assert.ok(item.seatSpec)
    assert.equal(item.seatSpec?.capacity, item.seatSpec?.seatPoints.length)
    assert.ok(item.seatSpec?.seatPoints.every((seat) => seat.approachPoint && seat.exitPoint))
  }
})

test("every seat SKU reaches a real approach and exit in each supported rotation", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const shell = ROOM_V2_SHELL_CATALOG.find((candidate) => candidate.id === DEFAULT_ROOM_V2_SHELL_ID)
  assert.ok(shell)

  for (const item of furniture.filter((candidate) => candidate.interactionType === "seat")) {
    const rotations = item.assetsByRotation
      ? (["front", "back", "left", "right"] as const)
      : (["front"] as const)

    for (const rotation of rotations) {
      const emptyScene = resolveRoomV2Scene({
        roomShellCatalog: [shell],
        furnitureCatalog: [item],
        decor: { roomShellId: shell.id, placedItems: [] },
        defaultRoomShellId: shell.id
      })
      const hasCompleteSeatRoute = getRoomV2DraftPlacementCandidates(item, emptyScene)
        .map((candidate) => ({
          instanceId: `${item.id}-${rotation}`,
          itemId: item.id,
          x: candidate.x,
          y: candidate.y,
          rotation
        }))
        .filter((candidate) => {
          const renderItem = resolvePlacedFurnitureRenderItem(candidate, item)
          return Boolean(renderItem && validateRoomV2FurniturePlacement({
            scene: emptyScene,
            candidate: renderItem
          }).isValid)
        })
        .some((placedItem) => {
          const scene = resolveRoomV2Scene({
            roomShellCatalog: [shell],
            furnitureCatalog: [item],
            decor: { roomShellId: shell.id, placedItems: [placedItem] },
            defaultRoomShellId: shell.id
          })
          const seatedFurniture = scene.renderItems.find(
            (renderItem) => renderItem.kind === "furniture"
          )
          if (!seatedFurniture) return false
          const seatedGeometry = createRoomWorldGeometryFromRoomV2Scene(scene)
          const selection = resolveRoomWorldSeatSelection({
            geometry: seatedGeometry,
            hotspots: createRoomWorldHotspotsFromRoomV2Scene(scene),
            seatedFurnitureRenderId: seatedFurniture.renderId,
            from: { x: 0.2, y: 0.7 },
            timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
          })
          if (!selection?.hotspot.exitPoint) return false
          const exitPoint = selection.hotspot.exitPoint
          const entry = createRoomWorldSeatMovementPlan({
            geometry: seatedGeometry,
            from: { x: 0.2, y: 0.7 },
            approach: selection.approach,
            seat: { x: selection.hotspot.x, y: selection.hotspot.y },
            seatedFurnitureRenderId: seatedFurniture.renderId,
            timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
          })
          const exit = [
            selection.approach,
            { x: 0.2, y: 0.7 },
            { x: 0.8, y: 0.7 },
            { x: 0.5, y: 0.86 }
          ].some((target) => Boolean(createRoomWorldSeatExitMovementPlan({
            geometry: seatedGeometry,
            from: { x: selection.hotspot.x, y: selection.hotspot.y },
            exit: exitPoint,
            target,
            seatedFurnitureRenderId: seatedFurniture.renderId,
            timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
          })))
          return Boolean(entry && exit)
        })
      assert.ok(hasCompleteSeatRoute, `${item.id}:${rotation} needs a complete seat route`)
    }
  }
})

test("every floor SKU fits a three-piece room in each supported rotation and leaves an avatar route", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const catalog = [...ROOM_V2_FURNITURE_CATALOG, ...furniture]
  const shell = ROOM_V2_SHELL_CATALOG.find((candidate) => candidate.id === DEFAULT_ROOM_V2_SHELL_ID)
  assert.ok(shell)
  const fallbackCompanionIds = [
    "universal_petal_side_table_a",
    "universal_orbit_floor_lamp_a",
    "universal_rug_a"
  ]

  const getValidPlacements = (
    item: typeof furniture[number],
    rotation: "front" | "back" | "left" | "right",
    placedItems: {
      instanceId: string
      itemId: string
      x: number
      y: number
      rotation: "front" | "back" | "left" | "right"
    }[]
  ) => {
    const scene = resolveRoomV2Scene({
      roomShellCatalog: [shell],
      furnitureCatalog: catalog,
      decor: { roomShellId: shell.id, placedItems },
      defaultRoomShellId: shell.id
    })
    return getRoomV2DraftPlacementCandidates(item, scene)
      .map((candidate) => ({
        instanceId: `multi-${item.id}-${placedItems.length}`,
        itemId: item.id,
        x: candidate.x,
        y: candidate.y,
        rotation
      }))
      .filter((candidate) => {
        const renderItem = resolvePlacedFurnitureRenderItem(candidate, item)
        return Boolean(renderItem && validateRoomV2FurniturePlacement({
          scene,
          candidate: renderItem
        }).isValid)
      })
  }

  for (const item of furniture.filter((candidate) => candidate.placementSurface === "floor")) {
    const companions = fallbackCompanionIds
      .filter((id) => id !== item.id)
      .map((id) => furniture.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is typeof furniture[number] => Boolean(candidate))
      .slice(0, 2)
    assert.equal(companions.length, 2)

    const rotations = item.assetsByRotation
      ? (["front", "back", "left", "right"] as const)
      : (["front"] as const)
    for (const rotation of rotations) {
      const hasAcceptedThreePieceLayout = getValidPlacements(item, rotation, []).some(
        (targetPlacement) => getValidPlacements(
        companions[0],
        "front",
        [targetPlacement]
      ).some((firstCompanionPlacement) => getValidPlacements(
        companions[1],
        "front",
        [targetPlacement, firstCompanionPlacement]
      ).some((secondCompanionPlacement) => {
        const placedItems = [targetPlacement, firstCompanionPlacement, secondCompanionPlacement]
        const scene = resolveRoomV2Scene({
          roomShellCatalog: [shell],
          furnitureCatalog: catalog,
          decor: { roomShellId: shell.id, placedItems },
          defaultRoomShellId: shell.id
        })
        const validation = validateRoomV2DraftPlacements({
          scene,
          decor: { roomShellId: shell.id, placedItems },
          furnitureCatalog: catalog
        })
        if (!validation.isValid) return false
        return Boolean(createRoomWorldMovementPlan({
          geometry: createRoomWorldGeometryFromRoomV2Scene(scene),
          from: { x: 0.2, y: 0.7 },
          to: { x: 0.8, y: 0.62 },
          timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
        }))
      }))
      )
      assert.ok(
        hasAcceptedThreePieceLayout,
        `${item.id}:${rotation} needs a clear three-piece layout`
      )
    }
  }
})

test("every wall, ceiling, and tabletop SKU resolves a legal surface placement", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const shell = ROOM_V2_SHELL_CATALOG.find((candidate) => candidate.id === DEFAULT_ROOM_V2_SHELL_ID)
  assert.ok(shell)
  const supports = furniture.filter((item) => item.surfaceSupports?.some(
    (support) => support.surface === "tabletop"
  ))

  for (const item of furniture.filter((candidate) => candidate.placementSurface !== "floor")) {
    const rotations = item.assetsByRotation
      ? (["front", "back", "left", "right"] as const)
      : (["front"] as const)

    for (const rotation of rotations) {
      const hasLegalPlacement = item.placementSurface === "tabletop"
        ? supports.some((support) => {
          const supportPlacement = {
            instanceId: `${support.id}-support`,
            itemId: support.id,
            x: 0.5,
            y: 0.76,
            rotation: "front" as const
          }
          const supportScene = resolveRoomV2Scene({
            roomShellCatalog: [shell],
            furnitureCatalog: [support, item],
            decor: { roomShellId: shell.id, placedItems: [supportPlacement] },
            defaultRoomShellId: shell.id
          })
          return getRoomV2DraftPlacementCandidates(item, supportScene).some((candidate) => {
            const placedItem = {
              instanceId: `${item.id}-${rotation}`,
              itemId: item.id,
              x: candidate.x,
              y: candidate.y,
              rotation
            }
            const renderItem = resolvePlacedFurnitureRenderItem(placedItem, item)
            return Boolean(renderItem && validateRoomV2FurniturePlacement({
              scene: supportScene,
              candidate: renderItem
            }).isValid)
          })
        })
        : (() => {
          const emptyScene = resolveRoomV2Scene({
            roomShellCatalog: [shell],
            furnitureCatalog: [item],
            decor: { roomShellId: shell.id, placedItems: [] },
            defaultRoomShellId: shell.id
          })
          return getRoomV2DraftPlacementCandidates(item, emptyScene).some((candidate) => {
            const placedItem = {
              instanceId: `${item.id}-${rotation}`,
              itemId: item.id,
              x: candidate.x,
              y: candidate.y,
              rotation
            }
            const renderItem = resolvePlacedFurnitureRenderItem(placedItem, item)
            return Boolean(renderItem && validateRoomV2FurniturePlacement({
              scene: emptyScene,
              candidate: renderItem
            }).isValid)
          })
        })()

      assert.ok(
        hasLegalPlacement,
        `${item.id}:${rotation} needs a legal ${item.placementSurface} placement`
      )
    }
  }
})

test("runtime placement semantics match the category contract and never downgrade floor items to front-only", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const itemById = new Map(furniture.map((item) => [item.id, item]))
  const incompleteDirectionalIds = new Set<string>(
    ROOM_V3_UNIVERSAL_CORE_RUNTIME_INCOMPLETE_DIRECTIONAL_IDS
  )

  assert.equal(itemById.get("universal_small_speaker_a")?.placementSurface, "floor")
  assert.equal(itemById.get("universal_small_speaker_a")?.layer, "furniture")
  assert.ok(itemById.get("universal_small_speaker_a")?.assetsByRotation)
  assert.equal(itemById.get("universal_cushion_set_a")?.placementSurface, "floor")
  assert.equal(itemById.get("universal_cushion_set_a")?.layer, "furniture")
  assert.equal(itemById.get("universal_soft_floor_cushion_a")?.interactionType, "decor")
  assert.equal(itemById.get("universal_soft_floor_cushion_a")?.seatSpec, undefined)

  for (const [id, surface, layer] of [
    ["universal_wall_clock_a", "wall", "wall"],
    ["universal_wall_artwork_a", "wall", "wall"],
    ["universal_ceiling_light_a", "ceiling", "wall"],
    ["universal_table_lamp_a", "tabletop", "furniture"],
    ["universal_small_tabletop_plant_a", "tabletop", "furniture"],
    ["universal_ceramic_vase_set_a", "tabletop", "furniture"],
    ["universal_books_magazine_stack_a", "tabletop", "furniture"],
    ["universal_tea_coffee_tray_a", "tabletop", "furniture"]
  ] as const) {
    const item = itemById.get(id)
    assert.ok(item)
    assert.equal(item.placementSurface, surface)
    assert.equal(item.layer, layer)
  }

  for (const id of [
    "universal_petal_side_table_a",
    "universal_tidy_work_desk_a",
    "universal_arc_coffee_table_b",
    "universal_small_speaker_a",
    "universal_cushion_set_a"
  ]) {
    const categoryId = ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID[
      id as keyof typeof ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID
    ]
    assert.ok(categoryId)
    const category = categoryById.get(categoryId)
    assert.ok(category)
    assert.equal(category.placementSurface, "floor")
    assert.equal(category.placementRule, "free_floor")
  }

  for (const category of ROOM_V3_FURNITURE_CATEGORIES) {
    const candidateId = Object.entries(ROOM_V3_UNIVERSAL_CORE_CATEGORY_BY_CANDIDATE_ID)
      .find(([, categoryId]) => categoryId === category.id)?.[0]
    if (!candidateId) throw new Error(`missing candidate mapping for ${category.id}`)
    const item = itemById.get(candidateId)

    if (incompleteDirectionalIds.has(candidateId)) {
      assert.equal(item, undefined)
      continue
    }

    assert.ok(item)
    assert.equal(item.placementSurface, category.placementSurface)
    if (category.requiresDirectionalAssets) {
      assert.deepEqual(Object.keys(item.assetsByRotation ?? {}).sort(), [
        "back",
        "front",
        "left",
        "right"
      ])
    } else {
      assert.equal(item.assetsByRotation, undefined)
    }
  }
})

test("custom surface semantics stay conservative for every Universal Core item", () => {
  const furniture = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const tabletop = furniture.filter((item) => item.placementSurface === "tabletop")
  const wall = furniture.filter((item) => item.placementSurface === "wall")
  const ceiling = furniture.filter((item) => item.placementSurface === "ceiling")
  const supports = furniture.filter((item) => item.surfaceSupports?.length)

  assert.ok(tabletop.length >= 6)
  assert.ok(tabletop.every((item) => (
    item.layer === "furniture" &&
    item.interactionType === "decor" &&
    item.blocksMovement === false
  )))
  assert.ok(wall.length >= 4)
  assert.ok(wall.every((item) => item.layer === "wall" && item.interactionType === "decor"))
  assert.ok(ceiling.length >= 1)
  assert.ok(ceiling.every((item) => item.layer === "wall" && item.interactionType === "decor"))
  assert.equal(
    furniture.find((item) => item.id === "universal_wall_clock_a")?.surfacePlacementPolicy,
    "avoid_openings"
  )
  assert.equal(
    furniture.find((item) => item.id === "universal_curtain_set_a")?.surfacePlacementPolicy,
    "opening"
  )
  assert.ok(supports.length >= 5)
  assert.ok(supports.every((item) => (
    item.placementSurface === "floor" &&
    item.surfaceSupports?.every((support) => (
      support.localBounds.minX >= 0 &&
      support.localBounds.maxX <= 1 &&
      support.localBounds.minY >= 0 &&
      support.localBounds.maxY <= 1
    )) === true
  )))
})

test("runtime factory returns independent furniture and asset metadata copies", () => {
  const first = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const second = createRoomV3UniversalCoreRuntimeFurniture(createTrustedRegistry())
  const firstDirectional = first.find((item) => item.assetsByRotation && item.seatSpec)
  const secondDirectional = second.find((item) => item.assetsByRotation && item.seatSpec)

  if (
    !firstDirectional ||
    !secondDirectional ||
    !firstDirectional.seatSpec ||
    !secondDirectional.seatSpec ||
    !firstDirectional.assetsByRotation ||
    !secondDirectional.assetsByRotation
  ) {
    throw new Error("expected a directional seat item")
  }
  const firstAssets = firstDirectional.assetsByRotation
  const secondAssets = secondDirectional.assetsByRotation
  if (!firstAssets.front || !secondAssets.front) {
    throw new Error("expected front directional assets")
  }
  firstAssets.front.key = "mutated"
  firstDirectional.seatSpec.seatPoints.push({
    id: "test",
    x: 0,
    y: 0,
    seatHeight: 0,
    approachPoint: { x: 0, y: 0 },
    exitPoint: { x: 0, y: 0 }
  })

  assert.notEqual(firstAssets.front.key, secondAssets.front.key)
  assert.notEqual(
    firstDirectional.seatSpec.seatPoints.length,
    secondDirectional.seatSpec.seatPoints.length
  )
})
