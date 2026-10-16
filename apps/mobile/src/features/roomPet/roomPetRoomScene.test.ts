import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

import type { RoomPoint2D, RoomV2FurnitureRenderItem, RoomV2RenderItem } from "../roomV2/roomV2.types"
import { placeRoomRendererDepthSlot } from "../roomV2/components/roomRendererDepthSlot"
import {
  createRoomV2FloorGridProjection,
  getRoomV2FloorGridCellPoint,
  ROOM_V2_BLUMI_WORLD_FLOOR_GRID
} from "../roomV2/roomV2FloorGrid"
import { createMyRoomAvatarDepthNeighbours, getMyRoomAvatarDepthIndex } from "../roomWorld/myRoomAvatarWalkModel"
import type { RoomPetCell, RoomPetPose, RoomPetState } from "./roomPet.types"
import { createRoomPetState, stepRoomPet } from "./roomPetEngine"
import { isRoomPetCellWalkable, isSameRoomPetCell } from "./roomPetGrid"
import { createRoomPetMapFromRoom } from "./roomPetRoomAdapter"
import { getRoomPetBeforeRenderId, getRoomPetNextWakeMs, getRoomPetOwnerEvents, resolveRoomPetDraw } from "./roomPetRoomScene"
import {
  getRoomPetClipForPose,
  getRoomPetDrawnHeading,
  getRoomPetSpriteCell,
  getRoomPetSpriteHeading,
  getRoomPetSpriteSheetProblems
} from "./roomPetSprite"
import { ROOM_PET_CAT_WHITE_SHEET_LAYOUT } from "./sheet/roomPetCatWhiteSheet"

const PROJECTION = createRoomV2FloorGridProjection(ROOM_V2_BLUMI_WORLD_FLOOR_GRID)
const MIDDLE_COLUMN = Math.round((PROJECTION.minColumn + PROJECTION.maxColumn) / 2)
const MIDDLE_ROW = Math.round((PROJECTION.minRow + PROJECTION.maxRow) / 2)
const SOFA_CENTER = getRoomV2FloorGridCellPoint(PROJECTION, MIDDLE_COLUMN, MIDDLE_ROW)

function cellPoint(cell: RoomPetCell): RoomPoint2D {
  return getRoomV2FloorGridCellPoint(PROJECTION, cell.column, cell.row)
}

function square(center: RoomPoint2D, half: number): RoomPoint2D[] {
  return [
    { x: center.x - half, y: center.y - half },
    { x: center.x + half, y: center.y - half },
    { x: center.x + half, y: center.y + half },
    { x: center.x - half, y: center.y + half }
  ]
}

function furniture(overrides: Partial<RoomV2FurnitureRenderItem> & Pick<RoomV2FurnitureRenderItem, "renderId" | "itemId">): RoomV2FurnitureRenderItem {
  return {
    kind: "furniture",
    layer: "furniture",
    depth: 0,
    x: 0.5,
    y: 0.6,
    width: 0.1,
    height: 0.1,
    anchor: { x: 0.5, y: 0.5 },
    name: overrides.itemId,
    category: "misc",
    asset: { key: overrides.itemId, source: 1 },
    rotation: "front",
    usesMirroredRotation: false,
    blocksMovement: false,
    interactionType: "none",
    ...overrides
  }
}

const SOFA = furniture({
  renderId: "sofa_1", itemId: "room_v3_sofa_test", category: "seating",
  x: SOFA_CENTER.x, y: SOFA_CENTER.y, depth: SOFA_CENTER.y,
  blocksMovement: true, collisionPolygon: square(SOFA_CENTER, 0.03)
})
const SCENE: RoomV2RenderItem[] = [SOFA]
const MAP = createRoomPetMapFromRoom({ projection: PROJECTION, furniture: [SOFA] })

function walkableCellNear(columnOffset: number, rowOffset: number): RoomPetCell {
  const cell = { column: MIDDLE_COLUMN + columnOffset, row: MIDDLE_ROW + rowOffset }
  assert.ok(isRoomPetCellWalkable(MAP, cell), `cell ${cell.column},${cell.row} should be walkable`)
  return cell
}

function petAt(cell: RoomPetCell, nowMs = 1_000): RoomPetState {
  return createRoomPetState({ map: MAP, seed: 7, nowMs, cell })
}

test("flag off: no drawing and the renderer's draw order is unchanged", () => {
  const draw = resolveRoomPetDraw({ isEnabled: false, projection: PROJECTION, map: MAP, state: petAt(walkableCellNear(0, 3)), renderItems: SCENE })
  assert.equal(draw, null)
  const entries = [{ renderId: "a" }, { renderId: "b" }]
  assert.equal(placeRoomRendererDepthSlot(entries, null), entries)
})

