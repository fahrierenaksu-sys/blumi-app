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
  resolveRoomV3QaFurnitureCatalogRuntime
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3QaFurnitureCatalogRuntime") as typeof import("./roomV3QaFurnitureCatalogRuntime")
const {
  createRoomV3UniversalCoreQaArtifactRegistry
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaCatalog") as typeof import("./roomV3UniversalCoreQaCatalog")
const {
  createRoomV3Focus12QaArtifactRegistry
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3Focus12QaCatalog") as typeof import("./roomV3Focus12QaCatalog")
const {
  ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreRuntimeFurniture") as typeof import("./roomV3UniversalCoreRuntimeFurniture")
const {
  ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3Focus12CandidateIds") as typeof import("./roomV3Focus12CandidateIds")
const {
  resolveRoomV3UniversalCoreQaRuntimeScene
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV3UniversalCoreQaRuntimeEvidence") as typeof import("./roomV3UniversalCoreQaRuntimeEvidence")

const enabledInput = () => ({
  isDevelopmentRuntime: true,
  buildProfile: "development",
  rawUniversalCoreQaFlag: undefined,
  rawFocus12QaFlag: undefined,
  universalCoreArtifactRegistry: createRoomV3UniversalCoreQaArtifactRegistry(),
  focus12ArtifactRegistry: createRoomV3Focus12QaArtifactRegistry()
})

test("QA furniture runtime stays disabled and empty until an explicit QA flag is enabled", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime(enabledInput())

  assert.equal(result.enabled, false)
  assert.equal(result.reason, "disabled")
  assert.equal(result.mode, "disabled")
  assert.deepEqual(result.catalog, [])
  assert.deepEqual(result.ownedItemIds, [])
})

test("Universal Core QA flag resolves the trusted 45-item catalog with isolated QA ownership", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime({
    ...enabledInput(),
    rawUniversalCoreQaFlag: "1"
  })

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.equal(result.mode, "universal_core")
  assert.deepEqual(result.catalog.map((item) => item.id), ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)
  assert.deepEqual(result.ownedItemIds, ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)
  assert.ok(result.catalog.every((item) => (
    item.sourceStatus === "candidate" &&
    item.qaStatus === "blocked" &&
    item.ownedByDefault === true &&
    item.locked === false
  )))
})

test("Focus12 QA flag composes the trusted 45-item Universal Core and three Focus12 candidates into 48 unique items", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime({
    ...enabledInput(),
    rawFocus12QaFlag: "1"
  })
  const expectedItemIds = [
    ...ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS,
    ...ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS
  ]

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.equal(result.mode, "focus12_plus_universal_core")
  assert.equal(result.catalog.length, 48)
  assert.equal(new Set(result.catalog.map((item) => item.id)).size, 48)
  assert.deepEqual(result.catalog.map((item) => item.id), expectedItemIds)
  assert.deepEqual(result.ownedItemIds, expectedItemIds)
  assert.ok(result.catalog.slice(0, 45).every((item) => item.ownedByDefault && !item.locked))
  assert.ok(result.catalog.slice(45).every((item) => !item.ownedByDefault && item.locked))
})

test("Focus12-only furniture uses the same avatar-calibrated scale and true contact base as the other 45 products", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime({
    ...enabledInput(),
    rawFocus12QaFlag: "1"
  })
  const sectional = result.catalog.find((item) => item.id === "universal_cloud_sectional_sofa_a")
  const tvUnit = result.catalog.find((item) => item.id === "universal_cozy_tv_media_unit_a")
  const arcade = result.catalog.find((item) => item.id === "universal_home_arcade_a")

  assert.ok(sectional)
  assert.ok(sectional.width > 0.45)
  assert.ok(sectional.footprint)
  assert.ok(sectional.placementFootprint)

  assert.ok(tvUnit)
  assert.ok(tvUnit.width > 0.3)
  assert.ok(tvUnit.footprint)
  assert.ok(tvUnit.placementFootprint)

  assert.ok(arcade)
  assert.ok(arcade.width < tvUnit.width)
  assert.ok(arcade.height > tvUnit.height)
  assert.ok(arcade.footprint)
  assert.ok(arcade.placementFootprint)
})

test("the Focus12 sectional shares the long-sofa scale family instead of becoming a giant mobile prop", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime({
    ...enabledInput(),
    rawFocus12QaFlag: "1"
  })
  const sectional = result.catalog.find((item) => item.id === "universal_cloud_sectional_sofa_a")
  const longSofa = result.catalog.find((item) => item.id === "universal_long_sofa_a")
  const tvUnit = result.catalog.find((item) => item.id === "universal_cozy_tv_media_unit_a")
  const arcade = result.catalog.find((item) => item.id === "universal_home_arcade_a")

  assert.ok(sectional && longSofa && tvUnit && arcade)
  assert.ok(sectional.width > longSofa.width)
  assert.ok(sectional.width <= longSofa.width * 1.25)
  assert.ok(tvUnit.height < sectional.height)
  assert.ok(arcade.width < tvUnit.width)
  assert.ok(arcade.height > tvUnit.height)
})

