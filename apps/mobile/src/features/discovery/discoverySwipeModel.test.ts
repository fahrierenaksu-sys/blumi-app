import assert from "node:assert/strict"
import test from "node:test"
import {
  DISCOVER_BOTTOM_CARD_MOTION,
  DISCOVER_PROMOTION_SPRING,
  DISCOVER_SWIPE_RESET_SPRING,
  DISCOVER_DECK_ENTRANCE_MS,
  getDiscoverActionExitDuration,
  getDiscoverDeckDragMotion,
  getDiscoverDeckEntrance,
  getDiscoverDeckRoleMotion,
  getDiscoverMiddleCardAdvance,
  getDiscoverDeckRoleProgress,
  getDiscoverMiddleCardMotion,
  DISCOVER_SWIPE_MAX_TILT_DEG,
  getDiscoverStampOpacity,
  getDiscoverSwipeOutDuration,
  getDiscoverSwipeOutX,
  getDiscoverSwipeRotation,
  isDiscoverSwipeLowerHalfGrab,
  getDiscoverSwipeThreshold,
  getDiscoverSwipeThresholdSide,
  getDiscoverSwipeTranslateX,
  resolveDiscoverSwipeRelease,
  shouldClaimDiscoverSwipe,
  shouldTickDiscoverSwipeThreshold,
  SWIPE_CAPTURE_THRESHOLD,
  SWIPE_DIRECTION_DOMINANCE,
  SWIPE_DISTANCE_RATIO,
  SWIPE_FLICK_VELOCITY,
  SWIPE_OUT_DURATION,
  SWIPE_OUT_MAX_DURATION,
  SWIPE_OUT_MIN_DURATION,
  SWIPE_OUT_MIN_VELOCITY,
  SWIPE_THRESHOLD_TICK_HYSTERESIS,
  type DiscoverSwipeThresholdSide
} from "./discoverySwipeModel"

const closeTo = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

test("the card leans with the drag up to the max tilt at a full screen width", () => {
  assert.equal(DISCOVER_SWIPE_MAX_TILT_DEG, 8)
  closeTo(getDiscoverSwipeRotation(0, 390, false), 0)
  closeTo(getDiscoverSwipeRotation(0, 390, true), 0)
  closeTo(getDiscoverSwipeRotation(195, 390, false), 4)
  closeTo(getDiscoverSwipeRotation(-195, 390, false), -4)
  closeTo(getDiscoverSwipeRotation(390, 390, false), 8)
  closeTo(getDiscoverSwipeRotation(-390, 390, false), -8)
})

test("a card held by its lower half leans the other way", () => {
  closeTo(getDiscoverSwipeRotation(195, 390, true), -4)
  closeTo(getDiscoverSwipeRotation(-390, 390, true), 8)
})

test("the lean is clamped past a screen width and zero without a width", () => {
  // The exit runs to 1.2 screen widths; the card never leans past the max.
  closeTo(getDiscoverSwipeRotation(468, 390, false), 8)
  closeTo(getDiscoverSwipeRotation(-2000, 390, true), 8)
  closeTo(getDiscoverSwipeRotation(120, 0, false), 0)
  closeTo(getDiscoverSwipeRotation(120, Number.NaN, false), 0)
})

test("a grab below the card's middle is a lower-half grab", () => {
  assert.equal(isDiscoverSwipeLowerHalfGrab(100, 548), false)
  assert.equal(isDiscoverSwipeLowerHalfGrab(274, 548), false)
  assert.equal(isDiscoverSwipeLowerHalfGrab(275, 548), true)
  // Before the card has been measured every grab counts as the upper half.
  assert.equal(isDiscoverSwipeLowerHalfGrab(400, 0), false)
})

test("the exit takes the remaining distance at the release speed, within 120-260 ms", () => {
  assert.equal(SWIPE_OUT_MIN_DURATION, 120)
  assert.equal(SWIPE_OUT_MAX_DURATION, 260)
  // A slow release of a typical remaining distance lands on the slowest exit.
  closeTo(390 / SWIPE_OUT_MIN_VELOCITY * 1000, SWIPE_OUT_MAX_DURATION)
  assert.equal(getDiscoverSwipeOutDuration(390, 0), 260)
  assert.equal(getDiscoverSwipeOutDuration(390, 400), 260)
  assert.equal(getDiscoverSwipeOutDuration(520, 0), 260)
  // A hard flick leaves as fast as the floor allows.
  assert.equal(getDiscoverSwipeOutDuration(400, 5000), 120)
  assert.equal(getDiscoverSwipeOutDuration(40, 0), 120)
  // In between the duration follows the release speed.
  closeTo(getDiscoverSwipeOutDuration(380, 2000), 190)
  closeTo(getDiscoverSwipeOutDuration(-380, 2000), 190)
})

test("a release moving away from the exit leaves at the slow pace", () => {
  assert.equal(getDiscoverSwipeOutDuration(390, -5000), 260)
})

