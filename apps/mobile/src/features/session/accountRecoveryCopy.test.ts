import assert from "node:assert/strict"
import test from "node:test"
import {
  getAccountRecoveryCopy,
  getAccountRecoveryErrorMessageForDisplay,
  resolveAccountRecoveryLocale
} from "./accountRecoveryCopy"

test("account recovery copy stays clear in Turkish and English", () => {
  const english = getAccountRecoveryCopy("en")
  const turkish = getAccountRecoveryCopy("tr")

  assert.equal(english.title, "Phone access help")
  assert.equal(turkish.title, "Telefon erişim desteği")
  assert.match(english.detailsBody, /does not sign you in/i)
  assert.match(turkish.detailsBody, /oturum açmaz/i)
  assert.equal(english.requestReview, "Request review")
  assert.equal(turkish.requestReview, "İnceleme iste")
})

test("account recovery locale prefers the native Turkish locale over an English Intl fallback", () => {
  assert.equal(resolveAccountRecoveryLocale("tr_TR", "en-US"), "tr")
  assert.equal(resolveAccountRecoveryLocale(undefined, "tr-TR"), "tr")
  assert.equal(resolveAccountRecoveryLocale(undefined, "en-US"), "en")
})

test("account recovery errors preserve privacy and never expose transport diagnostics", () => {
  const technicalError =
    "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
  const invalidCodeError = new Error("The verification code is invalid or expired.")

  assert.equal(
    getAccountRecoveryErrorMessageForDisplay("requestCode", technicalError, "en"),
    "We couldn't send a recovery code. Check your number and connection, then try again."
  )
  assert.equal(
    getAccountRecoveryErrorMessageForDisplay("submitReview", technicalError, "tr"),
    "Destek incelemesi isteğini şu anda gönderemedik. Bağlantını kontrol edip tekrar dene."
  )
  assert.equal(
    getAccountRecoveryErrorMessageForDisplay("submitReview", invalidCodeError, "en"),
    "That code wasn't accepted. Check the 6-digit code and try again."
  )
})
