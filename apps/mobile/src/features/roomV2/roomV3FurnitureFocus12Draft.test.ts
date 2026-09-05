import assert from "node:assert/strict"
import test from "node:test"
import {
  createFocus12ArcadeDraft,
  createFocus12SectionalDraft,
  createFocus12TvMediaUnitDraft,
  FOCUS_12_FURNITURE_IDS
} from "./roomV3FurnitureFocus12Draft"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && request.endsWith(".png")) {
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
    return require("node:path").resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  createRoomV3UniversalCoreRuntimeFurniture
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")
const {
  createRoomV3UniversalCoreQaArtifactRegistry
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaCatalog") as typeof import("./roomV3UniversalCoreQaCatalog")

const ASSETS = {
  front: { key: "front", source: 1 },
  back: { key: "back", source: 2 },
  left: { key: "left", source: 3 },
  right: { key: "right", source: 4 }
}

test("Focus 12 preserves the exact furniture-first product selection", () => {
  assert.deepEqual(FOCUS_12_FURNITURE_IDS, [
    "universal_cloud_sectional_sofa_a",
    "universal_long_sofa_a",
    "universal_cloud_loveseat_a",
    "universal_lounge_armchair_a",
    "universal_dining_chair_a",
    "universal_desk_chair_a",
    "universal_round_dining_table_a",
    "universal_tidy_work_desk_a",
    "universal_arc_coffee_table_b",
    "universal_petal_side_table_a",
    "universal_cozy_tv_media_unit_a",
    "universal_home_arcade_a"
  ])
})

test("new Focus 12 furniture drafts are floor-only, directional and remain QA candidates", () => {
  const sectional = createFocus12SectionalDraft(ASSETS)
  const tv = createFocus12TvMediaUnitDraft(ASSETS)
  const arcade = createFocus12ArcadeDraft(ASSETS)

  for (const item of [sectional, tv, arcade]) {
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(Object.keys(item.assetsByRotation ?? {}).sort(), [
      "back",
      "front",
      "left",
      "right"
    ])
    assert.equal(item.blocksMovement, true)
    assert.equal(item.sourceStatus, "candidate")
  }

  assert.equal(sectional.interactionType, "decor")
  assert.equal(sectional.seatSpec, undefined)
  assert.equal(sectional.frontOcclusionByRotation, undefined)
  assert.deepEqual(sectional.footprintByRotation, {
    front: { width: 0.22, height: 0.13 },
    back: { width: 0.22, height: 0.13 },
    left: { width: 0.13, height: 0.22 },
    right: { width: 0.13, height: 0.22 }
  })
  assert.equal(sectional.width, 0.38)
  assert.equal(sectional.height, 0.24)
  assert.equal(sectional.qaStatus, "pending")
  assert.equal(tv.interactionType, "decor")
  assert.equal(tv.width, 0.3)
  assert.equal(tv.height, 0.26)
  assert.deepEqual(tv.footprintByRotation, {
    front: { width: 0.23, height: 0.085 },
    back: { width: 0.23, height: 0.085 },
    left: { width: 0.085, height: 0.23 },
    right: { width: 0.085, height: 0.23 }
  })
  assert.equal(tv.qaStatus, "pending")
  assert.equal(arcade.interactionType, "decor")
  assert.equal(arcade.width, 0.13)
  assert.equal(arcade.height, 0.29)
  assert.deepEqual(arcade.footprintByRotation, {
    front: { width: 0.09, height: 0.075 },
    back: { width: 0.09, height: 0.075 },
    left: { width: 0.075, height: 0.09 },
    right: { width: 0.075, height: 0.09 }
  })
  assert.equal(arcade.qaStatus, "pending")
})

test("Focus 12 draft factories do not retain caller-owned directional asset refs", () => {
  const sectional = createFocus12SectionalDraft(ASSETS)
  const secondSectional = createFocus12SectionalDraft(ASSETS)

  sectional.asset.key = "mutated-asset"
  sectional.assetsByRotation!.left!.key = "mutated-left"

  assert.equal(ASSETS.front.key, "front")
  assert.equal(ASSETS.left.key, "left")
  assert.equal(secondSectional.asset.key, "front")
  assert.equal(secondSectional.assetsByRotation!.left!.key, "left")
})

test("the nine established Focus 12 products retain four-direction, floor and collision contracts", () => {
  const runtimeFurnitureById = new Map(
    createRoomV3UniversalCoreRuntimeFurniture(
      createRoomV3UniversalCoreQaArtifactRegistry()
    ).map((item) => [item.id, item])
  )
  const newCandidateIds = new Set([
    "universal_cloud_sectional_sofa_a",
    "universal_cozy_tv_media_unit_a",
    "universal_home_arcade_a"
  ])
  const establishedIds = FOCUS_12_FURNITURE_IDS.filter((id) => !newCandidateIds.has(id))

  assert.equal(establishedIds.length, 9)
  for (const id of establishedIds) {
    const item = runtimeFurnitureById.get(id)
    assert.ok(item, `${id} must remain in the trusted Universal Core runtime wave`)
    assert.equal(item.placementSurface, "floor")
    assert.equal(item.blocksMovement, true)
    assert.equal(item.rotationPolicy, "directional_assets_required")
    assert.deepEqual(Object.keys(item.assetsByRotation ?? {}).sort(), [
      "back",
      "front",
      "left",
      "right"
    ])
    assert.ok(item.footprintByRotation, `${id} must retain rotation-aware collision data`)
  }
})
