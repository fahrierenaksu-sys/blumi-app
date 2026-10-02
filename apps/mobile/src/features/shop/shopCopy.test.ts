import assert from "node:assert/strict"
import test from "node:test"
import { getShopCopy } from "./shopCopy"

// Shop copy is complete in both release languages (Turkish text missing or
// left in English has been a frequent bug). The wording itself stays free.

const SAMPLE_ARGUMENTS = [7, 3, "Ada"] as const
// Labels that are legitimately identical in both languages: brand and loan
// words (optionally followed by a number) and number-only labels.
const SAME_IN_BOTH_LOCALES = /^(Blumi|Avatar)?[\d\s.,·/+:%-]*$/

function collectLeaves(value: unknown, path = "", leaves = new Map<string, string>()): Map<string, string> {
  if (typeof value === "string") {
    leaves.set(path, value)
  } else if (typeof value === "function") {
    const result = (value as (...args: unknown[]) => unknown)(...SAMPLE_ARGUMENTS)
    if (typeof result === "string") leaves.set(`${path}()`, result)
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeaves(item, `${path}[${index}]`, leaves))
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) collectLeaves(item, path ? `${path}.${key}` : key, leaves)
  }
  return leaves
}

test("shop copy is complete and translated in Turkish and English", () => {
  const english = collectLeaves(getShopCopy("en"))
  const turkish = collectLeaves(getShopCopy("tr"))

  assert.deepEqual([...turkish.keys()].sort(), [...english.keys()].sort())
  const untranslated: string[] = []
  for (const [key, value] of english) {
    assert.ok(value.trim().length > 0, `${key} (en) is empty`)
    const translated = turkish.get(key) ?? ""
    assert.ok(translated.trim().length > 0, `${key} (tr) is empty`)
    if (translated === value && !SAME_IN_BOTH_LOCALES.test(value)) untranslated.push(`${key}: ${value}`)
  }
  assert.deepEqual(untranslated, [])
})

test("checkout copy carries the amounts it is given in both locales", () => {
  for (const locale of ["tr", "en"] as const) {
    const { checkout } = getShopCopy(locale)
    assert.ok(checkout.confirm("120").includes("120"))
    const partial = checkout.partial(1, 3)
    assert.ok(partial.includes("1") && partial.includes("3"))
    assert.ok(checkout.lineAccessibility("Blossom top", "120", "Yours").includes("120"))
  }
})

test("shop categories never include the featured pseudo-category", () => {
  for (const locale of ["tr", "en"] as const) {
    assert.equal((getShopCopy(locale).categories as Record<string, unknown>).featured, undefined)
  }
})
