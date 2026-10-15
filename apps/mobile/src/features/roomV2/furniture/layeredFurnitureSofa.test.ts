import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { ROOM_BLUMI_WORLD_FLOOR_GRID, ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON } from "@blumi/domain"
import {
  createRoomV2AvatarRenderItem,
  compareRoomV2RenderItems,
  resolvePlacedFurnitureRenderItem,
  validateRoomV2FurniturePlacement
} from "../roomV2Selectors"
import type {
  FurnitureItem,
  PlacedRoomItem,
  RoomFurnitureRotation,
  RoomShell,
  RoomV2FurnitureRenderItem
} from "../roomV2.types"
import { MY_ROOM_AVATAR_SPAWN } from "../../roomWorld/myRoomInteractionModel"
import { pointInRoomWorldPolygon } from "../../roomWorld/roomWorldGeometry"
import { createRoomWorldGeometryFromRoomV2Scene, createRoomWorldHotspotsFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import {
  createRoomWorldMovementPlan,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
} from "../../roomWorld/roomWorldRuntime"
import { createRoomAvatar25dRoomCalibration } from "../calibration/roomAvatar25dRoomCalibration"
import {
  floorCellCentre,
  floorToShell,
  floorToStageFraction,
  ROOM_CALIBRATION as C,
  worldToShell
} from "../calibration/roomCalibration"
import { calibrateRoomShell, calibrateRoomWalkGeometry } from "../calibration/roomCalibrationScene"
import {
  getLayeredFurnitureFloorBox,
  getLayeredSeatDrawOrder,
  getSeatedLayerPlan,
  LAYERED_FURNITURE_SPECS,
  LAYERED_ROTATION_INDEX,
  parseLayeredFurnitureSpec,
  type LayeredFurnitureAssets,
  type LayeredFurnitureSpec
} from "./layeredFurniture"
import { createRoomAvatar25dFurnitureCatalog, ROOM_AVATAR_25D_SOFA_ID } from "./layeredFurnitureCatalog"
import rawChair from "./room_v2_chair_blush/item.json"
import rawSofa from "./room_v3_sofa_japon_cream/item.json"

// The room catalog bundles the shipped art: image modules load as their file names (plain Node).
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro image fixture loading needs the hook first.
const { ROOM_V2_FURNITURE_CATALOG } = require("../roomV2Catalog") as typeof import("../roomV2Catalog")
// eslint-disable-next-line import/first -- the test room loads image modules, which need the require hook above first.
import { createLayeredFurnitureTestRoom } from "./layeredFurnitureTestRoom"

const SOFA_SPEC = LAYERED_FURNITURE_SPECS[ROOM_AVATAR_25D_SOFA_ID]!
const CHAIR_SPEC = LAYERED_FURNITURE_SPECS.room_v2_chair_blush!
const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const SHELL = calibrateRoomShell({
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  floorGrid: ROOM_BLUMI_WORLD_FLOOR_GRID
} satisfies RoomShell)

// Plain Node: stand-in image modules, one key per item, rotation and layer.
const asset = (key: string) => ({ key, source: 0 as never })
const layers = (id: string) => Object.fromEntries(([0, 1, 2, 3] as const).map((r) => [r, {
  back: asset(`${id}_r${r}_back`), front: asset(`${id}_r${r}_front`), shadow: asset(`${id}_r${r}_shadow`)
}])) as unknown as LayeredFurnitureAssets[string]
const ASSETS: LayeredFurnitureAssets = {
  room_v2_chair_blush: layers("room_v2_chair_blush"),
  [ROOM_AVATAR_25D_SOFA_ID]: layers(ROOM_AVATAR_25D_SOFA_ID)
}
const calibration = createRoomAvatar25dRoomCalibration(ASSETS)
const [SOFA] = createRoomAvatar25dFurnitureCatalog(ASSETS) as FurnitureItem[]

// The shipped catalog chair (roomV2Catalog), without its image module.
const CHAIR: FurnitureItem = {
  id: "room_v2_chair_blush",
  name: "Blush Lounge Chair",
  asset: asset("room_v2_furniture_world_chair_v1"),
  category: "seating",
  layer: "furniture",
  width: 0.126,
  height: 0.244,
  footprint: { width: 0.109, height: 0.067 },
  blocksMovement: true,
  interactionType: "seat",
  seatSpec: {
    capacity: 1,
    seatPoints: [{
      id: "front_edge", x: 0.1, y: -0.2, facing: "front",
      approachPoint: { x: 0, y: 0.22 }, exitPoint: { x: 0, y: 0.28 }, seatHeight: 0.096
    }]
  }
}

function place(item: FurnitureItem, placed: Omit<PlacedRoomItem, "itemId">): RoomV2FurnitureRenderItem {
  const plain = resolvePlacedFurnitureRenderItem({ ...placed, itemId: item.id }, item)!
  return calibration.calibrateFurnitureItem(plain)
}

function onCell(item: FurnitureItem, i: number, j: number, rotation: RoomFurnitureRotation): RoomV2FurnitureRenderItem {
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  return place(item, { instanceId: item.id, x: point.x, y: point.y, rotation })
}

function hipShellOfSeat(piece: RoomV2FurnitureRenderItem, index: number) {
  const seat = piece.seatWorldPoints![index]!
  return { x: seat.seat.x * C.canvas.width, y: (seat.seat.y - seat.seatHeight) * C.canvas.height }
}

test("the loader takes each item's own sprite scale from item.json (2.0 for the sofa, 1.03 for the armchair)", () => {
  assert.equal(SOFA_SPEC.scale, (rawSofa as { scale: number }).scale)
  assert.equal(SOFA_SPEC.scale, 2)
  assert.equal(CHAIR_SPEC.scale, (rawChair as { scale: number }).scale)
  // a scale the file does not give is refused, never guessed
  const withScale = (scale: unknown) => ({ ...(rawSofa as object), scale })
  assert.throws(() => parseLayeredFurnitureSpec(withScale(undefined)), /scale/)
  assert.throws(() => parseLayeredFurnitureSpec(withScale(0)), /scale/)
  assert.throws(() => parseLayeredFurnitureSpec(withScale(-2)), /scale/)
})

test("each piece's layers are drawn at size / its own scale, and every seat's hip lands on the sprite's hip_px", () => {
  const cases: [FurnitureItem, LayeredFurnitureSpec][] = [[SOFA!, SOFA_SPEC], [CHAIR, CHAIR_SPEC]]
  for (const [item, spec] of cases) {
    for (const rotation of ROTATIONS) {
      const piece = onCell(item, 8, 8, rotation)
      const rot = spec.rotations[LAYERED_ROTATION_INDEX[rotation]]
      const { placed } = getLayeredFurnitureFloorBox(spec, piece, C)
      const centre = { x: (placed.minX + placed.maxX) / 2, z: (placed.minZ + placed.maxZ) / 2 }
      const left = (piece.x + piece.renderOffset!.x - piece.width * piece.anchor.x) * C.canvas.width
      const top = (piece.y + piece.renderOffset!.y - piece.height * piece.anchor.y) * C.canvas.height
      assert.ok(Math.abs(piece.width * C.canvas.width - rot.size[0] / spec.scale) < 1e-9, `${item.id} ${rotation} width`)
      assert.ok(Math.abs(piece.height * C.canvas.height - rot.size[1] / spec.scale) < 1e-9, `${item.id} ${rotation} height`)
      const anchorShell = floorToShell(C, centre)
      assert.ok(Math.abs(left - (anchorShell.x - rot.anchorPx[0] / spec.scale)) < 1e-6, `${item.id} ${rotation} left`)
      assert.ok(Math.abs(top - (anchorShell.y - rot.anchorPx[1] / spec.scale)) < 1e-6, `${item.id} ${rotation} top`)
      assert.equal(piece.seatWorldPoints!.length, rot.seats.length)
      rot.seats.forEach((seat, index) => {
        const hip = hipShellOfSeat(piece, index)
        const sprite = { x: left + seat.hipPx[0] / spec.scale, y: top + seat.hipPx[1] / spec.scale }
        assert.ok(Math.hypot(hip.x - sprite.x, hip.y - sprite.y) < 1.5,
          `${item.id} ${rotation} ${seat.id}: hip ${JSON.stringify(hip)} vs sprite ${JSON.stringify(sprite)}`)
        const direct = worldToShell(C, { x: centre.x + seat.hipWorld[0], y: seat.hipWorld[1], z: centre.z + seat.hipWorld[2] })
        assert.ok(Math.abs(direct.x - hip.x) < 0.01 && Math.abs(direct.y - hip.y) < 0.01)
      })
    }
  }
})

test("the sofa has two seats in every rotation, each with its own sitter drawing and front-layer rule", () => {
  for (const rotation of ROTATIONS) {
    const sofa = onCell(SOFA!, 8, 8, rotation)
    const rot = SOFA_SPEC.rotations[LAYERED_ROTATION_INDEX[rotation]]
    assert.deepEqual(sofa.seatWorldPoints!.map((seat) => seat.id), ["s0", "s1"], rotation)
    assert.deepEqual(sofa.layered25d!.seats.map((seat) => seat.id), ["s0", "s1"], rotation)
    rot.seats.forEach((seat, index) => {
      const art = sofa.layered25d!.seats[index]!
      const plan = getSeatedLayerPlan(seat)
      assert.equal(art.view, seat.avatarView.startsWith("back") ? "back" : "front")
      assert.equal(art.mirror, seat.avatarView.endsWith("M"))
      if (seat.cardSplit) {
        // the front layer covers this sitter only above her own cushion edge
        assert.ok(Math.abs(art.frontVisibleHeight! - plan.frontVisibleBelowRow! / rot.size[1]) < 1e-12)
        assert.equal(art.avatarClipBelowHip, undefined)
      } else {
        assert.equal(art.frontVisibleHeight, undefined)
        const clip = art.avatarClipBelowHip! * C.canvas.height
        assert.ok(clip > 0 && clip < 10, `${rotation} ${seat.id}: clip ${clip} shell px below the hip`)
      }
    })
    // the two seats are two places on the cushion, not one
    const [a, b] = [hipShellOfSeat(sofa, 0), hipShellOfSeat(sofa, 1)]
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 40, `${rotation}: seats ${JSON.stringify(a)} ${JSON.stringify(b)}`)
  }
})

