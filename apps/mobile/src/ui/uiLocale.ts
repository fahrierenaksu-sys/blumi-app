/**
 * The shared UI layer cannot import the session locale resolver
 * (`features/session`, see mobile-import-boundaries). The app root registers
 * it here once, so toasts and the loading surface speak the app language
 * (native per-app language first) instead of guessing from Intl.
 */
export type UiLocale = "tr" | "en"

let localeSource: (() => string | undefined) | null = null

export function setUiLocaleSource(source: (() => string | undefined) | null): void {
  localeSource = source
}

/** The raw app locale tag, or the JavaScript runtime locale before registration. */
export function readUiLocaleTag(): string | undefined {
  try {
    const registered = localeSource?.()
    if (registered) return registered
  } catch {
    // A failing native read falls back to the runtime locale below.
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}

export function resolveUiLocale(locale: string | undefined = readUiLocaleTag()): UiLocale {
  return (locale ?? "en").toLowerCase().startsWith("tr") ? "tr" : "en"
}
