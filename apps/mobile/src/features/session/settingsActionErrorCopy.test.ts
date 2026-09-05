import assert from "node:assert/strict"
import test from "node:test"
import {
  getSettingsActionErrorMessageForDisplay,
  getSettingsVerificationErrorToastForDisplay
} from "./settingsActionErrorCopy"

const technicalError =
  "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)"
const invalidCodeError = new Error("The verification code is invalid or expired.")

test("settings security errors never expose transport diagnostics", () => {
  assert.equal(
    getSettingsActionErrorMessageForDisplay("deleteAccount", technicalError),
    "We couldn't delete your account. Your account is still active. Try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("requestDeletionCode", technicalError),
    "We couldn't send a deletion code. Try again in a moment."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyDeletionCode", technicalError),
    "We couldn't verify that deletion code. Check your connection and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("requestDataExport", technicalError),
    "We couldn't send an export code. Try again in a moment."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyDataExport", technicalError),
    "We couldn't prepare your account export. Try again in a moment."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("requestCurrentPhoneCode", technicalError),
    "We couldn't send a security code. Try again in a moment."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyCurrentPhoneCode", technicalError),
    "We couldn't verify that code. Check your connection and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("requestNewPhoneCode", technicalError),
    "We couldn't send a code to that number. Check it and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyNewPhoneCode", technicalError),
    "We couldn't verify that code. Check your connection and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("confirmPhoneChange", technicalError),
    "We couldn't change your phone number. Your current sign-in phone is unchanged."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("refreshHiddenList", technicalError),
    "We couldn't refresh your hidden list. Try again in a moment."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("unblockPerson", technicalError),
    "We couldn't update your hidden list. Try again in a moment."
  )
})

test("settings verification errors distinguish an invalid code from an unavailable service", () => {
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyDeletionCode", invalidCodeError),
    "That code wasn't accepted. Check the 6-digit code and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyDataExport", invalidCodeError),
    "That code wasn't accepted. Check the 6-digit code and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyCurrentPhoneCode", invalidCodeError),
    "That code wasn't accepted. Check the 6-digit code and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyNewPhoneCode", invalidCodeError),
    "That code wasn't accepted. Check the 6-digit code and try again."
  )
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyCurrentPhoneCode", { status: 503 }),
    "We couldn't verify that code. Check your connection and try again."
  )
})

test("settings verification toast titles match the recovery action", () => {
  assert.deepEqual(
    getSettingsVerificationErrorToastForDisplay("verifyDeletionCode", technicalError),
    {
      title: "Could not verify deletion code",
      body: "We couldn't verify that deletion code. Check your connection and try again."
    }
  )
  assert.deepEqual(
    getSettingsVerificationErrorToastForDisplay("verifyCurrentPhoneCode", invalidCodeError),
    {
      title: "Code not accepted",
      body: "That code wasn't accepted. Check the 6-digit code and try again."
    }
  )
  assert.deepEqual(
    getSettingsVerificationErrorToastForDisplay("verifyNewPhoneCode", technicalError),
    {
      title: "Could not verify code",
      body: "We couldn't verify that code. Check your connection and try again."
    }
  )
})

test("settings security errors remain private and actionable in Turkish", () => {
  assert.equal(
    getSettingsActionErrorMessageForDisplay("verifyDeletionCode", technicalError, "tr"),
    "Silme kodu doğrulanamadı. Bağlantını kontrol edip tekrar dene."
  )
  assert.deepEqual(
    getSettingsVerificationErrorToastForDisplay("verifyCurrentPhoneCode", invalidCodeError, "tr"),
    {
      title: "Kod kabul edilmedi",
      body: "Bu kod kabul edilmedi. 6 haneli kodu kontrol edip tekrar dene."
    }
  )
})
