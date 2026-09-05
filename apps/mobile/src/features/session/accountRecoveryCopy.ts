import { resolveAppLocale, type AppLocale } from "./appLocale"

export type AccountRecoveryLocale = AppLocale
export type AccountRecoveryErrorKind = "requestCode" | "submitReview"

export interface AccountRecoveryCopy {
  title: string
  detailsBody: string
  codeBody: string
  oldPhoneLabel: string
  oldPhonePlaceholder: string
  newPhoneLabel: string
  newPhonePlaceholder: string
  codeLabel: string
  codePlaceholder: string
  cancel: string
  sendCode: string
  requestReview: string
  checking: string
  retry: string
  requestCodeUnavailable: string
  submitReviewUnavailable: string
  codeNotAccepted: string
  link: string
  linkAccessibilityLabel: string
}

const COPY: Record<AccountRecoveryLocale, AccountRecoveryCopy> = {
  en: {
    title: "Phone access help",
    detailsBody: "Verify a new phone number to open a private support review. This does not sign you in or reveal whether an account exists.",
    codeBody: "Enter the 6-digit code sent to your new phone. A support review will follow.",
    oldPhoneLabel: "Previous phone number",
    oldPhonePlaceholder: "Previous number, e.g. +90…",
    newPhoneLabel: "New phone number",
    newPhonePlaceholder: "New number, e.g. +90…",
    codeLabel: "Recovery verification code",
    codePlaceholder: "000000",
    cancel: "Cancel",
    sendCode: "Send code",
    requestReview: "Request review",
    checking: "Checking…",
    retry: "Try again in a moment.",
    requestCodeUnavailable: "We couldn't send a recovery code. Check your number and connection, then try again.",
    submitReviewUnavailable: "We couldn't submit your support review right now. Check your connection and try again.",
    codeNotAccepted: "That code wasn't accepted. Check the 6-digit code and try again.",
    link: "Can’t use your old phone number?",
    linkAccessibilityLabel: "Get help with a lost phone number"
  },
  tr: {
    title: "Telefon erişim desteği",
    detailsBody: "Özel bir destek incelemesi başlatmak için yeni telefon numaranı doğrula. Bu işlem oturum açmaz veya bir hesabın varlığını açıklamaz.",
    codeBody: "Yeni telefonuna gönderilen 6 haneli kodu gir. Ardından destek incelemesi yapılır.",
    oldPhoneLabel: "Önceki telefon numarası",
    oldPhonePlaceholder: "Önceki numara, ör. +90…",
    newPhoneLabel: "Yeni telefon numarası",
    newPhonePlaceholder: "Yeni numara, ör. +90…",
    codeLabel: "Kurtarma doğrulama kodu",
    codePlaceholder: "000000",
    cancel: "Vazgeç",
    sendCode: "Kod gönder",
    requestReview: "İnceleme iste",
    checking: "Kontrol ediliyor…",
    retry: "Kısa süre sonra tekrar dene.",
    requestCodeUnavailable: "Kurtarma kodunu şu anda gönderemedik. Numaranı ve bağlantını kontrol edip tekrar dene.",
    submitReviewUnavailable: "Destek incelemesi isteğini şu anda gönderemedik. Bağlantını kontrol edip tekrar dene.",
    codeNotAccepted: "Bu kod kabul edilmedi. 6 haneli kodu kontrol edip tekrar dene.",
    link: "Eski telefon numarana erişemiyor musun?",
    linkAccessibilityLabel: "Eski telefon numarası için destek al"
  }
}

export function getAccountRecoveryCopy(locale: AccountRecoveryLocale): AccountRecoveryCopy {
  return COPY[locale]
}

export function getAccountRecoveryErrorMessageForDisplay(
  kind: AccountRecoveryErrorKind,
  error: unknown,
  locale: AccountRecoveryLocale
): string {
  const copy = getAccountRecoveryCopy(locale)
  if (kind === "submitReview" && isExpectedVerificationCodeFailure(error)) {
    return copy.codeNotAccepted
  }
  return kind === "requestCode"
    ? copy.requestCodeUnavailable
    : copy.submitReviewUnavailable
}

export function resolveAccountRecoveryLocale(
  nativeLocale: string | undefined,
  intlLocale: string
): AccountRecoveryLocale {
  return resolveAppLocale(nativeLocale, intlLocale)
}

function isExpectedVerificationCodeFailure(error: unknown): boolean {
  const errorMessage = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : ""
  const message = errorMessage.trim().toLowerCase()
  if (!message) return false

  const mentionsCode = /\b(code|otp|verification|one-time|6-digit)\b/.test(message)
  const describesInvalidCode = /\b(invalid|incorrect|expired|not accepted|not valid)\b/.test(message)
  return mentionsCode && describesInvalidCode
}