test("an unmeasurable release falls back to the fixed exit duration", () => {
  assert.equal(getDiscoverSwipeOutDuration(Number.NaN, 2000), SWIPE_OUT_DURATION)
  assert.equal(getDiscoverSwipeOutDuration(390, Number.POSITIVE_INFINITY), SWIPE_OUT_DURATION)
})

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

test("the drag is past a threshold exactly where a release would commit", () => {
  const threshold = 80
  assert.equal(getDiscoverSwipeThresholdSide(0, 0, threshold, true), 0)
  assert.equal(getDiscoverSwipeThresholdSide(0, 80, threshold, true), 0)
  assert.equal(getDiscoverSwipeThresholdSide(0, 80.5, threshold, true), 1)
  assert.equal(getDiscoverSwipeThresholdSide(0, -80, threshold, true), 0)
  assert.equal(getDiscoverSwipeThresholdSide(0, -80.5, threshold, true), -1)
  // A disabled like never arms; pass always does.
  assert.equal(getDiscoverSwipeThresholdSide(0, 200, threshold, false), 0)
  assert.equal(getDiscoverSwipeThresholdSide(1, 200, threshold, false), 0)
  assert.equal(getDiscoverSwipeThresholdSide(0, -200, threshold, false), -1)
})

test("an entered threshold holds through jitter and releases inside the hysteresis band", () => {
  const threshold = 80
  const keep = threshold - SWIPE_THRESHOLD_TICK_HYSTERESIS
  assert.equal(getDiscoverSwipeThresholdSide(1, 79, threshold, true), 1)
  assert.equal(getDiscoverSwipeThresholdSide(1, keep, threshold, true), 0)
  assert.equal(getDiscoverSwipeThresholdSide(-1, -79, threshold, true), -1)
  assert.equal(getDiscoverSwipeThresholdSide(-1, -keep, threshold, true), 0)
  // The band only holds the side that was entered.
  assert.equal(getDiscoverSwipeThresholdSide(0, 79, threshold, true), 0)
  assert.equal(getDiscoverSwipeThresholdSide(-1, 79, threshold, true), 0)
  // One fast frame can jump from one side to the other.
  assert.equal(getDiscoverSwipeThresholdSide(1, -120, threshold, true), -1)
})

test("a drag ticks once per threshold entry and re-arms after coming back", () => {
  const threshold = 80
  let side: DiscoverSwipeThresholdSide = 0
  let ticks = 0
  for (const x of [10, 60, 81, 95, 79, 82, 120, 70, 40, 81, 0, -90, -78, -90, -60, -200]) {
    const next = getDiscoverSwipeThresholdSide(side, x, threshold, true)
    if (shouldTickDiscoverSwipeThreshold(side, next)) ticks += 1
    side = next
  }
  // Enter like, (jitter held), re-enter like, enter pass, (jitter held), re-enter pass.
  assert.equal(ticks, 4)
  assert.equal(shouldTickDiscoverSwipeThreshold(1, 0), false)
  assert.equal(shouldTickDiscoverSwipeThreshold(0, 0), false)
  assert.equal(shouldTickDiscoverSwipeThreshold(1, 1), false)
  assert.equal(shouldTickDiscoverSwipeThreshold(1, -1), true)
})

test("each deck slot has one role progress: bottom 0, middle 1, top 2", () => {
  assert.equal(getDiscoverDeckRoleProgress("bottom"), 0)
  assert.equal(getDiscoverDeckRoleProgress("middle"), 1)
  assert.equal(getDiscoverDeckRoleProgress("top"), 2)
})

test("the bottom card keeps the approved fan-out", () => {
  assert.deepEqual(DISCOVER_BOTTOM_CARD_MOTION, {
    translateX: -10,
    translateY: -30,
    rotateDeg: -3,
    scale: 0.98,
    opacity: 0.96
  })
})

test("only the middle card follows the drag; the top card was carried fully forward", () => {
  assert.deepEqual(getDiscoverDeckDragMotion("middle", 200), getDiscoverMiddleCardMotion(200))
  assert.deepEqual(getDiscoverDeckDragMotion("middle", 0), getDiscoverMiddleCardMotion(0))
  assert.deepEqual(getDiscoverDeckDragMotion("top", 0), { scale: 1, translateX: 0, translateY: 0 })
  assert.deepEqual(getDiscoverDeckDragMotion("bottom", 480), getDiscoverMiddleCardMotion(0))
})

test("role motion at 0, 1 and 2 is exactly the bottom, dragged middle and top card", () => {
  const rest = getDiscoverMiddleCardMotion(0)
  assert.deepEqual(getDiscoverDeckRoleMotion(0, rest), {
    ...DISCOVER_BOTTOM_CARD_MOTION,
    overlayOpacity: 1
  })
  const dragged = getDiscoverMiddleCardMotion(200)
  // The middle card stays upright while it advances with the drag.
  assert.deepEqual(getDiscoverDeckRoleMotion(1, dragged), {
    translateX: dragged.translateX,
    translateY: dragged.translateY,
    rotateDeg: 0,
    scale: dragged.scale,
    opacity: 1,
    overlayOpacity: 1
  })
  const top = { translateX: 0, translateY: 0, rotateDeg: 0, scale: 1, opacity: 1, overlayOpacity: 0 }
  assert.deepEqual(getDiscoverDeckRoleMotion(2, rest), top)
  assert.deepEqual(getDiscoverDeckRoleMotion(2, dragged), top)
})

