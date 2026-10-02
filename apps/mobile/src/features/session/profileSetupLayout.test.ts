import assert from "node:assert/strict"
import test from "node:test"
import { getProfileSetupLayoutMetrics } from "./profileSetupLayout"

function layoutFlags(height: number, width: number, fontScale: number) {
  const { compact, scrollFallback, stackIdentityFields, wrapGenderOptions } =
    getProfileSetupLayoutMetrics(height, width, fontScale)
  return { compact, scrollFallback, stackIdentityFields, wrapGenderOptions }
}

test("uses compact scroll geometry on the shorter reference viewport", () => {
  assert.deepEqual(layoutFlags(852, 393, 1), {
    compact: true,
    scrollFallback: true,
    stackIdentityFields: false,
    wrapGenderOptions: false
  })
})

test("keeps iPhone 17 identity fields in the stronger inline composition", () => {
  const layout = layoutFlags(874, 402, 1)

  assert.equal(layout.scrollFallback, true)
  assert.equal(layout.stackIdentityFields, false)
  assert.equal(layout.wrapGenderOptions, false)
})

test("preserves the regular Pro Max presentation", () => {
  const layout = layoutFlags(956, 440, 1)

  assert.equal(layout.scrollFallback, false)
  assert.equal(layout.compact, false)
  assert.equal(layout.wrapGenderOptions, false)
})

test("enables a compact scroll fallback on short phones", () => {
  assert.deepEqual(layoutFlags(667, 375, 1), {
    compact: true,
    scrollFallback: true,
    stackIdentityFields: true,
    wrapGenderOptions: true
  })
})

test("uses the scroll fallback instead of clipping Dynamic Type", () => {
  const layout = layoutFlags(852, 393, 1.35)

  assert.equal(layout.scrollFallback, true)
  assert.equal(layout.stackIdentityFields, true)
  assert.equal(layout.compact, true)
  assert.equal(layout.wrapGenderOptions, true)
})

test("stacks identity fields on narrow screens even when height is ample", () => {
  const layout = layoutFlags(852, 340, 1)

  assert.equal(layout.scrollFallback, true)
  assert.equal(layout.stackIdentityFields, true)
  assert.equal(layout.wrapGenderOptions, true)
})
