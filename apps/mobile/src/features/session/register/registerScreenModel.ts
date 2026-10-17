import type { AccountRecoveryCopy } from "../accountRecoveryCopy"
import type { AuthEntryCopy } from "../authEntryCopy"
import type { RegisterFlowAvailability } from "../registerFlowModel"
import { canRequestRegisterPhoneCode } from "../registerPhonePanelModel"
import type { SetupLayoutMetrics } from "../setupFlow/setupFlowShellModel"

// Match the server's minimum SMS interval; it remains the authority if the
// screen is reset, the app is restarted, or the device clock is changed.
export const RESEND_COOLDOWN_SECONDS = 60
export const REGISTER_OTP_LENGTH = 6

export type RegisterAuthIntent = "create" | "sign-in"
export type RegisterCodeRequestStatus = "idle" | "sending" | "sent" | "failed"
export type RegisterCodeRequestDecision =
  | "blocked"
  | "request-code"
export type AccountRecoveryStage = "details" | "code"

export function tickResendCooldown(seconds: number): number {
  return Math.max(0, seconds - 1)
}

export function shouldRunResendCooldown(
  isCodeStep: boolean,
  resendCooldownSeconds: number
): boolean {
  return isCodeStep && resendCooldownSeconds > 0
}

export function resolveRegisterProgress(
  authIntent: RegisterAuthIntent,
  isCodeStep: boolean
): { progressTotal: number; progressCurrent: number } {
  const progressTotal = authIntent === "create" ? 4 : 2
  const progressCurrent = authIntent === "create"
    ? 4
    : isCodeStep ? 2 : 1
  return { progressTotal, progressCurrent }
}

export function resolveLegalRequirementsMet(
  authIntent: RegisterAuthIntent,
  termsAccepted: boolean
): boolean {
  const legalRequirementsMet = authIntent === "create"
    ? termsAccepted
    : true
  return legalRequirementsMet
}

export function resolveRegisterPrimaryAction(input: {
  isCodeStep: boolean
  availability: Pick<RegisterFlowAvailability, "canVerify" | "phoneValid">
  legalRequirementsMet: boolean
  busy: boolean
  codeRequestStatus: RegisterCodeRequestStatus
}): { primaryEnabled: boolean; primaryDisabled: boolean } {
  const {
    isCodeStep,
    availability,
    legalRequirementsMet,
    busy,
    codeRequestStatus
  } = input
  const primaryEnabled = isCodeStep
    ? availability.canVerify
    : canRequestRegisterPhoneCode({
      phoneValid: availability.phoneValid,
      termsAccepted: legalRequirementsMet,
      isSubmitting: busy
    })
  const primaryDisabled = busy || !primaryEnabled ||
    (isCodeStep && codeRequestStatus !== "sent")
  return { primaryEnabled, primaryDisabled }
}

export function resolveRegisterFieldErrors(input: {
  phoneValid: boolean
  verificationCodeValid: boolean
  phoneTouched: boolean
  otpTouched: boolean
  attemptedPrimaryAction: boolean
  phoneNumberLength: number
  verificationCodeLength: number
}): { showPhoneError: boolean; showOtpError: boolean } {
  const {
    phoneValid,
    verificationCodeValid,
    phoneTouched,
    otpTouched,
    attemptedPrimaryAction
  } = input
  const showPhoneError = !phoneValid &&
    (phoneTouched || attemptedPrimaryAction) && input.phoneNumberLength > 0
  const showOtpError = !verificationCodeValid &&
    (otpTouched || attemptedPrimaryAction) && input.verificationCodeLength > 0
  return { showPhoneError, showOtpError }
}

/**
 * Decides what the phone-step primary action (and the resend control) does.
 * Every request must pass the validity, legal, in-flight, and cooldown guards.
 * A Firebase session left on the device cannot replace fresh verification.
 */
export function resolveRegisterCodeRequestDecision(input: {
  phoneValid: boolean
  canRequestCode: boolean
  legalRequirementsMet: boolean
  actionInFlight: boolean
  isCodeStep: boolean
  resendCooldownSeconds: number
}): RegisterCodeRequestDecision {
  if (
    !input.canRequestCode ||
    !input.legalRequirementsMet ||
    input.actionInFlight ||
    (input.isCodeStep && input.resendCooldownSeconds > 0)
  ) {
    return "blocked"
  }
  return "request-code"
}

export function canSubmitRegisterVerification(input: {
  canVerify: boolean
  actionInFlight: boolean
  codeRequestStatus: RegisterCodeRequestStatus
}): boolean {
  const { canVerify, actionInFlight, codeRequestStatus } = input
  if (!canVerify || actionInFlight || codeRequestStatus !== "sent") return false
  return true
}

/**
 * The code field stays editable while its code is still being sent, so it can
 * hold focus (and iOS can offer the SMS code) the moment the OTP step appears
 * instead of after the request returns; a code typed early is verified only
 * once the request has landed. It is read-only while a code is verified.
 */
