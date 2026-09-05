import assert from "node:assert/strict"
import test from "node:test"
import { getProfileSetupLayoutMetrics } from "./profileSetupLayout"

test("uses compact scroll geometry on the shorter reference viewport", () => {
  assert.deepEqual(getProfileSetupLayoutMetrics(852, 393, 1), {
    avatarSize: 92,
    avatarStageHeight: 132,
    compact: true,
    contentGap: 6,
    formGap: 8,
    formPadding: 12,
    horizontalPadding: 8,
    scrollFallback: true,
    stackIdentityFields: false,
    verticalPadding: 8,
    wrapGenderOptions: false
  })
})

test("keeps iPhone 17 identity fields in the stronger inline composition", () => {
  const layout = getProfileSetupLayoutMetrics(874, 402, 1)

  assert.equal(layout.scrollFallback, true)
  assert.equal(layout.stackIdentityFields, false)
  assert.equal(layout.avatarStageHeight, 132)
  assert.equal(layout.wrapGenderOptions, false)
})

test("preserves the regular Pro Max presentation", () => {
  const layout = getProfileSetupLayoutMetrics(956, 440, 1)

  assert.equal(layout.scrollFallback, false)
  assert.equal(layout.compact, false)
  assert.equal(layout.avatarStageHeight, 170)
  assert.equal(layout.wrapGenderOptions, false)
})

test("enables a compact scroll fallback on short phones", () => {
  assert.deepEqual(getProfileSetupLayoutMetrics(667, 375, 1), {
    avatarSize: 92,
    avatarStageHeight: 132,
    compact: true,
    contentGap: 6,
    formGap: 8,
    formPadding: 12,
    horizontalPadding: 8,
    scrollFallback: true,
    stackIdentityFields: true,
    verticalPadding: 8,
    wrapGenderOptions: true
  })
})

test("uses the scroll fallback instead of clipping Dynamic Type", () => {
  const layout = getProfileSetupLayoutMetrics(852, 393, 1.35)

  assert.equal(layout.scrollFallback, true)
  assert.equal(layout.stackIdentityFields, true)
  assert.equal(layout.compact, true)
  assert.equal(layout.wrapGenderOptions, true)
})

test("stacks identity fields on narrow screens even when height is ample", () => {
  const layout = getProfileSetupLayoutMetrics(852, 340, 1)

  assert.equal(layout.scrollFallback, true)
  assert.equal(layout.stackIdentityFields, true)
  assert.equal(layout.wrapGenderOptions, true)
})
