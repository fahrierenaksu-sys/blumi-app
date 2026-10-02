import assert from "node:assert/strict"
import test from "node:test"
import {
  formatBottomNavBadgeCount,
  getBadgeAppearMotion,
  getBadgeBumpMotion,
  getBadgeExitMotion,
  isBottomNavBadgeVisible,
  resolveBottomNavBadgeLabelCount,
  resolveBottomNavBadgeTransition,
  shouldBumpBadge,
} from "./bottomNavBadgeModel"

test("the unread badge is visible only for a positive count", () => {
  assert.equal(isBottomNavBadgeVisible(0), false)
  assert.equal(isBottomNavBadgeVisible(-1), false)
  assert.equal(isBottomNavBadgeVisible(1), true)
  assert.equal(isBottomNavBadgeVisible(120), true)
})

test("the badge appears from 0 to n, bumps only on an increase and exits at 0", () => {
  assert.equal(resolveBottomNavBadgeTransition(0, 3), "appear")
  assert.equal(resolveBottomNavBadgeTransition(3, 4), "bump")
  assert.equal(resolveBottomNavBadgeTransition(4, 2), "none")
  assert.equal(resolveBottomNavBadgeTransition(2, 2), "none")
  assert.equal(resolveBottomNavBadgeTransition(2, 0), "exit")
  assert.equal(resolveBottomNavBadgeTransition(0, 0), "none")
})

test("a bump needs a visible badge and a higher count", () => {
  assert.equal(shouldBumpBadge(1, 2), true)
  assert.equal(shouldBumpBadge(99, 140), true)
  assert.equal(shouldBumpBadge(0, 5), false, "0 -> n is an appearance, not a bump")
  assert.equal(shouldBumpBadge(5, 4), false)
  assert.equal(shouldBumpBadge(5, 5), false)
})

test("appearing springs into place, or snaps with Reduce Motion", () => {
  const animated = getBadgeAppearMotion(false)
  assert.ok(animated.fromScale > 0 && animated.fromScale < 1)
  assert.ok(animated.spring)
  assert.ok(animated.opacityDurationMs > 0)
  assert.deepEqual(getBadgeAppearMotion(true), {
    fromScale: 1,
    spring: null,
    opacityDurationMs: 0,
  })
})

test("a count increase bumps briefly, and never with Reduce Motion", () => {
  const bump = getBadgeBumpMotion(false)
  assert.ok(bump)
  assert.ok(bump.peakScale > 1)
  assert.ok(bump.peakDurationMs > 0)
  assert.ok(bump.spring)
  assert.equal(getBadgeBumpMotion(true), null)
})

test("exiting fades and shrinks, or hides instantly with Reduce Motion", () => {
  const exit = getBadgeExitMotion(false)
  assert.ok(exit.toScale < 1)
  assert.ok(exit.durationMs > 0)
  assert.deepEqual(getBadgeExitMotion(true), { toScale: 0, durationMs: 0 })
})

test("the badge label caps at 99+ and keeps the last count while it fades out", () => {
  assert.equal(formatBottomNavBadgeCount(7), "7")
  assert.equal(formatBottomNavBadgeCount(99), "99")
  assert.equal(formatBottomNavBadgeCount(100), "99+")
  assert.equal(resolveBottomNavBadgeLabelCount(4, 6), 6)
  assert.equal(resolveBottomNavBadgeLabelCount(4, 0), 4)
  assert.equal(resolveBottomNavBadgeLabelCount(0, 0), 0)
})
