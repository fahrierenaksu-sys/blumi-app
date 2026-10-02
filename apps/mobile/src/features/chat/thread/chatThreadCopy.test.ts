import assert from "node:assert/strict"
import test from "node:test"
import { CHAT_COPY, resolveChatThreadLocale } from "./chatThreadCopy"

test("an explicit route locale wins over the device locale", () => {
  assert.equal(resolveChatThreadLocale("tr", "en-US"), "tr")
  assert.equal(resolveChatThreadLocale("en", "tr-TR"), "en")
})

test("without a route locale, Turkish devices get Turkish copy and others English", () => {
  assert.equal(resolveChatThreadLocale(undefined, "tr-TR"), "tr")
  assert.equal(resolveChatThreadLocale(undefined, "TR"), "tr")
  assert.equal(resolveChatThreadLocale(undefined, "en-US"), "en")
  assert.equal(resolveChatThreadLocale(undefined, "de-DE"), "en")
})

test("without an injected device locale the ICU default locale decides", () => {
  const expected = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("tr")
    ? "tr"
    : "en"
  assert.equal(resolveChatThreadLocale(undefined), expected)
})

test("Turkish and English copy define the same keys", () => {
  assert.deepEqual(Object.keys(CHAT_COPY.tr).sort(), Object.keys(CHAT_COPY.en).sort())
})

test("accessibility labels name the partner in both locales", () => {
  for (const locale of ["en", "tr"] as const) {
    const copy = CHAT_COPY[locale]
    for (const label of [
      copy.messageAccessibilityLabel("Ada"),
      copy.sendAccessibilityLabel("Ada"),
      copy.safetyAccessibilityLabel("Ada")
    ]) {
      assert.ok(label.includes("Ada"), `${locale}: ${label}`)
    }
  }
})
