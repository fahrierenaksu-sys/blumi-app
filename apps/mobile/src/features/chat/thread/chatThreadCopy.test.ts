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

test("core chat copy is preserved in both locales", () => {
  assert.equal(CHAT_COPY.en.pendingConversation, "This conversation is still getting ready.")
  assert.equal(CHAT_COPY.en.openingChat, "Opening your chat...")
  assert.equal(CHAT_COPY.tr.openingChat, "Sohbetin hazırlanıyor...")
  assert.equal(CHAT_COPY.en.loadEarlier, "Load earlier")
  assert.equal(CHAT_COPY.tr.loadEarlier, "Önceki mesajları yükle")
  assert.equal(CHAT_COPY.en.messagePlaceholder, "Message…")
  assert.equal(CHAT_COPY.tr.messagePlaceholder, "Mesaj yaz…")
  assert.equal(CHAT_COPY.en.notSent, "Not sent")
  assert.equal(CHAT_COPY.tr.tryAgain, "Tekrar dene")
})

test("accessibility labels name the partner in both locales", () => {
  assert.equal(CHAT_COPY.en.messageAccessibilityLabel("Ada"), "Message Ada")
  assert.equal(CHAT_COPY.en.sendAccessibilityLabel("Ada"), "Send message to Ada")
  assert.equal(CHAT_COPY.en.safetyAccessibilityLabel("Ada"), "Safety options for Ada")
  assert.equal(CHAT_COPY.tr.messageAccessibilityLabel("Ada"), "Ada için mesaj yaz")
  assert.equal(CHAT_COPY.tr.sendAccessibilityLabel("Ada"), "Ada kişisine mesaj gönder")
  assert.equal(CHAT_COPY.tr.safetyAccessibilityLabel("Ada"), "Ada için güvenlik seçenekleri")
})
