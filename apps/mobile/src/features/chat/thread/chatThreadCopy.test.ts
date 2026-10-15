import assert from "node:assert/strict"
import test from "node:test"
import { CHAT_COPY, resolveChatThreadLocale } from "./chatThreadCopy"
import { getRoomInvitationErrorTitle } from "../chatErrorCopy"
import { setUiLocaleSource } from "../../../ui/uiLocale"

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

test("chat locale collapses platform locale variants to the supported contract", () => {
  assert.equal(resolveChatThreadLocale(undefined, "tr-TR"), "tr")
  assert.equal(resolveChatThreadLocale(undefined, "tr"), "tr")
  assert.equal(resolveChatThreadLocale(undefined, "en-US"), "en")
  assert.equal(resolveChatThreadLocale(undefined, "de-DE"), "en")
})

// Sim QA beta-5: iOS reported en-US to the JavaScript runtime while the app ran in Turkish, so chat and room
// invitations spoke English. The registered app language must win over the runtime locale.
test("the app language tr beats an English device locale in chat and room invitations", () => {
  const runtimeDateTimeFormat = Intl.DateTimeFormat
  const englishDevice = function () {
    return { resolvedOptions: () => ({ locale: "en-US" }) }
  } as unknown as typeof Intl.DateTimeFormat
  try {
    Intl.DateTimeFormat = englishDevice
    setUiLocaleSource(() => "tr-TR")

    assert.equal(resolveChatThreadLocale(undefined), "tr")
    assert.equal(getRoomInvitationErrorTitle("load"), getRoomInvitationErrorTitle("load", "tr"))
    assert.equal(getRoomInvitationErrorTitle("action"), getRoomInvitationErrorTitle("action", "tr"))

    setUiLocaleSource(null)
    assert.equal(resolveChatThreadLocale(undefined), "en", "without a registered app language the device decides")
  } finally {
    Intl.DateTimeFormat = runtimeDateTimeFormat
    setUiLocaleSource(null)
  }
})
