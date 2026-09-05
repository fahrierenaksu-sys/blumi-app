import assert from "node:assert/strict"
import test from "node:test"
import {
  REGISTER_PHONE_PANEL_LAYOUT,
  canRequestRegisterPhoneCode,
  hasBalancedRegisterPhoneTypography,
  resolveRegisterPhoneStageHeight
} from "./registerPhonePanelModel"

test("register phone panel keeps the number task prominent without oversized supporting copy", () => {
  const { spacing, typography } = REGISTER_PHONE_PANEL_LAYOUT

  assert.equal(hasBalancedRegisterPhoneTypography(), true)
  assert.ok(typography.title.fontSize > typography.fieldLabel.fontSize)
  assert.ok(typography.title.fontSize <= 22)
  assert.ok(typography.helper.fontSize < typography.fieldValue.fontSize)
  assert.ok(typography.privacy.fontSize <= typography.fieldLabel.fontSize)
  assert.ok(typography.title.lineHeight > typography.title.fontSize)
  assert.deepEqual(typography.eyebrow, { fontSize: 12, lineHeight: 16, letterSpacing: 0.8 })
  assert.deepEqual(typography.title, { fontSize: 18, lineHeight: 24, letterSpacing: -0.3 })
  assert.ok(spacing.fieldControlMinHeight >= 44)
  assert.ok(spacing.termsTargetMinHeight >= 44)
  assert.ok(spacing.legalTargetMinHeight >= 44)
  assert.equal(spacing.taskCardOffsetY, 16)
  assert.equal(spacing.footerBottomTrim, 24)
})

test("the fourth-step phone stage leaves the full legal footer visible on standard iPhones", () => {
  assert.equal(resolveRegisterPhoneStageHeight({ dense: true, veryCompact: false }), 174)
  assert.equal(resolveRegisterPhoneStageHeight({ dense: true, veryCompact: true }), 162)
  assert.equal(resolveRegisterPhoneStageHeight({ dense: false, veryCompact: false }), 280)
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
