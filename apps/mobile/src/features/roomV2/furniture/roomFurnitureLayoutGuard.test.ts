import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import type { FurnitureItem, PlacedRoomItem, RoomFurnitureRotation, RoomV2FurnitureRenderItem } from "../roomV2.types"

/**
 * Tree-wide guard over every piece the room catalog sells, so a new piece cannot bring back what the 2026-10-17
 * room audit found: its drawing stands on its own floor cells (never floating above them, never spilling onto a
 * neighbour's), the nearer of two neighbours is the one drawn over the other where their drawings meet, a small
 * rug laid on a bigger one stays visible, and no wall piece hangs over another.
 */

// The layered art loads as file names in plain Node (Metro image modules).
for (const extension of [".png", ".webp", ".jpg"]) {
  require.extensions[extension] = (module, filename) => { module.exports = filename }
}
/* eslint-disable @typescript-eslint/no-require-imports -- the room seam must be in place before the room modules load */
const { createRoomAvatar25dRoomCalibration } = require("../calibration/roomAvatar25dRoomCalibration") as
  typeof import("../calibration/roomAvatar25dRoomCalibration")
const { LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS } = require("./layeredFurnitureAssets") as
  typeof import("./layeredFurnitureAssets")
const { createRoomAvatar25dFurnitureCatalog } = require("./layeredFurnitureCatalog") as
  typeof import("./layeredFurnitureCatalog")
const { roomAvatar25d: stub, installRoomAvatarSeam } = require("../../avatar/roomAvatarSeam") as
  typeof import("../../avatar/roomAvatarSeam")
const roomCalibration = createRoomAvatar25dRoomCalibration(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
const furnitureCatalog: FurnitureItem[] = [...createRoomAvatar25dFurnitureCatalog(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)]
installRoomAvatarSeam({ ...stub, roomCalibration, furnitureCatalog })

const { resolvePlacedFurnitureRenderItem, resolveRoomV2Scene, sortRoomV2RenderItems, validateRoomV2FurniturePlacement } =
  require("../roomV2Selectors") as typeof import("../roomV2Selectors")
const { ROOM_V2_SHELL_CATALOG } = require("../roomV2Catalog") as typeof import("../roomV2Catalog")
const { floorBoxCorners, floorCellCentre, floorToShell, floorToStageFraction, ROOM_CALIBRATION: C } =
  require("../calibration/roomCalibration") as typeof import("../calibration/roomCalibration")
const { PNG } = require("pngjs") as { PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } } }
/* eslint-enable @typescript-eslint/no-require-imports */

const SHELL_ID = "room_v2_shell_blumi_world_v1"
const ROTATIONS: RoomFurnitureRotation[] = ["front", "right", "back", "left"]
const W = C.canvas.width
const H = C.canvas.height
/** Shell px of slack for the drawing's anti-aliased edge. */
const EDGE_SLACK_PX = 2
/** Alpha above which a drawn pixel counts as the piece (shadows and soft edges below it do not). */
const SOLID_ALPHA = 40
/** Drawings of two neighbours that share fewer shell px than this only graze each other. */
const MEETING_PX = 25

const floorPieces = furnitureCatalog.filter((piece) => piece.placementSurface !== "wall")
const solidPieces = floorPieces.filter((piece) => piece.blocksMovement)
const rugs = floorPieces.filter((piece) => !piece.blocksMovement)
const wallPieces = furnitureCatalog.filter((piece) => piece.placementSurface === "wall")
const byId = new Map(furnitureCatalog.map((piece) => [piece.id, piece]))
const SHELL = resolveRoomV2Scene({
  decor: { roomShellId: SHELL_ID, placedItems: [] },
  furnitureCatalog,
  roomShellCatalog: ROOM_V2_SHELL_CATALOG,
  defaultRoomShellId: SHELL_ID
}).shell

function onCell(id: string, i: number, j: number, rotation: RoomFurnitureRotation, instanceId: string): PlacedRoomItem {
  const point = floorToStageFraction(C, floorCellCentre(C, { i, j }))
  return { instanceId, itemId: id, x: point.x, y: point.y, rotation }
}

function rendered(placed: PlacedRoomItem): RoomV2FurnitureRenderItem {
  return resolvePlacedFurnitureRenderItem(placed, byId.get(placed.itemId)!)!
}

function drawOrder(placed: PlacedRoomItem[]): string[] {
  return resolveRoomV2Scene({
    decor: { roomShellId: SHELL_ID, placedItems: placed },
    furnitureCatalog,
    roomShellCatalog: ROOM_V2_SHELL_CATALOG,
    defaultRoomShellId: SHELL_ID
  }).renderItems.map((item) => item.renderId)
}

