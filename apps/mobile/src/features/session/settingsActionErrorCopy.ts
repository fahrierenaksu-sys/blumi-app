import type { AppLocale } from "./appLocale"
export type SettingsActionErrorKind =
  | "refreshHiddenList"
  | "unblockPerson"
  | "deleteAccount"
  | "requestDeletionCode"
  | "verifyDeletionCode"
  | "requestDataExport"
  | "verifyDataExport"
  | "requestCurrentPhoneCode"
  | "verifyCurrentPhoneCode"
  | "requestNewPhoneCode"
  | "verifyNewPhoneCode"
  | "confirmPhoneChange"

type SettingsVerificationErrorKind =
  | "verifyDeletionCode"
  | "verifyCurrentPhoneCode"
  | "verifyNewPhoneCode"

interface SettingsActionErrorCopy {
  fallback: string
  invalidCode?: string
}

const ENGLISH_COPY: Record<SettingsActionErrorKind, SettingsActionErrorCopy> = {
  refreshHiddenList: { fallback: "We couldn't refresh your hidden list. Try again in a moment." },
  unblockPerson: { fallback: "We couldn't update your hidden list. Try again in a moment." },
  deleteAccount: { fallback: "We couldn't delete your account. Your account is still active. Try again." },
  requestDeletionCode: { fallback: "We couldn't send a deletion code. Try again in a moment." },
  verifyDeletionCode: {
    fallback: "We couldn't verify that deletion code. Check your connection and try again.",
    invalidCode: "That code wasn't accepted. Check the 6-digit code and try again."
  },
  requestDataExport: { fallback: "We couldn't send an export code. Try again in a moment." },
  verifyDataExport: {
    fallback: "We couldn't prepare your account export. Try again in a moment.",
    invalidCode: "That code wasn't accepted. Check the 6-digit code and try again."
  },
  requestCurrentPhoneCode: { fallback: "We couldn't send a security code. Try again in a moment." },
  verifyCurrentPhoneCode: {
    fallback: "We couldn't verify that code. Check your connection and try again.",
    invalidCode: "That code wasn't accepted. Check the 6-digit code and try again."
  },
  requestNewPhoneCode: { fallback: "We couldn't send a code to that number. Check it and try again." },
  verifyNewPhoneCode: {
    fallback: "We couldn't verify that code. Check your connection and try again.",
    invalidCode: "That code wasn't accepted. Check the 6-digit code and try again."
  },
  confirmPhoneChange: { fallback: "We couldn't change your phone number. Your current sign-in phone is unchanged." }
}

const TURKISH_COPY: Record<SettingsActionErrorKind, SettingsActionErrorCopy> = {
  refreshHiddenList: { fallback: "Gizli listen yenilenemedi. Biraz sonra tekrar dene." },
  unblockPerson: { fallback: "Gizli listen güncellenemedi. Biraz sonra tekrar dene." },
  deleteAccount: { fallback: "Hesabın silinemedi. Hesabın hâlâ aktif. Tekrar dene." },
  requestDeletionCode: { fallback: "Silme kodu gönderilemedi. Biraz sonra tekrar dene." },
  verifyDeletionCode: {
    fallback: "Silme kodu doğrulanamadı. Bağlantını kontrol edip tekrar dene.",
    invalidCode: "Bu kod kabul edilmedi. 6 haneli kodu kontrol edip tekrar dene."
  },
  requestDataExport: { fallback: "Dışa aktarım kodu gönderilemedi. Biraz sonra tekrar dene." },
  verifyDataExport: {
    fallback: "Hesap dışa aktarımın hazırlanamadı. Biraz sonra tekrar dene.",
    invalidCode: "Bu kod kabul edilmedi. 6 haneli kodu kontrol edip tekrar dene."
  },
  requestCurrentPhoneCode: { fallback: "Güvenlik kodu gönderilemedi. Biraz sonra tekrar dene." },
  verifyCurrentPhoneCode: {
    fallback: "Kod doğrulanamadı. Bağlantını kontrol edip tekrar dene.",
    invalidCode: "Bu kod kabul edilmedi. 6 haneli kodu kontrol edip tekrar dene."
  },
  requestNewPhoneCode: { fallback: "Bu numaraya kod gönderilemedi. Numarayı kontrol edip tekrar dene." },
  verifyNewPhoneCode: {
    fallback: "Kod doğrulanamadı. Bağlantını kontrol edip tekrar dene.",
    invalidCode: "Bu kod kabul edilmedi. 6 haneli kodu kontrol edip tekrar dene."
  },
  confirmPhoneChange: { fallback: "Telefon numaran değiştirilemedi. Mevcut giriş telefonun aynı kaldı." }
}

const SETTINGS_ACTION_ERROR_COPY: Record<AppLocale, Record<SettingsActionErrorKind, SettingsActionErrorCopy>> = {
  en: ENGLISH_COPY,
  tr: TURKISH_COPY
}

/**
 * Account and safety endpoints may return transport or provider diagnostics.
 * Keep those details out of user-visible settings surfaces while retaining
 * specific recovery guidance for the action that failed.
 */
export function getSettingsActionErrorMessageForDisplay(
  kind: SettingsActionErrorKind,
  error: unknown,
  locale: AppLocale = "en"
): string {
  const copy = SETTINGS_ACTION_ERROR_COPY[locale][kind]
  return copy.invalidCode && isExpectedVerificationCodeFailure(error)
    ? copy.invalidCode
    : copy.fallback
}

export function getSettingsVerificationErrorToastForDisplay(
  kind: SettingsVerificationErrorKind,
  error: unknown,
  locale: AppLocale = "en"
): { title: string; body: string } {
  const isInvalidCode = isExpectedVerificationCodeFailure(error)
  return {
    title: isInvalidCode
      ? locale === "tr" ? "Kod kabul edilmedi" : "Code not accepted"
      : getVerificationFallbackTitle(kind, locale),
    body: getSettingsActionErrorMessageForDisplay(kind, error, locale)
  }
}

function getVerificationFallbackTitle(
  kind: SettingsVerificationErrorKind,
  locale: AppLocale
): string {
  if (locale === "tr") {
    return kind === "verifyDeletionCode"
      ? "Silme kodu doğrulanamadı"
      : "Kod doğrulanamadı"
  }
  return kind === "verifyDeletionCode" ? "Could not verify deletion code" : "Could not verify code"
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
