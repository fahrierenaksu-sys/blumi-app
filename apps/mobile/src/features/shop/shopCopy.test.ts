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
  assert.match(english.combination.purchaseSummary("Blossom top", "120", "80"), /120 coins/)
  assert.match(turkish.combination.purchaseSummary("Çiçekli üst", "120", "80"), /120 jeton/)
  assert.equal(english.combination.purchaseFailure("not_enough_coins"), "Not enough coins")
  assert.equal(turkish.combination.purchaseFailure("not_enough_coins"), "Yeterli jetonun yok")
})

test("shop combination messages come from the localized copy contract", () => {
  const source = readFileSync(join(process.cwd(), "src/screens/CosmeticShopScreen.tsx"), "utf8")

  assert.match(source, /copy\.combination\.applyLook/)
  assert.match(source, /copy\.purchaseSummary/)
  assert.doesNotMatch(source, /locale === "tr" \? "Kombini uygula"/)
  assert.doesNotMatch(source, /locale === "tr" \? "Ürünü satın al"/)
})
