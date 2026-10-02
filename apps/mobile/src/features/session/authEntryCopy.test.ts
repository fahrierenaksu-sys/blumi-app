import assert from "node:assert/strict"
import test from "node:test"
import { getAuthEntryCopy } from "./authEntryCopy"

test("Turkish auth copy names both legal documents and keeps the phone number private", () => {
  const copy = getAuthEntryCopy("tr")

  assert.match(copy.phonePrivacy, /başka kişilere gösterilmez/i)
  assert.match(copy.termsConsent, /Kullanım Koşulları/i)
  assert.match(copy.termsConsent, /Gizlilik Politikası.*kabul/i)
})

test("English auth copy names both legal documents in the consent line", () => {
  const copy = getAuthEntryCopy("en")

  assert.match(copy.termsConsent, /Terms of Service/i)
  assert.match(copy.termsConsent, /Privacy Policy/i)
})
