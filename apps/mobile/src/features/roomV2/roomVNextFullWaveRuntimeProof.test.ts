import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = (module, filename) => {
  module.exports = filename
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
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_SHELL_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2.mock") as typeof import("./roomV2.mock")
const {
  resolveRoomV2Scene,
  resolvePlacedFurnitureRenderItem,
  validateRoomV2DraftPlacements
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2Selectors") as typeof import("./roomV2Selectors")
const {
  resolveRoomVNextFullWaveCuteCandidateCatalog
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomVNextFullWaveCatalog") as typeof import("./roomVNextFullWaveCatalog")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { resolveRoomVNextRuntimeGate } = require("./roomVNextRuntimeGate") as typeof import("./roomVNextRuntimeGate")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { readStoredRoomV2Decor } = require("./roomV2Persistence") as typeof import("./roomV2Persistence")

const DIRECTIONS = ["front", "right", "back", "left"] as const

function resolveCute45Catalog() {
  const result = resolveRoomVNextFullWaveCuteCandidateCatalog({
    isDevelopmentRuntime: true,
    buildProfile: "development",
    rawFullWaveFlag: "1",
    rawFullWaveCuteFlag: "1"
  })
  assert.equal(result.enabled, true)
  assert.equal(result.catalog.length, 45)
  return result.catalog
}

test("cute45 runtime proof keeps all four authored directions on the same floor pivot", () => {
  const catalog = resolveCute45Catalog()
  const bed = catalog.find((item) => item.id === "universal_cloud_bed_b")
  assert.ok(bed)

  const placedItems = DIRECTIONS.map((rotation, index) => ({
    instanceId: `cute45-bed-${rotation}`,
    itemId: bed.id,
    x: 0.31 + index * 0.13,
    y: 0.74,
    rotation,
    geometryVersion: `room-furniture-vnext-${bed.visualContract?.assetVersion}`,
    placementSurface: "floor" as const
  }))
  const scene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems },
    furnitureCatalog: catalog,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  })

  assert.equal(scene.renderItems.length, 4)
  const rendered = scene.renderItems.filter((item) => item.kind === "furniture")
  assert.deepEqual(
    rendered.map((item) => item.rotation).sort(),
    [...DIRECTIONS].sort()
  )
  assert.ok(rendered.every((item) => item.contactShadowAsset && item.collisionPolygon?.length === 4))
  assert.equal(new Set(rendered.map((item) => `${item.anchor.x}:${item.anchor.y}`)).size, 1)
  assert.ok(rendered.every((item) => item.width > 0 && item.height > 0))
})

test("cute45 runtime adapter resolves every SKU in every authored direction", () => {
  const catalog = resolveCute45Catalog()

  for (const item of catalog) {
    assert.ok(item.visualContract, `${item.id} needs a vNext visual contract`)
    for (const rotation of DIRECTIONS) {
      const placed = {
        instanceId: `cute45-${item.id}-${rotation}`,
        itemId: item.id,
        x: 0.5,
        y: 0.72,
        rotation,
        placementSurface: item.visualContract!.placementSurface
      }
      const render = resolvePlacedFurnitureRenderItem(placed, item)
      assert.ok(render, `${item.id}:${rotation} must resolve to a render item`)
      assert.equal(render!.asset.key, item.visualContract!.directions[rotation].bodyAsset.key)
      assert.equal(render!.rotation, rotation)
      assert.ok(render!.width > 0 && render!.height > 0)
      assert.ok(render!.collisionPolygon && render!.collisionPolygon.length >= 3)
      assert.ok(render!.placementPolygon && render!.placementPolygon.length >= 3)
      if (item.visualContract!.placementSurface === "floor") {
        assert.ok(render!.contactShadowAsset, `${item.id}:${rotation} needs floor contact shadow`)
      }
    }
    assert.equal(
      new Set(DIRECTIONS.map((direction) => item.visualContract!.directions[direction].bodyAsset.key)).size,
      DIRECTIONS.length,
      `${item.id} must not reuse a body asset across directions`
    )
    assert.equal(
      new Set(DIRECTIONS.map((direction) => String(item.visualContract!.directions[direction].bodyAsset.source))).size,
      DIRECTIONS.length,
      `${item.id} must not mirror a body source across directions`
    )
  }
})

