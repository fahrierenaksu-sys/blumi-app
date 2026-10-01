/**
 * Toast accessibility copy. The shared UI layer cannot import the session
 * locale resolver (`features/session`), so the toast resolves its language
 * from the JavaScript runtime locale, which follows the device language.
 */

export type ToastLocale = "tr" | "en"

export interface ToastCopy {
  dismissLabel: (title: string) => string
  openLabel: (title: string) => string
}

const TOAST_COPY: Readonly<Record<ToastLocale, ToastCopy>> = {
  tr: { dismissLabel: (title) => `Bildirimi kapat: ${title}`, openLabel: (title) => `Aç: ${title}` },
  en: { dismissLabel: (title) => `Dismiss notification: ${title}`, openLabel: (title) => `Open: ${title}` }
}

export function resolveToastLocale(locale: string | undefined = readIntlLocale()): ToastLocale {
  return (locale ?? "en").toLowerCase().startsWith("tr") ? "tr" : "en"
}

export function getToastCopy(locale: ToastLocale): ToastCopy {
  return TOAST_COPY[locale]
}

function readIntlLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}
