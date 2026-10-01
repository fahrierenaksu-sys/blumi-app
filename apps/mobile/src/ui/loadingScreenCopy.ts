import type { UiLocale } from "./uiLocale"

export interface LoadingScreenCopy {
  preparing: string
}

const COPY: Readonly<Record<UiLocale, LoadingScreenCopy>> = {
  tr: { preparing: "Blumi hazırlanıyor" },
  en: { preparing: "Getting Blumi ready" }
}

export function getLoadingScreenCopy(locale: UiLocale): LoadingScreenCopy {
  return COPY[locale]
}
