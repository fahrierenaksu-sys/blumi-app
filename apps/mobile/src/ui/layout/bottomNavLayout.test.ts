import assert from "node:assert/strict"
import test from "node:test"
import {
  BOTTOM_NAV_HEIGHT,
  MIN_TOUCH_TARGET_SIZE,
  resolveBottomNavLayout,
} from "./bottomNavLayout"

test("uses one measured nav height and reserves its complete floating footprint", () => {
  const layout = resolveBottomNavLayout({
    viewportWidth: 393,
    safeAreaBottom: 34,
    visible: true,
  })

  assert.equal(layout.height, BOTTOM_NAV_HEIGHT)
  assert.equal(layout.bottomOffset, 32)
  assert.equal(
    layout.contentInset,
    layout.bottomOffset + layout.height + layout.contentGap
  )
})

test("hidden navigation reserves only the safe-area bottom inset", () => {
  const layout = resolveBottomNavLayout({
    viewportWidth: 393,
    safeAreaBottom: 34,
    visible: false,
  })

  assert.equal(layout.contentInset, 34)
})

test("every tab keeps at least a 44pt target on supported phone widths", () => {
  for (const viewportWidth of [320, 375, 393, 430]) {
    const layout = resolveBottomNavLayout({
      viewportWidth,
      safeAreaBottom: 0,
      visible: true,
    })

    assert.ok(layout.tabWidth >= MIN_TOUCH_TARGET_SIZE)
    assert.ok(layout.itemHeight >= MIN_TOUCH_TARGET_SIZE)
  }
})

test("nav width changes continuously around former device thresholds", () => {
  const widths = [389, 390, 391]
  const layouts = widths.map((viewportWidth) => resolveBottomNavLayout({
    viewportWidth,
    safeAreaBottom: 34,
    visible: true,
  }))

  assert.ok(Math.abs(layouts[1].navWidth - layouts[0].navWidth) <= 1)
  assert.ok(Math.abs(layouts[2].navWidth - layouts[1].navWidth) <= 1)
})

test("normalizes invalid safe-area values instead of producing negative geometry", () => {
  const layout = resolveBottomNavLayout({
    viewportWidth: 393,
    safeAreaBottom: -20,
    visible: true,
  })

  assert.equal(layout.safeAreaBottom, 0)
  assert.ok(layout.contentInset > 0)
})
