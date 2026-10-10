import assert from "node:assert/strict"
import test from "node:test"
import { getExampleNumber } from "libphonenumber-js/max"
import examples from "libphonenumber-js/mobile/examples"
import { compactPhoneInput, normalizeInternationalSmsPhone } from "./phoneNumberInput"
import { createInitialRegisterFlow, getRegisterFlowAvailability, updateRegisterPhone } from "./registerFlowModel"
import { normalizeRecoveryPhoneNumber } from "./accountRecoveryModel"

test("invalid raw input cannot become a valid registration or recovery destination", () => {
  const phone = getExampleNumber("US", examples)!
  const inputs = [phone.number + "x", "call " + phone.number, phone.number + " ext 9",
    phone.number + "\n", phone.number + "\t", phone.number + "\u200b", phone.number + "\u202e",
    phone.number + "😀", phone.number.replace("+", "++"), phone.number + "/" + phone.number,
    phone.number.replace("+", "＋"), phone.number + "٠", phone.number + "\u0000", " ".repeat(65) + phone.number]
  for (const input of inputs) {
    assert.equal(normalizeInternationalSmsPhone(input), null)
    assert.equal(normalizeRecoveryPhoneNumber(input), "")
    const flow = updateRegisterPhone(createInitialRegisterFlow("US"), input)
    assert.equal(flow.phoneNumber, input, "invalid characters must remain available for correction")
    assert.equal(getRegisterFlowAvailability(flow, false).canRequestCode, false)
  }
})

test("permitted formatting maps to one canonical SMS destination", () => {
  for (const country of ["US", "CA", "TR", "GB", "DE", "FR", "RU", "CN", "SA"] as const) {
    const phone = getExampleNumber(country, examples)!
    for (const input of [phone.number, phone.formatInternational(), phone.formatInternational().replaceAll(" ", "\u00a0")]) {
      assert.equal(normalizeInternationalSmsPhone(input), phone.number)
      assert.equal(normalizeRecoveryPhoneNumber(input), phone.number)
      const flow = updateRegisterPhone(createInitialRegisterFlow(country), input)
      assert.equal(getRegisterFlowAvailability(flow, false).normalizedPhoneNumber, phone.number)
    }
  }
})

test("typing through automatic formatting still reaches a valid number", () => {
  for (const country of ["US", "TR", "GB"] as const) {
    const phone = getExampleNumber(country, examples)!
    let flow = createInitialRegisterFlow(country)
    const digits = country === "TR" ? phone.nationalNumber : compactPhoneInput(phone.formatNational())!
    for (const digit of digits) flow = updateRegisterPhone(flow, flow.phoneNumber + digit)
    assert.equal(getRegisterFlowAvailability(flow, false).normalizedPhoneNumber, phone.number)
  }
})

test("correcting a rejected paste restores a valid form without retaining a bypass", () => {
  const phone = getExampleNumber("US", examples)!
  const invalid = updateRegisterPhone(createInitialRegisterFlow("US"), phone.number + "x")
  const corrected = updateRegisterPhone(invalid, phone.number)
  assert.equal(getRegisterFlowAvailability(invalid, false).canRequestCode, false)
  assert.equal(getRegisterFlowAvailability(corrected, false).canRequestCode, true)
})
