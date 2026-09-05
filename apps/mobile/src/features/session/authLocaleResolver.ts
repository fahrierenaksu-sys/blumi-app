export interface NativeLocaleSettings {
  get?: (key: string) => unknown
}

export interface NativeLocaleModules {
  SettingsManager?: {
    settings?: {
      AppleLocale?: unknown
      AppleLanguages?: unknown
    }
  }
  I18nManager?: {
    localeIdentifier?: unknown
  }
}

export interface NativeLocaleInput {
  platform: string
  settings?: NativeLocaleSettings | null
  nativeModules?: NativeLocaleModules | null
}

/**
 * Resolves a device locale without assuming a native Settings module exists.
 * React Native Web intentionally does not provide the iOS Settings bridge.
 */
export function resolveNativeAppLocale(
  input: NativeLocaleInput
): string | undefined {
  if (input.platform === "web") return undefined

  const appleLocale = input.settings?.get?.("AppleLocale")
  if (typeof appleLocale === "string") return appleLocale
  const appleLanguages = input.settings?.get?.("AppleLanguages")
  if (Array.isArray(appleLanguages) && typeof appleLanguages[0] === "string") {
    return appleLanguages[0]
  }

  const settings = input.nativeModules?.SettingsManager?.settings
  if (input.platform === "ios") {
    if (typeof settings?.AppleLocale === "string") return settings.AppleLocale
    if (Array.isArray(settings?.AppleLanguages) && typeof settings.AppleLanguages[0] === "string") {
      return settings.AppleLanguages[0]
    }
  }

  const localeIdentifier = input.nativeModules?.I18nManager?.localeIdentifier
  return typeof localeIdentifier === "string" ? localeIdentifier : undefined
}