test("a promotion blends between slots instead of jumping", () => {
  const rest = getDiscoverMiddleCardMotion(0)
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

  const bottomToMiddle = getDiscoverDeckRoleMotion(0.5, rest)
  close(bottomToMiddle.translateX, (-10 + -8) / 2)
  close(bottomToMiddle.translateY, (-30 + -12) / 2)
  close(bottomToMiddle.rotateDeg, -1.5)
  close(bottomToMiddle.scale, 0.98)
  close(bottomToMiddle.opacity, (0.96 + 1) / 2)
  assert.equal(bottomToMiddle.overlayOpacity, 1)

  const middleToTop = getDiscoverDeckRoleMotion(1.5, rest)
  close(middleToTop.translateX, -4)
  close(middleToTop.translateY, -6)
  assert.equal(middleToTop.rotateDeg, 0)
  close(middleToTop.scale, 0.99)
  assert.equal(middleToTop.opacity, 1)
  close(middleToTop.overlayOpacity, 0.5)

  // A spring settling past its target never leaves the slot range.
  assert.deepEqual(getDiscoverDeckRoleMotion(-0.2, rest), getDiscoverDeckRoleMotion(0, rest))
  assert.deepEqual(getDiscoverDeckRoleMotion(2.1, rest), getDiscoverDeckRoleMotion(2, rest))
})

test("the promotion spring is short and critically damped", () => {
  const { stiffness, damping, mass } = DISCOVER_PROMOTION_SPRING
  assert.ok(Math.abs(damping - 2 * Math.sqrt(stiffness * mass)) < 1e-9, "critical damping: no overshoot")
  // A critically damped spring is within 1% after about 6.64 / ω seconds.
  const settleSeconds = 6.64 / Math.sqrt(stiffness / mass)
  assert.ok(settleSeconds <= 0.4, `settles in ${settleSeconds.toFixed(3)} s`)
})

test("the frosted layer clears with the drag, so it is not still frosted after the release (DSC-11)", () => {
  assert.equal(getDiscoverMiddleCardAdvance(0), 0)
  assert.equal(getDiscoverMiddleCardAdvance(-200), 0.5)
  assert.equal(getDiscoverMiddleCardAdvance(900), 1)
  const middle = getDiscoverDeckRoleMotion(1, getDiscoverMiddleCardMotion(200), getDiscoverMiddleCardAdvance(200))
  assert.equal(middle.overlayOpacity, 0.5)
  // The bottom slot stays fully frosted; without an advance nothing changes.
  assert.equal(getDiscoverDeckRoleMotion(0, getDiscoverMiddleCardMotion(0), 0.7).overlayOpacity, 1)
  assert.equal(getDiscoverDeckRoleMotion(1, getDiscoverMiddleCardMotion(200)).overlayOpacity, 1)
})

test("a card promoted at release continues from the pose and frost it had, then settles at rest", () => {
  const releasedAt = 120
  const advance = getDiscoverMiddleCardAdvance(releasedAt)
  const lastMiddleFrame = getDiscoverDeckRoleMotion(1, getDiscoverDeckDragMotion("middle", releasedAt), advance)
  const firstTopFrame = getDiscoverDeckRoleMotion(1, getDiscoverDeckDragMotion("top", 0, releasedAt), advance)
  assert.deepEqual(firstTopFrame, lastMiddleFrame, "no jump when the deck advances at release")
  const settled = getDiscoverDeckRoleMotion(2, getDiscoverDeckDragMotion("top", 0, releasedAt), advance)
  assert.deepEqual(settled, { translateX: 0, translateY: 0, rotateDeg: 0, scale: 1, opacity: 1, overlayOpacity: 0 })
})

test("a card arriving at the back of the deck fades in (and grows only when motion is allowed)", () => {
  assert.equal(DISCOVER_DECK_ENTRANCE_MS, 220)
  assert.deepEqual(getDiscoverDeckEntrance(0, false), { opacity: 0, scale: 0.94 })
  assert.deepEqual(getDiscoverDeckEntrance(1, false), { opacity: 1, scale: 1 })
  assert.deepEqual(getDiscoverDeckEntrance(0, true), { opacity: 0, scale: 1 })
  assert.deepEqual(getDiscoverDeckEntrance(1.2, false), { opacity: 1, scale: 1 })
})

test("a Like or Pass button exit takes 190 ms and is instant under Reduce Motion (DSC-10)", () => {
  assert.equal(getDiscoverActionExitDuration(false), 190)
  assert.equal(getDiscoverActionExitDuration(true), 0)
})
