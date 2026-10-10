import assert from "node:assert/strict"
import test from "node:test"
import { ROOM_BLUMI_WORLD_FLOOR_GRID } from "@blumi/domain"
import { resolvePlacedFurnitureRenderItem } from "../roomV2Selectors"
import type {
  FurnitureItem,
  RoomFurnitureRotation,
  RoomShell,
  RoomV2FurnitureRenderItem
} from "../roomV2.types"
import { createMyRoomAvatarDepthNeighbours, getMyRoomAvatarDepthIndex } from "../../roomWorld/myRoomAvatarWalkModel"
import { MY_ROOM_AVATAR_SPAWN } from "../../roomWorld/myRoomInteractionModel"
import { createRoomWorldGeometryFromRoomV2Scene, createRoomWorldHotspotsFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import { pointInRoomWorldPolygon } from "../../roomWorld/roomWorldGeometry"
import {
  createRoomWorldMovementPlan,
  resolveRoomWorldSeatSelection,
  ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
  ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
} from "../../roomWorld/roomWorldRuntime"
import { createRoomAvatar25dRoomCalibration } from "../calibration/roomAvatar25dRoomCalibration"
import {
  floorCellCentre,
  floorToShell,
  floorToStageFraction,
  ROOM_CALIBRATION as C,
  stageFractionToFloor,
  worldToShell
} from "../calibration/roomCalibration"
import { calibrateRoomShell, calibrateRoomWalkGeometry } from "../calibration/roomCalibrationScene"
import {
  getLayeredFurnitureFloorBox,
  getSeatedLayerPlan,
  LAYERED_FURNITURE_SPECS,
  LAYERED_ROTATION_INDEX,
  type LayeredFurnitureAssets,
  type LayeredRotationIndex
} from "./layeredFurniture"

const SPEC = LAYERED_FURNITURE_SPECS.room_v2_chair_blush!
const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const SHELL = calibrateRoomShell({
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  floorGrid: ROOM_BLUMI_WORLD_FLOOR_GRID
} satisfies RoomShell)

// Plain Node: stand-in image modules, one key per layer.
const asset = (key: string) => ({ key, source: 0 as never })
const ASSETS: LayeredFurnitureAssets = {
  room_v2_chair_blush: Object.fromEntries(([0, 1, 2, 3] as const).map((r) => [r, {
    back: asset(`r${r}_back`), front: asset(`r${r}_front`), shadow: asset(`r${r}_shadow`)
  }])) as unknown as LayeredFurnitureAssets[string]
}
const calibration = createRoomAvatar25dRoomCalibration(ASSETS)

// The shipped catalog chair (roomV2Catalog), without its image module.
const CHAIR: FurnitureItem = {
  id: "room_v2_chair_blush",
  name: "Blush Lounge Chair",
  asset: { key: "room_v2_furniture_world_chair_v1", source: 0 as never },
  category: "seating",
  layer: "furniture",
  width: 0.126,
  height: 0.244,
  footprint: { width: 0.109, height: 0.067 },
  blocksMovement: true,
  interactionType: "seat",
  frontOcclusionByRotation: { front: { left: 0.02, top: 0.68, width: 0.96, height: 0.29 } },
  seatSpec: {
    capacity: 1,
    seatPoints: [{
      id: "front_edge", x: 0.1, y: -0.2, facing: "front",
      approachPoint: { x: 0, y: 0.22 }, exitPoint: { x: 0, y: 0.28 }, seatHeight: 0.096
    }]
  }
}

function chairOnCell(i: number, j: number, rotation: RoomFurnitureRotation): RoomV2FurnitureRenderItem {
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  const plain = resolvePlacedFurnitureRenderItem({ instanceId: "chair", itemId: CHAIR.id, x: point.x, y: point.y, rotation }, CHAIR)!
  return calibration.calibrateFurnitureItem(plain)
}

const r = (rotation: RoomFurnitureRotation): LayeredRotationIndex => LAYERED_ROTATION_INDEX[rotation]

test("seated in a front view, her shins and shoes draw over the chair's front layer; her thighs stay under it", () => {
  for (const rotation of [0, 1] as const) {
    const seat = SPEC.rotations[rotation].seats[0]!
    assert.equal(seat.cardSplit, true)
    const plan = getSeatedLayerPlan(seat)
    assert.deepEqual(plan.order, ["shadow", "back", "avatar", "front"])
    // the front layer covers her only above the cushion's front edge; below it she is on top
    assert.equal(plan.frontVisibleBelowRow, seat.frontEdgePx[1])
    assert.ok(plan.frontVisibleBelowRow! > seat.hipPx[1], "the edge is below the hip: her thighs stay between the layers")
    assert.equal(plan.avatarClipBelowRow, undefined, "nothing of her is cut in a front view")
  }
})

test("seated in a back view, nothing of her draws below the seat and the front layer covers her whole", () => {
  for (const rotation of [2, 3] as const) {
    const seat = SPEC.rotations[rotation].seats[0]!
    const plan = getSeatedLayerPlan(seat)
    assert.deepEqual(plan.order, ["shadow", "back", "avatar", "front"])
    assert.equal(plan.avatarClipBelowRow, seat.cardClipBelowPx)
    assert.ok(plan.avatarClipBelowRow! > seat.hipPx[1], "cut just below the hip point")
    assert.equal(plan.frontVisibleBelowRow, undefined)
  }
})

test("the split works because the front layer is the back layer's own pixels (so no seam where it ends)", () => {
  // the front layer is cut from the same painting as the back layer: its drawn pixels are the back layer's own
  for (const rotation of ROTATIONS) {
    const chair = chairOnCell(8, 8, rotation)
    const art = chair.layered25d!
    assert.equal(chair.asset.key, `r${r(rotation)}_back`)
    assert.equal(art.frontAsset?.key, `r${r(rotation)}_front`)
    assert.equal(art.shadowAsset?.key, `r${r(rotation)}_shadow`)
    const seat = SPEC.rotations[r(rotation)].seats[0]!
    assert.equal(art.seats.length, 1, "one seat, one seat rule")
    const seatArt = art.seats[0]!
    assert.equal(seatArt.id, seat.id)
    if (seat.cardSplit) {
      assert.ok(Math.abs(seatArt.frontVisibleHeight! - seat.frontEdgePx[1] / SPEC.rotations[r(rotation)].size[1]) < 1e-12)
      assert.equal(seatArt.avatarClipBelowHip, undefined)
    } else {
      assert.equal(seatArt.frontVisibleHeight, undefined)
      // a few shell px below the hip, as a stage share
      const clip = seatArt.avatarClipBelowHip! * C.canvas.height
      assert.ok(clip > 0 && clip < 10, `clip ${clip} shell px below the hip`)
    }
  }
})

test("every app rotation shows a different drawn rotation, and she sits in the drawing item.json names", () => {
  const drawn = new Set(ROTATIONS.map(r))
  assert.equal(drawn.size, 4)
  assert.equal(r("front"), 1, "front keeps the shop's look (the app painting is r1)")
  const expected: Record<RoomFurnitureRotation, { view: string; mirror: boolean }> = {
    front: { view: "front", mirror: true }, // r1 frontM
    right: { view: "front", mirror: false }, // r0 front
    back: { view: "back", mirror: true }, // r3 backM
    left: { view: "back", mirror: false } // r2 back
  }
  for (const rotation of ROTATIONS) {
    const seat = chairOnCell(8, 8, rotation).layered25d!.seats[0]!
    assert.deepEqual({ view: seat.view, mirror: seat.mirror }, expected[rotation], rotation)
  }
})

test("placed in world units, the drawing and its hip point land where item.json's sprite says", () => {
  for (const rotation of ROTATIONS) {
    const chair = chairOnCell(8, 8, rotation)
    const rot = SPEC.rotations[r(rotation)]
    const { placed } = getLayeredFurnitureFloorBox(SPEC, chair, C)
    const centre = { x: (placed.minX + placed.maxX) / 2, z: (placed.minZ + placed.maxZ) / 2 }
    // layer top-left (shell px) = shell px of the footprint centre - anchor_px / scale
    const left = (chair.x + chair.renderOffset!.x - chair.width * chair.anchor.x) * C.canvas.width
    const top = (chair.y + chair.renderOffset!.y - chair.height * chair.anchor.y) * C.canvas.height
    const expectedTopLeft = floorToShell(C, centre)
    assert.ok(Math.abs(left - (expectedTopLeft.x - rot.anchorPx[0] / SPEC.scale)) < 1e-6, `${rotation} left`)
    assert.ok(Math.abs(top - (expectedTopLeft.y - rot.anchorPx[1] / SPEC.scale)) < 1e-6, `${rotation} top`)
    assert.ok(Math.abs(chair.width * C.canvas.width - rot.size[0] / SPEC.scale) < 1e-9)
    // the seat point is the floor under hip_world, the hip seatHeight above it; it must agree with the sprite's hip_px
    const seat = chair.seatWorldPoints![0]!
    const hipShell = { x: seat.seat.x * C.canvas.width, y: (seat.seat.y - seat.seatHeight) * C.canvas.height }
    const hipSprite = { x: left + rot.seats[0]!.hipPx[0] / SPEC.scale, y: top + rot.seats[0]!.hipPx[1] / SPEC.scale }
    assert.ok(Math.hypot(hipShell.x - hipSprite.x, hipShell.y - hipSprite.y) < 1.5,
      `${rotation}: hip ${JSON.stringify(hipShell)} vs sprite ${JSON.stringify(hipSprite)}`)
    const world = rot.seats[0]!.hipWorld
    const direct = worldToShell(C, { x: centre.x + world[0], y: world[1], z: centre.z + world[2] })
    assert.ok(Math.abs(direct.x - hipShell.x) < 0.01 && Math.abs(direct.y - hipShell.y) < 0.01)
  }
})

test("it stands on item.json's floor cells (3×2 at scale D, turned for odd rotations), saved spot and id untouched", () => {
  for (const rotation of ROTATIONS) {
    const chair = chairOnCell(8, 8, rotation)
    const saved = floorToStageFraction(C, floorCellCentre(C, { i: 8, j: 8 }))
    assert.equal(chair.x, saved.x)
    assert.equal(chair.y, saved.y)
    assert.equal(chair.itemId, "room_v2_chair_blush")
    assert.equal(chair.usesMirroredRotation, false)
    const corners = chair.collisionPolygon!.map((point) => stageFractionToFloor(C, point))
    const spanX = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x))
    const spanZ = Math.max(...corners.map((p) => p.z)) - Math.min(...corners.map((p) => p.z))
    const cells = SPEC.rotations[r(rotation)].footprintCells
    assert.ok(Math.abs(spanX - (cells[0] * 0.5 - 0.02)) < 1e-3 && Math.abs(spanZ - (cells[1] * 0.5 - 0.02)) < 1e-3,
      `${rotation}: ${spanX} x ${spanZ}`)
    // the old hand-tuned crop never draws over this chair
    assert.equal(chair.frontOcclusion, undefined)
    // calibrating twice is calibrating once (the editor's preview path re-calibrates)
    assert.deepEqual(calibration.calibrateFurnitureItem(chair), chair)
  }
})

