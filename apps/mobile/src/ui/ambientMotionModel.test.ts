import assert from "node:assert/strict"
import test from "node:test"
import { getPulseRestProgress, shouldRunSoftBlobLoop } from "./ambientMotionModel"

const visible = { variant: "lobby" as const, animated: true, reduceMotion: false, screenFocused: true, appActive: true }

test("the blob drift runs only on a visible, foreground, motion-allowed screen", () => {
  assert.equal(shouldRunSoftBlobLoop(visible), true)
  assert.equal(shouldRunSoftBlobLoop({ ...visible, screenFocused: false }), false, "covered or unselected page")
  assert.equal(shouldRunSoftBlobLoop({ ...visible, appActive: false }), false, "backgrounded app")
  assert.equal(shouldRunSoftBlobLoop({ ...visible, reduceMotion: true }), false)
  assert.equal(shouldRunSoftBlobLoop({ ...visible, animated: false }), false)
})

test("variants without blobs never run the loop", () => {
  for (const variant of ["register", "homeLiquid", "premiumMesh"] as const) {
    assert.equal(shouldRunSoftBlobLoop({ ...visible, variant }), false, variant)
  }
  for (const variant of ["lobby", "bootstrap", "miniRoom"] as const) {
    assert.equal(shouldRunSoftBlobLoop({ ...visible, variant }), true, variant)
  }
})

test("a bounded pulse rests at full size", () => {
  // MatchResult halo: 0.9 -> 1.1 rested at 0.9 before.
  assert.ok(Math.abs(0.9 + getPulseRestProgress(0.9, 1.1) * 0.2 - 1) < 1e-9)
  assert.ok(Math.abs(0.95 + getPulseRestProgress(0.95, 1.05) * 0.1 - 1) < 1e-9)
  assert.equal(getPulseRestProgress(1, 1.2), 0)
  assert.equal(getPulseRestProgress(1.1, 1.3), 0, "a pulse that never reaches 1 rests at its minimum")
  assert.equal(getPulseRestProgress(0.6, 0.9), 1)
  assert.equal(getPulseRestProgress(1, 1), 0)
})
