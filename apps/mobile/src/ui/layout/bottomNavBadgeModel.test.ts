import assert from "node:assert/strict"
import test from "node:test"
import {
  BOTTOM_NAV_BADGE_SPRING,
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

test("appearing springs from 0.6 to 1, or snaps with Reduce Motion", () => {
  assert.deepEqual(getBadgeAppearMotion(false), {
    fromScale: 0.6,
    spring: BOTTOM_NAV_BADGE_SPRING,
    opacityDurationMs: 120,
  })
  assert.deepEqual(getBadgeAppearMotion(true), {
    fromScale: 1,
    spring: null,
    opacityDurationMs: 0,
  })
})

test("a count increase bumps briefly, and never with Reduce Motion", () => {
  assert.deepEqual(getBadgeBumpMotion(false), {
    peakScale: 1.12,
    peakDurationMs: 90,
    spring: BOTTOM_NAV_BADGE_SPRING,
  })
  assert.equal(getBadgeBumpMotion(true), null)
})

test("exiting fades and shrinks in 120 ms, or hides instantly with Reduce Motion", () => {
  assert.deepEqual(getBadgeExitMotion(false), { toScale: 0.6, durationMs: 120 })
  assert.deepEqual(getBadgeExitMotion(true), { toScale: 0, durationMs: 0 })
})

test("the badge spring mirrors the bouncy theme spring", () => {
  assert.deepEqual(BOTTOM_NAV_BADGE_SPRING, { damping: 12, stiffness: 200, mass: 0.8 })
})

test("the badge label caps at 99+ and keeps the last count while it fades out", () => {
  assert.equal(formatBottomNavBadgeCount(7), "7")
  assert.equal(formatBottomNavBadgeCount(99), "99")
  assert.equal(formatBottomNavBadgeCount(100), "99+")
  assert.equal(resolveBottomNavBadgeLabelCount(4, 6), 6)
  assert.equal(resolveBottomNavBadgeLabelCount(4, 0), 4)
  assert.equal(resolveBottomNavBadgeLabelCount(0, 0), 0)
})
