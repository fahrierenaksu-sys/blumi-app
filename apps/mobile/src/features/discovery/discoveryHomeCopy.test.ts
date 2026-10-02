import assert from "node:assert/strict"
import test from "node:test"
import {
  DISCOVERY_VIBE_OPTIONS,
  getDiscoveryHomeCopy
} from "./discoveryHomeCopy"

test("Discover header and filters read in Turkish on a Turkish device", () => {
  const copy = getDiscoveryHomeCopy("tr")

  assert.equal(copy.header.title, "Keşfet")
  assert.equal(copy.header.filtersAccessibilityLabel, "Discover filtrelerini aç")
  assert.equal(copy.filters.closeAccessibilityLabel, "Discover filtrelerini kapat")
  assert.equal(copy.filters.showEveryoneAccessibilityLabel, "Herkesi göster")
  assert.equal(copy.filters.everyone, "Herkes")
  assert.equal(copy.filters.genders.woman.label, "Kadınlar")
  assert.equal(copy.filters.genders.man.accessibilityLabel, "Erkekleri göster")
  assert.equal(copy.filters.decreaseMinimumAge(24), "En düşük yaşı azalt, şu an 24")
  assert.equal(copy.filters.increaseMaximumAge(40), "En yüksek yaşı artır, şu an 40")
  assert.equal(copy.filters.vibeLabels["Night owl"], "Gece kuşu")
  assert.equal(copy.filters.vibeAccessibilityLabel("Gece kuşu"), "Gece kuşu vibe'ı")
  assert.equal(copy.filters.reset, "Sıfırla")
  assert.equal(copy.filters.apply, "Eşleşmeleri göster")
})

test("Discover header and filters keep the approved English wording", () => {
  const copy = getDiscoveryHomeCopy("en")

  assert.equal(copy.header.title, "Discover")
  assert.equal(copy.header.filtersAccessibilityLabel, "Open discover filters")
  assert.equal(copy.filters.closeAccessibilityLabel, "Close discovery filters")
  assert.equal(copy.filters.eyebrow, "DISCOVERY")
  assert.equal(copy.filters.title, "Set your vibe")
  assert.equal(copy.filters.showEveryoneAccessibilityLabel, "Show everyone")
  assert.equal(copy.filters.genders.woman.accessibilityLabel, "Show women")
  assert.equal(copy.filters.genders.man.label, "Men")
  assert.equal(copy.filters.decreaseMinimumAge(24), "Decrease minimum age, currently 24")
  assert.equal(copy.filters.increaseMaximumAge(40), "Increase maximum age, currently 40")
  assert.equal(copy.filters.vibeAccessibilityLabel("Night owl"), "Night owl vibe")
  assert.equal(copy.filters.reset, "Reset")
  assert.equal(copy.filters.apply, "Show matches")
})

test("vibe filter values stay canonical while every locale labels each one", () => {
  // The server matches vibes by value, so only the label is localised.
  assert.deepEqual(DISCOVERY_VIBE_OPTIONS, [
    "Coffee dates",
    "Slow burn",
    "Bookish",
    "Outdoors",
    "Creative",
    "Fitness",
    "Night owl",
    "Pets"
  ])
  for (const locale of ["tr", "en"] as const) {
    const { vibeLabels } = getDiscoveryHomeCopy(locale).filters
    for (const vibe of DISCOVERY_VIBE_OPTIONS) {
      assert.ok(vibeLabels[vibe].trim().length > 0, `${locale}: ${vibe}`)
    }
  }
  assert.equal(getDiscoveryHomeCopy("en").filters.vibeLabels["Coffee dates"], "Coffee dates")
})
