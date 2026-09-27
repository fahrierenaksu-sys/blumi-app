import assert from "node:assert/strict"
import test from "node:test"
import { getCombinationPage, getCombinationPageSize, getCombinationSelectionPage } from "./shopCombinationViewport"

test("four rows fit without clipping either navigation or purchase action", () => {
  assert.equal(getCombinationPageSize(256), 4)
  assert.equal(getCombinationPageSize(228, 1, 4), 4)
  for (const height of [170, 190, 220, 256]) {
    const size = getCombinationPageSize(height, 1, 9)
    assert.ok(size * 34 + (size - 1) * 3 + 104 <= height)
  }
})
test("every item remains reachable on short screens and with large text", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: `item-${i}` }))
  for (const height of [140, 180, 256]) {
    for (const scale of [1, 1.3, 2]) {
      const size = getCombinationPageSize(height, scale)
      for (const item of items) {
        const page = getCombinationSelectionPage(items, item.id, size)
        assert.ok(getCombinationPage(items, size, page).items.includes(item))
      }
    }
  }
})
test("the fifth selection opens its page without dropping the first four", () => {
  const items = ["top", "bottom", "shoes", "hair", "bag"].map((id) => ({ id }))
  assert.equal(getCombinationSelectionPage(items, "bag", 4), 1)
  assert.deepEqual(getCombinationPage(items, 4, 1).items, [{ id: "bag" }])
  assert.equal(getCombinationPage(items, 4, 0).items.length, 4)
  assert.equal(getCombinationPage(items.slice(0, 2), 4, 1).page, 0)
})
