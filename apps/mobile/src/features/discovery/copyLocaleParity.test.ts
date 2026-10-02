import assert from "node:assert/strict"
import test from "node:test"
import { getReportModalCopy } from "../safety/reportModalCopy"
import { getDiscoveryHomeCopy } from "./discoveryHomeCopy"
import { getDiscoverySurfaceCopy } from "./discoverySurfaceCopy"
import { getProfilePreviewCopy } from "./profilePreviewCopy"

// Locale parity for user-facing copy modules: Turkish and English define the
// same keys, no string is empty, and Turkish is actually translated. The exact
// wording stays free to change.

type CopyLeaves = Map<string, string>

const SAMPLE_ARGUMENTS = ["Ada", 3, 10] as const

function collectLeaves(value: unknown, path = "", leaves: CopyLeaves = new Map()): CopyLeaves {
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

// Values that are legitimately identical in both languages (brand words,
// shared abbreviations, numbers and punctuation-only labels).
const SAME_IN_BOTH_LOCALES = /^(Blumi|Whoa!|Min|Max|OK|[\d\s.,/+:%-]*)$/

const copyModules: Record<string, (locale: "tr" | "en") => unknown> = {
  discoverySurface: getDiscoverySurfaceCopy,
  discoveryHome: getDiscoveryHomeCopy,
  profilePreview: getProfilePreviewCopy,
  reportModal: getReportModalCopy
}

for (const [name, getCopy] of Object.entries(copyModules)) {
  test(`${name} copy is complete and translated in Turkish and English`, () => {
    const turkish = collectLeaves(getCopy("tr"))
    const english = collectLeaves(getCopy("en"))

    assert.deepEqual([...turkish.keys()].sort(), [...english.keys()].sort(), `${name} keys match`)
    assert.ok(turkish.size > 0)
    const untranslated: string[] = []
    for (const [key, value] of english) {
      assert.ok(value.trim().length > 0, `${name}.${key} (en) is empty`)
      const translated = turkish.get(key) ?? ""
      assert.ok(translated.trim().length > 0, `${name}.${key} (tr) is empty`)
      if (translated === value && !SAME_IN_BOTH_LOCALES.test(value)) untranslated.push(`${key}: ${value}`)
    }
    assert.deepEqual(untranslated, [], `${name} has untranslated Turkish copy`)
  })
}

test("quota usage names both numbers in each locale", () => {
  for (const locale of ["tr", "en"] as const) {
    const usage = getDiscoverySurfaceCopy(locale).empty.quotaUsage(3, 10)
    assert.match(usage, /3/)
    assert.match(usage, /10/)
  }
})
