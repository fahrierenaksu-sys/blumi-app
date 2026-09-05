import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

const assetExtension = (module: NodeModule, filename: string) => {
  module.exports = filename
}
require.extensions[".png"] = assetExtension
require.extensions[".webp"] = assetExtension
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
  ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS,
  createRoomV3Focus12QaArtifactRegistry,
  resolveRoomV3Focus12QaCatalog
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3Focus12QaCatalog") as typeof import("./roomV3Focus12QaCatalog")
const {
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  validateRoomV2DraftPlacements
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2Selectors") as typeof import("./roomV2Selectors")
const {
  createRoomWorldGeometryFromRoomV2Scene
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomWorld/roomWorldRoomV2Projection") as typeof import("../roomWorld/roomWorldRoomV2Projection")
const {
  getRoomWorldMotionReadinessSummary
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../roomWorld/roomWorldDiagnostics") as typeof import("../roomWorld/roomWorldDiagnostics")
const {
  getRoomV2DraftPlacementCandidates
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2DraftPlacementCandidates") as typeof import("./roomV2DraftPlacementCandidates")
const {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_SHELL_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2.mock") as typeof import("./roomV2.mock")

const EXPECTED_DIRECTIONAL_ASSET_KEYS = {
  universal_cloud_sectional_sofa_a: {
    front: "universal_cloud_sectional_sofa_a_front_candidate_v1.png",
    back: "universal_cloud_sectional_sofa_a_back_candidate_v1.png",
    left: "universal_cloud_sectional_sofa_a_left_candidate_v1.png",
    right: "universal_cloud_sectional_sofa_a_right_candidate_v1.png"
  },
  universal_cozy_tv_media_unit_a: {
    front: "universal_cozy_tv_media_unit_a_front_candidate_v1.png",
    back: "universal_cozy_tv_media_unit_a_back_candidate_v1.png",
    left: "universal_cozy_tv_media_unit_a_left_candidate_v2.png",
    right: "universal_cozy_tv_media_unit_a_right_candidate_v1.png"
  },
  universal_home_arcade_a: {
    front: "universal_home_arcade_a_front_candidate_v1.png",
    back: "universal_home_arcade_a_back_candidate_v1.png",
    left: "universal_home_arcade_a_left_candidate_v1.png",
    right: "universal_home_arcade_a_right_candidate_v2.png"
  }
} as const

const enabledInput = () => ({
  isDevelopmentRuntime: true,
  buildProfile: "development",
  rawFocus12QaFlag: "1",
  artifactRegistry: createRoomV3Focus12QaArtifactRegistry()
})

test("Focus12 QA catalog is development-only and explicitly opt-in", () => {
  const production = resolveRoomV3Focus12QaCatalog({
    ...enabledInput(),
    isDevelopmentRuntime: false
  })
  const releaseProfile = resolveRoomV3Focus12QaCatalog({
    ...enabledInput(),
    buildProfile: "production"
  })
  const missingFlag = resolveRoomV3Focus12QaCatalog({
    ...enabledInput(),
    rawFocus12QaFlag: undefined
  })

  for (const result of [production, releaseProfile, missingFlag]) {
    assert.equal(result.enabled, false)
    assert.equal(result.reason, "disabled")
    assert.deepEqual(result.catalog, [])
    assert.deepEqual(result.ownedItemIds, [])
  }
})

test("Focus12 QA catalog exposes only blocked candidate drafts with isolated QA ownership", () => {
  const result = resolveRoomV3Focus12QaCatalog(enabledInput())

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.deepEqual(result.catalog.map((item) => item.id), ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS)
  assert.deepEqual(result.ownedItemIds, ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS)
  assert.ok(result.catalog.every((item) => (
    item.sourceStatus === "candidate" &&
    item.qaStatus === "blocked" &&
    item.locked === true &&
    item.ownedByDefault === false
  )))
  assert.ok(result.catalog.every((item) => (
    Object.keys(item.assetsByRotation ?? {}).sort().join(",") === "back,front,left,right"
  )))
})

test("Focus12 QA catalog accepts the isolated native UI test profile", () => {
  const result = resolveRoomV3Focus12QaCatalog({
    ...enabledInput(),
    isDevelopmentRuntime: false,
    buildProfile: "native-ui-test"
  })

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.deepEqual(result.catalog.map((item) => item.id), ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS)
})

test("Focus12 QA catalog fails closed when the artifact registry is missing or altered", () => {
  const missing = resolveRoomV3Focus12QaCatalog({
    ...enabledInput(),
    artifactRegistry: undefined
  })
  const altered = resolveRoomV3Focus12QaCatalog({
    ...enabledInput(),
    artifactRegistry: {
      ...createRoomV3Focus12QaArtifactRegistry(),
      verifiedCandidateIds: ["universal_cloud_sectional_sofa_a"]
    }
  })

  for (const result of [missing, altered]) {
    assert.equal(result.enabled, false)
    assert.equal(result.reason, "untrusted_registry")
    assert.deepEqual(result.catalog, [])
    assert.deepEqual(result.ownedItemIds, [])
  }
})

test("Focus12 QA resolver returns fresh candidate data for each isolated session", () => {
  const first = resolveRoomV3Focus12QaCatalog(enabledInput())
  const second = resolveRoomV3Focus12QaCatalog(enabledInput())

  assert.notEqual(first.catalog[0], second.catalog[0])
  first.catalog[0]!.name = "mutated QA item"
  assert.notEqual(first.catalog[0]!.name, second.catalog[0]!.name)
})

test("Focus12 candidates resolve their real directional assets and rotation-aware footprints", () => {
  const result = resolveRoomV3Focus12QaCatalog(enabledInput())

  for (const item of result.catalog) {
    const expectedKeys =
      EXPECTED_DIRECTIONAL_ASSET_KEYS[
        item.id as keyof typeof EXPECTED_DIRECTIONAL_ASSET_KEYS
      ]
    const resolvedKeys = new Set<string>()

    for (const rotation of ["front", "back", "left", "right"] as const) {
      const renderItem = resolvePlacedFurnitureRenderItem({
        instanceId: `${item.id}:${rotation}`,
        itemId: item.id,
        x: 0.5,
        y: 0.72,
        rotation
      }, item)

      assert.ok(renderItem, `${item.id} must resolve ${rotation} without a legacy fallback`)
      assert.equal(renderItem.usesMirroredRotation, false)
      assert.equal(renderItem.asset.key, expectedKeys[rotation])
      assert.ok(
        String(renderItem.asset.source).endsWith(expectedKeys[rotation]),
        `${item.id} ${rotation} source must bind the exact static file`
      )
      assert.deepEqual(renderItem.footprint, item.footprintByRotation![rotation])
      resolvedKeys.add(renderItem.asset.key)
    }

    assert.equal(
      resolvedKeys.size,
      4,
      `${item.id} must keep four distinct directional files rather than reusing a mirrored pair`
    )
  }
})

test("Focus12 candidate footprints pass the real shell placement validator and reject a solid overlap", () => {
  const result = resolveRoomV3Focus12QaCatalog(enabledInput())
  const emptyScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: result.catalog,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [] }
  })

  const placements = result.catalog.map((item) => {
    const placement = getRoomV2DraftPlacementCandidates(item, emptyScene)
      .map((point) => ({
        instanceId: `${item.id}:front`,
        itemId: item.id,
        x: point.x,
        y: point.y,
        rotation: "front" as const
      }))
      .find((candidate) => {
        const candidateScene = resolveRoomV2Scene({
          roomShellCatalog: ROOM_V2_SHELL_CATALOG,
          furnitureCatalog: result.catalog,
          decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [candidate] }
        })
        return validateRoomV2DraftPlacements({
          scene: candidateScene,
          decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [candidate] },
          furnitureCatalog: result.catalog
        }).isValid
      })
    assert.ok(placement, `${item.id} must have at least one valid floor draft candidate`)
    return placement
  })

  for (const placedItem of placements) {
    const scene = resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      furnitureCatalog: result.catalog,
      decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [placedItem] }
    })
    const validation = validateRoomV2DraftPlacements({
      scene,
      decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [placedItem] },
      furnitureCatalog: result.catalog
    })
    assert.equal(validation.isValid, true, `${placedItem.itemId} must fit its suggested floor candidate`)
  }

  const [sectional, tv] = placements
  assert.ok(sectional)
  assert.ok(tv)
  const occupiedScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: result.catalog,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [sectional] }
  })
  const overlappingTv = { ...tv, x: sectional.x, y: sectional.y }
  const overlapValidation = validateRoomV2DraftPlacements({
    scene: occupiedScene,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [overlappingTv] },
    furnitureCatalog: result.catalog
  })

  assert.equal(overlapValidation.isValid, false)
  assert.deepEqual(overlapValidation.invalidItems[0]?.issueIds, ["overlaps_blocking_furniture"])
})

