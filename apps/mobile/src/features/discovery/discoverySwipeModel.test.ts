import assert from "node:assert/strict"
import test from "node:test"
import {
  DISCOVER_BOTTOM_CARD_MOTION,
  DISCOVER_DECK_ENTRANCE_MS,
  DISCOVER_MIDDLE_CARD_TRAVEL,
  DISCOVER_PROMOTION_SPRING,
  DISCOVER_SWIPE_MAX_TILT_DEG,
  DISCOVER_SWIPE_RESET_SPRING,
  SWIPE_CAPTURE_THRESHOLD,
  SWIPE_DIRECTION_DOMINANCE,
  SWIPE_DISTANCE_RATIO,
  SWIPE_FLICK_VELOCITY,
  SWIPE_OUT_DURATION,
  SWIPE_OUT_MAX_DURATION,
  SWIPE_OUT_MIN_DURATION,
  SWIPE_OUT_MIN_VELOCITY,
  SWIPE_THRESHOLD_TICK_HYSTERESIS,
  getDiscoverActionExitDuration,
  getDiscoverDeckDragMotion,
  getDiscoverDeckEntrance,
  getDiscoverDeckRoleMotion,
  getDiscoverDeckRoleProgress,
  getDiscoverMiddleCardAdvance,
  getDiscoverMiddleCardMotion,
  getDiscoverStampOpacity,
  getDiscoverSwipeOutDuration,
  getDiscoverSwipeOutX,
  getDiscoverSwipeRotation,
  getDiscoverSwipeThreshold,
  getDiscoverSwipeThresholdSide,
  getDiscoverSwipeTranslateX,
  isDiscoverSwipeLowerHalfGrab,
  resolveDiscoverSwipeRelease,
  shouldClaimDiscoverSwipe,
  shouldTickDiscoverSwipeThreshold,
  type DiscoverSwipeThresholdSide
} from "./discoverySwipeModel"

// Relational swipe guarantees. Tuning values (tilt, durations, thresholds,
// springs, fan-out) are read from the exported constants so card physics can
// be redesigned without editing this file.

const closeTo = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

const WIDTH = 390

test("the card leans with the drag up to the max tilt at a full screen width", () => {
  assert.ok(DISCOVER_SWIPE_MAX_TILT_DEG > 0)
  closeTo(getDiscoverSwipeRotation(0, WIDTH, false), 0)
  closeTo(getDiscoverSwipeRotation(0, WIDTH, true), 0)
  closeTo(getDiscoverSwipeRotation(WIDTH / 2, WIDTH, false), DISCOVER_SWIPE_MAX_TILT_DEG / 2)
  closeTo(getDiscoverSwipeRotation(-WIDTH / 2, WIDTH, false), -DISCOVER_SWIPE_MAX_TILT_DEG / 2)
  closeTo(getDiscoverSwipeRotation(WIDTH, WIDTH, false), DISCOVER_SWIPE_MAX_TILT_DEG)
  closeTo(getDiscoverSwipeRotation(-WIDTH, WIDTH, false), -DISCOVER_SWIPE_MAX_TILT_DEG)
})

test("a card held by its lower half leans the other way", () => {
  closeTo(getDiscoverSwipeRotation(WIDTH / 2, WIDTH, true), -DISCOVER_SWIPE_MAX_TILT_DEG / 2)
  closeTo(getDiscoverSwipeRotation(-WIDTH, WIDTH, true), DISCOVER_SWIPE_MAX_TILT_DEG)
})

