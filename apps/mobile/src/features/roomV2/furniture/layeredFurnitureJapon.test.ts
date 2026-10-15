import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { ROOM_BLUMI_WORLD_FLOOR_GRID } from "@blumi/domain"
import {
  compareRoomV2RenderItems,
  createRoomV2AvatarRenderItem,
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
import {
  createMyRoomAvatarDepthNeighbours,
  getMyRoomAvatarDepthIndex
} from "../../roomWorld/myRoomAvatarWalkModel"
import { createRoomWorldGeometryFromRoomV2Scene, createRoomWorldHotspotsFromRoomV2Scene } from "../../roomWorld/roomWorldRoomV2Projection"
import { getRoomWorldMotionReadinessSummary } from "../../roomWorld/roomWorldDiagnostics"
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
  leftWallX,
  rightWallZ,
  ROOM_CALIBRATION as C,
  type WallSide
} from "../calibration/roomCalibration"
import { calibrateRoomShell, calibrateRoomWalkGeometry } from "../calibration/roomCalibrationScene"
import { stageFractionToWallSpot, wallSpotToStageFraction } from "../calibration/roomWallPlacement"
import {
  getLayeredFurnitureFloorBox,
  LAYERED_FURNITURE_SPECS,
  LAYERED_ROTATION_INDEX,
  parseLayeredFurnitureSpec,
  type LayeredRotationIndex
} from "./layeredFurniture"
import { LAYERED_WALL_SPECS } from "./layeredWallFurniture"
import rawBed from "./room_v3_bed_japon_sakura/item.json"

// The bundled art loads as file names in plain Node (Metro image modules).
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
/* eslint-disable @typescript-eslint/no-require-imports -- image modules need the hook above first. */
const { LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS } = require("./layeredFurnitureAssets") as
  typeof import("./layeredFurnitureAssets")
const { createRoomAvatar25dFurnitureCatalog } = require("./layeredFurnitureCatalog") as
  typeof import("./layeredFurnitureCatalog")
const { ROOM_V2_FURNITURE_CATALOG } = require("../roomV2Catalog") as
  typeof import("../roomV2Catalog")
// eslint-disable-next-line import/first -- the test room loads image modules, which need the require hook above first.
import { createLayeredFurnitureTestRoom } from "./layeredFurnitureTestRoom"
const { EDIT_ROOM_AVATAR_SPAWN } = require("../editor/roomEditorPlacementModel") as
  typeof import("../editor/roomEditorPlacementModel")
const tapModel = require("../components/roomFurnitureTapTargetModel") as
  typeof import("../components/roomFurnitureTapTargetModel")
const { PNG } = require("pngjs") as { PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } } }
/* eslint-enable @typescript-eslint/no-require-imports */

/** The first ten finished Japon pieces (Workbench batch_japon DONE_ITEM); the tea set and TV unit are in layeredFurnitureOyun.test.ts. */
const JAPON_FLOOR = [
  "room_v3_armchair_japon_cream",
  "room_v3_bed_japon_sakura",
  "room_v3_bookshelf_japon_rattan",
  "room_v3_clothesrack_japon_bamboo",
  "room_v3_coffeetable_japon_round",
  "room_v3_nightstand_japon_cedar",
  "room_v3_rug_japon_botanic",
  "room_v3_rug_japon_tea"
] as const
const JAPON_WALL = ["room_v3_frame_japon_sakura", "room_v3_clock_japon_flower"] as const
const RUGS = ["room_v3_rug_japon_botanic", "room_v3_rug_japon_tea"]
const TALL = ["room_v3_bookshelf_japon_rattan", "room_v3_clothesrack_japon_bamboo", "room_v3_bed_japon_sakura"]
const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const SHELL = calibrateRoomShell({
  id: "room_v2_shell_blumi_world_v1",
  name: "Blumi Home",
  asset: { key: "shell", source: 0 as never },
  canvasSize: { width: 1254, height: 714 },
  floorGrid: ROOM_BLUMI_WORLD_FLOOR_GRID
} satisfies RoomShell)