test("flag on: the pet slot lands just before the item it stands behind, else after every item", () => {
  const entries = [{ renderId: "a" }, { renderId: "b" }]
  const slot = { renderId: "pet", beforeRenderId: "b" }
  assert.deepEqual(placeRoomRendererDepthSlot(entries, slot).map((entry) => entry.renderId), ["a", "pet", "b"])
  assert.deepEqual(placeRoomRendererDepthSlot(entries, { ...slot, beforeRenderId: null }).map((entry) => entry.renderId), ["a", "b", "pet"])
  assert.deepEqual(placeRoomRendererDepthSlot(entries, { ...slot, beforeRenderId: "gone" }).map((entry) => entry.renderId), ["a", "b", "pet"])
})

test("the pet sorts with furniture exactly like an avatar standing on the same floor cell", () => {
  const behind = walkableCellNear(0, -3)
  const inFront = walkableCellNear(0, 3)
  assert.equal(resolveRoomPetDraw({ isEnabled: true, projection: PROJECTION, map: MAP, state: petAt(behind), renderItems: SCENE })?.beforeRenderId, "sofa_1")
  assert.equal(resolveRoomPetDraw({ isEnabled: true, projection: PROJECTION, map: MAP, state: petAt(inFront), renderItems: SCENE })?.beforeRenderId, null)
  const avatarNeighbours = createMyRoomAvatarDepthNeighbours(SCENE, { layer: "furniture", renderId: "my-room-owner" })
  for (const cell of MAP.cells) {
    const foot = cellPoint(cell)
    const avatarIndex = getMyRoomAvatarDepthIndex(avatarNeighbours, foot.y, foot.x, foot.y)
    assert.equal(getRoomPetBeforeRenderId(SCENE, foot, null), SCENE[avatarIndex]?.renderId ?? null)
  }
})

test("rugs and other layered floor pieces always stay behind the pet; a perched pet draws over its piece", () => {
  const layeredRug = furniture({
    renderId: "rug_1", itemId: "room_v3_rug_test", category: "rug", layer: "floor", depth: 0.99,
    layered25d: {} as RoomV2FurnitureRenderItem["layered25d"]
  })
  const lamp = furniture({ renderId: "lamp_1", itemId: "room_v3_lamp_test", depth: 0.995 })
  const foot = cellPoint(walkableCellNear(0, 3))
  assert.equal(getRoomPetBeforeRenderId([layeredRug, SOFA, lamp], foot, null), "lamp_1")
  assert.equal(getRoomPetBeforeRenderId([layeredRug, SOFA, lamp], { x: 0.5, y: 0.1 }, "sofa_1"), "lamp_1")
})

test("the avatar walking onto the pet makes it step aside the same tick, onto a free floor cell", () => {
  const petCell = walkableCellNear(0, 3)
  const ownerFrom = walkableCellNear(-2, 3)
  let state = stepRoomPet(petAt(petCell), MAP, { nowMs: 1_100, events: getRoomPetOwnerEvents(null, { cell: ownerFrom, seatFurnitureId: null }) })
  const petBefore = state.cell
  const events = getRoomPetOwnerEvents({ cell: ownerFrom, seatFurnitureId: null }, { cell: petBefore, seatFurnitureId: null })
  assert.deepEqual(events, [{ type: "ownerMoved", cell: petBefore }])
  state = stepRoomPet(state, MAP, { nowMs: 1_200, events })
  assert.ok(!isSameRoomPetCell(state.cell, petBefore), "the pet left the avatar's cell")
  assert.ok(isRoomPetCellWalkable(MAP, state.cell))
})

test("owner snapshots become arrive, sit, stand and leave events", () => {
  const cell = walkableCellNear(0, 3)
  assert.deepEqual(getRoomPetOwnerEvents(null, { cell, seatFurnitureId: null }), [{ type: "ownerArrived", cell }])
  assert.deepEqual(getRoomPetOwnerEvents({ cell, seatFurnitureId: null }, { cell, seatFurnitureId: "sofa_1" }), [{ type: "ownerSat", cell, seatFurnitureId: "sofa_1" }])
  assert.deepEqual(getRoomPetOwnerEvents({ cell, seatFurnitureId: "sofa_1" }, { cell, seatFurnitureId: null }), [{ type: "ownerStood", cell }])
  assert.deepEqual(getRoomPetOwnerEvents({ cell, seatFurnitureId: null }, null), [{ type: "ownerLeft" }])
  assert.deepEqual(getRoomPetOwnerEvents({ cell, seatFurnitureId: null }, { cell, seatFurnitureId: null }), [])
})

