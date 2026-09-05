import assert from "node:assert/strict"
import test from "node:test"
import { CAPABILITY_KEYS, type CapabilityMap } from "@blumi/contracts"
import {
  canMerchandiseSemanticOutfits,
  isMobileOuterwearMerchandisingEnabled,
  isShopMultiItemApplyEnabled
} from "./shopCapabilityPolicy"

function capabilities(enabled: readonly (keyof CapabilityMap)[]): CapabilityMap {
  return Object.fromEntries(
    CAPABILITY_KEYS.map((key) => [key, enabled.includes(key)])
  ) as CapabilityMap
}

test("production Shop enables basic multi-item apply without advertising semantic outfit rendering", () => {
  const none = capabilities([])
  const multiItemOnly = capabilities(["shop_multi_item_apply"])

  assert.equal(isShopMultiItemApplyEnabled("production", none), false)
  assert.equal(isShopMultiItemApplyEnabled("production", multiItemOnly), true)
  assert.equal(canMerchandiseSemanticOutfits("production", multiItemOnly), false)
})

test("demo keeps deterministic local try-on while outerwear remains preserve-only", () => {
  assert.equal(isShopMultiItemApplyEnabled("demo", capabilities([])), true)
  assert.equal(canMerchandiseSemanticOutfits("demo", capabilities([])), true)
  assert.equal(isMobileOuterwearMerchandisingEnabled(), false)
})

test("full catalog QA exposes dresses for production-session inspection", () => {
  assert.equal(
    canMerchandiseSemanticOutfits("production", capabilities([]), {
      fullCatalogQaPreview: true
    }),
    true
  )
})