const calibration = createRoomAvatar25dRoomCalibration(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
const CATALOG = new Map(createRoomAvatar25dFurnitureCatalog(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
  .map((item) => [item.id, item]))
const item = (id: string): FurnitureItem => CATALOG.get(id)!

function place(furniture: FurnitureItem, placed: Omit<PlacedRoomItem, "itemId">): RoomV2FurnitureRenderItem {
  return calibration.calibrateFurnitureItem(resolvePlacedFurnitureRenderItem({ ...placed, itemId: furniture.id }, furniture)!)
}

function onCell(id: string, i: number, j: number, rotation: RoomFurnitureRotation = "front"): RoomV2FurnitureRenderItem {
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  return place(item(id), { instanceId: `${id}-${i}-${j}`, x: point.x, y: point.y, rotation })
}

function canWalk(pieces: RoomV2FurnitureRenderItem[], to: { x: number; y: number }) {
  const scene = { shell: SHELL, renderItems: pieces }
  const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene(scene), SHELL)
  return createRoomWorldMovementPlan({
    geometry,
    from: MY_ROOM_AVATAR_SPAWN,
    to,
    clearance: ROOM_WORLD_AVATAR_COLLISION_CLEARANCE,
    timing: ROOM_WORLD_MY_ROOM_MOVEMENT_TIMING
  })
}

const stageOf = (x: number, z: number) => floorToStageFraction(C, { x, z })

test("every finished Japon piece is in the flagged experiment's catalog under its own item.json id, and nowhere else", () => {
  for (const id of [...JAPON_FLOOR, ...JAPON_WALL]) {
    const piece = CATALOG.get(id)
    assert.ok(piece, `${id} missing from the experiment catalog`)
    assert.equal(piece.id, id)
    const raw = JSON.parse(readFileSync(join(__dirname, id, "item.json"), "utf8")) as { id: string }
    assert.equal(raw.id, id, `${id}: the bundled item.json keeps its canonical id`)
    // a bundle without the flag: the shipped catalog never has it
    assert.ok(!ROOM_V2_FURNITURE_CATALOG.some((shipped) => shipped.id === id), id)
  }
  // no art in the bundle, no entry
  assert.deepEqual(createRoomAvatar25dFurnitureCatalog({}, {}), [])
})

test("every bundled layer exists at its rotation's size, with fully transparent pixels zeroed", () => {
  const check = (file: string, size: [number, number]) => {
    assert.ok(existsSync(file), file)
    const image = PNG.sync.read(readFileSync(file))
    assert.deepEqual([image.width, image.height], size, file)
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (image.data[offset + 3] !== 0) continue
      assert.ok(image.data[offset] === 0 && image.data[offset + 1] === 0 && image.data[offset + 2] === 0, `${file}: RGB under alpha 0`)
    }
  }
  for (const id of JAPON_FLOOR) {
    const spec = LAYERED_FURNITURE_SPECS[id]!
    for (const r of [0, 1, 2, 3] as LayeredRotationIndex[]) {
      const art = LAYERED_FURNITURE_ASSETS[id]![r]
      for (const layer of [art.back, art.front, art.shadow]) {
        if (layer) check(layer.source as unknown as string, spec.rotations[r].size)
      }
      // a front layer only where a seated avatar can be covered
      if (spec.rotations[r].seats.length === 0) assert.equal(art.front, undefined, `${id} r${r}`)
    }
  }
  for (const id of JAPON_WALL) {
    for (const wall of ["left", "right"] as WallSide[]) {
      const art = LAYERED_WALL_ASSETS[id]![wall]
      check(art.back.source as unknown as string, LAYERED_WALL_SPECS[id]!.variants[wall].size)
    }
  }
})

