import assert from "node:assert/strict"
import test from "node:test"
import {
  getWardrobePageDotWidth,
  getWardrobeSegmentIndicatorFrame,
  getWardrobeTabIndicatorFrame,
  WARDROBE_PAGE_DOT_ACTIVE_WIDTH,
  WARDROBE_PAGE_DOT_SIZE
} from "./wardrobeIndicatorModel"

test("the tab indicator sits under the active flex tab, capped at its max width", () => {
  // 338 wide, 4 tabs, 4 gaps: (338 - 12) / 4 = 81.5 per tab.
  assert.deepEqual(getWardrobeTabIndicatorFrame({ rowWidth: 338, count: 4, index: 0 }), { x: 0, width: 81.5 })
  assert.deepEqual(getWardrobeTabIndicatorFrame({ rowWidth: 338, count: 4, index: 3 }), { x: 3 * 85.5, width: 81.5 })
  // A wide row caps tabs at 84 and keeps them left-aligned.
  assert.deepEqual(getWardrobeTabIndicatorFrame({ rowWidth: 420, count: 4, index: 2 }), { x: 2 * 88, width: 84 })
})

test("the tab indicator waits for a measured row and a real tab", () => {
  assert.equal(getWardrobeTabIndicatorFrame({ rowWidth: 0, count: 4, index: 0 }), null)
  assert.equal(getWardrobeTabIndicatorFrame({ rowWidth: 338, count: 4, index: -1 }), null, "no active tab")
  assert.equal(getWardrobeTabIndicatorFrame({ rowWidth: 338, count: 4, index: 4 }), null)
  assert.equal(getWardrobeTabIndicatorFrame({ rowWidth: 338, count: 0, index: 0 }), null)
})

test("the section capsule covers one half of the padded track", () => {
  assert.deepEqual(getWardrobeSegmentIndicatorFrame({ trackWidth: 228, padding: 4, count: 2, index: 0 }), { x: 0, width: 110 })
  assert.deepEqual(getWardrobeSegmentIndicatorFrame({ trackWidth: 228, padding: 4, count: 2, index: 1 }), { x: 110, width: 110 })
  assert.equal(getWardrobeSegmentIndicatorFrame({ trackWidth: 0, padding: 4, count: 2, index: 0 }), null)
  assert.equal(getWardrobeSegmentIndicatorFrame({ trackWidth: 228, padding: 4, count: 2, index: 2 }), null)
})

test("page dots follow the live position and keep the row width constant", () => {
  assert.equal(getWardrobePageDotWidth(0, 0), WARDROBE_PAGE_DOT_ACTIVE_WIDTH)
  assert.equal(getWardrobePageDotWidth(0, 1), WARDROBE_PAGE_DOT_SIZE)
  assert.equal(getWardrobePageDotWidth(0.5, 0), (WARDROBE_PAGE_DOT_SIZE + WARDROBE_PAGE_DOT_ACTIVE_WIDTH) / 2)
  assert.equal(getWardrobePageDotWidth(Number.NaN, 0), WARDROBE_PAGE_DOT_ACTIVE_WIDTH)
  for (const position of [0, 0.25, 0.5, 1, 1.7, 2]) {
    const total = [0, 1, 2].reduce((sum, index) => sum + getWardrobePageDotWidth(position, index), 0)
    assert.equal(total, WARDROBE_PAGE_DOT_SIZE * 3 + (WARDROBE_PAGE_DOT_ACTIVE_WIDTH - WARDROBE_PAGE_DOT_SIZE), `at ${position}`)
  }
})
