import { readUiLocaleTag } from "./uiLocale"

/**
 * Toast accessibility copy, in the app language registered at the app root
 * (ui/uiLocale), falling back to the runtime locale.
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

export function resolveToastLocale(locale: string | undefined = readUiLocaleTag()): ToastLocale {
  return (locale ?? "en").toLowerCase().startsWith("tr") ? "tr" : "en"
}

export function getToastCopy(locale: ToastLocale): ToastCopy {
  return TOAST_COPY[locale]
}
