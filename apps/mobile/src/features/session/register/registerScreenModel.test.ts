import assert from "node:assert/strict"
import test from "node:test"
import { getAuthEntryCopy } from "../authEntryCopy"
import {
  RESEND_COOLDOWN_SECONDS,
  canSubmitRegisterVerification,
  resolveCodeRequestFailure,
  resolveCodeRequestSuccess,
  resolveCreatePrimaryActionLabel,
  resolveFallbackHeadingCopy,
  resolveLegalRequirementsMet,
  resolveOtpCells,
  resolveRecoveryPrimaryControl,
  resolveRegisterCodeRequestDecision,
  resolveRegisterFieldErrors,
  resolveRegisterHeroLayout,
  resolveRegisterPrimaryAction,
  resolveRegisterProgress,
  resolveResendControl,
  resolveSignInHeroCopy,
  resolveSignInPrimaryActionLabel,
  sanitizeRecoveryCode,
  shouldRunResendCooldown,
  tickResendCooldown
} from "./registerScreenModel"

const en = getAuthEntryCopy("en")
const tr = getAuthEntryCopy("tr")

const readyAvailability = {
  canVerify: false,
  phoneValid: true
}

test("the resend cooldown lasts thirty seconds and never ticks below zero", () => {
  assert.equal(RESEND_COOLDOWN_SECONDS, 30)
  assert.equal(tickResendCooldown(30), 29)
  assert.equal(tickResendCooldown(1), 0)
  assert.equal(tickResendCooldown(0), 0)
  assert.equal(tickResendCooldown(-3), 0)
})

test("the resend countdown only runs on the code step while seconds remain", () => {
  assert.equal(shouldRunResendCooldown(true, 30), true)
  assert.equal(shouldRunResendCooldown(true, 1), true)
  assert.equal(shouldRunResendCooldown(true, 0), false)
  assert.equal(shouldRunResendCooldown(false, 30), false)
})

test("create shows the full four-step onboarding progress; sign-in shows two steps", () => {
  assert.deepEqual(resolveRegisterProgress("create", false), { progressTotal: 4, progressCurrent: 4 })
  assert.deepEqual(resolveRegisterProgress("create", true), { progressTotal: 4, progressCurrent: 4 })
  assert.deepEqual(resolveRegisterProgress("sign-in", false), { progressTotal: 2, progressCurrent: 1 })
  assert.deepEqual(resolveRegisterProgress("sign-in", true), { progressTotal: 2, progressCurrent: 2 })
})

test("only account creation is gated by the combined terms acceptance", () => {
  assert.equal(resolveLegalRequirementsMet("create", false), false)
  assert.equal(resolveLegalRequirementsMet("create", true), true)
  assert.equal(resolveLegalRequirementsMet("sign-in", false), true)
  assert.equal(resolveLegalRequirementsMet("sign-in", true), true)
})

test("the phone step primary action needs a valid phone, legal acceptance, and an idle form", () => {
  const base = {
    isCodeStep: false,
    availability: readyAvailability,
    verifiedFirebasePhone: false,
    legalRequirementsMet: true,
    busy: false,
    codeRequestStatus: "idle" as const
  }
  assert.deepEqual(resolveRegisterPrimaryAction(base), { primaryEnabled: true, primaryDisabled: false })
  assert.deepEqual(
    resolveRegisterPrimaryAction({ ...base, legalRequirementsMet: false }),
    { primaryEnabled: false, primaryDisabled: true }
  )
  assert.deepEqual(
    resolveRegisterPrimaryAction({ ...base, availability: { canVerify: false, phoneValid: false } }),
    { primaryEnabled: false, primaryDisabled: true }
  )
  assert.deepEqual(
    resolveRegisterPrimaryAction({ ...base, busy: true }),
    { primaryEnabled: false, primaryDisabled: true }
  )
})

test("the code step primary action needs a complete code and a sent request unless Firebase already verified the phone", () => {
  const base = {
    isCodeStep: true,
    availability: { canVerify: true, phoneValid: true },
    verifiedFirebasePhone: false,
    legalRequirementsMet: false,
    busy: false,
    codeRequestStatus: "sent" as const
  }
  assert.deepEqual(resolveRegisterPrimaryAction(base), { primaryEnabled: true, primaryDisabled: false })
  // An incomplete code keeps the action disabled.
  assert.deepEqual(
    resolveRegisterPrimaryAction({ ...base, availability: { canVerify: false, phoneValid: true } }),
    { primaryEnabled: false, primaryDisabled: true }
  )
  // A complete code is not enough while no code has been sent.
  for (const codeRequestStatus of ["idle", "sending", "failed"] as const) {
    assert.deepEqual(
      resolveRegisterPrimaryAction({ ...base, codeRequestStatus }),
      { primaryEnabled: true, primaryDisabled: true }
    )
  }
  // Firebase auto-verification unlocks the action without a code or a sent request.
  assert.deepEqual(
    resolveRegisterPrimaryAction({
      ...base,
      availability: { canVerify: false, phoneValid: true },
      verifiedFirebasePhone: true,
      codeRequestStatus: "failed"
    }),
    { primaryEnabled: true, primaryDisabled: false }
  )
  assert.deepEqual(
    resolveRegisterPrimaryAction({
      ...base,
      availability: { canVerify: false, phoneValid: false },
      verifiedFirebasePhone: true
    }),
    { primaryEnabled: false, primaryDisabled: true }
  )
  assert.deepEqual(
    resolveRegisterPrimaryAction({ ...base, busy: true }),
    { primaryEnabled: true, primaryDisabled: true }
  )
})

