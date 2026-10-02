import assert from "node:assert/strict"
import test from "node:test"
import {
  getCombinationRowRemoveThreshold,
  getCombinationRowRevealProgress,
  getCombinationRowSwipeClaim,
  getCombinationRowSwipeOffset,
  resolveCombinationRowSwipeRelease
} from "./shopCombinationRowSwipe"

// A typical outfit row in the preview overlay is about 150 pt wide.
const ROW = 150

/** Plays a drag the way the row's pan sees it: claim, follow, release. */
function swipe(path: readonly [number, number][], velocityX: number, rowWidth = ROW) {
  let claim: "wait" | "claim" | "fail" = "wait"
  const offsets: number[] = []
  for (const [dx, dy] of path) {
    if (claim === "wait") claim = getCombinationRowSwipeClaim(dx, dy)
    if (claim === "fail") return { claim, offsets, release: null }
    if (claim === "claim") offsets.push(getCombinationRowSwipeOffset(dx))
  }
  if (claim !== "claim") return { claim, offsets, release: null }
  const [lastDx] = path[path.length - 1] ?? [0, 0]
  return { claim, offsets, release: resolveCombinationRowSwipeRelease({ translationX: lastDx, velocityX, rowWidth }) }
}

test("a slow swipe right past the threshold removes the piece", () => {
  const result = swipe([[4, 1], [14, 2], [40, 3], [70, 3]], 120)
  assert.equal(result.claim, "claim")
  assert.deepEqual(result.offsets, [14, 40, 70])
  assert.equal(result.release, "remove")
})

test("releasing before the threshold springs back", () => {
  assert.equal(swipe([[12, 0], [40, 2]], 200).release, "restore")
  assert.equal(swipe([[12, 0], [80, 2], [30, 2]], 50).release, "restore", "dragged past, then back before lifting")
})

test("a quick flick right removes after a short move; a flick back cancels", () => {
  assert.equal(swipe([[12, 0], [30, 1]], 900).release, "remove")
  assert.equal(swipe([[12, 0], [18, 1]], 900).release, "restore", "too short to be a flick")
  assert.equal(swipe([[12, 0], [90, 1]], -900).release, "restore", "flicked back past the threshold")
})

test("vertical drags and drags to the left never claim the row", () => {
  assert.equal(swipe([[2, 12], [3, 40]], 0).claim, "fail", "the list keeps vertical scrolling")
  assert.equal(swipe([[-12, 1]], 0).claim, "fail", "a left drag stays with the main pager")
  assert.equal(swipe([[12, 10]], 0).claim, "fail", "diagonal is not a swipe")
  assert.equal(swipe([[3, 3]], 0).claim, "wait", "a tap stays a tap")
  assert.equal(getCombinationRowSwipeClaim(Number.NaN, 0), "fail")
})

test("the row never moves left of its rest and the backdrop grows to the threshold", () => {
  assert.equal(getCombinationRowSwipeOffset(-30), 0)
  assert.equal(getCombinationRowSwipeOffset(Number.NaN), 0)
  const threshold = getCombinationRowRemoveThreshold(ROW)
  assert.equal(threshold, 64, "short rows use the floor")
  assert.equal(getCombinationRowRemoveThreshold(300), 120, "wide rows use 40% of the width")
  assert.equal(getCombinationRowRemoveThreshold(0), 64, "before layout")
  assert.equal(getCombinationRowRevealProgress(0, threshold), 0)
  assert.equal(getCombinationRowRevealProgress(threshold / 2, threshold), 0.5)
  assert.equal(getCombinationRowRevealProgress(threshold * 2, threshold), 1, "armed")
  assert.equal(getCombinationRowRevealProgress(10, 0), 0)
})