test("the lean is clamped past a screen width and zero without a width", () => {
  closeTo(getDiscoverSwipeRotation(getDiscoverSwipeOutX("right", WIDTH), WIDTH, false), DISCOVER_SWIPE_MAX_TILT_DEG)
  closeTo(getDiscoverSwipeRotation(-2000, WIDTH, true), DISCOVER_SWIPE_MAX_TILT_DEG)
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

test("the exit takes the remaining distance at the release speed, within its bounds", () => {
  assert.ok(SWIPE_OUT_MIN_DURATION < SWIPE_OUT_MAX_DURATION)
  const durations = [
    getDiscoverSwipeOutDuration(WIDTH, 0),
    getDiscoverSwipeOutDuration(WIDTH, 400),
    getDiscoverSwipeOutDuration(520, 0),
    getDiscoverSwipeOutDuration(400, 5000),
    getDiscoverSwipeOutDuration(40, 0),
    getDiscoverSwipeOutDuration(380, 2000)
  ]
  for (const duration of durations) {
    assert.ok(duration >= SWIPE_OUT_MIN_DURATION && duration <= SWIPE_OUT_MAX_DURATION, `${duration}`)
  }
  // A hard flick leaves as fast as the floor allows; a slow long exit hits the cap.
  assert.equal(getDiscoverSwipeOutDuration(400, 50_000), SWIPE_OUT_MIN_DURATION)
  assert.equal(getDiscoverSwipeOutDuration(5_000, 0), SWIPE_OUT_MAX_DURATION)
  // In between the duration follows the release speed, symmetric in direction.
  const remaining = 380
  const speed = Math.max(SWIPE_OUT_MIN_VELOCITY, remaining / (SWIPE_OUT_MAX_DURATION / 1000)) * 1.1
  const expected = Math.min(SWIPE_OUT_MAX_DURATION, Math.max(SWIPE_OUT_MIN_DURATION, remaining / speed * 1000))
  closeTo(getDiscoverSwipeOutDuration(remaining, speed), expected)
  closeTo(getDiscoverSwipeOutDuration(-remaining, speed), expected)
  assert.ok(getDiscoverSwipeOutDuration(remaining, 4000) <= getDiscoverSwipeOutDuration(remaining, 2000))
})

test("a release moving away from the exit leaves at the slow pace", () => {
  assert.equal(getDiscoverSwipeOutDuration(WIDTH, -5000), getDiscoverSwipeOutDuration(WIDTH, 0))
})

test("an unmeasurable release falls back to the fixed exit duration", () => {
  assert.equal(getDiscoverSwipeOutDuration(Number.NaN, 2000), SWIPE_OUT_DURATION)
  assert.equal(getDiscoverSwipeOutDuration(WIDTH, Number.POSITIVE_INFINITY), SWIPE_OUT_DURATION)
})

test("the commit threshold grows with the screen and is capped on wide screens", () => {
  assert.equal(getDiscoverSwipeThreshold(WIDTH), WIDTH * SWIPE_DISTANCE_RATIO)
  assert.ok(getDiscoverSwipeThreshold(300) < getDiscoverSwipeThreshold(WIDTH))
  assert.equal(getDiscoverSwipeThreshold(2000), getDiscoverSwipeThreshold(3000))
  assert.ok(getDiscoverSwipeThreshold(2000) < 2000 * SWIPE_DISTANCE_RATIO)
})

test("a swipe is claimed only after a horizontal-dominant move past the capture threshold", () => {
  const past = SWIPE_CAPTURE_THRESHOLD + 0.5
  assert.equal(shouldClaimDiscoverSwipe(SWIPE_CAPTURE_THRESHOLD, 0), false)
  assert.equal(shouldClaimDiscoverSwipe(past, 0), true)
  assert.equal(shouldClaimDiscoverSwipe(-past, 0), true)
  const dy = 10
  assert.equal(shouldClaimDiscoverSwipe(dy * SWIPE_DIRECTION_DOMINANCE, dy), false)
  assert.equal(shouldClaimDiscoverSwipe(dy * SWIPE_DIRECTION_DOMINANCE + 0.01, dy), true)
  assert.equal(shouldClaimDiscoverSwipe(-20, 30), false)
})

test("release commits past the distance threshold or on a flick, converting px/s to px/ms", () => {
  const threshold = 85.8
  const release = (dx: number, velocityXPerSecond: number, canSwipeRight = true) =>
    resolveDiscoverSwipeRelease({ dx, velocityXPerSecond, threshold, canSwipeRight })
  assert.equal(release(threshold + 0.2, 0), "right")
  assert.equal(release(threshold, 0), "reset")
  assert.equal(release(-threshold - 0.2, 0), "left")
  assert.equal(release(-threshold, 0), "reset")
  // Gesture Handler reports px/s; the flick velocity is in px/ms.
  const flick = SWIPE_FLICK_VELOCITY * 1000
  assert.equal(release(20, flick + 10), "right")
  assert.equal(release(20, flick), "reset")
  assert.equal(release(-20, -flick - 10), "left")
  assert.equal(release(-20, flick + 10), "reset")
  assert.equal(release(20, -flick - 10), "reset")
  // Like can be disabled; pass never is.
  assert.equal(release(200, 2000, false), "reset")
  assert.equal(release(-200, 0, false), "left")
})

test("the card leaves fully off screen in the swipe direction", () => {
  assert.ok(getDiscoverSwipeOutX("right", 400) >= 400)
  assert.ok(getDiscoverSwipeOutX("left", 400) <= -400)
  assert.equal(getDiscoverSwipeOutX("left", 400), -getDiscoverSwipeOutX("right", 400))
})

test("only the card that owns the swipe moves", () => {
  assert.equal(getDiscoverSwipeTranslateX("a", "a", 120), 120)
  assert.equal(getDiscoverSwipeTranslateX("a", "b", 480), 0)
})

test("LIKE and NOPE stamps fade in over the swipe threshold, clamped", () => {
  const threshold = 80
  assert.deepEqual(getDiscoverStampOpacity(0, threshold), { like: 0, nope: 0 })
  let previous = 0
  for (const x of [20, 40, 60, threshold]) {
    const { like, nope } = getDiscoverStampOpacity(x, threshold)
    assert.equal(nope, 0)
    assert.ok(like > previous, "like grows with the drag")
    previous = like
  }
  assert.deepEqual(getDiscoverStampOpacity(400, threshold), { like: 1, nope: 0 })
  assert.deepEqual(getDiscoverStampOpacity(-60, threshold), {
    like: 0,
    nope: getDiscoverStampOpacity(60, threshold).like
  })
  assert.deepEqual(getDiscoverStampOpacity(-400, threshold), { like: 0, nope: 1 })
})

test("the next card advances with the swipe distance toward the top slot, clamped", () => {
  const rest = getDiscoverMiddleCardMotion(0)
  const half = getDiscoverMiddleCardMotion(DISCOVER_MIDDLE_CARD_TRAVEL / 2)
  const full = getDiscoverMiddleCardMotion(DISCOVER_MIDDLE_CARD_TRAVEL)
  assert.ok(rest.scale < half.scale && half.scale < full.scale)
  assert.deepEqual(full, { scale: 1, translateX: 0, translateY: 0 })
  assert.deepEqual(getDiscoverMiddleCardMotion(-DISCOVER_MIDDLE_CARD_TRAVEL / 2), half)
  assert.deepEqual(getDiscoverMiddleCardMotion(DISCOVER_MIDDLE_CARD_TRAVEL * 3), full)
})

test("the snap-back spring settles without endless oscillation", () => {
  const { stiffness, damping, mass } = DISCOVER_SWIPE_RESET_SPRING
  assert.ok(stiffness > 0 && damping > 0 && mass > 0)
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

test("deck roles are ordered from the back of the deck to the top", () => {
  assert.ok(getDiscoverDeckRoleProgress("bottom") < getDiscoverDeckRoleProgress("middle"))
  assert.ok(getDiscoverDeckRoleProgress("middle") < getDiscoverDeckRoleProgress("top"))
})

test("only the middle card follows the drag; the top card was carried fully forward", () => {
  assert.deepEqual(getDiscoverDeckDragMotion("middle", 200), getDiscoverMiddleCardMotion(200))
  assert.deepEqual(getDiscoverDeckDragMotion("middle", 0), getDiscoverMiddleCardMotion(0))
  assert.deepEqual(getDiscoverDeckDragMotion("top", 0), { scale: 1, translateX: 0, translateY: 0 })
  assert.deepEqual(getDiscoverDeckDragMotion("bottom", 480), getDiscoverMiddleCardMotion(0))
})

const BOTTOM = getDiscoverDeckRoleProgress("bottom")
const MIDDLE = getDiscoverDeckRoleProgress("middle")
const TOP = getDiscoverDeckRoleProgress("top")

test("role motion at each slot is exactly the bottom, dragged middle and top card", () => {
  const rest = getDiscoverMiddleCardMotion(0)
  assert.deepEqual(getDiscoverDeckRoleMotion(BOTTOM, rest), {
    ...DISCOVER_BOTTOM_CARD_MOTION,
    overlayOpacity: 1
  })
  const dragged = getDiscoverMiddleCardMotion(200)
  // The middle card stays upright while it advances with the drag.
  assert.deepEqual(getDiscoverDeckRoleMotion(MIDDLE, dragged), {
    translateX: dragged.translateX,
    translateY: dragged.translateY,
    rotateDeg: 0,
    scale: dragged.scale,
    opacity: 1,
    overlayOpacity: 1
  })
  const top = { translateX: 0, translateY: 0, rotateDeg: 0, scale: 1, opacity: 1, overlayOpacity: 0 }
  assert.deepEqual(getDiscoverDeckRoleMotion(TOP, rest), top)
  assert.deepEqual(getDiscoverDeckRoleMotion(TOP, dragged), top)
})

test("a promotion blends between slots instead of jumping", () => {
  const rest = getDiscoverMiddleCardMotion(0)
  const between = (value: number, a: number, b: number) =>
    assert.ok(value >= Math.min(a, b) - 1e-9 && value <= Math.max(a, b) + 1e-9, `${value} between ${a} and ${b}`)

  const bottom = getDiscoverDeckRoleMotion(BOTTOM, rest)
  const middle = getDiscoverDeckRoleMotion(MIDDLE, rest)
  const top = getDiscoverDeckRoleMotion(TOP, rest)
  const bottomToMiddle = getDiscoverDeckRoleMotion((BOTTOM + MIDDLE) / 2, rest)
  const middleToTop = getDiscoverDeckRoleMotion((MIDDLE + TOP) / 2, rest)
  for (const key of ["translateX", "translateY", "rotateDeg", "scale", "opacity", "overlayOpacity"] as const) {
    between(bottomToMiddle[key], bottom[key], middle[key])
    between(middleToTop[key], middle[key], top[key])
  }

  // A spring settling past its target never leaves the slot range.
  assert.deepEqual(getDiscoverDeckRoleMotion(BOTTOM - 0.2, rest), bottom)
  assert.deepEqual(getDiscoverDeckRoleMotion(TOP + 0.1, rest), top)
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
  assert.equal(getDiscoverMiddleCardAdvance(-DISCOVER_MIDDLE_CARD_TRAVEL / 2), 0.5)
  assert.equal(getDiscoverMiddleCardAdvance(DISCOVER_MIDDLE_CARD_TRAVEL * 3), 1)
  const halfway = DISCOVER_MIDDLE_CARD_TRAVEL / 2
  const middle = getDiscoverDeckRoleMotion(MIDDLE, getDiscoverMiddleCardMotion(halfway), getDiscoverMiddleCardAdvance(halfway))
  assert.equal(middle.overlayOpacity, 0.5)
  // The bottom slot stays fully frosted; without an advance nothing changes.
  assert.equal(getDiscoverDeckRoleMotion(BOTTOM, getDiscoverMiddleCardMotion(0), 0.7).overlayOpacity, 1)
  assert.equal(getDiscoverDeckRoleMotion(MIDDLE, getDiscoverMiddleCardMotion(halfway)).overlayOpacity, 1)
})

test("a card promoted at release continues from the pose and frost it had, then settles at rest", () => {
  const releasedAt = 120
  const advance = getDiscoverMiddleCardAdvance(releasedAt)
  const lastMiddleFrame = getDiscoverDeckRoleMotion(MIDDLE, getDiscoverDeckDragMotion("middle", releasedAt), advance)
  const firstTopFrame = getDiscoverDeckRoleMotion(MIDDLE, getDiscoverDeckDragMotion("top", 0, releasedAt), advance)
  assert.deepEqual(firstTopFrame, lastMiddleFrame, "no jump when the deck advances at release")
  const settled = getDiscoverDeckRoleMotion(TOP, getDiscoverDeckDragMotion("top", 0, releasedAt), advance)
  assert.deepEqual(settled, { translateX: 0, translateY: 0, rotateDeg: 0, scale: 1, opacity: 1, overlayOpacity: 0 })
})

test("a card arriving at the back of the deck fades in (and grows only when motion is allowed)", () => {
  assert.ok(DISCOVER_DECK_ENTRANCE_MS > 0)
  const start = getDiscoverDeckEntrance(0, false)
  assert.equal(start.opacity, 0)
  assert.ok(start.scale < 1)
  assert.deepEqual(getDiscoverDeckEntrance(1, false), { opacity: 1, scale: 1 })
  assert.deepEqual(getDiscoverDeckEntrance(0, true), { opacity: 0, scale: 1 })
  assert.deepEqual(getDiscoverDeckEntrance(1.2, false), { opacity: 1, scale: 1 })
})

test("a Like or Pass button exit animates, and is instant under Reduce Motion (DSC-10)", () => {
  assert.ok(getDiscoverActionExitDuration(false) > 0)
  assert.equal(getDiscoverActionExitDuration(true), 0)
})