export function canEditRegisterCode(input: {
  busy: boolean
  codeRequestStatus: RegisterCodeRequestStatus
}): boolean {
  return !input.busy || input.codeRequestStatus === "sending"
}

export const REGISTER_CODE_LENGTH = 6

/**
 * A complete six-digit code verifies itself once (ONB-12). The same code is
 * never resubmitted automatically after a failure; editing it re-arms.
 */
export function shouldAutoSubmitRegisterCode(input: {
  isCodeStep: boolean
  verificationCode: string
  lastAutoSubmittedCode: string | null
  canVerify: boolean
  actionInFlight: boolean
  codeRequestStatus: RegisterCodeRequestStatus
}): boolean {
  if (!input.isCodeStep) return false
  if (input.verificationCode.length !== REGISTER_CODE_LENGTH) return false
  if (input.verificationCode === input.lastAutoSubmittedCode) return false
  return canSubmitRegisterVerification({
    canVerify: input.canVerify,
    actionInFlight: input.actionInFlight,
    codeRequestStatus: input.codeRequestStatus
  })
}

type CodeRequestNoticeCopy = Pick<
  AuthEntryCopy,
  "freshCodeSent" | "codeExpiresSoon" | "resendFailed" | "codeNotSent"
>

/**
 * How the code-status card above the code cells is drawn. Only a code that is
 * actually on its way is a success; a failed send is an error, and a failed
 * resend while the previous code may still work is a warning.
 */
export type SmsNoticeTone = "pending" | "success" | "warning" | "error"

export function resolveCodeRequestSuccess(
  isCodeStep: boolean,
  authCopy: CodeRequestNoticeCopy
): { codeRequestStatus: "sent"; smsNotice: string; smsNoticeTone: SmsNoticeTone } {
  return {
    codeRequestStatus: "sent",
    smsNotice: isCodeStep
      ? authCopy.freshCodeSent
      : authCopy.codeExpiresSoon,
    smsNoticeTone: "success"
  }
}

export function resolveCodeRequestFailure(
  previousCodeAvailable: boolean,
  authCopy: CodeRequestNoticeCopy
): { codeRequestStatus: "sent" | "failed"; smsNotice: string; smsNoticeTone: SmsNoticeTone } {
  return {
    codeRequestStatus: previousCodeAvailable ? "sent" : "failed",
    smsNotice: previousCodeAvailable ? authCopy.resendFailed : authCopy.codeNotSent,
    smsNoticeTone: previousCodeAvailable ? "warning" : "error"
  }
}

/** Text and tone of the code-status card; a failed send never reads as sent. */
export function resolveSmsNoticeCard(input: {
  codeRequestStatus: RegisterCodeRequestStatus
  smsNotice: string | null
  requestTone: SmsNoticeTone | null
  authCopy: Pick<AuthEntryCopy, "codeSent" | "codeNotSent">
}): { text: string; tone: SmsNoticeTone } {
  const { codeRequestStatus, smsNotice, requestTone, authCopy } = input
  if (codeRequestStatus === "failed") {
    return { text: smsNotice ?? authCopy.codeNotSent, tone: "error" }
  }
  if (codeRequestStatus === "sending") {
    return { text: smsNotice ?? authCopy.codeSent, tone: "pending" }
  }
  return {
    text: smsNotice ?? authCopy.codeSent,
    tone: smsNotice === null ? (codeRequestStatus === "sent" ? "success" : "pending") : requestTone ?? "success"
  }
}

/**
 * Registration refused because the verified phone already has an account:
 * say so and offer sign-in instead of a generic error. Only the create flow
 * shows it, and only when the screen can actually sign the user in.
 */
export function resolveAccountExistsNotice(input: {
  authIntent: RegisterAuthIntent
  accountExists: boolean
  canSignIn: boolean
  authCopy: Pick<AuthEntryCopy, "accountExistsTitle" | "accountExistsBody" | "accountExistsSignIn">
}): { title: string; body: string; actionLabel: string } | null {
  if (input.authIntent !== "create" || !input.accountExists || !input.canSignIn) return null
  return {
    title: input.authCopy.accountExistsTitle,
    body: input.authCopy.accountExistsBody,
    actionLabel: input.authCopy.accountExistsSignIn
  }
}

export function resolveResendControl(
  resendCooldownSeconds: number,
  busy: boolean,
  authCopy: Pick<AuthEntryCopy, "resendCode" | "resendCodeIn" | "resendCodeCountdown">
): { accessibilityLabel: string; label: string; disabled: boolean } {
  return {
    accessibilityLabel: resendCooldownSeconds > 0
      ? authCopy.resendCodeIn(resendCooldownSeconds)
      : authCopy.resendCode,
    label: resendCooldownSeconds > 0
      ? authCopy.resendCodeCountdown(resendCooldownSeconds)
      : authCopy.resendCode,
    disabled: busy || resendCooldownSeconds > 0
  }
}

