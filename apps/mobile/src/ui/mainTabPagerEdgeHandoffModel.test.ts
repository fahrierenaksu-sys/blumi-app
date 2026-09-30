import assert from "node:assert/strict"
import test from "node:test"
import {
  MAIN_TAB_PAGER_EDGE_HANDOFF,
  resolveHorizontalScrollerDragOwner
} from "./mainTabPagerEdgeHandoffModel"

const W = 240
const MAX = 2 * W // three pages
const SLOP = MAIN_TAB_PAGER_EDGE_HANDOFF.slop

// dx > 0: the finger moves right, towards the previous page (lower offset).
// dx < 0: the finger moves left, towards the next page (higher offset).
const owner = (dx: number, scrollOffset: number, dy = 0, maxScrollOffset = MAX) =>
  resolveHorizontalScrollerDragOwner({ dx, dy, scrollOffset, maxScrollOffset })

test("no decision before the finger passes the slop", () => {
  assert.equal(owner(SLOP - 1, 0), "wait")
  assert.equal(owner(-(SLOP - 1), W), "wait")
  assert.equal(owner(0, W, SLOP - 1), "wait")
})

test("on the first page the previous direction goes to the pager, the next direction stays", () => {
  assert.equal(owner(SLOP + 2, 0), "release", "nothing before the first page")
  assert.equal(owner(-(SLOP + 2), 0), "scroller", "the next page exists")
})

test("on the last page the next direction goes to the pager, the previous direction stays", () => {
  assert.equal(owner(-(SLOP + 2), MAX), "release", "nothing after the last page")
  assert.equal(owner(SLOP + 2, MAX), "scroller", "the previous page exists")
})

test("middle pages and a shelf between pages keep both directions", () => {
  assert.equal(owner(SLOP + 2, W), "scroller")
  assert.equal(owner(-(SLOP + 2), W), "scroller")
  assert.equal(owner(SLOP + 2, W / 3), "scroller", "still settling towards a page")
  assert.equal(owner(-(SLOP + 2), MAX - W / 3), "scroller")
})

test("an edge is an edge within a sub-pixel tolerance", () => {
  assert.equal(owner(SLOP + 2, MAIN_TAB_PAGER_EDGE_HANDOFF.edgeTolerance / 2), "release")
  assert.equal(owner(-(SLOP + 2), MAX - MAIN_TAB_PAGER_EDGE_HANDOFF.edgeTolerance / 2), "release")
})

test("a single page (1/1) hands both directions to the pager", () => {
  assert.equal(owner(SLOP + 2, 0, 0, 0), "release")
  assert.equal(owner(-(SLOP + 2), 0, 0, 0), "release")
})

test("vertical and diagonal-vertical drags are never kept by the scroller", () => {
  assert.equal(owner(2, W, SLOP + 4), "release")
  assert.equal(owner(SLOP + 2, W, SLOP + 6), "release", "more vertical than horizontal")
  assert.equal(owner(SLOP + 6, W, SLOP + 2), "scroller", "more horizontal than vertical")
})

test("unknown geometry keeps the previous behaviour: the scroller owns horizontal drags", () => {
  assert.equal(owner(SLOP + 2, Number.NaN), "scroller")
  assert.equal(owner(-(SLOP + 2), 0, 0, Number.NaN), "scroller")
})
