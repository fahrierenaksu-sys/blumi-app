import assert from "node:assert/strict"
import test from "node:test"
import { getDiscoveryHomeCopy } from "./discoveryHomeCopy"

test("Discover header and filters read in Turkish on a Turkish device", () => {
  const copy = getDiscoveryHomeCopy("tr")

  assert.equal(copy.header.profileAccessibilityLabel, "Blumi profilini aç")
  assert.equal(copy.header.profileMeta, "Vibe'ını düzenle")
  assert.equal(copy.header.filtersAccessibilityLabel, "Discover filtrelerini aç")
  assert.equal(copy.filters.closeAccessibilityLabel, "Discover filtrelerini kapat")
  assert.equal(copy.filters.showEveryoneAccessibilityLabel, "Herkesi göster")
  assert.equal(copy.filters.everyone, "Herkes")
  assert.equal(copy.filters.genders.woman.label, "Kadınlar")
  assert.equal(copy.filters.genders.man.accessibilityLabel, "Erkekleri göster")
  assert.equal(copy.filters.title, "Vibe'ını belirle")
  assert.equal(copy.filters.subtitle, "Discover'da kimleri göreceğini seç.")
  assert.equal(copy.filters.ageRange, "Yaş aralığı")
  assert.equal(copy.filters.ageRangeAccessibilityLabel(24, 40), "Yaş aralığı, 24 ile 40 arası")
  assert.equal(copy.filters.minimumAge, "En düşük yaş")
  assert.equal(copy.filters.maximumAge, "En yüksek yaş")
  assert.equal(copy.filters.reset, "Sıfırla")
  assert.equal(copy.filters.resetAccessibilityLabel, "Filtreleri sıfırla")
  assert.equal(copy.filters.apply, "Eşleşmeleri göster")
})

test("Discover header and filters keep the approved English wording", () => {
  const copy = getDiscoveryHomeCopy("en")

  assert.equal(copy.header.profileAccessibilityLabel, "Open your Blumi profile")
  assert.equal(copy.header.profileMeta, "Edit your vibe")
  assert.equal(copy.header.filtersAccessibilityLabel, "Open discover filters")
  assert.equal(copy.filters.closeAccessibilityLabel, "Close discovery filters")
  assert.equal(copy.filters.title, "Set your vibe")
  assert.equal(copy.filters.subtitle, "Choose who shows up in Discover.")
  assert.equal(copy.filters.showEveryoneAccessibilityLabel, "Show everyone")
  assert.equal(copy.filters.genders.woman.accessibilityLabel, "Show women")
  assert.equal(copy.filters.genders.man.label, "Men")
  assert.equal(copy.filters.ageRange, "Age range")
  assert.equal(copy.filters.ageRangeAccessibilityLabel(24, 40), "Age range, 24 to 40")
  assert.equal(copy.filters.minimumAge, "Minimum age")
  assert.equal(copy.filters.maximumAge, "Maximum age")
  assert.equal(copy.filters.reset, "Reset")
  assert.equal(copy.filters.resetAccessibilityLabel, "Reset filters")
  assert.equal(copy.filters.apply, "Show matches")
})

test("the filters sheet no longer offers liked-vibe pills", () => {
  // Stored vibes stay on the account; the sheet just does not show or edit them.
  for (const locale of ["tr", "en"] as const) {
    const filters = getDiscoveryHomeCopy(locale).filters as unknown as Record<string, unknown>
    assert.equal("vibesTitle" in filters, false, locale)
    assert.equal("vibeLabels" in filters, false, locale)
  }
})
