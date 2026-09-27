import assert from "node:assert/strict"
import test from "node:test"
import { getShopLayoutMetrics } from "./shopLayoutMetrics"

const iphone17 = getShopLayoutMetrics({ width: 402, height: 874 })
const iphone17ProMax = getShopLayoutMetrics({ width: 440, height: 956 })

test("shop metrics depend on width and ignore height-only changes", () => {
  const aroundWidthBreakpoint = [389, 390].map((width) =>
    getShopLayoutMetrics({ width, height: 874 })
  )
  const aroundHeightBreakpoint = [879, 880].map((height) =>
    getShopLayoutMetrics({ width: 402, height })
  )

  assert.ok(
    Math.abs(
      aroundWidthBreakpoint[1].preview.avatarWidth
        - aroundWidthBreakpoint[0].preview.avatarWidth
    ) < 1
  )
  assert.deepEqual(aroundHeightBreakpoint[1], aroundHeightBreakpoint[0])
})

test("larger iPhones keep the same Shop hierarchy and only gain bounded space", () => {
  assert.equal(iphone17.hierarchy, "live-preview")
  assert.equal(iphone17ProMax.hierarchy, "live-preview")
  assert.ok(iphone17ProMax.preview.avatarWidth >= iphone17.preview.avatarWidth)
  assert.ok(iphone17ProMax.preview.avatarWidth <= 178)
  assert.ok(iphone17ProMax.preview.roomStageHeight <= 300)
})

test("short content viewports shrink the preview without narrowing the catalog", () => {
  const short = getShopLayoutMetrics({ width: 402, height: 520 })
  const tall = getShopLayoutMetrics({ width: 402, height: 740 })
  assert.ok(short.preview.avatarStageHeight < tall.preview.avatarStageHeight)
  assert.equal(short.catalog.productCardWidth, tall.catalog.productCardWidth)
  assert.ok(short.preview.avatarWidth * 1.4 <= short.preview.avatarStageHeight)
})

test("four-piece preview redistributes space without expanding the screen", () => {
  for (const width of [375, 390, 402, 430, 440]) {
    const metrics = getShopLayoutMetrics({ width, height: 730 })
    assert.ok(metrics.preview.avatarStageHeight >= 228)
    assert.ok(metrics.catalog.productCardHeight >= 108)
    assert.ok(metrics.catalog.productCardHeight * 2 + metrics.preview.avatarStageHeight + 246 <= 730.1)
  }
})

test("small phones retain touch targets and a two-column product shelf", () => {
  const small = getShopLayoutMetrics({ width: 375, height: 667 })

  assert.ok(small.minimumTouchTarget >= 44)
  assert.ok(small.catalog.categoryRailWidth >= 44)
  assert.ok(small.catalog.productCardWidth >= 88)
  assert.ok(
    small.catalog.productCardWidth * 2 + small.catalog.columnGap
      <= small.catalog.productShelfWidth
  )
})

test("the narrowest supported viewport never overflows the Shop catalog", () => {
  const narrow = getShopLayoutMetrics({
    width: 320,
    height: 568,
    horizontalInset: 16
  })
  const occupiedWidth = narrow.catalog.cardPadding * 2
    + narrow.catalog.categoryRailWidth
    + narrow.catalog.bodyGap
    + narrow.catalog.productShelfWidth

  assert.ok(occupiedWidth <= narrow.contentWidth)
  assert.ok(
    narrow.catalog.productCardWidth * 2 + narrow.catalog.columnGap
      <= narrow.catalog.productShelfWidth
  )
})

test("invalid viewport values fail closed to finite, usable metrics", () => {
  const invalid = getShopLayoutMetrics({ width: Number.NaN, height: -20 })

  assert.ok(Number.isFinite(invalid.preview.avatarWidth))
  assert.ok(invalid.contentWidth > 0)
  assert.ok(invalid.catalog.productShelfWidth > 0)
})

test("moderately larger text grows product cards within the two-column shelf", () => {
  const standard = getShopLayoutMetrics({ width: 402, height: 874, fontScale: 1 })
  const large = getShopLayoutMetrics({ width: 402, height: 874, fontScale: 1.3 })
  assert.ok(large.catalog.productCardHeight > standard.catalog.productCardHeight)
  assert.equal(large.catalog.productCardWidth, standard.catalog.productCardWidth)
  assert.equal(large.catalog.productShelfWidth, standard.catalog.productShelfWidth)
})

test("accessibility text gets a full-width product shelf", () => {
  const accessible = getShopLayoutMetrics({ width: 402, height: 874, fontScale: 2 })
  assert.equal(accessible.catalog.accessibilityLayout, true)
  assert.equal(accessible.catalog.productCardWidth, accessible.catalog.productShelfWidth)
  assert.ok(accessible.catalog.productShelfWidth > iphone17.catalog.productShelfWidth)
  assert.ok(accessible.catalog.productCardHeight > iphone17.catalog.productCardHeight)
})
