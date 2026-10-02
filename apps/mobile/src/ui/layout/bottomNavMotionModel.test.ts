import assert from "node:assert/strict"
import test from "node:test"
import {
  BOTTOM_NAV_PRESSED_SCALE,
  getBottomNavMotionDuration,
} from "./bottomNavMotionModel"

test("bottom navigation uses a subtle press response and no motion under Reduce Motion", () => {
  assert.ok(BOTTOM_NAV_PRESSED_SCALE > 0.9 && BOTTOM_NAV_PRESSED_SCALE < 1)
  assert.ok(getBottomNavMotionDuration(false) > 0)
  assert.equal(getBottomNavMotionDuration(true), 0)
})
