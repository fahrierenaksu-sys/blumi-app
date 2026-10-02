import assert from "node:assert/strict"
import test from "node:test"
import { getShopLayoutMetrics } from "./shopLayoutMetrics"

const iphone17 = getShopLayoutMetrics({ width: 402, height: 874 })

test("short content viewports shrink the preview without narrowing the catalog", () => {
  const short = getShopLayoutMetrics({ width: 402, height: 520 })
  const tall = getShopLayoutMetrics({ width: 402, height: 740 })
  assert.ok(short.preview.avatarStageHeight < tall.preview.avatarStageHeight)
  assert.equal(short.catalog.productCardWidth, tall.catalog.productCardWidth)
  assert.ok(short.preview.avatarWidth / (256 / 384) <= short.preview.avatarStageHeight)
})

test("shop avatar frame never exceeds its stage at supported phone sizes", () => {
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [402, 874],
    [440, 956]
  ]) {
    const metrics = getShopLayoutMetrics({ width, height })
    const renderedAvatarHeight = metrics.preview.avatarWidth / (256 / 384)
    assert.ok(
      renderedAvatarHeight <= metrics.preview.avatarStageHeight,
      `${width}x${height}: avatar ${renderedAvatarHeight} exceeds stage ${metrics.preview.avatarStageHeight}`
    )
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
