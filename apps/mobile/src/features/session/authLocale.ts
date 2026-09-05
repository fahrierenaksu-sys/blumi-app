import { NativeModules, Platform, Settings } from "react-native"
import { resolveNativeAppLocale } from "./authLocaleResolver"
export { getAppLocale } from "./appLocale"

export function getNativeAppLocale(): string | undefined {
  return resolveNativeAppLocale({
    platform: Platform.OS,
    settings: Settings,
    nativeModules: NativeModules
  })
}
