/** The release languages supported by the application shell. */
export type AppLocale = "en" | "tr"

/**
 * Resolves locale exactly once at a surface boundary. Native locale wins over
 * the JavaScript runtime because Android/iOS settings can differ from Intl.
 */
export function resolveAppLocale(
  nativeLocale: string | undefined,
  intlLocale: string | undefined = getIntlLocale()
): AppLocale {
  return (nativeLocale ?? intlLocale ?? "en").toLowerCase().startsWith("tr")
    ? "tr"
    : "en"
}

/**
 * Backward-compatible native surface seam. Kept lazy so pure copy/format tests
 * do not need to transform React Native internals.
 */
export function getAppLocale(): AppLocale {
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const { getNativeAppLocale } = require("./authLocale") as {
    getNativeAppLocale: () => string | undefined
  }
  return resolveAppLocale(getNativeAppLocale())
}

export function getLocaleIdentifier(locale: AppLocale): "en-US" | "tr-TR" {
  return locale === "tr" ? "tr-TR" : "en-US"
}

function getIntlLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}
