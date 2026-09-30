import assert from "node:assert/strict"
import test from "node:test"
import * as bottomNavMotionModel from "./bottomNavMotionModel"
import {
  BOTTOM_NAV_PRESSED_SCALE,
  BOTTOM_NAV_PRESS_DURATION_MS,
  getBottomNavMotionDuration,
} from "./bottomNavMotionModel"

test("bottom navigation uses a subtle press response without shrinking its layout", () => {
  assert.equal(BOTTOM_NAV_PRESSED_SCALE, 0.97)
  assert.equal(BOTTOM_NAV_PRESS_DURATION_MS, 80)
  assert.equal(getBottomNavMotionDuration(false), 150)
  assert.equal(getBottomNavMotionDuration(true), 0)
})

// A11Y-2: tabs use accessibilityRole="tab", whose trait already announces
// "tab"/"sekme", the position and "selected"; the accessible name is the
// localized label alone (pinned in mainTabPagerContract.test.mjs).
test("bottom navigation no longer builds verb-phrase tab labels", () => {
  assert.equal("getBottomNavAccessibilityLabel" in bottomNavMotionModel, false)
})