test("two sitters draw far to near: by hip X + Z, so the nearer one is drawn over the farther one", () => {
  for (const rotation of ROTATIONS) {
    const sofa = onCell(SOFA!, 8, 8, rotation)
    const rot = SOFA_SPEC.rotations[LAYERED_ROTATION_INDEX[rotation]]
    const order = getLayeredSeatDrawOrder(rot.seats)
    const nearness = order.map((index) => rot.seats[index]!.hipWorld[0] + rot.seats[index]!.hipWorld[2])
    assert.ok(nearness[0]! < nearness[1]!, `${rotation}: ${JSON.stringify(nearness)}`)
    // X + Z toward the camera is lower on screen: the farther hip is higher up
    assert.ok(hipShellOfSeat(sofa, order[0]!).y < hipShellOfSeat(sofa, order[1]!).y, rotation)

    const scene = { shell: SHELL, renderItems: [sofa] }
    const hotspots = createRoomWorldHotspotsFromRoomV2Scene(scene)
    const depthOf = (index: number) => hotspots.find((hotspot) => hotspot.seatId === rot.seats[index]!.id)!.renderDepth!
    assert.ok(depthOf(order[0]!) < depthOf(order[1]!), rotation)
    for (const index of [0, 1]) {
      // both sitters stay just in front of the sofa itself
      assert.ok(depthOf(index) > sofa.depth && depthOf(index) < sofa.depth + 2 * ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON)
    }
    // two seated avatars in the render list come out far to near, whatever their ids
    const seated = (index: number, renderId: string) => createRoomV2AvatarRenderItem({
      avatarId: renderId, name: renderId, renderId, layers: [],
      x: 0.5, y: 0.5, width: 0.1, height: 0.2, depth: depthOf(index), state: "sitting"
    })
    const sorted = [seated(order[0]!, "z-far"), seated(order[1]!, "a-near")].sort(compareRoomV2RenderItems)
    assert.deepEqual(sorted.map((item) => item.renderId), ["z-far", "a-near"], rotation)
  }
})