test("cute45 candidate gate stays closed outside QA and keeps blocked provenance in QA", () => {
  assert.deepEqual(
    resolveRoomVNextRuntimeGate({
      isDevelopmentRuntime: false,
      buildProfile: "release",
      rawFlag: "1",
      independentReviewApproved: true,
      finalUserApproval: true
    }),
    { enabled: false, mode: "disabled", reason: "disabled" }
  )

  assert.equal(
    resolveRoomVNextFullWaveCuteCandidateCatalog({
      isDevelopmentRuntime: false,
      buildProfile: "release",
      rawFullWaveFlag: "1",
      rawFullWaveCuteFlag: "1"
    }).enabled,
    false
  )

  const nativeQa = resolveRoomVNextFullWaveCuteCandidateCatalog({
    isDevelopmentRuntime: false,
    buildProfile: "native-ui-test",
    rawFullWaveFlag: "1",
    rawFullWaveCuteFlag: "1"
  })
  assert.equal(nativeQa.enabled, true)
  assert.equal(nativeQa.catalog.length, 45)

  const catalog = resolveCute45Catalog()
  assert.equal(catalog.length, 45)
  assert.ok(catalog.every((item) =>
    item.sourceStatus === "candidate" &&
    item.qaStatus === "blocked" &&
    item.locked === false &&
    item.ownedByDefault === true
  ))
  assert.ok(catalog.every((item) => item.sourceStatus !== "approved" && item.qaStatus !== "pass"))
})

test("cute45 collision gate rejects co-located blocking candidates across the full SKU set", () => {
  const catalog = resolveCute45Catalog()
  const blockingCandidates = catalog.filter((item) => item.blocksMovement)
  assert.ok(blockingCandidates.length > 0)

  for (const item of blockingCandidates) {
    const placementSurface = item.visualContract!.placementSurface
    const placedItems = [
      {
        instanceId: `cute45-collision-a-${item.id}`,
        itemId: item.id,
        x: 0.5,
        y: 0.72,
        rotation: "front" as const,
        placementSurface
      },
      {
        instanceId: `cute45-collision-b-${item.id}`,
        itemId: item.id,
        x: 0.5,
        y: 0.72,
        rotation: "front" as const,
        placementSurface
      }
    ]
    const scene = resolveRoomV2Scene({
      roomShellCatalog: ROOM_V2_SHELL_CATALOG,
      decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems },
      furnitureCatalog: catalog,
      defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
    })
    const validation = validateRoomV2DraftPlacements({
      scene,
      decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems },
      furnitureCatalog: catalog
    })
    assert.equal(validation.isValid, false, `${item.id} must reject a co-located blocker`)
    assert.ok(
      validation.invalidItems.some((invalid) => invalid.issueIds.includes("overlaps_blocking_furniture")),
      `${item.id} must report a physical collision`
    )
  }
})

