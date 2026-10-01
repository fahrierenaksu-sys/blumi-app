import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

// The focused TypeScript test runner emits JS to a temporary directory while
// the React Native asset files remain in the source tree. Resolve those image
// requests back to the checked-in assets before Node applies the extension
// stubs above.
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
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2Catalog") as typeof import("./roomV2Catalog")
const {
  roomV2ProductionAssets
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2ProductionAssets") as typeof import("./roomV2ProductionAssets")

function getFurnitureItem(itemId: string) {
  const item = ROOM_V2_FURNITURE_CATALOG.find((candidate) => candidate.id === itemId)
  assert.ok(item, `missing active Room V2 furniture item: ${itemId}`)
  return item
}

function collectAssetSources(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return []
  }

  if ("source" in input && typeof (input as { source?: unknown }).source === "string") {
    return [(input as { source: string }).source]
  }

  return Object.values(input).flatMap((value) => collectAssetSources(value))
}

test("default My Room shell keeps the approved wide framing instead of the cropped legacy zoom", () => {
  const shell = ROOM_V2_SHELL_CATALOG.find(
    (candidate) => candidate.id === "room_v2_shell_blumi_world_v1"
  )
  assert.ok(shell)
  assert.equal(shell.myRoomCamera?.compactRendererWidth, "155%")
  assert.equal(shell.myRoomCamera?.regularRendererWidth, "154%")
  assert.equal(shell.myRoomCamera?.rendererTranslateY, 0)
  assert.equal(shell.myRoomCamera?.compactStageHeightRatio, 0.64)
  assert.equal(shell.myRoomCamera?.wideStageHeightRatio, 0.64)
})

test("runtime assets do not bundle the blocked historical shell draft", () => {
  assert.equal("mintGardenMasterDraft" in roomV2ProductionAssets.shells, false)
  assert.equal(
    Object.keys(roomV2ProductionAssets.furniture).some((key) => key.startsWith("roomVNext")),
    false
  )
  assert.equal(
    collectAssetSources(roomV2ProductionAssets).some((source) =>
      source.includes("/assets/runtime/room-vnext/")
    ),
    false
  )
})

test("active Room V2 seating declares complete seatSpec routing metadata", () => {
  const chair = getFurnitureItem("room_v2_chair_blush")
  const bed = getFurnitureItem("room_v2_cozy_bed")

  assert.equal(bed.sceneProjection, "floor_plane")
  assert.deepEqual(bed.renderSizeByRotation?.front, {
    width: 0.294,
    height: 0.196
  })
  assert.deepEqual(bed.anchorByRotation?.right, { x: 0.5, y: 1 })

  assert.deepEqual(chair.seatSpec, {
    capacity: 1,
    seatPoints: [{
      id: "front_edge",
      x: 0,
      y: -0.2,
      facing: "front",
      approachPoint: { x: 0, y: 0.22 },
      exitPoint: { x: 0, y: 0.28 },
      seatHeight: 0.096
    }]
  })
  assert.deepEqual(bed.seatSpec, {
    capacity: 1,
    seatPoints: [{
      id: "left_edge",
      x: -0.18,
      y: -0.36,
      facing: "left",
      approachPoint: { x: -0.18, y: 0.36 },
      exitPoint: { x: -0.18, y: 0.44 },
      localPositionCm: { x: -60, y: 20 },
      approachPointCm: { x: -115, y: 20 },
      exitPointCm: { x: -130, y: 20 },
      seatHeight: 0.08
    }]
  })

  for (const item of [chair, bed]) {
    assert.equal(item.interactionType, "seat")
    assert.ok(item.seatSpec)
    assert.equal(item.seatSpec.capacity, item.seatSpec.seatPoints.length)
    for (const seat of item.seatSpec.seatPoints) {
      assert.ok(seat.approachPoint)
      assert.ok(seat.exitPoint)
      assert.equal(typeof seat.seatHeight, "number")
    }
  }
})

test("the starter bed's seat is reachable at its rendered size in every rotation, with unchanged art", () => {
  // Loaded after the asset hooks above, like the catalog itself.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const { resolveRoomV2Scene } = require("./roomV2Selectors") as typeof import("./roomV2Selectors")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const projection = require("../roomWorld/roomWorldRoomV2Projection") as
    typeof import("../roomWorld/roomWorldRoomV2Projection")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const runtime = require("../roomWorld/roomWorldRuntime") as typeof import("../roomWorld/roomWorldRuntime")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const geometryModule = require("../roomWorld/roomWorldGeometry") as typeof import("../roomWorld/roomWorldGeometry")
  const bed = getFurnitureItem("room_v2_cozy_bed")
  for (const rotation of ["front", "right", "back", "left"] as const) {
    const scene = resolveRoomV2Scene({ roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
      decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [
        { instanceId: "starter-room-bed", itemId: "room_v2_cozy_bed", x: 0.52, y: 0.7, rotation }] },
      defaultRoomShellId: "room_v2_shell_blumi_world_v1" })
    const item = scene.renderItems.find((entry) => entry.kind === "furniture")
    // The art keeps rendering at the visual contract's size; only seat routes moved.
    assert.equal(item?.width, bed.visualContract?.directions[rotation]?.normalizedRenderSize.width)
    const geometry = projection.createRoomWorldGeometryFromRoomV2Scene(scene)
    const [seat] = projection.createRoomWorldHotspotsFromRoomV2Scene(scene)
    assert.ok(seat?.approachPoint && seat.exitPoint && seat.sourceRenderId, rotation)
    const floor = geometry.walkableAreas[0]!.points
    assert.ok(geometryModule.pointInRoomWorldPolygon(seat, floor), `${rotation}: seat on the floor`)
    for (const point of [seat.approachPoint, seat.exitPoint]) {
      assert.ok(geometryModule.isRoomWorldPointWalkable(geometry, point,
        { clearance: runtime.ROOM_WORLD_AVATAR_COLLISION_CLEARANCE }), `${rotation}: approach and exit walkable`)
    }
    assert.ok(runtime.createRoomWorldSeatMovementPlan({ geometry, from: { x: 0.5, y: 0.85 }, approach: seat.approachPoint,
      seat, seatedFurnitureRenderId: seat.sourceRenderId, clearance: runtime.ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: runtime.ROOM_WORLD_MINI_ROOM_MOVEMENT_TIMING }), `${rotation}: MiniRoom can plan sitting on the bed`)
  }
})

test("active Room V2 blush lounge chair carries a front-seat occlusion crop", () => {
  const chair = getFurnitureItem("room_v2_chair_blush")

  assert.deepEqual(chair.frontOcclusionByRotation, {
    front: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
    back: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
    left: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 },
    right: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 }
  })
})

test("active Room V2 bookshelf is placed on the wall surface", () => {
  const bookshelf = getFurnitureItem("room_v2_cute_bookshelf")
  assert.equal(bookshelf.placementSurface, "wall")
  assert.equal(bookshelf.layer, "wall")
  assert.equal(bookshelf.blocksMovement, false)
  assert.equal(bookshelf.footprint, undefined)
})

test("active Room V2 tables expose their tabletop support bounds", () => {
  for (const itemId of ["room_v2_table_round", "room_v2_side_table"]) {
    const item = getFurnitureItem(itemId)
    assert.deepEqual(item.surfaceSupports, [{
      surface: "tabletop",
      localBounds: { minX: 0.12, maxX: 0.88, minY: 0.18, maxY: 0.28 }
    }])
  }
})

test("active Room V2 production catalog stays at the seven legacy pieces", () => {
  assert.equal(ROOM_V2_FURNITURE_CATALOG.length, 7)
})
