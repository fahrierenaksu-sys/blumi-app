import assert from "node:assert/strict"
import test from "node:test"
import { getShopCombinationItems, getShopCombinationSummary } from "./shopCombinationSummary"

test("male selections expose product names and ownership across categories", () => {
  const items = getShopCombinationItems({
    equipped: { top: "old", hair: "hair" },
    draft: { top: "male-shirt", bottom: "male-pants", shoes: "male-shoes", hair: "hair" },
    ownedProductIds: ["old", "hair", "male-shoes"],
    products: [
      { sourceItemId: "male-shirt", title: "Resort Shirt", priceCoins: 350 },
      { sourceItemId: "male-pants", title: "Cargo Pants", priceCoins: 250 },
      { sourceItemId: "male-shoes", title: "Sneakers", priceCoins: 100 }
    ]
  })
  assert.deepEqual(items.map(({ title, owned }) => ({ title, owned })), [
    { title: "Resort Shirt", owned: false }, { title: "Cargo Pants", owned: false }, { title: "Sneakers", owned: true }
  ])
})

test("summary includes all new pieces but charges only unowned items", () => {
  assert.deepEqual(getShopCombinationSummary({
    equipped: { top: "old" }, draft: { top: "top", bottom: "bottom", shoes: "shoes" },
    ownedProductIds: ["old", "shoes"],
    products: [{ sourceItemId: "top", priceCoins: 80 }, { sourceItemId: "bottom", priceCoins: 120 }]
  }), { selectedCount: 3, purchaseCount: 2, total: 200 })
})
test("semantic dresses exclude hidden tops and bottoms and accessories count once", () => {
  assert.deepEqual(getShopCombinationSummary({
    equipped: {}, draft: { dress: "dress", top: "hidden", bottom: "hidden2", accessoryIds: ["bow", "bow"] },
    ownedProductIds: ["bow"], products: [{ sourceItemId: "dress", priceCoins: 300 }]
  }), { selectedCount: 2, purchaseCount: 1, total: 300 })
})
test("unknown prices fail closed rather than displaying a partial total", () => {
  assert.equal(getShopCombinationSummary({ equipped: {}, draft: { top: "missing" }, ownedProductIds: [], products: [] }).total, null)
})
test("owned-only selections have no purchase cost", () => {
  assert.deepEqual(getShopCombinationSummary({ equipped: {}, draft: { top: "owned" }, ownedProductIds: ["owned"], products: [] }),
    { selectedCount: 1, purchaseCount: 0, total: 0 })
})

test("pieces appear in selection order rather than category order", () => {
  const items = getShopCombinationItems({ equipped: {},
    draft: { top: "shirt", bottom: "pants", shoes: "shoes" },
    ownedProductIds: [], products: [], selectionOrder: ["shoes", "shirt", "pants"] })
  assert.deepEqual(items.map((item) => item.id), ["shoes", "shirt", "pants"])
})

test("combination rows replace a category and exclude pieces hidden by a dress", () => {
  const items = getShopCombinationItems({
    equipped: {},
    draft: { dress: "dress", top: "hidden-top", bottom: "hidden-bottom", shoes: "shoes", accessoryIds: ["bow", "bow"] },
    ownedProductIds: ["bow"],
    products: []
  })
  assert.deepEqual(items.map((item) => item.id), ["dress", "shoes", "bow"])
  assert.equal(items[0].title, null)
  assert.equal(items[0].price, null)
  assert.equal(items[2].owned, true)
})
