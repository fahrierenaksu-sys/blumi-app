import assert from "node:assert/strict"
import test from "node:test"
import {
  DISCOVER_SWIPE_RESET_SPRING,
  getDiscoverMiddleCardMotion,
  getDiscoverStampOpacity,
  getDiscoverSwipeOutX,
  getDiscoverSwipeThreshold,
  getDiscoverSwipeTranslateX,
  resolveDiscoverSwipeRelease,
  shouldClaimDiscoverSwipe,
  SWIPE_CAPTURE_THRESHOLD,
  SWIPE_DIRECTION_DOMINANCE,
  SWIPE_DISTANCE_RATIO,
  SWIPE_FLICK_VELOCITY,
  SWIPE_OUT_DURATION
} from "./discoverySwipeModel"

test("swipe thresholds are the PanResponder values", () => {
  assert.equal(SWIPE_OUT_DURATION, 190)
  assert.equal(SWIPE_CAPTURE_THRESHOLD, 4)
  assert.equal(SWIPE_DIRECTION_DOMINANCE, 1.1)
  assert.equal(SWIPE_DISTANCE_RATIO, 0.22)
  assert.equal(SWIPE_FLICK_VELOCITY, 0.55)
  assert.equal(getDiscoverSwipeThreshold(390), 390 * 0.22)
  assert.equal(getDiscoverSwipeThreshold(600), 96)
})

test("a swipe is claimed only after a horizontal-dominant move past 4 px", () => {
  assert.equal(shouldClaimDiscoverSwipe(4, 0), false)
  assert.equal(shouldClaimDiscoverSwipe(4.5, 0), true)
  assert.equal(shouldClaimDiscoverSwipe(-4.5, 0), true)
  assert.equal(shouldClaimDiscoverSwipe(11, 10), false)
  assert.equal(shouldClaimDiscoverSwipe(11.01, 10), true)
  assert.equal(shouldClaimDiscoverSwipe(-20, 30), false)
})

test("release commits past the distance threshold or on a flick, converting px/s to px/ms", () => {
  const threshold = 85.8
  const release = (dx: number, velocityXPerSecond: number, canSwipeRight = true) =>
    resolveDiscoverSwipeRelease({ dx, velocityXPerSecond, threshold, canSwipeRight })
  assert.equal(release(86, 0), "right")
  assert.equal(release(85.8, 0), "reset")
  assert.equal(release(-86, 0), "left")
  assert.equal(release(-85.8, 0), "reset")
  // 0.55 px/ms is 550 px/s: Gesture Handler reports px/s.
  assert.equal(release(20, 560), "right")
  assert.equal(release(20, 550), "reset")
  assert.equal(release(-20, -560), "left")
  assert.equal(release(-20, 560), "reset")
  assert.equal(release(20, -560), "reset")
  // Like can be disabled; pass never is.
  assert.equal(release(200, 2000, false), "reset")
  assert.equal(release(-200, 0, false), "left")
})

test("the card leaves 1.2 screen widths away", () => {
  assert.equal(getDiscoverSwipeOutX("right", 400), 480)
  assert.equal(getDiscoverSwipeOutX("left", 400), -480)
})

test("only the card that owns the swipe moves", () => {
  assert.equal(getDiscoverSwipeTranslateX("a", "a", 120), 120)
  assert.equal(getDiscoverSwipeTranslateX("a", "b", 480), 0)
})

test("LIKE and NOPE stamps fade in over the swipe threshold, clamped", () => {
  const threshold = 80
  assert.deepEqual(getDiscoverStampOpacity(0, threshold), { like: 0, nope: 0 })
  assert.deepEqual(getDiscoverStampOpacity(20, threshold), { like: 0.25, nope: 0 })
  assert.deepEqual(getDiscoverStampOpacity(40, threshold), { like: 0.5, nope: 0 })
  assert.deepEqual(getDiscoverStampOpacity(60, threshold), { like: 0.75, nope: 0 })
  assert.deepEqual(getDiscoverStampOpacity(400, threshold), { like: 1, nope: 0 })
  assert.deepEqual(getDiscoverStampOpacity(-60, threshold), { like: 0, nope: 0.75 })
  assert.deepEqual(getDiscoverStampOpacity(-400, threshold), { like: 0, nope: 1 })
})

test("the next card advances with the swipe distance, clamped at 400 px", () => {
  assert.deepEqual(getDiscoverMiddleCardMotion(0), { scale: 0.98, translateX: -8, translateY: -12 })
  assert.deepEqual(getDiscoverMiddleCardMotion(200), { scale: 0.99, translateX: -4, translateY: -6 })
  assert.deepEqual(getDiscoverMiddleCardMotion(-200), { scale: 0.99, translateX: -4, translateY: -6 })
  assert.deepEqual(getDiscoverMiddleCardMotion(900), { scale: 1, translateX: 0, translateY: 0 })
})

test("the snap-back spring is Animated.spring tension 120 / friction 7", () => {
  // React Native converts Origami tension/friction to stiffness/damping this way.
  const stiffness = (120 - 30) * 3.62 + 194
  const damping = (7 - 8) * 3 + 25
  assert.ok(Math.abs(DISCOVER_SWIPE_RESET_SPRING.stiffness - stiffness) < 1e-9)
  assert.equal(DISCOVER_SWIPE_RESET_SPRING.damping, damping)
  assert.equal(DISCOVER_SWIPE_RESET_SPRING.mass, 1)
})