interface Mask { left: number; top: number; width: number; height: number; solid: Uint8Array }

const images = new Map<string, { width: number; height: number; data: Buffer }>()
/** The piece's drawn pixels where the room draws them (shell px, its back layer). */
function maskOf(item: RoomV2FurnitureRenderItem): Mask {
  const offset = item.renderOffset ?? { x: 0, y: 0 }
  const file = item.asset.source as unknown as string
  const image = images.get(file) ?? PNG.sync.read(readFileSync(file))
  images.set(file, image)
  const width = Math.round(item.width * W)
  const height = Math.round(item.height * H)
  const solid = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = Math.min(image.width - 1, Math.floor(((x + 0.5) / width) * image.width))
    const sy = Math.min(image.height - 1, Math.floor(((y + 0.5) / height) * image.height))
    solid[y * width + x] = image.data[(sy * image.width + sx) * 4 + 3]! > SOLID_ALPHA ? 1 : 0
  }
  return cropToSolid({
    left: Math.round((item.x + offset.x - item.width * item.anchor.x) * W),
    top: Math.round((item.y + offset.y - item.height * item.anchor.y) * H),
    width,
    height,
    solid
  })
}

/** The same mask cut to its solid pixels' bounds (fewer pixels to compare). */
function cropToSolid(mask: Mask): Mask {
  let x0 = mask.width
  let x1 = 0
  let y0 = mask.height
  let y1 = 0
  for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) {
    if (!mask.solid[y * mask.width + x]) continue
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x + 1)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y + 1)
  }
  if (x1 <= x0) return { ...mask, width: 0, height: 0, solid: new Uint8Array(0) }
  const width = x1 - x0
  const solid = new Uint8Array(width * (y1 - y0))
  for (let y = y0; y < y1; y += 1) solid.set(mask.solid.subarray(y * mask.width + x0, y * mask.width + x1), (y - y0) * width)
  return { left: mask.left + x0, top: mask.top + y0, width, height: y1 - y0, solid }
}

/** Whether the two drawings share at least `MEETING_PX` solid shell px. */
function drawingsMeet(a: Mask, b: Mask): boolean {
  const x0 = Math.max(a.left, b.left)
  const x1 = Math.min(a.left + a.width, b.left + b.width)
  const y0 = Math.max(a.top, b.top)
  const y1 = Math.min(a.top + a.height, b.top + b.height)
  let count = 0
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
    if (a.solid[(y - a.top) * a.width + (x - a.left)] && b.solid[(y - b.top) * b.width + (x - b.left)]) count += 1
    if (count >= MEETING_PX) return true
  }
  return false
}

test("every floor piece's drawing stands on its own cells: not floating above them, not spilling past them", () => {
  for (const piece of floorPieces) for (const rotation of ROTATIONS) {
    const item = rendered(onCell(piece.id, 7, 7, rotation, "piece"))
    const mask = maskOf(item)
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) {
      if (!mask.solid[y * mask.width + x]) continue
      minX = Math.min(minX, mask.left + x)
      maxX = Math.max(maxX, mask.left + x + 1)
      maxY = Math.max(maxY, mask.top + y + 1)
    }
    const corners = floorBoxCorners(item.floorBox!).map((corner) => floorToShell(C, corner))
    const front = Math.max(...corners.map((corner) => corner.y))
    const sides = corners.filter((corner) => corner.y < front).map((corner) => corner.y)
    const label = `${piece.id} (${rotation})`
    assert.ok(minX >= Math.min(...corners.map((corner) => corner.x)) - EDGE_SLACK_PX, `${label} spills past its left corner`)
    assert.ok(maxX <= Math.max(...corners.map((corner) => corner.x)) + EDGE_SLACK_PX, `${label} spills past its right corner`)
    assert.ok(maxY <= front + EDGE_SLACK_PX, `${label} reaches below its front corner`)
    // its lowest point is on the front half of its cells: lower than the side corners, so it stands on the floor
    assert.ok(maxY >= Math.max(...sides) - EDGE_SLACK_PX, `${label} floats above its cells`)
  }
})

