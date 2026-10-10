import assert from "node:assert/strict"
import test from "node:test"
import rawCalibration from "./room_calibration.json"
import {
  avatarFigureHeightPx,
  dropFloorPointOnto,
  fitFloorBoxToWalls,
  floorCellCentre,
  floorCellOf,
  floorDepthKey,
  floorToShell,
  floorToStage,
  isFloorBoxOnFloor,
  isFloorPointInFrontOfBox,
  isFloorPointWalkable,
  leftWallX,
  nearestWalkableFloorPoint,
  parseRoomCalibration,
  resolveTapFloorTarget,
  rightWallZ,
  ROOM_CALIBRATION as C,
  shellToFloor,
  stageToFloor,
  worldToShell,
  type FloorBox
} from "./roomCalibration"

const near = (actual: number, expected: number, tolerance: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs ${expected}`)

test("the worked example in the calibration file converts exactly", () => {
  const { world, shell, worldUp, shellUp } = C.example
  const px = worldToShell(C, world)
  near(px.x, shell.x, 0.002, "example x")
  near(px.y, shell.y, 0.002, "example y")
  const up = worldToShell(C, worldUp)
  near(up.x, shellUp.x, 0.002, "1 up x")
  near(up.y, shellUp.y, 0.002, "1 up y")
  // and back: the floor point under the example's pixel
  const back = shellToFloor(C, shell)
  near(back.x, world.x, 1e-4, "inverse X")
  near(back.z, world.z, 1e-4, "inverse Z")
})

test("the painted floor outline lands on its measured shell pixels", () => {
  const raw = rawCalibration as { floor: { painted_floor_polygon_shell_px: number[][] } }
  C.floorPolygon.forEach((corner, index) => {
    const px = floorToShell(C, corner)
    const measured = raw.floor.painted_floor_polygon_shell_px[index]!
    near(px.x, measured[0]!, 0.05, `corner ${index} x`)
    near(px.y, measured[1]!, 0.05, `corner ${index} y`)
  })
})

test("a tap on any stage size maps to the same floor point", () => {
  const floor = { x: 2.25, z: 5.75 }
  for (const stage of [{ width: 1254, height: 714 }, { width: 1943.7, height: 1106.7 }, { width: 1, height: 1 }]) {
    const tap = floorToStage(C, floor, stage)
    const back = stageToFloor(C, tap, stage)
    near(back.x, floor.x, 1e-9, `X on ${stage.width}`)
    near(back.z, floor.z, 1e-9, `Z on ${stage.width}`)
  }
})

test("tapping the floor walks to that floor point", () => {
  const stage = { x: 600.604 / 1254, y: 481.993 / 714 }
  const target = resolveTapFloorTarget(C, stage)
  near(target.x, 3.5, 1e-3, "X")
  near(target.z, 3.5, 1e-3, "Z")
})

test("tapping a back wall walks to the floor straight below the tap, in front of the skirting", () => {
  // high on the left wall (the window) and on the right wall (the lamp niche)
  for (const [wall, shell] of [["left", { x: 427, y: 200 }], ["right", { x: 1035, y: 300 }]] as const) {
    const target = resolveTapFloorTarget(C, { x: shell.x / C.canvas.width, y: shell.y / C.canvas.height })
    assert.ok(isFloorPointWalkable(C, target), `${wall}: walkable`)
    const px = floorToShell(C, target)
    near(px.x, shell.x, 8, `${wall}: stays below the tap on screen`)
    // within a foot radius or two of that wall's measured base line
    const gap = wall === "left" ? target.x - leftWallX(C, target.z) : target.z - rightWallZ(C, target.x)
    assert.ok(gap > 0 && gap < 0.4, `${wall}: ${gap} units in front of the wall base`)
  }
})

test("tapping past the front edge or a corner stays on the painted floor, never past it", () => {
  const taps = [
    { x: 618 / 1254, y: 700 / 714 }, // below the front bay
    { x: 1250 / 1254, y: 480 / 714 }, // past the right corner
    { x: 4 / 1254, y: 480 / 714 }, // past the left corner
    { x: 601 / 1254, y: 200 / 714 }, // above the back corner
    { x: 900 / 1254, y: 700 / 714 } // below the right front edge
  ]
  for (const tap of taps) {
    const target = resolveTapFloorTarget(C, tap)
    assert.ok(isFloorPointWalkable(C, target), `walkable for ${JSON.stringify(tap)}`)
    // her feet (the foot radius around the point) stay inside the painted floor
    for (let a = 0; a < 8; a += 1) {
      const foot = { x: target.x + Math.cos(a) * C.footRadius * 0.95, z: target.z + Math.sin(a) * C.footRadius * 0.95 }
      assert.ok(isFloorBoxOnFloor(C, { minX: foot.x, maxX: foot.x, minZ: foot.z, maxZ: foot.z }), "foot on floor")
    }
  }
})

test("the walkable floor is the painted floor less her foot radius", () => {
  assert.ok(isFloorPointWalkable(C, { x: 3.5, z: 3.5 }))
  assert.ok(!isFloorPointWalkable(C, { x: -0.6, z: 3 }), "touching the left wall")
  assert.ok(!isFloorPointWalkable(C, { x: 7.7, z: 3 }), "on the right lip")
  const inside = nearestWalkableFloorPoint(C, { x: 3, z: 3 })
  assert.deepEqual(inside, { x: 3, z: 3 })
})

test("a point below the floor's front never drops onto it", () => {
  const front = { x: 8.5, z: 8.5 }
  assert.equal(dropFloorPointOnto(front, C.floorPolygon), null)
})

test("depth key orders floor points by closeness to the camera", () => {
  assert.ok(floorDepthKey({ x: 4, z: 4 }) > floorDepthKey({ x: 3, z: 4 }))
  // equal key, equal screen y
  near(floorToShell(C, { x: 2, z: 5 }).y, floorToShell(C, { x: 5, z: 2 }).y, 1e-9, "same row")
})

test("feet past a chair's front faces are in front of it, behind its back faces behind it", () => {
  const chair: FloorBox = { minX: 3, maxX: 4, minZ: 3, maxZ: 4 }
  assert.ok(isFloorPointInFrontOfBox({ x: 4.3, z: 3.5 }, chair), "in front of the right-front face")
  assert.ok(isFloorPointInFrontOfBox({ x: 3.5, z: 4.3 }, chair), "in front of the left-front face")
  assert.ok(!isFloorPointInFrontOfBox({ x: 2.7, z: 3.5 }, chair), "behind the back-left face")
  assert.ok(!isFloorPointInFrontOfBox({ x: 3.5, z: 2.7 }, chair), "behind the back-right face")
  assert.ok(isFloorPointInFrontOfBox({ x: 4.5, z: 4.5 }, chair), "diagonally in front")
  assert.ok(!isFloorPointInFrontOfBox({ x: 2.5, z: 2.5 }, chair), "diagonally behind")
})

test("her size is one scale everywhere: the lab height gives the lab's shell height", () => {
  const raw = rawCalibration as { avatar: { height_shell_px: number } }
  near(avatarFigureHeightPx(C, C.avatarHeight, C.canvas.height), raw.avatar.height_shell_px, 0.1, "shell px")
  // and the same fraction of any stage
  near(avatarFigureHeightPx(C, 2, 1428) / avatarFigureHeightPx(C, 2, 714), 2, 1e-12, "scales with the stage")
})

test("grid cells are half tiles from the back corner", () => {
  assert.deepEqual(floorCellOf(C, { x: 3.8, z: 3.6 }), { i: 7, j: 7 })
  assert.deepEqual(floorCellCentre(C, { i: 7, j: 7 }), { x: 3.75, z: 3.75 })
  assert.deepEqual(floorCellOf(C, { x: -0.2, z: 0.1 }), { i: -1, j: 0 })
})

test("a footprint in the last row before a wall goes flush with that wall's measured base", () => {
  const atLeftWall = fitFloorBoxToWalls(C, { minX: -0.5, maxX: 0.5, minZ: 3, maxZ: 4 })
  near(atLeftWall.minX, Math.max(leftWallX(C, 3), leftWallX(C, 4)) + 0.01, 1e-9, "left wall flush")
  near(atLeftWall.maxX - atLeftWall.minX, 1, 1e-9, "size kept")
  assert.ok(isFloorBoxOnFloor(C, atLeftWall), "on the floor, not in the wall")
  // the right wall drifts away from the tiles: the far end of the last row is a whole half cell deep
  const atRightWall = fitFloorBoxToWalls(C, { minX: 6, maxX: 7, minZ: -0.5, maxZ: 0.5 })
  near(atRightWall.minZ, Math.max(rightWallZ(C, 6), rightWallZ(C, 7)) + 0.01, 1e-9, "right wall flush")
  assert.ok(isFloorBoxOnFloor(C, atRightWall))
  // a footprint in the middle of the room keeps its cells
  const middle = { minX: 3, maxX: 4, minZ: 3, maxZ: 4 }
  assert.deepEqual(fitFloorBoxToWalls(C, middle), middle)
})

test("a footprint over the front edge is off the floor", () => {
  assert.ok(!isFloorBoxOnFloor(C, { minX: 7, maxX: 8, minZ: 3, maxZ: 4 }))
  assert.ok(isFloorBoxOnFloor(C, { minX: 6.5, maxX: 7.5, minZ: 3, maxZ: 4 }))
})

test("the calibration file is checked when it loads", () => {
  assert.throws(() => parseRoomCalibration({ version: "other" }), /version/)
  const broken = structuredClone(rawCalibration) as { camera: { px_per_world_unit: unknown } }
  broken.camera.px_per_world_unit = "97"
  assert.throws(() => parseRoomCalibration(broken), /px_per_world_unit/)
})