test("field errors appear only for non-empty invalid values after blur or a primary attempt", () => {
  const base = {
    phoneValid: false,
    verificationCodeValid: false,
    phoneTouched: false,
    otpTouched: false,
    attemptedPrimaryAction: false,
    phoneNumberLength: 3,
    verificationCodeLength: 3
  }
  assert.deepEqual(resolveRegisterFieldErrors(base), { showPhoneError: false, showOtpError: false })
  assert.deepEqual(
    resolveRegisterFieldErrors({ ...base, phoneTouched: true }),
    { showPhoneError: true, showOtpError: false }
  )
  assert.deepEqual(
    resolveRegisterFieldErrors({ ...base, otpTouched: true }),
    { showPhoneError: false, showOtpError: true }
  )
  assert.deepEqual(
    resolveRegisterFieldErrors({ ...base, attemptedPrimaryAction: true }),
    { showPhoneError: true, showOtpError: true }
  )
  assert.deepEqual(
    resolveRegisterFieldErrors({
      ...base,
      attemptedPrimaryAction: true,
      phoneNumberLength: 0,
      verificationCodeLength: 0
    }),
    { showPhoneError: false, showOtpError: false }
  )
  assert.deepEqual(
    resolveRegisterFieldErrors({
      ...base,
      attemptedPrimaryAction: true,
      phoneValid: true,
      verificationCodeValid: true
    }),
    { showPhoneError: false, showOtpError: false }
  )
})

test("a Firebase-verified phone completes the account instead of requesting another code", () => {
  const base = {
    verifiedFirebasePhone: true,
    phoneValid: true,
    canRequestCode: true,
    legalRequirementsMet: true,
    actionInFlight: false,
    isCodeStep: false,
    resendCooldownSeconds: 0
  }
  assert.equal(resolveRegisterCodeRequestDecision(base), "complete-verified-phone")
  assert.equal(
    resolveRegisterCodeRequestDecision({ ...base, isCodeStep: true, resendCooldownSeconds: 12 }),
    "complete-verified-phone"
  )
  // Terms, validity, and in-flight guards still apply to the verified shortcut.
  assert.equal(resolveRegisterCodeRequestDecision({ ...base, legalRequirementsMet: false }), "blocked")
  assert.equal(resolveRegisterCodeRequestDecision({ ...base, actionInFlight: true }), "blocked")
  assert.equal(
    resolveRegisterCodeRequestDecision({ ...base, phoneValid: false, canRequestCode: false }),
    "blocked"
  )
})

test("code requests are blocked by invalid input, missing terms, in-flight work, and the resend cooldown", () => {
  const base = {
    verifiedFirebasePhone: false,
    phoneValid: true,
    canRequestCode: true,
    legalRequirementsMet: true,
    actionInFlight: false,
    isCodeStep: false,
    resendCooldownSeconds: 0
  }
  assert.equal(resolveRegisterCodeRequestDecision(base), "request-code")
  assert.equal(resolveRegisterCodeRequestDecision({ ...base, canRequestCode: false }), "blocked")
  assert.equal(resolveRegisterCodeRequestDecision({ ...base, legalRequirementsMet: false }), "blocked")
  assert.equal(resolveRegisterCodeRequestDecision({ ...base, actionInFlight: true }), "blocked")
  assert.equal(
    resolveRegisterCodeRequestDecision({ ...base, isCodeStep: true, resendCooldownSeconds: 1 }),
    "blocked"
  )
  assert.equal(
    resolveRegisterCodeRequestDecision({ ...base, isCodeStep: true, resendCooldownSeconds: 0 }),
    "request-code"
  )
  // The cooldown only guards resends from the code step.
  assert.equal(
    resolveRegisterCodeRequestDecision({ ...base, isCodeStep: false, resendCooldownSeconds: 20 }),
    "request-code"
  )
})

