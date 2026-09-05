import assert from "node:assert/strict"
import test from "node:test"
import type { ShopCatalogItem } from "./shopCatalog"
import { resolveQueuedAvatarProduct } from "./shopQueueProductPolicy"

const product = {
  sourceItemId: "top-visible"
} as ShopCatalogItem

test("queue product resolution accepts only a visible catalog product", () => {
  assert.deepEqual(
    resolveQueuedAvatarProduct("top-visible", [product]),
    { kind: "visible", product }
  )
  assert.deepEqual(
    resolveQueuedAvatarProduct("missing-product", [product]),
    { kind: "missing" }
  )
})
