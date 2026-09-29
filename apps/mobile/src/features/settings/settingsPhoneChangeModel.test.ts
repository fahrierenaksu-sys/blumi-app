import assert from "node:assert/strict"
import test from "node:test"
import { getSettingsCopy } from "./settingsCopy"
import {
  INITIAL_PHONE_CHANGE_FORM_STATE,
  getPhoneChangeStepPresentation,
  isPhoneChangePrimaryDisabled,
  phoneChangeFormReducer,
  type PhoneChangeFormState
} from "./settingsPhoneChangeModel"

const dirtyState: PhoneChangeFormState = {
  visible: true,
  step: "new_code",
  currentCode: "12",
  newCountry: "GB",
  newNumber: "7700 900123",
  newCode: "99",
  currentConfirmationToken: "token-1"
}

test("phone change starts closed on the current-code step with a Turkish default country", () => {
  assert.deepEqual(INITIAL_PHONE_CHANGE_FORM_STATE, {
    visible: false,
    step: "current_code",
    currentCode: "",
    newCountry: "TR",
    newNumber: "",
    newCode: "",
    currentConfirmationToken: ""
  })
})

test("reset closes the modal and clears every field", () => {
  assert.deepEqual(phoneChangeFormReducer(dirtyState, { type: "reset" }), INITIAL_PHONE_CHANGE_FORM_STATE)
})

test("opening after the current-phone code is sent clears the previous attempt", () => {
  assert.deepEqual(phoneChangeFormReducer(dirtyState, { type: "opened" }), {
    ...INITIAL_PHONE_CHANGE_FORM_STATE,
    visible: true
  })
})

test("code entry is sanitized and routed by step", () => {
  const current = phoneChangeFormReducer(
    { ...INITIAL_PHONE_CHANGE_FORM_STATE, visible: true },
    { type: "codeEntered", value: "1a2 3" }
  )
  assert.equal(current.currentCode, "123")
  assert.equal(current.newCode, "")

  const next = phoneChangeFormReducer(dirtyState, { type: "codeEntered", value: "45-6" })
  assert.equal(next.newCode, "456")
  assert.equal(next.currentCode, "12")

  const numberStep = phoneChangeFormReducer(
    { ...dirtyState, step: "new_number" },
    { type: "codeEntered", value: "7" }
  )
  assert.equal(numberStep.newCode, "7")
})

test("selecting a country clears the typed number", () => {
  const next = phoneChangeFormReducer(dirtyState, { type: "countrySelected", country: "US" })
  assert.equal(next.newCountry, "US")
  assert.equal(next.newNumber, "")
  assert.equal(next.newCode, dirtyState.newCode)
})

test("number changes store the already formatted value", () => {
  const next = phoneChangeFormReducer(dirtyState, { type: "numberChanged", formattedNumber: "532 000 00 00" })
  assert.equal(next.newNumber, "532 000 00 00")
})

test("verifying the current phone advances to the new-number step", () => {
  const next = phoneChangeFormReducer(
    { ...INITIAL_PHONE_CHANGE_FORM_STATE, visible: true, currentCode: "123456" },
    { type: "currentPhoneVerified", confirmationToken: "current-token" }
  )
  assert.equal(next.step, "new_number")
  assert.equal(next.currentCode, "")
  assert.equal(next.currentConfirmationToken, "current-token")
  assert.equal(next.visible, true)
})

test("sending the new-phone code advances to the new-code step with an empty code", () => {
  const next = phoneChangeFormReducer({ ...dirtyState, step: "new_number" }, { type: "newPhoneCodeSent" })
  assert.equal(next.step, "new_code")
  assert.equal(next.newCode, "")
  assert.equal(next.newNumber, dirtyState.newNumber)
})

test("primary action is disabled while busy or when the step input is incomplete", () => {
  const base = { isChangingPhone: false, currentCode: "", newCode: "", newPhoneValid: false }
  assert.equal(isPhoneChangePrimaryDisabled({ ...base, step: "current_code" }), true)
  assert.equal(isPhoneChangePrimaryDisabled({ ...base, step: "current_code", currentCode: "123456" }), false)
  assert.equal(isPhoneChangePrimaryDisabled({ ...base, step: "new_number" }), true)
  assert.equal(isPhoneChangePrimaryDisabled({ ...base, step: "new_number", newPhoneValid: true }), false)
  assert.equal(isPhoneChangePrimaryDisabled({ ...base, step: "new_code", newCode: "12345" }), true)
  assert.equal(isPhoneChangePrimaryDisabled({ ...base, step: "new_code", newCode: "123456" }), false)
  assert.equal(
    isPhoneChangePrimaryDisabled({ ...base, step: "new_code", newCode: "123456", isChangingPhone: true }),
    true
  )
})

test("step presentation keeps title, body, labels and button text per step in both languages", () => {
  for (const locale of ["en", "tr"] as const) {
    const copy = getSettingsCopy(locale)
    assert.deepEqual(getPhoneChangeStepPresentation("current_code", false, copy), {
      title: copy.currentPhoneTitle,
      body: copy.currentPhoneBody,
      codeInputAccessibilityLabel: copy.currentPhoneCode,
      primaryAccessibilityLabel: copy.verifyCurrentCode,
      primaryText: copy.continue
    })
    assert.deepEqual(getPhoneChangeStepPresentation("new_number", false, copy), {
      title: copy.newPhoneTitle,
      body: copy.newPhoneBody,
      codeInputAccessibilityLabel: copy.newPhoneCode,
      primaryAccessibilityLabel: copy.sendCodeToNewPhone,
      primaryText: copy.sendCode
    })
    assert.deepEqual(getPhoneChangeStepPresentation("new_code", false, copy), {
      title: copy.verifyNewPhoneTitle,
      body: copy.verifyNewPhoneBody,
      codeInputAccessibilityLabel: copy.newPhoneCode,
      primaryAccessibilityLabel: copy.finishPhoneChange,
      primaryText: copy.finish
    })
    assert.equal(getPhoneChangeStepPresentation("current_code", true, copy).primaryText, copy.checking)
    assert.equal(getPhoneChangeStepPresentation("new_number", true, copy).primaryText, copy.checking)
    assert.equal(getPhoneChangeStepPresentation("new_code", true, copy).primaryText, copy.finishing)
  }
})