test("the three Focus12 candidates can share a valid room layout with a clear avatar path", () => {
  const result = resolveRoomV3Focus12QaCatalog(enabledInput())
  const candidatesByItem = result.catalog.map((item) =>
    getRoomV2DraftPlacementCandidates(item).map((point) => ({
      instanceId: `${item.id}:shared-layout`,
      itemId: item.id,
      x: point.x,
      y: point.y,
      rotation: "front" as const
    }))
  )
  const [sectionalCandidates, tvCandidates, arcadeCandidates] = candidatesByItem
  assert.ok(sectionalCandidates)
  assert.ok(tvCandidates)
  assert.ok(arcadeCandidates)

  let placedItems: import("./roomV2.types").PlacedRoomItem[] | null = null
  for (const sectional of sectionalCandidates) {
    for (const tv of tvCandidates) {
      for (const arcade of arcadeCandidates) {
        const candidateDecor = {
          roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
          placedItems: [sectional, tv, arcade]
        }
        const candidateScene = resolveRoomV2Scene({
          roomShellCatalog: ROOM_V2_SHELL_CATALOG,
          furnitureCatalog: result.catalog,
          decor: candidateDecor
        })
        const validation = validateRoomV2DraftPlacements({
          scene: candidateScene,
          decor: candidateDecor,
          furnitureCatalog: result.catalog
        })
        if (!validation.isValid) continue
        const readiness = getRoomWorldMotionReadinessSummary({
          geometry: createRoomWorldGeometryFromRoomV2Scene(candidateScene),
          spawn: { x: 0.47, y: 0.76 }
        })
        if (readiness.level !== "blocked") {
          placedItems = candidateDecor.placedItems
          break
        }
      }
      if (placedItems) break
    }
    if (placedItems) break
  }

  assert.ok(placedItems, "Focus12 must offer a three-item layout that preserves the avatar spawn path")

  const sharedScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    furnitureCatalog: result.catalog,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems }
  })
  const readiness = getRoomWorldMotionReadinessSummary({
    geometry: createRoomWorldGeometryFromRoomV2Scene(sharedScene),
    spawn: { x: 0.47, y: 0.76 }
  })

  assert.equal(placedItems.length, 3)
  assert.notEqual(readiness.level, "blocked")
})