test("verification submits a complete code only after a code was sent, or a Firebase-verified phone", () => {
  const base = {
    canVerify: true,
    verifiedFirebasePhone: false,
    actionInFlight: false,
    codeRequestStatus: "sent" as const
  }
  assert.equal(canSubmitRegisterVerification(base), true)
  assert.equal(canSubmitRegisterVerification({ ...base, canVerify: false }), false)
  assert.equal(canSubmitRegisterVerification({ ...base, actionInFlight: true }), false)
  for (const codeRequestStatus of ["idle", "sending", "failed"] as const) {
    assert.equal(canSubmitRegisterVerification({ ...base, codeRequestStatus }), false)
    assert.equal(
      canSubmitRegisterVerification({ ...base, codeRequestStatus, verifiedFirebasePhone: true }),
      true
    )
  }
  assert.equal(
    canSubmitRegisterVerification({ ...base, canVerify: false, verifiedFirebasePhone: true }),
    true
  )
  assert.equal(
    canSubmitRegisterVerification({
      ...base,
      canVerify: false,
      verifiedFirebasePhone: true,
      actionInFlight: true
    }),
    false
  )
})

test("code request outcomes keep a previously sent code usable after a failed resend", () => {
  assert.deepEqual(resolveCodeRequestSuccess(false, en), {
    codeRequestStatus: "sent",
    smsNotice: en.codeExpiresSoon
  })
  assert.deepEqual(resolveCodeRequestSuccess(true, en), {
    codeRequestStatus: "sent",
    smsNotice: en.freshCodeSent
  })
  assert.deepEqual(resolveCodeRequestFailure(true, en), {
    codeRequestStatus: "sent",
    smsNotice: en.resendFailed
  })
  assert.deepEqual(resolveCodeRequestFailure(false, tr), {
    codeRequestStatus: "failed",
    smsNotice: tr.codeNotSent
  })
})

test("the resend control announces and shows the remaining cooldown", () => {
  assert.deepEqual(resolveResendControl(12, false, en), {
    accessibilityLabel: en.resendCodeIn(12),
    label: en.resendCodeCountdown(12),
    disabled: true
  })
  assert.deepEqual(resolveResendControl(0, false, tr), {
    accessibilityLabel: tr.resendCode,
    label: tr.resendCode,
    disabled: false
  })
  assert.equal(resolveResendControl(0, true, en).disabled, true)
})

test("primary action labels keep the create and sign-in wording", () => {
  assert.equal(resolveCreatePrimaryActionLabel(false, false, en), en.sendCode)
  assert.equal(resolveCreatePrimaryActionLabel(true, false, en), "Blumi'ye katil")
  assert.equal(resolveCreatePrimaryActionLabel(false, true, tr), "Blumi'ye katil")
  assert.equal(resolveSignInPrimaryActionLabel("sign-in", false, false, en), en.sendCode)
  assert.equal(resolveSignInPrimaryActionLabel("sign-in", true, false, en), en.signInToBlumi)
  assert.equal(resolveSignInPrimaryActionLabel("sign-in", false, true, tr), tr.signInToBlumi)
  assert.equal(resolveSignInPrimaryActionLabel("create", true, false, en), "Blumi’ye katıl")
})

test("the sign-in hero copy follows the code request status", () => {
  const base = { authIntent: "sign-in" as const, authCopy: en }
  assert.deepEqual(
    resolveSignInHeroCopy({ ...base, isCodeStep: false, codeRequestStatus: "idle" }),
    { body: en.signInPhoneBody, title: en.verifyNumber }
  )
  assert.deepEqual(
    resolveSignInHeroCopy({ ...base, isCodeStep: true, codeRequestStatus: "sending" }),
    { body: en.sendingCode, title: en.checkMessages }
  )
  assert.deepEqual(
    resolveSignInHeroCopy({ ...base, isCodeStep: true, codeRequestStatus: "failed" }),
    { body: en.codeNotSent, title: en.checkMessages }
  )
  assert.deepEqual(
    resolveSignInHeroCopy({ ...base, isCodeStep: true, codeRequestStatus: "sent" }),
    { body: en.signInCodeBody, title: en.checkMessages }
  )
  assert.deepEqual(
    resolveSignInHeroCopy({ authIntent: "create", authCopy: tr, isCodeStep: true, codeRequestStatus: "sent" }),
    { body: tr.createCodeBody, title: tr.checkMessages }
  )
  assert.deepEqual(
    resolveSignInHeroCopy({ authIntent: "create", authCopy: tr, isCodeStep: false, codeRequestStatus: "idle" }),
    { body: tr.registerHeroBody, title: tr.registerHeroTitle }
  )
})

