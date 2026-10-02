import assert from "node:assert/strict"
import test from "node:test"
import {
  REGISTER_PHONE_PANEL_LAYOUT,
  canRequestRegisterPhoneCode
} from "./registerPhonePanelModel"

test("register phone panel controls keep a 44 pt touch target", () => {
  const { spacing } = REGISTER_PHONE_PANEL_LAYOUT

  assert.ok(spacing.fieldControlMinHeight >= 44)
  assert.ok(spacing.termsTargetMinHeight >= 44)
  assert.ok(spacing.legalTargetMinHeight >= 44)
})

test("phone code request requires explicit terms acceptance", () => {
  assert.equal(
    canRequestRegisterPhoneCode({ phoneValid: true, termsAccepted: false, isSubmitting: false }),
    false
  )
  assert.equal(
    canRequestRegisterPhoneCode({ phoneValid: true, termsAccepted: true, isSubmitting: false }),
    true
  )
  assert.equal(
    canRequestRegisterPhoneCode({ phoneValid: true, termsAccepted: true, isSubmitting: true }),
    false
  )
})
