import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { getShopCopy } from "./shopCopy"

test("shop copy covers release languages and offline restrictions", () => {
  const english = getShopCopy("en")
  const turkish = getShopCopy("tr")

  assert.match(english.offline.body, /purchases and saved changes/i)
  assert.match(turkish.offline.body, /satın alma/i)
  assert.equal(english.categories.dress, "Dresses")
  assert.equal(turkish.categories.dress, "Elbiseler")
  assert.equal(english.categories.face, "Face")
  assert.equal(turkish.categories.face, "Yüz")
  assert.equal(english.categories.featured, undefined)
  assert.equal(turkish.categories.featured, undefined)
  assert.equal(english.combination.applyLook, "Apply look")
  assert.equal(turkish.combination.applyLook, "Kombini uygula")
  assert.equal(english.checkout.confirm("120"), "Buy · 120")
  assert.equal(turkish.checkout.confirm("120"), "Satın al · 120")
  assert.match(english.checkout.partial(1, 3), /1 of 3 pieces are yours\. Nothing else was charged\./)
  assert.match(turkish.checkout.partial(1, 3), /3 parçadan 1 tanesi artık senin/)
  assert.match(english.checkout.lineAccessibility("Blossom top", "120", "Yours"), /120 coins/)
  assert.match(turkish.checkout.lineAccessibility("Çiçekli üst", "120", "Senin"), /120 jeton/)
  assert.equal(english.ownedCompact, "Owned")
  assert.equal(turkish.ownedCompact, "Sende")
  assert.equal(english.combination.purchaseFailure("not_enough_coins"), "Not enough coins")
  assert.equal(turkish.combination.purchaseFailure("not_enough_coins"), "Yeterli jetonun yok")
})

test("shop combination messages come from the localized copy contract", () => {
  const source = readFileSync(join(process.cwd(), "src/screens/CosmeticShopScreen.tsx"), "utf8")
  // "Buy the look" confirms once in the checkout sheet (SHOP-1), not N system alerts.
  const confirmationSource = readFileSync(join(process.cwd(), "src/features/shop/screen/ShopCheckoutSheet.tsx"), "utf8")

  assert.match(source, /copy\.combination\.applyLook/)
  assert.match(confirmationSource, /text\.confirm\(totalLabel\)/)
  assert.doesNotMatch(confirmationSource, /Alert\.alert/)
  for (const shopSource of [source, confirmationSource]) {
    assert.doesNotMatch(shopSource, /locale === "tr" \? "Kombini uygula"/)
    assert.doesNotMatch(shopSource, /locale === "tr" \? "Ürünü satın al"/)
  }
})