export function resolveCreatePrimaryActionLabel(
  isCodeStep: boolean,
  authCopy: Pick<AuthEntryCopy, "sendCode">
): string {
  return isCodeStep ? "Blumi'ye katil" : authCopy.sendCode
}

export function resolveSignInPrimaryActionLabel(
  authIntent: RegisterAuthIntent,
  isCodeStep: boolean,
  authCopy: Pick<AuthEntryCopy, "sendCode" | "signInToBlumi">
): string {
  return isCodeStep
    ? authIntent === "sign-in" ? authCopy.signInToBlumi : "Blumi’ye katıl"
    : authCopy.sendCode
}

export function resolveSignInHeroCopy(input: {
  authIntent: RegisterAuthIntent
  isCodeStep: boolean
  codeRequestStatus: RegisterCodeRequestStatus
  authCopy: AuthEntryCopy
}): { body: string; title: string } {
  const { authIntent, isCodeStep, codeRequestStatus, authCopy } = input
  return {
    body: isCodeStep
      ? codeRequestStatus === "sending"
        ? authCopy.sendingCode
        : codeRequestStatus === "failed"
          ? authCopy.codeNotSent
          : authIntent === "sign-in"
            ? authCopy.signInCodeBody
            : authCopy.createCodeBody
      : authIntent === "sign-in"
        ? authCopy.signInPhoneBody
        : authCopy.registerHeroBody,
    title: isCodeStep
      ? authCopy.checkMessages
      : authIntent === "sign-in"
        ? authCopy.verifyNumber
        : authCopy.registerHeroTitle
  }
}

export function resolveFallbackHeadingCopy(
  isCodeStep: boolean,
  codeRequestStatus: RegisterCodeRequestStatus,
  authCopy: Pick<AuthEntryCopy, "sendingCode" | "codeNotSent">
): { title: string; body: string } {
  return {
    title: isCodeStep ? "Mesajlarına bak" : "Dünyan kaybolmasın",
    body: isCodeStep
      ? codeRequestStatus === "sending"
        ? authCopy.sendingCode
        : codeRequestStatus === "failed"
          ? authCopy.codeNotSent
          : "Gönderdiğimiz 6 haneli kodu gir."
      : "Telefonunla Blumi dünyanı güvende tut."
  }
}

export function resolveOtpCells(
  verificationCode: string,
  otpFocused: boolean
): { digit: string; active: boolean }[] {
  return Array.from({ length: REGISTER_OTP_LENGTH }, (_, index) => ({
    digit: verificationCode[index] ?? "",
    active: otpFocused &&
      index === Math.min(verificationCode.length, REGISTER_OTP_LENGTH - 1)
  }))
}

export function resolveRegisterHeroLayout(
  viewport: { width: number; height: number; fontScale: number },
  setupMetrics: Pick<SetupLayoutMetrics, "dense" | "veryCompact">
): {
  stackRecoveryActions: boolean
  compactHero: boolean
  createHeroAvatarSize: number
  createHeroStageHeight: number
} {
  const {
    width: viewportWidth,
    height: viewportHeight,
    fontScale: viewportFontScale
  } = viewport
  const stackRecoveryActions = viewportWidth < 360 || viewportFontScale >= 1.25
  const compactHero =
    viewportWidth < 375 || viewportFontScale >= 1.2 || viewportHeight < 760
  const createHeroAvatarSize = setupMetrics.veryCompact ? 82 : setupMetrics.dense ? 88 : 94
  const createHeroStageHeight = setupMetrics.veryCompact ? 110 : setupMetrics.dense ? 118 : 126
  return { stackRecoveryActions, compactHero, createHeroAvatarSize, createHeroStageHeight }
}

export function sanitizeRecoveryCode(value: string): string {
  return value.replace(/\D/g, "")
}

export function resolveRecoveryPrimaryControl(input: {
  recoveryBusy: boolean
  recoveryStage: AccountRecoveryStage
  recoveryOldPhone: string
  recoveryNewPhone: string
  recoveryCode: string
  recoveryCopy: Pick<AccountRecoveryCopy, "checking" | "sendCode" | "requestReview">
}): { label: string; disabled: boolean } {
  const {
    recoveryBusy,
    recoveryStage,
    recoveryOldPhone,
    recoveryNewPhone,
    recoveryCode,
    recoveryCopy
  } = input
  return {
    label: recoveryBusy
      ? recoveryCopy.checking
      : recoveryStage === "details" ? recoveryCopy.sendCode : recoveryCopy.requestReview,
    disabled: recoveryBusy || (recoveryStage === "details"
      ? recoveryOldPhone.trim().length < 8 || recoveryNewPhone.trim().length < 8
      : recoveryCode.length !== 6)
  }
}