test("the fallback heading keeps its Turkish copy and request status lines", () => {
  assert.deepEqual(resolveFallbackHeadingCopy(false, "idle", en), {
    title: "Dünyan kaybolmasın",
    body: "Telefonunla Blumi dünyanı güvende tut."
  })
  assert.deepEqual(resolveFallbackHeadingCopy(true, "sent", en), {
    title: "Mesajlarına bak",
    body: "Gönderdiğimiz 6 haneli kodu gir."
  })
  assert.equal(resolveFallbackHeadingCopy(true, "sending", en).body, en.sendingCode)
  assert.equal(resolveFallbackHeadingCopy(true, "failed", en).body, en.codeNotSent)
})

test("OTP cells mirror the typed digits and highlight the next slot only while focused", () => {
  assert.deepEqual(resolveOtpCells("", false).map((cell) => cell.active), [false, false, false, false, false, false])
  assert.deepEqual(resolveOtpCells("", true).map((cell) => cell.active), [true, false, false, false, false, false])
  const partial = resolveOtpCells("123", true)
  assert.deepEqual(partial.map((cell) => cell.digit), ["1", "2", "3", "", "", ""])
  assert.deepEqual(partial.map((cell) => cell.active), [false, false, false, true, false, false])
  const complete = resolveOtpCells("123456", true)
  assert.deepEqual(complete.map((cell) => cell.digit), ["1", "2", "3", "4", "5", "6"])
  assert.deepEqual(complete.map((cell) => cell.active), [false, false, false, false, false, true])
})

test("hero and recovery layout adapt to narrow, short, and large-text viewports", () => {
  const roomy = { dense: false, veryCompact: false }
  assert.deepEqual(
    resolveRegisterHeroLayout({ width: 393, height: 852, fontScale: 1 }, roomy),
    {
      stackRecoveryActions: false,
      compactHero: false,
      createHeroAvatarSize: 94,
      createHeroStageHeight: 126
    }
  )
  assert.deepEqual(
    resolveRegisterHeroLayout(
      { width: 320, height: 568, fontScale: 1 },
      { dense: true, veryCompact: true }
    ),
    {
      stackRecoveryActions: true,
      compactHero: true,
      createHeroAvatarSize: 82,
      createHeroStageHeight: 110
    }
  )
  const dense = resolveRegisterHeroLayout(
    { width: 375, height: 812, fontScale: 1.25 },
    { dense: true, veryCompact: false }
  )
  assert.equal(dense.stackRecoveryActions, true)
  assert.equal(dense.compactHero, true)
  assert.equal(dense.createHeroAvatarSize, 88)
  assert.equal(dense.createHeroStageHeight, 118)
  assert.equal(
    resolveRegisterHeroLayout({ width: 393, height: 759, fontScale: 1 }, roomy).compactHero,
    true
  )
  assert.equal(
    resolveRegisterHeroLayout({ width: 393, height: 852, fontScale: 1.2 }, roomy).compactHero,
    true
  )
})

test("account recovery keeps digits only and gates its primary action per stage", () => {
  assert.equal(sanitizeRecoveryCode("12 3-4a56"), "123456")
  const copy = {
    checking: "checking",
    sendCode: "send",
    requestReview: "review"
  }
  assert.deepEqual(
    resolveRecoveryPrimaryControl({
      recoveryBusy: false,
      recoveryStage: "details",
      recoveryOldPhone: "5551234567",
      recoveryNewPhone: " 5559876543 ",
      recoveryCode: "",
      recoveryCopy: copy
    }),
    { label: "send", disabled: false }
  )
  assert.equal(
    resolveRecoveryPrimaryControl({
      recoveryBusy: false,
      recoveryStage: "details",
      recoveryOldPhone: "  1234567 ",
      recoveryNewPhone: "5559876543",
      recoveryCode: "",
      recoveryCopy: copy
    }).disabled,
    true
  )
  assert.deepEqual(
    resolveRecoveryPrimaryControl({
      recoveryBusy: false,
      recoveryStage: "code",
      recoveryOldPhone: "",
      recoveryNewPhone: "",
      recoveryCode: "12345",
      recoveryCopy: copy
    }),
    { label: "review", disabled: true }
  )
  assert.deepEqual(
    resolveRecoveryPrimaryControl({
      recoveryBusy: false,
      recoveryStage: "code",
      recoveryOldPhone: "",
      recoveryNewPhone: "",
      recoveryCode: "123456",
      recoveryCopy: copy
    }),
    { label: "review", disabled: false }
  )
  assert.deepEqual(
    resolveRecoveryPrimaryControl({
      recoveryBusy: true,
      recoveryStage: "code",
      recoveryOldPhone: "",
      recoveryNewPhone: "",
      recoveryCode: "123456",
      recoveryCopy: copy
    }),
    { label: "checking", disabled: true }
  )
})
