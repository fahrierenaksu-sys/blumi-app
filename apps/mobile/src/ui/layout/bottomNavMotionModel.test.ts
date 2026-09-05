import assert from "node:assert/strict"
import test from "node:test"
import {
  BOTTOM_NAV_PRESSED_SCALE,
  BOTTOM_NAV_PRESS_DURATION_MS,
  getBottomNavAccessibilityLabel,
  getBottomNavMotionDuration,
} from "./bottomNavMotionModel"

test("bottom navigation uses a subtle press response without shrinking its layout", () => {
  assert.equal(BOTTOM_NAV_PRESSED_SCALE, 0.97)
  assert.equal(BOTTOM_NAV_PRESS_DURATION_MS, 100)
  assert.equal(getBottomNavMotionDuration(false), 200)
  assert.equal(getBottomNavMotionDuration(true), 0)
})

test("bottom navigation accessibility actions follow the active app locale", () => {
  assert.equal(getBottomNavAccessibilityLabel("en", "Discover"), "Open Discover tab")
  assert.equal(getBottomNavAccessibilityLabel("tr", "Keşfet"), "Keşfet sekmesini aç")
  assert.equal(getBottomNavAccessibilityLabel("tr", "Odam", true), "Odam sekmesi")
})