test("the armchair keeps one seat at the old seated depth", () => {
  for (const rotation of ROTATIONS) {
    const chair = onCell(CHAIR, 8, 8, rotation)
    assert.equal(chair.layered25d!.seats.length, 1)
    const [hotspot] = createRoomWorldHotspotsFromRoomV2Scene({ shell: SHELL, renderItems: [chair] })
    assert.equal(hotspot!.renderDepth, chair.depth + ROOM_WORLD_SEATED_RENDER_DEPTH_EPSILON)
  }
})

test("she can walk from the spawn to both sofa seats in every rotation, approaching from off the sofa", () => {
  for (const rotation of ROTATIONS) {
    const sofa = onCell(SOFA!, 6, 6, rotation)
    const scene = { shell: SHELL, renderItems: [sofa] }
    const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene(scene), SHELL)
    const hotspots = createRoomWorldHotspotsFromRoomV2Scene(scene)
    assert.equal(hotspots.length, 2, rotation)
    for (const hotspot of hotspots) {
      assert.ok(!pointInRoomWorldPolygon(hotspot.approachPoint!, sofa.collisionPolygon!), `${rotation} ${hotspot.seatId}`)
      const plan = createRoomWorldMovementPlan({
        geometry,
        from: MY_ROOM_AVATAR_SPAWN,
        to: hotspot.approachPoint!,
        clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
        timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
      })
      assert.ok(plan, `${rotation} ${hotspot.seatId}: a path to the approach cell`)
    }
  }
})