test("each floor piece stands on its item.json cells (w × d, turned for odd rotations), idempotently, id unchanged", () => {
  for (const id of JAPON_FLOOR) {
    const raw = JSON.parse(readFileSync(join(__dirname, id, "item.json"), "utf8")) as { footprint: { w: number; d: number } }
    for (const rotation of ROTATIONS) {
      const piece = onCell(id, 9, 9, rotation)
      assert.equal(piece.itemId, id)
      const { cells } = getLayeredFurnitureFloorBox(LAYERED_FURNITURE_SPECS[id]!, piece, C)
      const r = LAYERED_ROTATION_INDEX[rotation]
      const expected = r % 2 === 0 ? [raw.footprint.w, raw.footprint.d] : [raw.footprint.d, raw.footprint.w]
      assert.deepEqual([(cells.maxX - cells.minX) / 0.5, (cells.maxZ - cells.minZ) / 0.5], expected, `${id} ${rotation}`)
      assert.deepEqual(calibration.calibrateFurnitureItem(piece), piece, `${id} ${rotation}: idempotent`)
      // drawn at size / its own scale, the footprint centre on the sprite's anchor
      const rot = LAYERED_FURNITURE_SPECS[id]!.rotations[r]
      assert.ok(Math.abs(piece.width * C.canvas.width - rot.size[0] / 2) < 1e-9)
      const { placed } = getLayeredFurnitureFloorBox(LAYERED_FURNITURE_SPECS[id]!, piece, C)
      const anchor = floorToShell(C, { x: (placed.minX + placed.maxX) / 2, z: (placed.minZ + placed.maxZ) / 2 })
      const left = (piece.x + piece.renderOffset!.x - piece.width * piece.anchor.x) * C.canvas.width
      assert.ok(Math.abs(left - (anchor.x - rot.anchorPx[0] / 2)) < 1e-6, `${id} ${rotation}: anchor`)
    }
    assert.deepEqual(calibration.furnitureRotations(id), ROTATIONS)
  }
})

test("pieces lined up on one cell edge with a free cell between them may both stand there (nightstand by the bed)", () => {
  for (const rotation of ROTATIONS) {
    const bed = onCell("room_v3_bed_japon_sakura", 6, 6, rotation)
    const nightstand = onCell("room_v3_nightstand_japon_cedar", 3, 9, rotation)
    for (const [piece, other] of [[bed, nightstand], [nightstand, bed]] as const) {
      const result = validateRoomV2FurniturePlacement({ scene: { shell: SHELL, renderItems: [other] }, candidate: piece })
      assert.ok(result.isValid, `${piece.itemId} ${rotation}: ${JSON.stringify(result.issueIds)}`)
    }
  }
})

test("the armchair seats one and the bed two on its edge in every rotation; she can walk to every seat", () => {
  const expected: Record<string, string[]> = {
    room_v3_armchair_japon_cream: ["s0"],
    room_v3_bed_japon_sakura: ["s0", "s1"]
  }
  for (const [id, seatIds] of Object.entries(expected)) {
    assert.equal(item(id).interactionType, "seat")
    assert.equal(item(id).seatSpec?.capacity, seatIds.length)
    for (const rotation of ROTATIONS) {
      const piece = onCell(id, 8, 8, rotation)
      assert.deepEqual(piece.seatWorldPoints!.map((seat) => seat.id), seatIds, `${id} ${rotation}`)
      assert.deepEqual(piece.layered25d!.seats.map((seat) => seat.id), seatIds)
      for (const hotspot of createRoomWorldHotspotsFromRoomV2Scene({ shell: SHELL, renderItems: [piece] })) {
        assert.ok(canWalk([piece], hotspot.approachPoint!), `${id} ${rotation} ${hotspot.seatId}: unreachable`)
      }
    }
  }
  for (const id of JAPON_FLOOR.filter((id) => !(id in expected))) {
    assert.equal(item(id).interactionType, "decor", id)
    assert.deepEqual(onCell(id, 8, 8).seatWorldPoints, [], id)
  }
})

test("a pose-pending seat (the bed's lie) is left out, never shown with the sitting pose", () => {
  const withLie = structuredClone(rawBed) as { rotations: Record<string, { seats: Record<string, unknown>[] }> }
  for (const rotation of Object.values(withLie.rotations)) {
    rotation.seats.push({ ...rotation.seats[0]!, id: "lie0", pose: "lie" })
  }
  const spec = parseLayeredFurnitureSpec(withLie)
  for (const r of [0, 1, 2, 3] as LayeredRotationIndex[]) {
    assert.deepEqual(spec.rotations[r].seats.map((seat) => seat.id), ["s0", "s1"])
  }
  for (const r of [0, 1, 2, 3] as LayeredRotationIndex[]) {
    assert.ok(LAYERED_FURNITURE_SPECS.room_v3_bed_japon_sakura!.rotations[r].seats.every((seat) => seat.id.startsWith("s")))
  }
})

