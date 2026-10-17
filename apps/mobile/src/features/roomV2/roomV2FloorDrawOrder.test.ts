import assert from "node:assert/strict"
import test from "node:test"
import type {
  FurnitureItem,
  PlacedRoomItem,
  RoomFurnitureRotation,
  RoomV2FurnitureRenderItem,
  RoomV2RenderItem,
  UserRoomDecor
} from "./roomV2.types"

/**
 * The room's painter's order and its wall rule, with the room calibration installed as the app has it: of two
 * pieces side by side the nearer is drawn over the other whatever their sizes, a small rug laid on a big one stays
 * visible, and two wall pieces never hang over each other.
 */

// The layered art loads as file names in plain Node (Metro image modules).
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
/* eslint-disable @typescript-eslint/no-require-imports -- the room seam must be in place before the room modules load */
const { createRoomAvatar25dRoomCalibration } = require("./calibration/roomAvatar25dRoomCalibration") as
  typeof import("./calibration/roomAvatar25dRoomCalibration")
const { LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS } = require("./furniture/layeredFurnitureAssets") as
  typeof import("./furniture/layeredFurnitureAssets")
const { createRoomAvatar25dFurnitureCatalog } = require("./furniture/layeredFurnitureCatalog") as
  typeof import("./furniture/layeredFurnitureCatalog")
const { roomAvatar25d: stub, installRoomAvatarSeam } = require("../avatar/roomAvatarSeam") as
  typeof import("../avatar/roomAvatarSeam")
