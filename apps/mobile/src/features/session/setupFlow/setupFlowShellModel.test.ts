import assert from "node:assert/strict"
import test from "node:test"
import {
  SETUP_MOTION_TIMELINE_MS,
  getSetupLayoutMetrics,
  getOutgoingRetentionMs,
  getSetupProgress,
  SETUP_KEYBOARD_SCROLL_IDLE,
  settleSetupKeyboardScrollAfterDrag,
  shouldClearOutgoingForMotionPreference,
  stepSetupKeyboardScrollReturn
} from "./setupFlowShellModel"

test("phone and otp share the fourth progress step", () => {
  assert.deepEqual(getSetupProgress("profile"), { activeIndex: 0, current: 1, total: 4 })
  assert.deepEqual(getSetupProgress("avatar"), { activeIndex: 1, current: 2, total: 4 })
  assert.deepEqual(getSetupProgress("room"), { activeIndex: 2, current: 3, total: 4 })
  assert.deepEqual(getSetupProgress("phone"), { activeIndex: 3, current: 4, total: 4 })
  assert.deepEqual(getSetupProgress("otp"), { activeIndex: 3, current: 4, total: 4 })
})

test("large Dynamic Type switches even the roomiest setup layout to scroll", () => {
  assert.equal(getSetupLayoutMetrics({ width: 440, height: 956, fontScale: 1.3 }).shouldScroll, true)
})

test("standard and legacy iPhones use a scroll-safe compact budget", () => {
  const compactViewports = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 402, height: 874 },
    { width: 414, height: 896 }
  ]

  for (const viewport of compactViewports) {
    const metrics = getSetupLayoutMetrics({ ...viewport, fontScale: 1 })
    assert.equal(metrics.compact, true, `${viewport.width}x${viewport.height}`)
    assert.equal(metrics.dense, true, `${viewport.width}x${viewport.height}`)
    assert.equal(metrics.shouldScroll, true, `${viewport.width}x${viewport.height}`)
  }

  const proMax = getSetupLayoutMetrics({ width: 440, height: 956, fontScale: 1 })
  assert.equal(proMax.compact, false)
  assert.equal(proMax.shouldScroll, false)
})

test("outgoing content has a bounded lifetime and clears when Reduce Motion is enabled", () => {
  assert.equal(getOutgoingRetentionMs(false), SETUP_MOTION_TIMELINE_MS.total)
  assert.equal(getOutgoingRetentionMs(true), SETUP_MOTION_TIMELINE_MS.reduced)
  assert.equal(shouldClearOutgoingForMotionPreference(false, true, true), true)
  assert.equal(shouldClearOutgoingForMotionPreference(true, false, true), false)
  assert.equal(shouldClearOutgoingForMotionPreference(false, true, false), false)
})

test("closing the keyboard glides the setup column back to its top in step with the keyboard", () => {
  // The keyboard layout was scrolled 120 pt down; the keyboard starts closing.
  const halfway = stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0.5, 1, 120)
  assert.equal(halfway.scrollTo, 60)
  // The column keeps gliding from where the close began, not from where it is now.
  const quarter = stepSetupKeyboardScrollReturn(halfway.from, 0.25, 0.5, 60)
  assert.equal(quarter.scrollTo, 30)
  const closed = stepSetupKeyboardScrollReturn(quarter.from, 0, 0.25, 30)
  assert.equal(closed.scrollTo, 0, "the resting layout shows the whole top again")
  assert.deepEqual(closed.from, SETUP_KEYBOARD_SCROLL_IDLE)
})

test("opening the keyboard never moves the setup column", () => {
  const opening = stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0.4, 0, 0)
  assert.equal(opening.scrollTo, null)
  assert.deepEqual(opening.from, SETUP_KEYBOARD_SCROLL_IDLE)
})

test("a keyboard that closes at once (Reduce Motion, a step that is left) lands on the top in one frame", () => {
  const closed = stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0, 1, 240)
  assert.equal(closed.scrollTo, 0)
  assert.deepEqual(closed.from, SETUP_KEYBOARD_SCROLL_IDLE)
})

test("a keyboard that reopens part way leaves the column alone and the next close starts fresh", () => {
  const closing = stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0.6, 1, 100)
  assert.equal(closing.scrollTo, 60)
  const reopening = stepSetupKeyboardScrollReturn(closing.from, 0.8, 0.6, 60)
  assert.equal(reopening.scrollTo, null)
  assert.deepEqual(reopening.from, SETUP_KEYBOARD_SCROLL_IDLE)
  const closingAgain = stepSetupKeyboardScrollReturn(reopening.from, 0.4, 0.8, 80)
  assert.equal(closingAgain.scrollTo, 40)
})

test("an overscrolled or unmeasured offset never scrolls past the top", () => {
  assert.equal(stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0.5, 1, -12).scrollTo, 0)
  assert.equal(stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0.5, 1, Number.NaN).scrollTo, 0)
})

test("a drag that dismissed the keyboard settles on the top; an ordinary drag stays where it ends", () => {
  assert.equal(settleSetupKeyboardScrollAfterDrag(true, 0, 70), 0)
  assert.equal(settleSetupKeyboardScrollAfterDrag(true, 0, 0), null, "already at the top")

  // Released half way: nothing jumps; the rest of the close glides from the
  // release offset (the close starts over from there).
  assert.equal(settleSetupKeyboardScrollAfterDrag(true, 0.5, 70), null)
  assert.equal(stepSetupKeyboardScrollReturn(SETUP_KEYBOARD_SCROLL_IDLE, 0.25, 0.5, 70).scrollTo, 35)

  // Scrolling a tall page with the keyboard closed is the reader's own position.
  assert.equal(settleSetupKeyboardScrollAfterDrag(false, 0, 140), null)
})

test("the reserved primary action grows with the user's text size instead of clipping it", () => {
  const viewport = { width: 390, height: 844 }
  const heights = [1, 1.3, 2, 3.1].map((fontScale) => getSetupLayoutMetrics({ ...viewport, fontScale }).primaryActionHeight)
  assert.equal(heights[0], 58, "the default text size keeps the designed action height")
  for (let index = 1; index < heights.length; index += 1) {
    assert.ok(heights[index] >= heights[index - 1], "a larger text size never reserves less room")
  }
  assert.ok(heights[3] >= 24 * 3.1 * 2, "the largest accessibility size reserves two full label lines")
})

test("at the largest text size the reserved action fits every line its label wraps to", () => {
  const largest = 3.1
  for (const width of [320, 375, 390]) {
    for (const primaryActionLabel of ["Karakterimi hazırlayalım", "Let’s make my character"]) {
      const { primaryActionHeight } = getSetupLayoutMetrics({ width, height: 844, fontScale: largest, primaryActionLabel })
      assert.ok(primaryActionHeight >= 24 * largest * 3, `${width} pt, "${primaryActionLabel}": ${primaryActionHeight} pt holds three label lines`)
    }
  }
  const short = getSetupLayoutMetrics({ width: 390, height: 844, fontScale: largest, primaryActionLabel: "Devam et" })
  const long = getSetupLayoutMetrics({ width: 390, height: 844, fontScale: largest, primaryActionLabel: "Karakterimi hazırlayalım" })
  assert.ok(short.primaryActionHeight < long.primaryActionHeight, "a short label does not reserve room for lines it never uses")
  assert.equal(getSetupLayoutMetrics({ width: 390, height: 844, fontScale: 1, primaryActionLabel: "Karakterimi hazırlayalım" }).primaryActionHeight, 58)
})
