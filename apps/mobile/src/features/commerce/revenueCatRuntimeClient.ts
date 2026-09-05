import { Platform } from "react-native"
import {
  BLUMI_REVENUECAT_ANDROID_API_KEY,
  BLUMI_REVENUECAT_IOS_API_KEY
} from "../../config/env"
import {
  createRevenueCatCoinPackClient,
  type RevenueCatCoinPackClient
} from "./revenueCatCoinPackClient"
import { createReactNativeRevenueCatBridge } from "./revenueCatNativeBridge"

let singleton: RevenueCatCoinPackClient | undefined

/**
 * Resolves only public mobile SDK keys. The RevenueCat webhook secret and all
 * wallet credentials stay server-side. Unsupported platforms intentionally
 * receive no bridge and therefore fail closed.
 */
export function resolveRevenueCatPublicApiKey(input: {
  platform: string
  iosApiKey: string | undefined
  androidApiKey: string | undefined
}): string | undefined {
  const rawKey = input.platform === "ios"
    ? input.iosApiKey
    : input.platform === "android"
      ? input.androidApiKey
      : undefined
  return rawKey?.trim() || undefined
}

/**
 * Application singleton used by RootNavigator's production session lifecycle.
 * It intentionally has no local fallback: without a configured native key,
 * coin pack UI remains unavailable and no purchase can start.
 */
export function getRevenueCatCoinPackClient(): RevenueCatCoinPackClient {
  if (singleton) return singleton

  const apiKey = resolveRevenueCatPublicApiKey({
    platform: Platform.OS,
    iosApiKey: BLUMI_REVENUECAT_IOS_API_KEY,
    androidApiKey: BLUMI_REVENUECAT_ANDROID_API_KEY
  })
  singleton = createRevenueCatCoinPackClient({
    apiKey,
    bridge: apiKey
      ? createReactNativeRevenueCatBridge({ platform: Platform.OS })
      : undefined
  })
  return singleton
}
