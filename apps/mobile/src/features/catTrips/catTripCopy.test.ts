import assert from "node:assert/strict"
import test from "node:test"
import { CAT_TRIP_COPY, firstName, getCatSouvenirCopy, withDative, withGenitive } from "./catTripCopy"

test("names take Turkish suffixes by vowel harmony", () => {
  const genitive: Array<[string, string]> = [["Mert", "Mert'in"], ["Ece", "Ece'nin"], ["Can", "Can'ın"], ["Oğuz", "Oğuz'un"],
    ["Gül", "Gül'ün"], ["Ali", "Ali'nin"], ["Ayşe", "Ayşe'nin"], ["Duru", "Duru'nun"]]
  for (const [name, expected] of genitive) assert.equal(withGenitive(name), expected)
  const dative: Array<[string, string]> = [["Mert", "Mert'e"], ["Ece", "Ece'ye"], ["Can", "Can'a"], ["Duru", "Duru'ya"]]
  for (const [name, expected] of dative) assert.equal(withDative(name), expected)
})

test("only a first name is ever shown, and a missing name falls back without one", () => {
  assert.equal(firstName("  Ece Yılmaz "), "Ece")
  assert.equal(firstName(""), null)
  assert.equal(firstName(undefined), null)
  assert.equal(CAT_TRIP_COPY.ownerRevealTitle(null, "sleepover").includes("'"), false)
  assert.equal(CAT_TRIP_COPY.hostTag(null).includes("'"), false)
})

test("every souvenir, even an unknown key, has a label and a glyph", () => {
  for (const key of ["ribbon", "leaf", "cushion_feather", "button", "pebble", "bell", "star_sticker", "tiny_flower",
    "friend_trinket", "moon_charm", "future_key"]) {
    const copy = getCatSouvenirCopy(key)
    assert.ok(copy.label.length > 0 && copy.glyph.length > 0, key)
  }
})
