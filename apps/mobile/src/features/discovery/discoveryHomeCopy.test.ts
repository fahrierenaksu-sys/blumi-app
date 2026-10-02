import assert from "node:assert/strict"
import test from "node:test"
import { getDiscoveryHomeCopy } from "./discoveryHomeCopy"

function shape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}()`]
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => shape(child, path ? `${path}.${key}` : key))
  }
  return [path]
}

function emptyStrings(value: unknown, path = ""): string[] {
  if (typeof value === "string") return value.trim() ? [] : [path]
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => emptyStrings(child, path ? `${path}.${key}` : key))
  }
  return []
}

test("Discover copy has the same keys in every locale, with no empty strings", () => {
  const tr = getDiscoveryHomeCopy("tr")
  const en = getDiscoveryHomeCopy("en")
  assert.deepEqual(shape(tr).sort(), shape(en).sort())
  assert.deepEqual(emptyStrings(tr), [])
  assert.deepEqual(emptyStrings(en), [])
})

test("the filters sheet no longer offers liked-vibe pills", () => {
  // Stored vibes stay on the account; the sheet just does not show or edit them.
  for (const locale of ["tr", "en"] as const) {
    const filters = getDiscoveryHomeCopy(locale).filters as unknown as Record<string, unknown>
    assert.equal("vibesTitle" in filters, false, locale)
    assert.equal("vibeLabels" in filters, false, locale)
  }
})