test("cute45 placement proof rejects a real outside/overlap case without synthetic floor markers", () => {
  const catalog = resolveCute45Catalog()
  const bed = catalog.find((item) => item.id === "universal_cloud_bed_b")!
  const validPlaced = {
    instanceId: "cute45-valid-bed",
    itemId: bed.id,
    x: 0.5,
    y: 0.72,
    rotation: "front" as const,
    placementSurface: "floor" as const
  }
  const validScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [validPlaced] },
    furnitureCatalog: catalog,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  })
  const valid = validateRoomV2DraftPlacements({
    scene: validScene,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [validPlaced] },
    furnitureCatalog: catalog
  })
  assert.equal(valid.isValid, true)

  const overlapPlaced = [
    validPlaced,
    { ...validPlaced, instanceId: "cute45-overlap-bed", x: 0.5, y: 0.74, rotation: "right" as const }
  ]
  const overlapScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: overlapPlaced },
    furnitureCatalog: catalog,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  })
  const overlap = validateRoomV2DraftPlacements({
    scene: overlapScene,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: overlapPlaced },
    furnitureCatalog: catalog
  })
  assert.equal(overlap.isValid, false)
  assert.ok(overlap.invalidItems.some((item) => item.issueIds.includes("overlaps_blocking_furniture")))

  const outside = { ...validPlaced, instanceId: "cute45-outside-bed", x: 0.92, y: 0.72 }
  const outsideScene = resolveRoomV2Scene({
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [outside] },
    furnitureCatalog: catalog,
    defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID
  })
  const outsideResult = validateRoomV2DraftPlacements({
    scene: outsideScene,
    decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [outside] },
    furnitureCatalog: catalog
  })
  assert.equal(outsideResult.isValid, false)
  assert.ok(outsideResult.invalidItems.some((item) => item.issueIds.includes("outside_placeable_area")))
})

test("cute45 save and reopen preserve exact position, direction, geometry, and floor surface", () => {
  const catalog = resolveCute45Catalog()
  const item = catalog.find((candidate) => candidate.id === "universal_cloud_bed_b")!
  const decor = {
    schemaVersion: 3,
    geometryVersion: "room-furniture-vnext-19",
    roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
    placedItems: [{
      instanceId: "cute45-persisted-bed",
      itemId: item.id,
      x: 0.63,
      y: 0.77,
      rotation: "left" as const,
      geometryVersion: "room-furniture-vnext-19",
      placementSurface: "floor" as const
    }]
  }
  const reopened = readStoredRoomV2Decor(JSON.stringify(decor))
  assert.equal(reopened.status, "ready")
  if (reopened.status !== "ready") return
  assert.deepEqual(reopened.decor, decor)
  const render = resolvePlacedFurnitureRenderItem(reopened.decor.placedItems[0], item)
  assert.ok(render)
  assert.equal(render.rotation, "left")
  assert.equal(render.x, 0.63)
  assert.equal(render.y, 0.77)
  assert.equal(render.placementSurface, "floor")
})

test("cute45 save and reopen preserve every SKU identity, direction, and geometry contract", () => {
  const catalog = resolveCute45Catalog()
  const placedItems = catalog.map((item, index) => ({
    instanceId: `cute45-persisted-${item.id}`,
    itemId: item.id,
    x: 0.35 + (index % 5) * 0.07,
    y: 0.58 + (index % 4) * 0.06,
    rotation: DIRECTIONS[index % DIRECTIONS.length],
    geometryVersion: `room-furniture-vnext-${item.visualContract!.assetVersion}`,
    placementSurface: item.visualContract!.placementSurface
  }))
  const decor = {
    schemaVersion: 3,
    geometryVersion: "room-furniture-vnext-cute45",
    roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
    placedItems
  }

  const reopened = readStoredRoomV2Decor(JSON.stringify(decor))
  assert.equal(reopened.status, "ready")
  if (reopened.status !== "ready") return
  assert.deepEqual(reopened.decor, decor)

  for (const placed of reopened.decor.placedItems) {
    const item = catalog.find((candidate) => candidate.id === placed.itemId)
    assert.ok(item, `${placed.itemId} must remain in the candidate catalog`)
    const render = resolvePlacedFurnitureRenderItem(placed, item)
    assert.ok(render, `${placed.itemId}:${placed.rotation} must reopen to a render item`)
    assert.equal(render!.rotation, placed.rotation)
    assert.equal(render!.x, placed.x)
    assert.equal(render!.y, placed.y)
    assert.equal(render!.placementSurface, placed.placementSurface)
  }
})
