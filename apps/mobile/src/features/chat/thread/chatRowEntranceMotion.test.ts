import assert from "node:assert/strict"
import test from "node:test"
import { CHAT_ROW_ENTRANCE, chatRowEntranceFrame } from "./chatRowEntranceMotion"

test("a new row starts invisible a few points below its place and comes to rest", () => {
  const start = chatRowEntranceFrame(0)
  const rest = chatRowEntranceFrame(1)
  assert.equal(start.opacity, 0)
  assert.ok(start.translateY > 0, "it rises into place from just below")
  assert.deepEqual(rest, { opacity: 1, translateY: 0 })
})

test("the entrance is calm: short, a small rise, steady, and never past its place", () => {
  assert.ok(CHAT_ROW_ENTRANCE.durationMs > 0 && CHAT_ROW_ENTRANCE.durationMs <= 250)
  assert.ok(CHAT_ROW_ENTRANCE.risePt > 0 && CHAT_ROW_ENTRANCE.risePt <= 12)
  let previous = chatRowEntranceFrame(0)
  for (let step = 1; step <= 40; step += 1) {
    const frame = chatRowEntranceFrame(step / 40)
    assert.ok(frame.opacity >= previous.opacity, "the fade only goes in")
    assert.ok(frame.translateY <= previous.translateY, "the row only rises")
    assert.ok(frame.translateY >= 0, "no overshoot")
    previous = frame
  }
})

test("a bubble never grows, shrinks or pops: the entrance moves only opacity and height on screen", () => {
  for (const progress of [0, 0.25, 0.5, 1]) {
    assert.deepEqual(Object.keys(chatRowEntranceFrame(progress)).sort(), ["opacity", "translateY"])
  }
  // Out-of-range clocks stay at the ends instead of overshooting.
  assert.deepEqual(chatRowEntranceFrame(-1), chatRowEntranceFrame(0))
  assert.deepEqual(chatRowEntranceFrame(2), chatRowEntranceFrame(1))
})