test("she can walk from the spawn to each seat's approach cell, and stands there in front of the right layer", () => {
  for (const rotation of ROTATIONS) {
    const chair = chairOnCell(6, 6, rotation)
    const scene = { shell: SHELL, renderItems: [chair] }
    const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene(scene), SHELL)
    const [hotspot] = createRoomWorldHotspotsFromRoomV2Scene(scene)
    assert.ok(hotspot?.approachPoint && hotspot.seatHeight !== undefined, rotation)
    assert.ok(!pointInRoomWorldPolygon(hotspot.approachPoint, chair.collisionPolygon!), `${rotation}: approach is off the chair`)
    const plan = createRoomWorldMovementPlan({
      geometry,
      from: MY_ROOM_AVATAR_SPAWN,
      to: hotspot.approachPoint,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
    })
    assert.ok(plan, `${rotation}: a path to the approach cell`)
    // a tap on the chair picks this seat (My Room's seat selection), its approach unchanged
    const selected = resolveRoomWorldSeatSelection({
      geometry,
      from: MY_ROOM_AVATAR_SPAWN,
      hotspots: [hotspot],
      seatedFurnitureRenderId: chair.renderId,
      clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
      timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
    })
    assert.deepEqual(selected?.approach, hotspot.approachPoint, `${rotation}: the chair is sittable`)
    // standing at the approach cell: in front of the chair for the front-facing seats, behind it for the back ones
    const neighbours = createMyRoomAvatarDepthNeighbours([chair], { layer: "furniture", renderId: "avatar" })
    const { x, y } = hotspot.approachPoint
    const inFront = getMyRoomAvatarDepthIndex(neighbours, y, x, y) === 1
    assert.equal(inFront, SPEC.rotations[r(rotation)].seats[0]!.cardSplit, rotation)
  }
})

test("without the layered art (or the flag) the chair keeps the generic calibrated path", () => {
  const plain = resolvePlacedFurnitureRenderItem({ instanceId: "c", itemId: CHAIR.id, x: 0.58, y: 0.86, rotation: "front" }, CHAIR)!
  const generic = createRoomAvatar25dRoomCalibration().calibrateFurnitureItem(plain)
  assert.equal(generic.layered25d, undefined)
  assert.equal(generic.asset.key, "room_v2_furniture_world_chair_v1")
})

test("the editor offers the layered chair's four drawn rotations; other pieces keep their catalog rotations", () => {
  assert.deepEqual(calibration.furnitureRotations("room_v2_chair_blush"), ["front", "right", "back", "left"])
  assert.equal(calibration.furnitureRotations("room_v2_table_round"), undefined)
  assert.equal(createRoomAvatar25dRoomCalibration().furnitureRotations("room_v2_chair_blush"), undefined)
})
