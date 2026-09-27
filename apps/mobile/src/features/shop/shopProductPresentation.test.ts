import assert from "node:assert/strict"
import test from "node:test"
import type { ShopCatalogItem } from "./shopCatalog"
import { getShopProductPresentation } from "./shopProductPresentation"

function item(override: Partial<ShopCatalogItem>): ShopCatalogItem {
  return {
    id: "avatar:top",
    kind: "avatarWearable",
    title: "Test Top",
    description: "",
    priceCoins: 100,
    owned: false,
    previewType: "avatar",
    actionType: "avatarUnlock",
    sourceItemId: "top",
    sectionId: "avatar",
    eyebrow: "Avatar top",
    stateLabel: "100 coins",
    actionLabel: "Unlock for 100 coins",
    ...override
  }
}

test("shop labels use the active locale without altering product identity or price", () => {
  const product = item({})
  assert.deepEqual(getShopProductPresentation(product, "tr"), {
    stateLabel: "100 jeton",
    actionLabel: "Aç · 100 jeton",
    eyebrow: "Avatar Tümü"
  })
  assert.equal(product.priceCoins, 100)
  assert.equal(product.sourceItemId, "top")
})

test("owned and placed states are localized without presenting another product", () => {
  assert.equal(getShopProductPresentation(item({ owned: true, actionType: "avatarEquip" }), "tr").stateLabel, "Sahip olundu")
  assert.equal(getShopProductPresentation(item({ owned: true, actionType: "disabled" }), "tr").stateLabel, "Giyili")
  assert.equal(getShopProductPresentation(item({
    id: "room:chair", kind: "roomItem", sectionId: "room", previewType: "room",
    owned: true, actionType: "disabled", placedCount: 2
  }), "tr").stateLabel, "2 yerleştirildi")
})
