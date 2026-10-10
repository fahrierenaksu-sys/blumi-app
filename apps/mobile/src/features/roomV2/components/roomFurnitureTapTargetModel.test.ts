import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomFurnitureTapTarget,
  isPointInOutline,
  isRoomFurnitureTapOnSeat,
  ROOM_FURNITURE_MIN_TAP_TARGET_PT
} from "./roomFurnitureTapTargetModel"

// shipped layered art (the old flat bed and chair were retired in X8): the Japon bed's and the blush chair's
// front back-layers
const BED = "room_v3_bed_japon_sakura_layered_r0_back"
const CHAIR = "room_v2_chair_blush_layered_r0_back"

test("a tap on the drawn bed sits; a tap on the empty canvas around it does not", () => {
  // A wider box than the bed's layer: contained, with empty bands left and right.
  const box = { width: 560, height: 319 }
  const target = getRoomFurnitureTapTarget({ assetKey: BED, boxWidthPx: box.width, boxHeightPx: box.height, fit: "contain", mirrored: false })
  assert.ok(target)
  assert.equal(isRoomFurnitureTapOnSeat(target, box.width * 0.5, box.height * 0.45), true, "the mattress")
  for (const [x, y] of [[0.03, 0.05], [0.97, 0.05], [0.03, 0.95], [0.97, 0.95]] as const) {
    assert.equal(isRoomFurnitureTapOnSeat(target, box.width * x, box.height * y), false, `empty canvas at ${x},${y}`)
  }
  assert.ok(target.width < box.width, "the pressable covers the bed, not the letterbox bands")
})

test("the chair's empty corners are not part of the seat", () => {
  const target = getRoomFurnitureTapTarget({ assetKey: CHAIR, boxWidthPx: 200, boxHeightPx: 200, fit: "fill", mirrored: false })
  assert.ok(target)
  assert.equal(isRoomFurnitureTapOnSeat(target, 100, 100), true)
  assert.equal(isRoomFurnitureTapOnSeat(target, 196, 6), false, "top-right corner")
  assert.equal(isRoomFurnitureTapOnSeat(target, 196, 194), false, "bottom-right corner")
  assert.equal(isRoomFurnitureTapOnSeat(target, 6, 6), false, "top-left corner")
})

test("a mirrored image mirrors its seat", () => {
  const plain = getRoomFurnitureTapTarget({ assetKey: CHAIR, boxWidthPx: 200, boxHeightPx: 200, fit: "fill", mirrored: false })
  const mirrored = getRoomFurnitureTapTarget({ assetKey: CHAIR, boxWidthPx: 200, boxHeightPx: 200, fit: "fill", mirrored: true })
  assert.ok(plain && mirrored)
  // The chair reaches its layer's left edge and stops short of its right; mirrored, the reverse.
  assert.equal(isRoomFurnitureTapOnSeat(plain, 20, 120), true)
  assert.equal(isRoomFurnitureTapOnSeat(plain, 180, 120), false)
  assert.equal(isRoomFurnitureTapOnSeat(mirrored, 180, 120), true)
  assert.equal(isRoomFurnitureTapOnSeat(mirrored, 20, 120), false)
})

test("a contained image's seat follows where the image lands in a taller box", () => {
  // A square-ish chair in a tall box is letterboxed: the band above it is empty.
  const target = getRoomFurnitureTapTarget({ assetKey: CHAIR, boxWidthPx: 100, boxHeightPx: 200, fit: "contain", mirrored: false })
  assert.ok(target)
  assert.equal(isRoomFurnitureTapOnSeat(target, 50, 20), false, "letterbox band above the image")
  assert.equal(isRoomFurnitureTapOnSeat(target, 50, 100), true, "middle of the image")
  assert.ok(target.top > 40 && target.top + target.height < 160)
})

test("a tiny seat still gets a finger-sized target", () => {
  const target = getRoomFurnitureTapTarget({ assetKey: BED, boxWidthPx: 120, boxHeightPx: 68, fit: "contain", mirrored: false })
  assert.ok(target)
  assert.ok(target.width >= ROOM_FURNITURE_MIN_TAP_TARGET_PT - 1e-6 || target.width === 120)
  assert.ok(target.height >= ROOM_FURNITURE_MIN_TAP_TARGET_PT - 1e-6 || target.height === 68)
  assert.equal(isRoomFurnitureTapOnSeat(target, 60, 30), true)
})

test("art without a measured outline keeps its whole box as the target", () => {
  assert.equal(getRoomFurnitureTapTarget({ assetKey: "unmeasured_art", boxWidthPx: 100, boxHeightPx: 100, fit: "contain", mirrored: false }), null)
  assert.equal(getRoomFurnitureTapTarget({ assetKey: BED, boxWidthPx: 0, boxHeightPx: 0, fit: "contain", mirrored: false }), null)
})

test("points on an outline's edge count as inside", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  assert.equal(isPointInOutline(square, 5, 5), true)
  assert.equal(isPointInOutline(square, 10, 5), true)
  assert.equal(isPointInOutline(square, 0, 0), true)
  assert.equal(isPointInOutline(square, 10.5, 5), false)
})