const roomCalibration = createRoomAvatar25dRoomCalibration(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
const furnitureCatalog: FurnitureItem[] = [...createRoomAvatar25dFurnitureCatalog(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)]
installRoomAvatarSeam({ ...stub, roomCalibration, furnitureCatalog })

const {
  resolvePlacedFurnitureRenderItem,
  resolveRoomV2Scene,
  validateRoomV2DraftPlacements,
  validateRoomV2FurniturePlacement
} = require("./roomV2Selectors") as typeof import("./roomV2Selectors")
const { ROOM_V2_SHELL_CATALOG } = require("./roomV2Catalog") as typeof import("./roomV2Catalog")
const { createMiniRoomDepthScene } = require("../miniRoom/scene/miniRoomDepthModel") as
  typeof import("../miniRoom/scene/miniRoomDepthModel")
const { createMyRoomAvatarDepthNeighbours, getMyRoomAvatarDepthIndex } = require("../roomWorld/myRoomAvatarWalkModel") as
  typeof import("../roomWorld/myRoomAvatarWalkModel")
const { floorCellCentre, floorToStageFraction, ROOM_CALIBRATION: C } = require("./calibration/roomCalibration") as
  typeof import("./calibration/roomCalibration")
const { stageFractionToWallSpot, wallSpotToStageFraction } = require("./calibration/roomWallPlacement") as
  typeof import("./calibration/roomWallPlacement")
/* eslint-enable @typescript-eslint/no-require-imports */

const SHELL_ID = "room_v2_shell_blumi_world_v1"
const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const byId = new Map(furnitureCatalog.map((item) => [item.id, item]))
const item = (id: string): FurnitureItem => byId.get(id)!

function onCell(id: string, i: number, j: number, rotation: RoomFurnitureRotation, instanceId = `${id}-${i}-${j}`): PlacedRoomItem {
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  return { instanceId, itemId: id, x: point.x, y: point.y, rotation }
}

function decorOf(placedItems: PlacedRoomItem[]): UserRoomDecor {
  return { roomShellId: SHELL_ID, placedItems }
}

function sceneOf(placedItems: PlacedRoomItem[]) {
  return resolveRoomV2Scene({
    decor: decorOf(placedItems),
    furnitureCatalog,
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    defaultRoomShellId: SHELL_ID
  })
}

function drawIndex(items: readonly RoomV2RenderItem[], instanceId: string): number {
  const index = items.findIndex((candidate) => candidate.kind === "furniture" && candidate.renderId === instanceId)
  assert.ok(index >= 0, `${instanceId} is drawn`)
  return index
}

function rendered(placed: PlacedRoomItem): RoomV2FurnitureRenderItem {
  return resolvePlacedFurnitureRenderItem(placed, item(placed.itemId))!
}

test("a nightstand beside the bed's head is drawn over the bed, not hidden under it", () => {
  const bed = onCell("room_v3_bed_japon_sakura", 5, 5, "right", "bed")
  const nightstand = onCell("room_v3_nightstand_japon_cedar", 3, 6, "right", "nightstand")
  const scene = sceneOf([bed, nightstand])
  assert.ok(drawIndex(scene.renderItems, "nightstand") > drawIndex(scene.renderItems, "bed"))
  // MiniRoom draws the same room the same way
  const occluders = createMiniRoomDepthScene(scene).occluders.map((piece) => piece.renderId)
  assert.ok(occluders.indexOf("nightstand") > occluders.indexOf("bed"))
})

test("of two neighbours the nearer one is drawn last, whatever their sizes and instance ids", () => {
  const ids = [
    "room_v3_bed_japon_sakura", "room_v3_bookshelf_japon_rattan", "room_v3_nightstand_oyun_honey",
    "room_v3_sofa_japon_cream", "room_v3_teaset_oyun_flower", "room_v3_tvunit_oyun_game"
  ]
  let checked = 0
  for (const a of ids) for (const b of ids) for (const ra of ROTATIONS) for (const rb of ROTATIONS) {
    for (let di = -5; di <= 5; di += 1) for (let dj = -5; dj <= 5; dj += 1) {
      // instance ids sort both ways, so neither tie break can pass by luck
      for (const [idA, idB] of [["a", "b"], ["b", "a"]]) {
        const first = onCell(a, 6, 6, ra, idA!)
        const second = onCell(b, 6 + di, 6 + dj, rb, idB!)
        const firstItem = rendered(first)
        const secondItem = rendered(second)
        const both = { shell: sceneOf([]).shell, renderItems: [firstItem] }
        if (!validateRoomV2FurniturePlacement({ scene: both, candidate: secondItem }).isValid) continue
        const p = firstItem.floorBox!
        const q = secondItem.floorBox!
        const shareZ = p.minZ < q.maxZ && q.minZ < p.maxZ
        const shareX = p.minX < q.maxX && q.minX < p.maxX
        const secondNearer = (q.minX >= p.maxX - 1e-6 && shareZ) || (q.minZ >= p.maxZ - 1e-6 && shareX)
        const firstNearer = (p.minX >= q.maxX - 1e-6 && shareZ) || (p.minZ >= q.maxZ - 1e-6 && shareX)
        if (secondNearer === firstNearer) continue
        const order = sceneOf([first, second]).renderItems
        const nearer = secondNearer ? idB! : idA!
        const farther = secondNearer ? idA! : idB!
        assert.ok(drawIndex(order, nearer) > drawIndex(order, farther),
          `${a}(${ra}) and ${b}(${rb}) at +${di},+${dj}: the nearer piece must draw over the farther one`)
        checked += 1
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked} side-by-side pairs`)
})

test("a small rug laid on a big rug stays on top of it", () => {
  for (const [bigId, smallId] of [["big", "small"], ["z-big", "a-small"]]) {
    const big = onCell("room_v3_rug_japon_botanic", 9, 9, "front", bigId!)
    const small = onCell("room_v3_rug_oyun_tea", 8, 8, "front", smallId!)
    for (const placed of [[big, small], [small, big]]) {
      const order = sceneOf(placed).renderItems
      assert.ok(drawIndex(order, smallId!) > drawIndex(order, bigId!), `${smallId} over ${bigId}`)
    }
  }
})

test("a sitter stays over the piece she sits on when a deeper piece is drawn before it", () => {
  // a bed beside a small seat can have the larger depth yet draw first (it is behind): find such spots
  let found = 0
  for (const seatId of ["room_v2_chair_blush", "room_v3_armchair_japon_cream", "room_v3_sofa_japon_cream"]) {
    for (const rotation of ROTATIONS) for (let di = -6; di <= 6; di += 1) for (let dj = -6; dj <= 6; dj += 1) {
      const bed = onCell("room_v3_bed_japon_sakura", 6, 6, "right", "bed")
      const seat = onCell(seatId, 6 + di, 6 + dj, rotation, "seat")
      const bedItem = rendered(bed)
      const seatItem = rendered(seat)
      const both = { shell: sceneOf([]).shell, renderItems: [bedItem] }
      if (!validateRoomV2FurniturePlacement({ scene: both, candidate: seatItem }).isValid) continue
      const order = sceneOf([bed, seat]).renderItems
      if (!(drawIndex(order, "bed") < drawIndex(order, "seat") && bedItem.depth > seatItem.depth)) continue
      const neighbours = createMyRoomAvatarDepthNeighbours(order, { layer: "furniture", renderId: "sitter" })
      assert.ok(getMyRoomAvatarDepthIndex(neighbours, seatItem.depth + 1e-4) > drawIndex(order, "seat"),
        `${seatId}(${rotation}) at +${di},+${dj}: the sitter draws over her seat`)
      found += 1
    }
  }
  assert.ok(found > 0, "some spot puts the deeper bed before the seat")
})

function wallPiece(id: string, instanceId: string, target: { x: number; y: number }): PlacedRoomItem {
  const probe = resolvePlacedFurnitureRenderItem(
    { instanceId, itemId: id, x: target.x, y: target.y, rotation: "front", placementSurface: "wall" }, item(id))!
  const point = roomCalibration.snapWallItem(probe, target)
  return { instanceId, itemId: id, x: point.x, y: point.y, rotation: "front", placementSurface: "wall" }
}

test("a wall piece cannot hang over another one, and may hang beside it", () => {
  const poster = wallPiece("room_v3_poster_oyun_bunny", "poster", { x: 0.72, y: 0.3 })
  const frame = wallPiece("room_v3_frame_japon_sakura", "frame", { x: 0.74, y: 0.31 })
  const scene = sceneOf([poster])
  const over = validateRoomV2FurniturePlacement({ scene, candidate: rendered(frame) })
  assert.equal(over.isValid, false)
  assert.deepEqual(over.issueIds, ["overlaps_blocking_furniture"])
  assert.deepEqual(over.blockingRenderIds, [rendered(poster).renderId])

  // the next clear spot along the same wall, just past the poster's drawing
  const cover = rendered(poster).wallPlacement!.cover
  const wall = rendered(poster).wallPlacement!.wall
  const spot = stageFractionToWallSpot(C, wall, poster)
  const width = cover.alongMax - cover.alongMin + 0.25
  const beside = [width, -width, 2 * width, -2 * width]
    .map((step) => wallSpotToStageFraction(C, { ...spot, along: spot.along + step }))
    .map((point) => rendered({ ...frame, x: point.x, y: point.y }))
    .find((candidate) => candidate.wallPlacement!.isValid)
  assert.ok(beside, "a spot beside it is on the wall, clear of openings")
  const besideCover = beside.wallPlacement!.cover
  assert.ok(besideCover.alongMin >= cover.alongMax - 1e-3 || besideCover.alongMax <= cover.alongMin + 1e-3, "and clear of the poster")
  assert.equal(validateRoomV2FurniturePlacement({ scene, candidate: beside }).isValid, true)
})

test("a room saved with two wall pieces over each other still saves, but a moved piece may not land on one", () => {
  const poster = wallPiece("room_v3_poster_oyun_bunny", "poster", { x: 0.72, y: 0.3 })
  const frame = wallPiece("room_v3_frame_japon_sakura", "frame", { x: 0.74, y: 0.31 })
  const saved = decorOf([poster, frame])
  const scene = sceneOf([poster, frame])
  const untouched = validateRoomV2DraftPlacements({ scene, decor: saved, furnitureCatalog, untouchedFrom: saved })
  assert.deepEqual(untouched.invalidItems, [])

  const clock = wallPiece("room_v3_clock_japon_flower", "clock", { x: 0.2, y: 0.32 })
  const before = decorOf([poster, clock])
  const moved = decorOf([poster, { ...clock, x: poster.x, y: poster.y }])
  const result = validateRoomV2DraftPlacements({ scene: sceneOf(moved.placedItems), decor: moved, furnitureCatalog, untouchedFrom: before })
  assert.deepEqual(result.invalidItems.map((invalid) => invalid.placedItem.instanceId), ["clock"])
})
