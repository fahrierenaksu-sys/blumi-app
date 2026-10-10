import assert from "node:assert/strict"
import test from "node:test"
import { isStillFullyDisplayed, NO_STILL_DISPLAY_RECEIPTS, recordStillLayerDisplay } from "./stillDisplayReceipts"

test("a still is displayed once every one of its layers has shown", () => {
  const assets = ["a", "b"]
  const one = recordStillLayerDisplay(NO_STILL_DISPLAY_RECEIPTS, "look", "a")
  assert.equal(isStillFullyDisplayed(one, "look", assets), false)
  assert.equal(isStillFullyDisplayed(recordStillLayerDisplay(one, "look", "b"), "look", assets), true)
})

test("recording never changes the receipts it was given, and a new look starts over", () => {
  const one = recordStillLayerDisplay(NO_STILL_DISPLAY_RECEIPTS, "look", "a")
  const other = recordStillLayerDisplay(one, "other", "b")
  assert.equal(one.shown.has("b"), false)
  assert.deepEqual([...other.shown], ["b"])
  assert.equal(isStillFullyDisplayed(other, "look", ["a"]), false)
})