test("a tap on the pet plays the happy clip", () => {
  const state = stepRoomPet(petAt(walkableCellNear(0, 3)), MAP, { nowMs: 1_050, events: [{ type: "tap" }] })
  const draw = resolveRoomPetDraw({ isEnabled: true, projection: PROJECTION, map: MAP, state, renderItems: SCENE })
  assert.equal(draw?.clip, "happy")
  assert.ok(ROOM_PET_CAT_WHITE_SHEET_LAYOUT.clips.happy.frames[draw.heading].length > 0)
})

test("a greeting pet plays the greet clip, a plain happy pet the happy clip", () => {
  const base = petAt(walkableCellNear(0, 3))
  const greet = resolveRoomPetDraw({ isEnabled: true, projection: PROJECTION, map: MAP, state: { ...base, mode: "greet", pose: "happy" }, renderItems: SCENE })
  const happy = resolveRoomPetDraw({ isEnabled: true, projection: PROJECTION, map: MAP, state: { ...base, mode: "react", pose: "happy" }, renderItems: SCENE })
  assert.equal(greet?.clip, "greet")
  assert.equal(happy?.clip, "happy")
})

test("a walking pet moves one engine step per drawing and wakes the clock for its next step", () => {
  let state = petAt(walkableCellNear(0, 3))
  for (let nowMs = 1_000; nowMs < 20_000 && state.path.length === 0; nowMs += 250) state = stepRoomPet(state, MAP, { nowMs })
  assert.ok(state.path.length > 0, "the pet starts a wander")
  const draw = resolveRoomPetDraw({ isEnabled: true, projection: PROJECTION, map: MAP, state, renderItems: SCENE })
  assert.equal(draw?.clip, "walk")
  assert.equal(draw?.moveMs, state.stepMs)
  assert.equal(getRoomPetNextWakeMs(state), Math.min(state.nextMoveAtMs, state.modeEndsAtMs ?? Infinity))
})

test("sprite contract: two drawn headings mirrored for the other two, loops wrap, one-shots hold", () => {
  assert.equal(getRoomPetSpriteHeading(1, 1), 135)
  assert.equal(getRoomPetSpriteHeading(1, -1), 45)
  assert.deepEqual(getRoomPetDrawnHeading(getRoomPetSpriteHeading(-1, -1)), { heading: 45, mirrored: true })
  assert.deepEqual(getRoomPetDrawnHeading(getRoomPetSpriteHeading(-1, 1)), { heading: 135, mirrored: true })
  assert.equal(getRoomPetSpriteCell([4, 5, 6], 10, true, 350), 4)
  assert.equal(getRoomPetSpriteCell([4, 5, 6], 10, false, 350), 6)
  assert.equal(getRoomPetSpriteCell([4, 5, 6], 10, false, -50), 4)
})

test("sprite contract: a sit or curl lead-in plays once, then only the loop part repeats", () => {
  const frames = [10, 11, 12, 13, 14, 15]
  const at = (step: number) => getRoomPetSpriteCell(frames, 10, true, step * 100 + 1, 3)
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(at), frames)
  assert.deepEqual([6, 7, 8, 9, 10].map(at), [13, 14, 15, 13, 14])
})

test("the white cat sheet is complete and every engine pose has a clip in it", () => {
  const sheet = ROOM_PET_CAT_WHITE_SHEET_LAYOUT
  assert.deepEqual(getRoomPetSpriteSheetProblems(sheet), [])
  const poses: RoomPetPose[] = ["stand", "walk", "run", "sit", "curl", "sleep", "hop", "perch", "happy", "trickRoll", "trickHop", "trickWave"]
  for (const pose of poses) assert.ok(sheet.clips[getRoomPetClipForPose(pose)])
  assert.ok(getRoomPetSpriteSheetProblems({ ...sheet, rows: 1 }).length > 0, "cells outside the sheet are refused")
  const badLoop = { ...sheet, clips: { ...sheet.clips, sit: { ...sheet.clips.sit, loopFrom: 99 } } }
  assert.ok(getRoomPetSpriteSheetProblems(badLoop).length > 0, "a loop start outside the frames is refused")
})

test("the white cat sheet image has exactly the cell grid its layout reads", () => {
  const relative = "assets/roomPet/catWhite/room_pet_cat_white_sheet.png"
  const path = [resolve(process.cwd(), relative), resolve(process.cwd(), "apps/mobile", relative)].find((candidate) => existsSync(candidate))
  assert.ok(path, "the sheet image is bundled")
  const png = readFileSync(path)
  const sheet = ROOM_PET_CAT_WHITE_SHEET_LAYOUT
  assert.equal(png.readUInt32BE(16), sheet.columns * sheet.cellWidth)
  assert.equal(png.readUInt32BE(20), sheet.rows * sheet.cellHeight)
})
