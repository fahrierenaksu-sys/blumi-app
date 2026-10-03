import assert from "node:assert/strict"
import test from "node:test"
import {
  REGISTER_PHONE_PANEL_LAYOUT,
  canRequestRegisterPhoneCode,
  resolveRegisterKeyboardLayout
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

test("the terms consent rides with the send-code action and leaves once the code is sent", () => {
  assert.equal(resolveRegisterKeyboardLayout({ veryCompact: false }, false).consentInActionDock, true)
  assert.equal(resolveRegisterKeyboardLayout({ veryCompact: true }, false).consentInActionDock, true)
  assert.equal(resolveRegisterKeyboardLayout({ veryCompact: false }, true).consentInActionDock, false)
})

test("only very compact screens fold the heading for the keyboard, the same way on both steps", () => {
  for (const veryCompact of [false, true]) {
    const phone = resolveRegisterKeyboardLayout({ veryCompact }, false)
    const code = resolveRegisterKeyboardLayout({ veryCompact }, true)
    assert.equal(phone.collapseHeadingOnKeyboard, veryCompact)
    assert.equal(
      code.collapseHeadingOnKeyboard,
      phone.collapseHeadingOnKeyboard,
      "moving to the code step with the keyboard up never pops the heading in"
    )
  }
})
