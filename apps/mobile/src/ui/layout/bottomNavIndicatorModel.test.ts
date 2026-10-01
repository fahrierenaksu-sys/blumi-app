import assert from "node:assert/strict"
import test from "node:test"
import {
  getBottomNavItemEmphasis,
  publishMainTabPagerIndicator,
  readMainTabPagerIndicatorProgress,
  resolveBottomNavIndicatorIndex,
  resolveMainTabPagerIndicatorSample,
  shouldAnimateBottomNavSelectionFromJs,
  type MainTabPagerIndicatorValues
} from "./bottomNavIndicatorModel"

const W = 390

function createIndicator(): MainTabPagerIndicatorValues {
  return { progress: { value: 0 }, tracking: { value: false }, selection: { value: -1 } }
}

test("a selection the pager already showed on the UI thread is not animated again from JS", () => {
  assert.equal(shouldAnimateBottomNavSelectionFromJs(2, 2), false, "a pager tap moved the pill already")
  assert.equal(shouldAnimateBottomNavSelectionFromJs(-1, 2), true, "no pager (rollback path): JS animates")
  assert.equal(shouldAnimateBottomNavSelectionFromJs(1, 2), true, "the pager shows another page: JS follows the route")
})

test("the pager publishes its fractional page only while a drag or settle moves it", () => {
  assert.deepEqual(
    resolveMainTabPagerIndicatorSample({ position: 1.25 * W, width: W, dragging: true, animating: false }),
    { progress: 1.25, tracking: true }
  )
  assert.deepEqual(
    resolveMainTabPagerIndicatorSample({ position: 2 * W, width: W, dragging: false, animating: true }),
    { progress: 2, tracking: true },
    "the settle animation keeps tracking until it finishes"
  )
  assert.equal(
    resolveMainTabPagerIndicatorSample({ position: 2 * W, width: W, dragging: false, animating: false }).tracking,
    false,
    "a snap (tap, route sync, Reduce Motion) is left to the bar's own selection animation"
  )
  assert.equal(
    resolveMainTabPagerIndicatorSample({ position: 100, width: 0, dragging: true, animating: false }).tracking,
    false,
    "no layout yet"
  )
})

test("the bar reads the pager position only while the pager is tracking", () => {
  const indicator = createIndicator()
  assert.equal(readMainTabPagerIndicatorProgress(indicator), null)
  publishMainTabPagerIndicator(indicator, { progress: 1.4, tracking: true })
  assert.equal(readMainTabPagerIndicatorProgress(indicator), 1.4)
  publishMainTabPagerIndicator(indicator, { progress: 1.9, tracking: true })
  assert.equal(readMainTabPagerIndicatorProgress(indicator), 1.9)
  publishMainTabPagerIndicator(indicator, { progress: 2, tracking: false })
  assert.equal(readMainTabPagerIndicatorProgress(indicator), null)
  assert.equal(indicator.progress.value, 1.9, "a snap does not overwrite the last tracked position")
})

test("the indicator stays on the bar through edge rubber bands", () => {
  assert.equal(resolveBottomNavIndicatorIndex(1.5, 4), 1.5)
  assert.equal(resolveBottomNavIndicatorIndex(-0.2, 4), 0, "Discover rubber band")
  assert.equal(resolveBottomNavIndicatorIndex(3.3, 4), 3, "Shop rubber band")
  assert.equal(resolveBottomNavIndicatorIndex(Number.NaN, 4), 0)
  assert.equal(resolveBottomNavIndicatorIndex(2, 0), 0)
})

test("icon and label emphasis crossfade between the two tabs the indicator spans", () => {
  assert.equal(getBottomNavItemEmphasis(1, 1), 1)
  assert.equal(getBottomNavItemEmphasis(2, 1), 0)
  assert.equal(getBottomNavItemEmphasis(0, 1), 0)
  assert.equal(getBottomNavItemEmphasis(1, 1.25), 0.75)
  assert.equal(getBottomNavItemEmphasis(2, 1.25), 0.25)
  assert.equal(getBottomNavItemEmphasis(3, 1.25), 0)
  for (const indicator of [0, 0.3, 1.5, 2.9, 3]) {
    const total = [0, 1, 2, 3].reduce((sum, index) => sum + getBottomNavItemEmphasis(index, indicator), 0)
    assert.ok(Math.abs(total - 1) < 1e-9, `one tab's worth of emphasis at ${indicator}`)
  }
})
