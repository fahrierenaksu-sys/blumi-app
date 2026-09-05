import assert from "node:assert/strict"
import test from "node:test"
import { getLocaleIdentifier, resolveAppLocale } from "./appLocale"

test("AppLocale prefers the native Turkish locale over the JavaScript fallback", () => {
  assert.equal(resolveAppLocale("tr_TR", "en-US"), "tr")
  assert.equal(resolveAppLocale(undefined, "tr-TR"), "tr")
  assert.equal(resolveAppLocale(undefined, "en-US"), "en")
})

test("AppLocale exposes a stable Intl identifier for each release language", () => {
  assert.equal(getLocaleIdentifier("tr"), "tr-TR")
  assert.equal(getLocaleIdentifier("en"), "en-US")
})
