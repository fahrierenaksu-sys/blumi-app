import assert from "node:assert/strict"
import test from "node:test"
import { getAuthEntryCopy } from "./authEntryCopy"
import {
  getLocalPhonePlaceholder,
  getPhoneErrorMessage
} from "./registerPresentationModel"

test("register uses country-aware local phone placeholders", () => {
  assert.equal(getLocalPhonePlaceholder("TR", "Local phone number"), "5XX XXX XX XX")
  assert.equal(getLocalPhonePlaceholder("US", "Local phone number"), "(202) 555-0123")
  assert.equal(getLocalPhonePlaceholder("GB", "Local phone number"), "7400 123456")
  assert.equal(getLocalPhonePlaceholder("DE", "Local phone number"), "Local phone number")
})

test("register keeps validation copy localized and specific for Turkish rules", () => {
  const copy = getAuthEntryCopy("en")

  assert.equal(
    getPhoneErrorMessage("tr-leading-zero", "Türkiye", copy),
    copy.trLeadingZeroError
  )
  assert.equal(
    getPhoneErrorMessage("tr-mobile-prefix", "Türkiye", copy),
    copy.trStartsWithFiveError
  )
  assert.equal(
    getPhoneErrorMessage("invalid-number", "Germany", copy),
    copy.invalidPhoneNumber("Germany")
  )
})