test("rugs lie flat under everything: walkable, never blocking, no shadow, drawn on the floor layer", () => {
  for (const id of RUGS) {
    assert.equal(item(id).layer, "floor")
    assert.equal(item(id).blocksMovement, false)
    const rug = onCell(id, 8, 8)
    assert.equal(rug.layered25d!.shadowAsset, undefined)
    // no walk blocker: she crosses the rug's middle
    const geometry = createRoomWorldGeometryFromRoomV2Scene({ shell: SHELL, renderItems: [rug] })
    assert.ok(!(geometry.blockers ?? []).some((blocker) => blocker.id === rug.renderId), id)
    const box = getLayeredFurnitureFloorBox(LAYERED_FURNITURE_SPECS[id]!, rug, C).placed
    assert.ok(canWalk([rug], stageOf((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2)), `${id}: walk onto it`)
    // a table and an armchair may stand on it
    for (const other of [onCell("room_v3_coffeetable_japon_round", 7, 7), onCell("room_v3_armchair_japon_cream", 8, 9)]) {
      const result = validateRoomV2FurniturePlacement({ scene: { shell: SHELL, renderItems: [rug] }, candidate: other })
      assert.ok(result.isValid, `${other.itemId} on ${id}: ${JSON.stringify(result.issueIds)}`)
      // and every upright piece draws over it, whatever their depths
      assert.ok(compareRoomV2RenderItems(rug, other) < 0)
    }
    const avatar = createRoomV2AvatarRenderItem({ avatarId: "a", name: "a", layers: [], x: 0.5, y: 0.1, width: 0.1, height: 0.2 })
    assert.ok(compareRoomV2RenderItems(rug, avatar) < 0, `${id}: under her even far behind`)
  }
})

test("she draws behind a tall piece from behind and in front of it from the front, and can walk around it", () => {
  const avatar = { layer: "furniture" as const, renderId: "room_v2_avatar_me" }
  for (const id of TALL) {
    for (const rotation of ROTATIONS) {
      const piece = onCell(id, 9, 9, rotation)
      const box = getLayeredFurnitureFloorBox(LAYERED_FURNITURE_SPECS[id]!, piece, C).placed
      const neighbours = createMyRoomAvatarDepthNeighbours([piece], avatar)
      const behind = stageOf(box.minX - 0.3, box.minZ - 0.3)
      const front = stageOf(box.maxX + 0.3, box.maxZ + 0.3)
      assert.equal(getMyRoomAvatarDepthIndex(neighbours, behind.y, behind.x, behind.y), 0, `${id} ${rotation}: behind`)
      assert.equal(getMyRoomAvatarDepthIndex(neighbours, front.y, front.x, front.y), 1, `${id} ${rotation}: in front`)
      assert.ok(canWalk([piece], behind), `${id} ${rotation}: a path to behind it`)
    }
  }
})

test("a tap anywhere on the armchair's or the bed's drawn back layer, in every rotation, is a tap on it", () => {
  for (const id of ["room_v3_armchair_japon_cream", "room_v3_bed_japon_sakura"]) {
    for (const r of [0, 1, 2, 3] as const) {
      const key = `${id}_layered_r${r}_back`
      const outline = tapModel.ROOM_FURNITURE_DRAWN_OUTLINES[key]
      assert.ok(outline, `no tap outline for ${key}`)
      const image = PNG.sync.read(readFileSync(join(__dirname, id, `r${r}_back.png`)))
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
  }
})

test("wall pieces were projected onto the app's own measured walls and draw the wall they hang on", () => {
  for (const id of JAPON_WALL) {
    const raw = JSON.parse(readFileSync(join(__dirname, id, "item.json"), "utf8")) as {
      wallVariants: Record<WallSide, { wall_plane: { at_t0: number; per_unit: number } }>
    }
    for (const t of [0, 3.5, 7]) {
      const right = raw.wallVariants.right.wall_plane
      const left = raw.wallVariants.left.wall_plane
      assert.ok(Math.abs(rightWallZ(C, t) - (right.at_t0 + right.per_unit * t)) < 1e-6)
      assert.ok(Math.abs(leftWallX(C, t) - (left.at_t0 + left.per_unit * t)) < 1e-6)
    }
    assert.equal(item(id).placementSurface, "wall")
    assert.equal(calibration.furnitureRotations(id), undefined, `${id}: nothing to turn on a wall`)
    const spec = LAYERED_WALL_SPECS[id]!
    for (const wall of ["left", "right"] as WallSide[]) {
      const target = wallSpotToStageFraction(C, { wall, along: 2.5, height: 1.5 })
      const point = calibration.snapWallItem(place(item(id), { instanceId: id, ...target, rotation: "front" }), target)
      const piece = place(item(id), { instanceId: id, ...point, rotation: "front" })
      assert.equal(piece.asset.key, `${id}_layered_${wall}_back`)
      assert.equal(piece.wallPlacement?.wall, wall)
      assert.ok(piece.wallPlacement?.isValid, `${id} on the ${wall} wall`)
      // the drawing was rendered with its centre `mount_height_default` above its base line (`anchor_px`): that base
      // line is on the wall plane straight under the centre, that far below it
      const spot = stageFractionToWallSpot(C, wall, point)
      const variant = raw.wallVariants[wall] as unknown as { anchor_px: [number, number]; mount_height_default: number }
      const left = (piece.x - piece.width * piece.anchor.x) * C.canvas.width
      const top = (piece.y - piece.height * piece.anchor.y) * C.canvas.height
      const base = wallSpotToStageFraction(C, { ...spot, height: spot.height - variant.mount_height_default })
      assert.ok(Math.abs(left + variant.anchor_px[0] / spec.scale - base.x * C.canvas.width) < 0.5, `${id} ${wall}: x`)
      assert.ok(Math.abs(top + variant.anchor_px[1] / spec.scale - base.y * C.canvas.height) < 0.5, `${id} ${wall}: y`)
      // its centre stays within its own mount heights, even dragged low or high
      for (const height of [0.4, 1.5, 2.3]) {
        const held = wallSpotToStageFraction(C, { wall, along: 2.5, height })
        const snapped = stageFractionToWallSpot(C, wall, calibration.snapWallItem(piece, held))
        assert.ok(snapped.height >= spec.mountHeight[0] - 1e-3 && snapped.height <= spec.mountHeight[1] + 1e-3,
          `${id} ${wall} held at ${height}: centre at ${snapped.height}`)
      }
    }
  }
})

test("a furnished room with the rug and the coffee table in front of the sofa is all valid, every seat reachable", () => {
  const all = new Map(CATALOG)
  // the blush chair is a layered piece too (its old flat art was retired in X8): stand-in layer images
  const blushLayers = Object.fromEntries(([0, 1, 2, 3] as const).map((r) => [r, {
    back: { key: `blush_r${r}_back`, source: 0 as never },
    front: { key: `blush_r${r}_front`, source: 0 as never },
    shadow: { key: `blush_r${r}_shadow`, source: 0 as never }
  }])) as unknown as Parameters<typeof createRoomAvatar25dFurnitureCatalog>[0][string]
  const blush = createRoomAvatar25dFurnitureCatalog({ room_v2_chair_blush: blushLayers })
    .find((entry) => entry.id === "room_v2_chair_blush")!
  all.set(blush.id, blush)
  const decor = createLayeredFurnitureTestRoom()
  const pieces = decor.placedItems.map((placed) =>
    calibration.calibrateFurnitureItem(resolvePlacedFurnitureRenderItem(placed, all.get(placed.itemId)!)!))
  assert.ok(pieces.some((piece) => piece.itemId === "room_v3_rug_japon_botanic"))
  assert.ok(pieces.some((piece) => piece.itemId === "room_v3_coffeetable_japon_round"))
  for (const piece of pieces) {
    const result = validateRoomV2FurniturePlacement({
      scene: { shell: SHELL, renderItems: pieces.filter((other) => other !== piece) },
      candidate: piece
    })
    assert.ok(result.isValid, `${piece.itemId}: ${JSON.stringify(result.issueIds)}`)
  }
  for (const hotspot of createRoomWorldHotspotsFromRoomV2Scene({ shell: SHELL, renderItems: pieces })) {
    assert.ok(canWalk(pieces, hotspot.approachPoint!), `${hotspot.id}: unreachable`)
  }
  // the editor refuses every move in a room whose edit spawn is blocked: the furnished room keeps it free
  const geometry = calibrateRoomWalkGeometry(createRoomWorldGeometryFromRoomV2Scene({ shell: SHELL, renderItems: pieces }), SHELL)
  const readiness = getRoomWorldMotionReadinessSummary({ geometry, spawn: EDIT_ROOM_AVATAR_SPAWN })
  assert.notEqual(readiness.level, "blocked", JSON.stringify(readiness.issueIds))
})
