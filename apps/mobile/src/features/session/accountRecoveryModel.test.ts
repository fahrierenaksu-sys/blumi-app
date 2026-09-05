import assert from "node:assert/strict"
import test from "node:test"
import {
  normalizeRecoveryPhoneNumber,
  validateAccountRecoveryPhones
} from "./accountRecoveryModel"

test("normalizeRecoveryPhoneNumber accepts international phone numbers only", () => {
  assert.equal(normalizeRecoveryPhoneNumber("+90 555 123 45 67"), "+905551234567")
  assert.equal(normalizeRecoveryPhoneNumber("0555 123 45 67"), "")
})

test("validateAccountRecoveryPhones rejects invalid or duplicate phone numbers", () => {
  assert.equal(
    validateAccountRecoveryPhones("0555 123 45 67", "+1 415 555 2671").errorMessage,
    "Enter your previous phone number with country code."
  )
  assert.equal(
    validateAccountRecoveryPhones("+90 555 123 45 67", "4155552671").errorMessage,
    "Enter your new phone number with country code."
  )
  assert.equal(
    validateAccountRecoveryPhones("+90 555 123 45 67", "+90 (555) 123-45-67").errorMessage,
    "Use a different new phone number."
  )
  assert.equal(
    validateAccountRecoveryPhones("+90 555 123 45 67", "+1 415 555 2671").normalizedNewPhoneNumber,
    "+14155552671"
  )
})
