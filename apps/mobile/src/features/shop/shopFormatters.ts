import { getLocaleIdentifier, resolveAppLocale, type AppLocale } from "../session/appLocale"

export function formatCoins(value: number, locale: AppLocale = resolveAppLocale(undefined)): string {
  return Math.max(0, Math.floor(value)).toLocaleString(getLocaleIdentifier(locale))
}