test("it stands on its 3×2 cells (turned for odd rotations), saved spot and id untouched, calibration idempotent", () => {
  for (const rotation of ROTATIONS) {
    const sofa = onCell(SOFA!, 8, 8, rotation)
    assert.equal(sofa.itemId, ROOM_AVATAR_25D_SOFA_ID)
    const { cells } = getLayeredFurnitureFloorBox(SOFA_SPEC, sofa, C)
    const expected = SOFA_SPEC.rotations[LAYERED_ROTATION_INDEX[rotation]].footprintCells
    assert.deepEqual([(cells.maxX - cells.minX) / 0.5, (cells.maxZ - cells.minZ) / 0.5], expected, rotation)
    assert.deepEqual(calibration.calibrateFurnitureItem(sofa), sofa)
  }
  assert.deepEqual(calibration.furnitureRotations(ROOM_AVATAR_25D_SOFA_ID), ["front", "right", "back", "left"])
})

test("the sofa exists only in the flagged experiment's catalog, under a new id", () => {
  assert.equal(SOFA!.id, "room_v3_sofa_japon_cream")
  assert.equal(SOFA!.seatSpec?.capacity, 2)
  assert.equal(SOFA!.interactionType, "seat")
  // no art in the bundle, no catalog entry
  assert.deepEqual(createRoomAvatar25dFurnitureCatalog({}), [])
  // plain Node has no seam installed: the shipped catalog draws nothing (the old flat pieces were retired in X8)
  assert.ok(!ROOM_V2_FURNITURE_CATALOG.some((item) => item.id === ROOM_AVATAR_25D_SOFA_ID))
  assert.deepEqual(ROOM_V2_FURNITURE_CATALOG, [])
})

test("a furnished room with the sofa and the armchair places validly, every seat reachable", () => {
  const decor = createLayeredFurnitureTestRoom()
  // the starter rug and coffee table are Japon pieces: the full experiment catalog, every piece with its layers
  const japonIds = Object.keys(LAYERED_FURNITURE_SPECS).filter((id) => id !== "room_v2_chair_blush")
  const allAssets: LayeredFurnitureAssets = { ...ASSETS, ...Object.fromEntries(japonIds.map((id) => [id, layers(id)])) }
  const catalog = new Map<string, FurnitureItem>([
    [CHAIR.id, CHAIR],
    ...createRoomAvatar25dFurnitureCatalog(allAssets).map((item) => [item.id, item] as const)
  ])
  const allCalibration = createRoomAvatar25dRoomCalibration(allAssets)
  const pieces = decor.placedItems.map((placed) =>
    allCalibration.calibrateFurnitureItem(resolvePlacedFurnitureRenderItem(placed, catalog.get(placed.itemId)!)!))
  assert.deepEqual(pieces.map((piece) => piece.itemId), [
    "room_v2_chair_blush",
    ROOM_AVATAR_25D_SOFA_ID,
    "room_v3_rug_japon_botanic",
    "room_v3_coffeetable_japon_round"
  ])
  for (const piece of pieces) {
    const others = { shell: SHELL, renderItems: pieces.filter((other) => other !== piece) }
    const result = validateRoomV2FurniturePlacement({ scene: others, candidate: piece })
    assert.ok(result.isValid, `${piece.itemId}: ${JSON.stringify(result.issueIds)}`)
  }
  const scene = { shell: SHELL, renderItems: pieces }
  const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene(scene), SHELL)
  const hotspots = createRoomWorldHotspotsFromRoomV2Scene(scene)
  assert.equal(hotspots.length, 3)
  for (const hotspot of hotspots) {
    const plan = createRoomWorldMovementPlan({
      geometry,
      from: MY_ROOM_AVATAR_SPAWN,
      to: hotspot.approachPoint!,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
    })
    assert.ok(plan, `${hotspot.id}: reachable from the spawn`)
  }
})

test("a tap anywhere on the sofa's drawn back layer, in every rotation, is a tap on the sofa", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after the image hooks above.
  const tapModel = require("../components/roomFurnitureTapTargetModel") as
    typeof import("../components/roomFurnitureTapTargetModel")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- pngjs has no type declarations here.
  const { PNG } = require("pngjs") as {
    PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } }
  }
  for (const r of [0, 1, 2, 3] as const) {
    const key = `${ROOM_AVATAR_25D_SOFA_ID}_layered_r${r}_back`
    const outline = tapModel.ROOM_FURNITURE_DRAWN_OUTLINES[key]
    assert.ok(outline, `no tap outline for ${key}`)
    const image = PNG.sync.read(readFileSync(join(__dirname, ROOM_AVATAR_25D_SOFA_ID, `r${r}_back.png`)))
    assert.deepEqual([image.width, image.height], SOFA_SPEC.rotations[r].size)
    assert.ok(Math.abs(outline.aspect - image.width / image.height) < 0.001, `${key}: aspect`)
    let uncovered = 0
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (image.data[(y * image.width + x) * 4 + 3]! < 32) continue
        if (!tapModel.isPointInOutline(outline.points, (x + 0.5) / image.width, (y + 0.5) / image.height)) uncovered++
      }
    }
    assert.equal(uncovered, 0, `${key}: drawn pixels outside its tap outline`)
  }
})
