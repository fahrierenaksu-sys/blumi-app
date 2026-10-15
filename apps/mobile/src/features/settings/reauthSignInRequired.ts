import type { AppLocale } from "../session/appLocale"

/**
 * Raised when the server confirmed none of the phones this device holds as
 * the account's phone, so no code can be sent. The only way out is to sign in
 * again, by SMS, with the number the account was created with: that puts the
 * account's phone in Firebase. Retrying cannot help, and every retry spends
 * the server's request limits, so callers show this once and never retry.
 */
export const REAUTH_SIGN_IN_REQUIRED_CODE = "reauth_sign_in_required"

export class ReauthSignInRequiredError extends Error {
  readonly code = REAUTH_SIGN_IN_REQUIRED_CODE
  constructor() {
    super("Sign in again to verify your phone.")
    this.name = "ReauthSignInRequiredError"
  }
}

export function isReauthSignInRequiredError(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && (error as { code?: unknown }).code === REAUTH_SIGN_IN_REQUIRED_CODE
}

interface ReauthSignInCopy {
  title: string
  body: string
  action: string
}

// The recovery link names the sign-in screen's "can't use your old phone
// number" entry (accountRecoveryCopy.link), the existing support route.
const COPY: Record<AppLocale, ReauthSignInCopy> = {
  en: {
    title: "Sign in again to continue",
    body: "We couldn't confirm which phone number your account uses, so we can't send a code. Sign out, then sign in again by SMS with the number your account was created with, not a newer one. If you no longer have that number, tap “Can’t use your old phone number?” on the sign-in screen.",
    action: "Sign out and sign in again"
  },
  tr: {
    title: "Devam etmek için yeniden giriş yap",
    body: "Hesabının hangi telefon numarasını kullandığını doğrulayamadık, bu yüzden kod gönderemiyoruz. Çıkış yapıp hesabı açarken kullandığın numarayla SMS ile yeniden giriş yap; daha yeni bir numarayla olmaz. O numaraya artık erişemiyorsan giriş ekranındaki “Eski telefon numarana erişemiyor musun?” bağlantısına dokun.",
    action: "Çıkış yap ve yeniden giriş yap"
  }
}

export function getReauthSignInRequiredCopy(locale: AppLocale = "en"): ReauthSignInCopy {
  return COPY[locale]
}

interface AlertButton {
  text: string
  style?: "cancel" | "default" | "destructive"
  onPress?: () => void
}

/** Arguments for `Alert.alert`: cancel, plus a sign-out action when the screen can sign out. */
export function reauthSignInAlertArgs(
  locale: AppLocale,
  cancelLabel: string,
  onSignInAgain?: () => void
): [string, string, AlertButton[]] {
  const copy = getReauthSignInRequiredCopy(locale)
  const buttons: AlertButton[] = [{ text: cancelLabel, style: "cancel" }]
  if (onSignInAgain) buttons.push({ text: copy.action, onPress: onSignInAgain })
  return [copy.title, copy.body, buttons]
}
