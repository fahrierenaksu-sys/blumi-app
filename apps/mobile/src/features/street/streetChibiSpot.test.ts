import assert from "node:assert/strict"
import test from "node:test"
import type { RoomPoint2D, RoomShell, RoomV2FurnitureRenderItem } from "../roomV2/roomV2.types"
import { ROOM_V2_BLUMI_WORLD_FLOOR_GRID } from "../roomV2/roomV2FloorGrid"
import { pickStreetChibiSpot, STREET_CHIBI_SEED } from "./streetChibiSpot"

const SHELL = { floorGrid: ROOM_V2_BLUMI_WORLD_FLOOR_GRID } as RoomShell
const CHIBI = { width: 0.06, height: 0.25 }

function square(center: RoomPoint2D, half: number): RoomPoint2D[] {
  return [
    { x: center.x - half, y: center.y - half },
    { x: center.x + half, y: center.y - half },
    { x: center.x + half, y: center.y + half },
    { x: center.x - half, y: center.y + half }
  ]
}

function piece(renderId: string, at: RoomPoint2D, size: { width: number; height: number }): RoomV2FurnitureRenderItem {
  return {
    kind: "furniture",
    renderId,
    itemId: renderId,
    layer: "furniture",
    depth: at.y,
    x: at.x,
    y: at.y,
    width: size.width,
    height: size.height,
    anchor: { x: 0.5, y: 1 },
    name: renderId,
    category: "misc",
    asset: { key: renderId, source: 1 },
    rotation: "front",
    usesMirroredRotation: false,
    blocksMovement: true,
    collisionPolygon: square(at, 0.05),
    interactionType: "none"
  }
}

function isInside(point: RoomPoint2D, center: RoomPoint2D, half: number): boolean {
  return Math.abs(point.x - center.x) <= half && Math.abs(point.y - center.y) <= half
}

test("in an empty room the chibi stands by the room's centre, in front of everything", () => {
  const spot = pickStreetChibiSpot({ shell: SHELL, renderItems: [], chibi: CHIBI })
  assert.ok(Math.hypot(spot.foot.x - STREET_CHIBI_SEED.x, spot.foot.y - STREET_CHIBI_SEED.y) < 0.05)
  assert.equal(spot.beforeRenderId, null)
})

test("a pouf on the centre spot moves the chibi onto free floor beside it, never on top of it", () => {
  const pouf = piece("pouf", STREET_CHIBI_SEED, { width: 0.08, height: 0.1 })
  const spot = pickStreetChibiSpot({ shell: SHELL, renderItems: [pouf], chibi: CHIBI })
  assert.equal(isInside(spot.foot, STREET_CHIBI_SEED, 0.05), false)
})

test("the chibi avoids a spot where a big piece in front would hide its body", () => {
  const front = { x: STREET_CHIBI_SEED.x, y: STREET_CHIBI_SEED.y + 0.12 }
  const armchair = piece("armchair", front, { width: 0.16, height: 0.22 })
  const spot = pickStreetChibiSpot({ shell: SHELL, renderItems: [armchair], chibi: CHIBI })
  const chair = { left: front.x - 0.08, right: front.x + 0.08, top: front.y - 0.22, bottom: front.y }
  const body = { left: spot.foot.x - CHIBI.width / 2, right: spot.foot.x + CHIBI.width / 2, top: spot.foot.y - CHIBI.height, bottom: spot.foot.y }
  const overlap = Math.max(0, Math.min(chair.right, body.right) - Math.max(chair.left, body.left)) *
    Math.max(0, Math.min(chair.bottom, body.bottom) - Math.max(chair.top, body.top))
  const hiddenShare = spot.beforeRenderId === "armchair" ? overlap / (CHIBI.width * CHIBI.height) : 0
  assert.ok(hiddenShare < 0.05, `armchair hides ${hiddenShare} of the chibi`)
})

test("a room without a floor grid keeps the centre spot and still sorts the chibi by depth", () => {
  const behind = piece("bed", { x: 0.5, y: 0.5 }, { width: 0.2, height: 0.2 })
  const spot = pickStreetChibiSpot({ shell: {} as RoomShell, renderItems: [behind], chibi: CHIBI })
  assert.deepEqual(spot.foot, STREET_CHIBI_SEED)
  assert.equal(spot.beforeRenderId, null)
})
