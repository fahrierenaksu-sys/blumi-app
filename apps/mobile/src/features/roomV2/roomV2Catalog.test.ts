import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
  DEFAULT_ROOM_V2_SHELL_ID,
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

test("the owner-locked room shell stays the default 1254x714 Blumi World shell", () => {
  // The fixed camera angle and shell geometry are the owner's chosen look.
  // Walkable polygons, placement areas and bands stay free to evolve.
  assert.equal(DEFAULT_ROOM_V2_SHELL_ID, "room_v2_shell_blumi_world_v1")
  const shell = ROOM_V2_SHELL_CATALOG.find((candidate) => candidate.id === DEFAULT_ROOM_V2_SHELL_ID)
  assert.ok(shell)
  assert.deepEqual(shell.canvasSize, { width: 1254, height: 714 })
  assert.equal(shell.asset, roomV2ProductionAssets.shells.blumiWorldShellV1)
  assert.equal(
    shell.asset.source,
    path.resolve(process.cwd(), "src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp")
  )
})

test("the live shell catalog holds no candidate, pending-QA or draft room_v3 shells", () => {
  assert.ok(ROOM_V2_SHELL_CATALOG.length > 0)
  for (const shell of ROOM_V2_SHELL_CATALOG) {
    assert.notEqual(shell.sourceStatus, "candidate", shell.id)
    assert.notEqual(shell.qaStatus, "pending", shell.id)
    assert.equal(shell.id.startsWith("room_v3_shell_"), false, shell.id)
  }
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
  const seats = ROOM_V2_FURNITURE_CATALOG.filter((item) => item.interactionType === "seat")
  assert.ok(seats.length > 0)
  for (const item of seats) {
    assert.ok(item.seatSpec, item.id)
    assert.equal(item.seatSpec.capacity, item.seatSpec.seatPoints.length, item.id)
    for (const seat of item.seatSpec.seatPoints) {
      assert.ok(seat.approachPoint, item.id)
      assert.ok(seat.exitPoint, item.id)
      assert.equal(typeof seat.seatHeight, "number", item.id)
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

test("every published room_v2 item and the starter bed keep resolving to one canonical catalog entry", () => {
  // Canonical IDs survive art and runtime changes: an item sold through the
  // R1 release catalog must stay resolvable in the live room catalog.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const { STARTER_ROOM_BED_ITEM_ID } = require("./roomStarterModel") as typeof import("./roomStarterModel")
  const releaseCatalog = JSON.parse(readFileSync(
    path.resolve(process.cwd(), "../../packages/domain/src/release/blumiR1ReleaseCatalog.json"),
    "utf8"
  )) as unknown
  const publishedRoomIds = new Set<string>()
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect)
    } else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (key === "itemId" && typeof entry === "string" && entry.startsWith("room_v2_")) {
          publishedRoomIds.add(entry)
        } else {
          collect(entry)
        }
      }
    }
  }
  collect(releaseCatalog)
  assert.ok(publishedRoomIds.size > 0, "the release catalog lists published room items")
  const catalogIds = new Set(ROOM_V2_FURNITURE_CATALOG.map((item) => item.id))
  assert.equal(catalogIds.size, ROOM_V2_FURNITURE_CATALOG.length, "catalog IDs are unique")
  for (const itemId of [...publishedRoomIds, STARTER_ROOM_BED_ITEM_ID]) {
    assert.ok(catalogIds.has(itemId), `${itemId} must resolve in the live room catalog`)
  }
})

