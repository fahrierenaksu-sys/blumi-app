import assert from "node:assert/strict"
import test from "node:test"
import {
  SHEET_DISMISS,
  getSheetDismissDistance,
  getSheetExitOffset,
  resolveSheetDismissClaim,
  resolveSheetDismissRelease,
  resolveSheetDragOffset
} from "./sheetDismissModel"

const H = 520

test("a downward drag claims the sheet only when its content is scrolled to the top", () => {
  assert.equal(resolveSheetDismissClaim({ dx: 0, dy: 4, atTop: true }), "wait", "under the slop")
  assert.equal(resolveSheetDismissClaim({ dx: 2, dy: SHEET_DISMISS.activeOffsetY + 1, atTop: true }), "activate")
  assert.equal(
    resolveSheetDismissClaim({ dx: 0, dy: 40, atTop: false }),
    "fail",
    "scrolled content scrolls back first; the sheet never moves"
  )
  assert.equal(resolveSheetDismissClaim({ dx: 0, dy: -SHEET_DISMISS.activeOffsetY - 1, atTop: true }), "fail", "upward drags scroll")
  assert.equal(resolveSheetDismissClaim({ dx: 30, dy: 12, atTop: true }), "fail", "horizontal drags stay with the content")
  assert.equal(resolveSheetDismissClaim({ dx: 14, dy: 16, atTop: true }), "activate", "a mostly vertical diagonal claims")
})

test("the sheet follows the finger down 1:1 and never rises above its resting place", () => {
  assert.equal(resolveSheetDragOffset(0), 0)
  assert.equal(resolveSheetDragOffset(137), 137)
  assert.equal(resolveSheetDragOffset(-60), 0)
  assert.equal(resolveSheetDragOffset(Number.NaN), 0)
})

test("a release past the dismiss distance closes; a short release springs back", () => {
  const distance = getSheetDismissDistance(H)
  assert.equal(distance, Math.min(H * SHEET_DISMISS.distanceFraction, SHEET_DISMISS.maxDistance))
  assert.equal(resolveSheetDismissRelease({ offset: distance + 1, velocityY: 0, sheetHeight: H }), "dismiss")
  assert.equal(resolveSheetDismissRelease({ offset: distance - 40, velocityY: 0, sheetHeight: H }), "return")
  assert.equal(resolveSheetDismissRelease({ offset: 0, velocityY: 0, sheetHeight: H }), "return")
})

test("a downward flick closes early; an upward flick keeps the sheet", () => {
  assert.equal(resolveSheetDismissRelease({ offset: 40, velocityY: SHEET_DISMISS.flickVelocity, sheetHeight: H }), "dismiss")
  assert.equal(
    resolveSheetDismissRelease({ offset: SHEET_DISMISS.flickMinDistance - 1, velocityY: 4000, sheetHeight: H }),
    "return",
    "jitter never closes"
  )
  assert.equal(
    resolveSheetDismissRelease({ offset: getSheetDismissDistance(H) + 60, velocityY: -SHEET_DISMISS.flickVelocity, sheetHeight: H }),
    "return",
    "flicked back up"
  )
  // A slow drag whose projected travel passes the distance closes.
  const offset = getSheetDismissDistance(H) - 30
  assert.equal(resolveSheetDismissRelease({ offset, velocityY: 400, sheetHeight: H }), "dismiss")
})

test("unmeasured or tiny sheets still use a sane distance and exit fully", () => {
  assert.equal(getSheetDismissDistance(0), SHEET_DISMISS.fallbackDistance)
  assert.equal(getSheetDismissDistance(Number.NaN), SHEET_DISMISS.fallbackDistance)
  assert.ok(getSheetDismissDistance(120) >= SHEET_DISMISS.minDistance)
  assert.ok(getSheetExitOffset(H) > H)
  assert.ok(getSheetExitOffset(0) > 0)
})
