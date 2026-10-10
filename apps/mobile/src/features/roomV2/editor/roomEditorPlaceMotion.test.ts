import assert from "node:assert/strict"
import test from "node:test"
import {
  getRoomEditorSparkleFrame,
  getRoomEditorSquashScale,
  getRoomEditorTurnFrame,
  ROOM_EDITOR_PLACE_JUICE,
  ROOM_EDITOR_SETTLE_FALL,
  ROOM_EDITOR_SETTLE_MS,
  ROOM_EDITOR_SPARKLE_COUNT,
  ROOM_EDITOR_TURN_MS
} from "./roomEditorPlaceMotion"

/** The editor's reward beats: short, they end at rest, and nothing lingers. */

test("the beats are off in every build without the flagged room calibration", () => {
  // plain Node: the room seam is not installed
  assert.equal(ROOM_EDITOR_PLACE_JUICE, false)
})

test("the settle is a short beat that ends with the piece at its own size", () => {
  assert.ok(ROOM_EDITOR_SETTLE_MS >= 150 && ROOM_EDITOR_SETTLE_MS <= 300, `settle ${ROOM_EDITOR_SETTLE_MS} ms`)
  assert.ok(ROOM_EDITOR_SETTLE_FALL.durationMs < ROOM_EDITOR_SETTLE_MS)
  assert.deepEqual(getRoomEditorSquashScale(0), { x: 1, y: 1 })
  const squashed = getRoomEditorSquashScale(1)
  assert.ok(squashed.y < 1 && squashed.x > 1, "a squash is shorter and a little wider")
  assert.ok(squashed.y > 0.9 && squashed.x < 1.1, "and stays subtle")
})

test("sparkles pop in round the piece's base, drift up, and are gone when the burst ends", () => {
  for (let index = 0; index < ROOM_EDITOR_SPARKLE_COUNT; index += 1) {
    const start = getRoomEditorSparkleFrame(index, 0, 120)
    const middle = getRoomEditorSparkleFrame(index, 0.3, 120)
    const end = getRoomEditorSparkleFrame(index, 1, 120)
    assert.equal(start.opacity, 0, `sparkle ${index} starts hidden`)
    assert.ok(middle.opacity > 0.5, `sparkle ${index} shows`)
    assert.equal(end.opacity, 0, `sparkle ${index} ends hidden`)
    assert.ok(end.translateY < start.translateY, `sparkle ${index} rises`)
    assert.ok(Math.abs(start.translateX) <= 120, `sparkle ${index} starts near the piece`)
  }
  const spread = new Set(Array.from({ length: ROOM_EDITOR_SPARKLE_COUNT }, (_, index) =>
    Math.sign(Math.round(getRoomEditorSparkleFrame(index, 0.3, 120).translateX))))
  assert.ok(spread.has(1) && spread.has(-1), "sparkles surround the piece")
})

test("a soft turn is quick, never shows the floor through the piece, and ends on the new drawing at rest", () => {
  assert.ok(ROOM_EDITOR_TURN_MS >= 120 && ROOM_EDITOR_TURN_MS <= 250)
  const start = getRoomEditorTurnFrame(0)
  const end = getRoomEditorTurnFrame(1)
  assert.equal(start.outgoingOpacity, 1)
  assert.equal(end.outgoingOpacity, 0)
  assert.equal(end.incomingOpacity, 1)
  assert.equal(start.scale, 1)
  assert.ok(Math.abs(end.scale - 1) < 1e-9)
  for (let step = 0; step <= 20; step += 1) {
    const frame = getRoomEditorTurnFrame(step / 20)
    // the two drawings together always cover at least as much as one opaque drawing would
    assert.ok(frame.outgoingOpacity + frame.incomingOpacity >= 1 - 1e-9, `covered at ${step / 20}`)
    assert.ok(frame.scale >= 1 && frame.scale < 1.1, `gentle pulse at ${step / 20}`)
  }
})
