import assert from "node:assert/strict"
import test from "node:test"
import { resolveAppViewportMetrics } from "./appViewportMetrics"

const SAFE_AREA = { top: 59, right: 0, bottom: 34, left: 0 }

test("computes usable content from viewport, safe area, font scale, and nav presence", () => {
  const withNav = resolveAppViewportMetrics({
    width: 393,
    height: 852,
    fontScale: 1,
    safeAreaInsets: SAFE_AREA,
    bottomNavVisible: true,
  })
  const withoutNav = resolveAppViewportMetrics({
    width: 393,
    height: 852,
    fontScale: 1,
    safeAreaInsets: SAFE_AREA,
    bottomNavVisible: false,
  })

  assert.equal(withNav.safeWidth, 393)
  assert.equal(withNav.safeHeight, 759)
  assert.equal(
    withNav.contentHeight,
    852 - SAFE_AREA.top - withNav.bottomContentInset
  )
  assert.ok(withNav.contentHeight < withoutNav.contentHeight)
  assert.equal(withNav.fontScale, 1)
})

test("metrics remain continuous around former width and height breakpoints", () => {
  const inputs = [
    { width: 389, height: 719 },
    { width: 390, height: 720 },
    { width: 391, height: 721 },
    { width: 393, height: 879 },
    { width: 393, height: 880 },
    { width: 393, height: 881 },
  ]
  const layouts = inputs.map(({ width, height }) => resolveAppViewportMetrics({
    width,
    height,
    fontScale: 1,
    safeAreaInsets: SAFE_AREA,
    bottomNavVisible: true,
  }))

  for (let index = 1; index < layouts.length; index += 1) {
    const current = layouts[index]
    const previous = layouts[index - 1]
    const inputJumpedToAnotherRange = inputs[index].height - inputs[index - 1].height > 1

    if (!inputJumpedToAnotherRange) {
      assert.ok(Math.abs(current.layoutScale - previous.layoutScale) < 0.01)
      assert.ok(Math.abs(current.horizontalGutter - previous.horizontalGutter) <= 1)
    }
  }
})

test("layout scale is continuous and clamped for small and large phones", () => {
  const small = resolveAppViewportMetrics({
    width: 320,
    height: 568,
    fontScale: 1,
    safeAreaInsets: { top: 20, right: 0, bottom: 0, left: 0 },
    bottomNavVisible: true,
  })
  const large = resolveAppViewportMetrics({
    width: 440,
    height: 956,
    fontScale: 1,
    safeAreaInsets: SAFE_AREA,
    bottomNavVisible: true,
  })

  assert.ok(small.layoutScale >= 0.82)
  assert.ok(large.layoutScale <= 1.08)
})

test("large Dynamic Type is exposed without changing the usable viewport geometry", () => {
  const normal = resolveAppViewportMetrics({
    width: 393,
    height: 852,
    fontScale: 1,
    safeAreaInsets: SAFE_AREA,
    bottomNavVisible: true,
  })
  const largeText = resolveAppViewportMetrics({
    width: 393,
    height: 852,
    fontScale: 1.4,
    safeAreaInsets: SAFE_AREA,
    bottomNavVisible: true,
  })

  assert.equal(largeText.usesLargeText, true)
  assert.equal(normal.usesLargeText, false)
  assert.equal(largeText.contentHeight, normal.contentHeight)
  assert.ok(largeText.readabilityScale < normal.readabilityScale)
})

test("normalizes invalid dimensions and insets to finite non-negative metrics", () => {
  const layout = resolveAppViewportMetrics({
    width: Number.NaN,
    height: -1,
    fontScale: 0,
    safeAreaInsets: { top: -10, right: 1_000, bottom: -5, left: 1_000 },
    bottomNavVisible: true,
  })

  for (const value of Object.values(layout)) {
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value))
      assert.ok(value >= 0)
    }
  }
  assert.equal(layout.fontScale, 1)
  assert.equal(layout.contentWidth, 0)
  assert.equal(layout.contentHeight, 0)
})