test("where two neighbours' drawings meet, the nearer piece is drawn over the farther one", () => {
  // every solid piece beside every other, all turns, around one spot mid-floor
  const placements = new Map<string, { placed: PlacedRoomItem; item: RoomV2FurnitureRenderItem; mask?: Mask }[]>()
  for (const piece of solidPieces) for (const rotation of ROTATIONS) {
    const list = []
    for (let i = 3; i <= 9; i += 1) for (let j = 3; j <= 9; j += 1) {
      const placed = onCell(piece.id, i, j, rotation, "second")
      const item = rendered(placed)
      if (validateRoomV2FurniturePlacement({ scene: { shell: SHELL, renderItems: [] }, candidate: item }).isValid) {
        list.push({ placed, item })
      }
    }
    placements.set(`${piece.id}|${rotation}`, list)
  }
  let met = 0
  for (const piece of solidPieces) for (const rotation of ROTATIONS) {
    const first = rendered(onCell(piece.id, 6, 6, rotation, "first"))
    const firstMask = maskOf(first)
    const p = first.floorBox!
    for (const candidates of placements.values()) for (const candidate of candidates) {
      const q = candidate.item.floorBox!
      const shareZ = p.minZ < q.maxZ - 1e-6 && q.minZ < p.maxZ - 1e-6
      const shareX = p.minX < q.maxX - 1e-6 && q.minX < p.maxX - 1e-6
      const secondNearer = (q.minX >= p.maxX - 1e-6 && shareZ) || (q.minZ >= p.maxZ - 1e-6 && shareX)
      const firstNearer = (p.minX >= q.maxX - 1e-6 && shareZ) || (p.minZ >= q.maxZ - 1e-6 && shareX)
      if (secondNearer === firstNearer) continue
      candidate.mask ??= maskOf(candidate.item)
      if (!drawingsMeet(firstMask, candidate.mask)) continue
      const scene = { shell: SHELL, renderItems: [first] }
      if (!validateRoomV2FurniturePlacement({ scene, candidate: candidate.item }).isValid) continue
      // the room's own order (what the scene and MiniRoom draw), fed in the farther-first and nearer-first ways
      const order = sortRoomV2RenderItems([first, candidate.item]).map((item) => item.renderId)
      assert.deepEqual(sortRoomV2RenderItems([candidate.item, first]).map((item) => item.renderId), order)
      const nearer = secondNearer ? "second" : "first"
      assert.equal(order[1], nearer,
        `${piece.id} (${rotation}) beside ${candidate.placed.itemId} (${candidate.placed.rotation}): the nearer one draws last`)
      met += 1
    }
  }
  assert.ok(met > 1000, `checked ${met} neighbours whose drawings meet`)
})

test("a rug laid inside a bigger rug is drawn over it", () => {
  let checked = 0
  for (const big of rugs) for (const small of rugs) for (const bigTurn of ROTATIONS) for (const smallTurn of ROTATIONS) {
    for (let di = -3; di <= 0; di += 1) for (let dj = -3; dj <= 0; dj += 1) {
      const bigPlaced = onCell(big.id, 9, 9, bigTurn, "big")
      const smallPlaced = onCell(small.id, 9 + di, 9 + dj, smallTurn, "small")
      const a = rendered(bigPlaced).floorBox!
      const b = rendered(smallPlaced).floorBox!
      const inside = b.minX >= a.minX && b.maxX <= a.maxX && b.minZ >= a.minZ && b.maxZ <= a.maxZ
      const smaller = (b.maxX - b.minX) * (b.maxZ - b.minZ) < (a.maxX - a.minX) * (a.maxZ - a.minZ)
      if (!inside || !smaller) continue
      assert.deepEqual(drawOrder([smallPlaced, bigPlaced]), ["big", "small"], `${small.id} inside ${big.id}`)
      checked += 1
    }
  }
  assert.ok(checked > 0, "some rug fits inside another")
})

test("no wall piece may hang over another, on either wall", () => {
  for (const target of [{ x: 0.72, y: 0.3 }, { x: 0.25, y: 0.32 }]) {
    for (const hung of wallPieces) for (const dropped of wallPieces) {
      const probe = (piece: FurnitureItem, instanceId: string) => {
        const draft = rendered({ instanceId, itemId: piece.id, x: target.x, y: target.y, rotation: "front", placementSurface: "wall" })
        const point = roomCalibration.snapWallItem(draft, target)
        return rendered({ instanceId, itemId: piece.id, x: point.x, y: point.y, rotation: "front", placementSurface: "wall" })
      }
      const first = probe(hung, "hung")
      const second = probe(dropped, "dropped")
      assert.ok(first.wallPlacement!.isValid && second.wallPlacement!.isValid, `${hung.id} / ${dropped.id} fit the wall`)
      const result = validateRoomV2FurniturePlacement({ scene: { shell: SHELL, renderItems: [first] }, candidate: second })
      assert.deepEqual(result.issueIds, ["overlaps_blocking_furniture"], `${dropped.id} over ${hung.id}`)
    }
  }
})
