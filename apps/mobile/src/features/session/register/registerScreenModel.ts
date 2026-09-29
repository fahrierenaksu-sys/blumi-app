import type { AccountRecoveryCopy } from "../accountRecoveryCopy"
import type { AuthEntryCopy } from "../authEntryCopy"
import type { RegisterFlowAvailability } from "../registerFlowModel"
import { canRequestRegisterPhoneCode } from "../registerPhonePanelModel"
import type { SetupLayoutMetrics } from "../setupFlow/setupFlowShellModel"

export const RESEND_COOLDOWN_SECONDS = 30
export const REGISTER_OTP_LENGTH = 6

export type RegisterAuthIntent = "create" | "sign-in"
export type RegisterCodeRequestStatus = "idle" | "sending" | "sent" | "failed"
export type RegisterCodeRequestDecision =
  | "complete-verified-phone"
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
  verifiedFirebasePhone: boolean
  legalRequirementsMet: boolean
  busy: boolean
  codeRequestStatus: RegisterCodeRequestStatus
}): { primaryEnabled: boolean; primaryDisabled: boolean } {
  const {
    isCodeStep,
    availability,
    verifiedFirebasePhone,
    legalRequirementsMet,
    busy,
    codeRequestStatus
  } = input
  const primaryEnabled = isCodeStep
    ? availability.canVerify || (verifiedFirebasePhone && availability.phoneValid)
    : canRequestRegisterPhoneCode({
      phoneValid: availability.phoneValid,
      termsAccepted: legalRequirementsMet,
      isSubmitting: busy
    })
  const primaryDisabled = busy || !primaryEnabled ||
    (isCodeStep && codeRequestStatus !== "sent" && !verifiedFirebasePhone)
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
 * A phone that Firebase already verified completes the account directly; every
 * other request must pass the validity, legal, in-flight, and cooldown guards.
 */
export function resolveRegisterCodeRequestDecision(input: {
  verifiedFirebasePhone: boolean
  phoneValid: boolean
  canRequestCode: boolean
  legalRequirementsMet: boolean
  actionInFlight: boolean
  isCodeStep: boolean
  resendCooldownSeconds: number
}): RegisterCodeRequestDecision {
  if (input.verifiedFirebasePhone && input.phoneValid && input.legalRequirementsMet &&
    !input.actionInFlight) {
    return "complete-verified-phone"
  }
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
  verifiedFirebasePhone: boolean
  actionInFlight: boolean
  codeRequestStatus: RegisterCodeRequestStatus
}): boolean {
  const { canVerify, verifiedFirebasePhone, actionInFlight, codeRequestStatus } = input
  if (!(canVerify || verifiedFirebasePhone) || actionInFlight ||
    (codeRequestStatus !== "sent" && !verifiedFirebasePhone)) return false
  return true
}

type CodeRequestNoticeCopy = Pick<
  AuthEntryCopy,
  "freshCodeSent" | "codeExpiresSoon" | "resendFailed" | "codeNotSent"
>

export function resolveCodeRequestSuccess(
  isCodeStep: boolean,
  authCopy: CodeRequestNoticeCopy
): { codeRequestStatus: "sent"; smsNotice: string } {
  return {
    codeRequestStatus: "sent",
    smsNotice: isCodeStep
      ? authCopy.freshCodeSent
      : authCopy.codeExpiresSoon
  }
}

export function resolveCodeRequestFailure(
  previousCodeAvailable: boolean,
  authCopy: CodeRequestNoticeCopy
): { codeRequestStatus: "sent" | "failed"; smsNotice: string } {
  return {
    codeRequestStatus: previousCodeAvailable ? "sent" : "failed",
    smsNotice: previousCodeAvailable ? authCopy.resendFailed : authCopy.codeNotSent
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
  verifiedFirebasePhone: boolean,
  authCopy: Pick<AuthEntryCopy, "sendCode">
): string {
  return isCodeStep || verifiedFirebasePhone ? "Blumi'ye katil" : authCopy.sendCode
}

export function resolveSignInPrimaryActionLabel(
  authIntent: RegisterAuthIntent,
  isCodeStep: boolean,
  verifiedFirebasePhone: boolean,
  authCopy: Pick<AuthEntryCopy, "sendCode" | "signInToBlumi">
): string {
  return isCodeStep || verifiedFirebasePhone
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
