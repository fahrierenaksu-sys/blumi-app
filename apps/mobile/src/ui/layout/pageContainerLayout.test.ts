import assert from "node:assert/strict"
import test from "node:test"
import {
  PAGE_CONTAINER_SPACING,
  resolvePageContainerLayout,
  resolvePageContentWidth,
  resolvePageScrollBottomPadding
} from "./pageContainerLayout"

const { compactHorizontalInset, regularHorizontalInset, maxContentWidth } = PAGE_CONTAINER_SPACING

test("compact iPhone widths use the compact content gutter", () => {
  assert.deepEqual(resolvePageContainerLayout(320), {
    horizontalInset: compactHorizontalInset,
    contentWidth: 320 - compactHorizontalInset * 2,
    maxContentWidth
  })
})

test("current iPhone widths use the shared regular page gutter", () => {
  for (const width of [390, 430]) {
    assert.deepEqual(resolvePageContainerLayout(width), {
      horizontalInset: regularHorizontalInset,
      contentWidth: width - regularHorizontalInset * 2,
      maxContentWidth
    })
  }
})

test("wide layouts center a capped readable column instead of stretching components", () => {
  assert.deepEqual(resolvePageContainerLayout(834), {
    horizontalInset: (834 - maxContentWidth) / 2,
    contentWidth: maxContentWidth,
    maxContentWidth
  })
})

test("invalid or pre-layout widths fall back without producing negative geometry", () => {
  for (const width of [0, Number.NaN]) {
    assert.deepEqual(resolvePageContainerLayout(width), {
      horizontalInset: compactHorizontalInset,
      contentWidth: 0,
      maxContentWidth
    })
  }
})

test("nested pages do not apply the horizontal gutter twice", () => {
  assert.equal(resolvePageContentWidth(390, false), 390 - regularHorizontalInset * 2)
  assert.equal(resolvePageContentWidth(390, true), "100%")
})

test("scroll content clears bottom navigation without repeating an included safe inset", () => {
  assert.equal(resolvePageScrollBottomPadding({
    bottomContentInset: 114, safeAreaBottom: 34, safeAreaBottomIncluded: true
  }), 80)
  assert.equal(resolvePageScrollBottomPadding({
    bottomContentInset: 114, safeAreaBottom: 34, safeAreaBottomIncluded: false
  }), 114)
  assert.equal(resolvePageScrollBottomPadding({
    bottomContentInset: Number.NaN, safeAreaBottom: 34, safeAreaBottomIncluded: true
  }), 0)
})
