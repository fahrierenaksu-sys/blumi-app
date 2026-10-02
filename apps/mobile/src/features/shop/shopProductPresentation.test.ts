import assert from "node:assert/strict"
import test from "node:test"
import type { ShopCatalogItem } from "./shopCatalog"
import { formatCoins } from "./shopFormatters"
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
  const turkish = getShopProductPresentation(product, "tr")
  const english = getShopProductPresentation(product, "en")
  assert.notEqual(turkish.stateLabel, english.stateLabel)
  assert.notEqual(turkish.actionLabel, english.actionLabel)
  assert.ok(turkish.stateLabel.includes(formatCoins(100, "tr")))
  assert.ok(turkish.actionLabel.includes(formatCoins(100, "tr")))
  assert.equal(product.priceCoins, 100)
  assert.equal(product.sourceItemId, "top")
})

test("owned, equipped and placed states get distinct localized labels", () => {
  const room = {
    id: "room:chair", kind: "roomItem", sectionId: "room", previewType: "room",
    owned: true, actionType: "disabled", placedCount: 2
  } as const
  for (const locale of ["tr", "en"] as const) {
    const owned = getShopProductPresentation(item({ owned: true, actionType: "avatarEquip" }), locale).stateLabel
    const wearing = getShopProductPresentation(item({ owned: true, actionType: "disabled" }), locale).stateLabel
    const placed = getShopProductPresentation(item(room), locale).stateLabel
    assert.equal(new Set([owned, wearing, placed]).size, 3, locale)
    assert.ok(placed.includes("2"), "the placed label counts the placed pieces")
  }
})