test("each of the 48 QA products has a legal orientation-specific placement and a calibrated contact base", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime({
    ...enabledInput(),
    rawFocus12QaFlag: "1"
  })

  assert.equal(result.catalog.length, 48)
  for (const item of result.catalog) {
    const rotations = item.assetsByRotation
      ? (["front", "back", "left", "right"] as const)
      : (["front"] as const)

    if (item.placementSurface === "floor" && item.blocksMovement) {
      assert.ok(item.placementFootprint, `${item.id} needs a true contact base`)
      for (const rotation of rotations) {
        assert.ok(
          item.placementFootprintByRotation?.[rotation] ?? item.placementFootprint,
          `${item.id}:${rotation} needs a placement base`
        )
      }
    }

    for (const rotation of rotations) {
      const resolution = resolveRoomV3UniversalCoreQaRuntimeScene({
        item,
        rotation,
        qaFurnitureCatalog: result.catalog
      })
      assert.equal(resolution.isValid, true, `${item.id}:${rotation} should place legally`)
    }
  }
})

test("Focus12 takes precedence over Universal Core and requires both trusted QA registries", () => {
  const invalidUniversalRegistry = {
    ...createRoomV3UniversalCoreQaArtifactRegistry(),
    verifiedCandidateIds: []
  }
  const invalidFocus12Registry = {
    ...createRoomV3Focus12QaArtifactRegistry(),
    verifiedCandidateIds: []
  }

  for (const input of [
    {
      ...enabledInput(),
      rawUniversalCoreQaFlag: "1",
      rawFocus12QaFlag: "1",
      universalCoreArtifactRegistry: invalidUniversalRegistry
    },
    {
      ...enabledInput(),
      rawFocus12QaFlag: "1",
      focus12ArtifactRegistry: invalidFocus12Registry
    }
  ]) {
    const result = resolveRoomV3QaFurnitureCatalogRuntime(input)
    assert.equal(result.enabled, false)
    assert.equal(result.reason, "untrusted_registry")
    assert.equal(result.mode, "disabled")
    assert.deepEqual(result.catalog, [])
    assert.deepEqual(result.ownedItemIds, [])
  }
})

test("QA furniture runtime fails closed outside an explicit development runtime", () => {
  for (const input of [
    {
      ...enabledInput(),
      isDevelopmentRuntime: false,
      rawFocus12QaFlag: "1"
    },
    {
      ...enabledInput(),
      buildProfile: "production",
      rawFocus12QaFlag: "1"
    }
  ]) {
    const result = resolveRoomV3QaFurnitureCatalogRuntime(input)
    assert.equal(result.enabled, false)
    assert.equal(result.reason, "disabled")
    assert.deepEqual(result.catalog, [])
    assert.deepEqual(result.ownedItemIds, [])
  }
})

test("native UI test profile exposes only the explicitly flagged trusted 45-item QA catalog", () => {
  const result = resolveRoomV3QaFurnitureCatalogRuntime({
    ...enabledInput(),
    isDevelopmentRuntime: false,
    buildProfile: "native-ui-test",
    rawUniversalCoreQaFlag: "1"
  })

  assert.equal(result.enabled, true)
  assert.equal(result.reason, "ready")
  assert.equal(result.mode, "universal_core")
  assert.deepEqual(result.catalog.map((item) => item.id), ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS)
})

test("QA furniture runtime returns fresh catalog and ownership copies", () => {
  const input = {
    ...enabledInput(),
    rawFocus12QaFlag: "1"
  }
  const first = resolveRoomV3QaFurnitureCatalogRuntime(input)
  const second = resolveRoomV3QaFurnitureCatalogRuntime(input)

  assert.notEqual(first.catalog, second.catalog)
  assert.notEqual(first.catalog[0], second.catalog[0])
  assert.notEqual(first.ownedItemIds, second.ownedItemIds)
  first.catalog[0]!.name = "mutated QA item"
  first.ownedItemIds.pop()
  assert.notEqual(first.catalog[0]!.name, second.catalog[0]!.name)
  assert.equal(second.ownedItemIds.length, 48)
})
