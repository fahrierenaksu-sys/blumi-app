function ensureNoTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

export const MOBILE_HTTP_BASE_URL = ensureNoTrailingSlash(
  process.env.EXPO_PUBLIC_BLUMI_API_HTTP_URL ?? "http://127.0.0.1:4000"
)

export const MOBILE_WS_BASE_URL = ensureNoTrailingSlash(
  process.env.EXPO_PUBLIC_REALTIME_EDGE_WS_URL ?? "ws://127.0.0.1:4100"
)

export type BlumiMediaMode = "demo" | "native"

const rawMediaMode = process.env.EXPO_PUBLIC_BLUMI_MEDIA_MODE
  ?.trim()
  .toLowerCase()

export const BLUMI_MEDIA_MODE: BlumiMediaMode =
  rawMediaMode === "native" ? "native" : "demo"

export const IS_BLUMI_MEDIA_DEMO_MODE = BLUMI_MEDIA_MODE === "demo"

export const IS_BLUMI_DEMO_ENABLED =
  process.env.EXPO_PUBLIC_BLUMI_ENABLE_DEMO?.trim() === "1"

export const BLUMI_BUILD_PROFILE =
  process.env.EXPO_PUBLIC_BLUMI_BUILD_PROFILE?.trim() || "development"

// Audio capture is intentionally unavailable in every current app build.
export const IS_BLUMI_VOICE_ENABLED = false

export interface BlumiNativeUiTestSessionResetInput {
  buildProfile: string
  rawResetFlag: string | undefined
}

/**
 * This flag is compiled into the dedicated native UI test build only. It must
 * never reset an installed production user's session.
 */
export function resolveBlumiNativeUiTestSessionResetEnabled(
  input: BlumiNativeUiTestSessionResetInput
): boolean {
  return (
    input.buildProfile === "native-ui-test" &&
    input.rawResetFlag?.trim() === "1"
  )
}

export const IS_BLUMI_NATIVE_UI_TEST_SESSION_RESET =
  resolveBlumiNativeUiTestSessionResetEnabled({
    buildProfile: BLUMI_BUILD_PROFILE,
    rawResetFlag: process.env.EXPO_PUBLIC_BLUMI_NATIVE_UI_TEST_SESSION_RESET
  })

export const IS_BLUMI_DEVELOPMENT_RUNTIME =
  typeof __DEV__ === "boolean" && __DEV__

export const BLUMI_ONBOARDING_RUN_V3_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_QA
export const BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_REVIEW_APPROVED
export const BLUMI_ONBOARDING_RUN_V3_USER_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_ONBOARDING_RUN_V3_USER_APPROVED

export const BLUMI_PROFILE_CHARACTER_REACTION_QA_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_QA
export const BLUMI_PROFILE_CHARACTER_REACTION_REVIEW_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_REVIEW_APPROVED
export const BLUMI_PROFILE_CHARACTER_REACTION_USER_APPROVED_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_PROFILE_CHARACTER_REACTION_USER_APPROVED

export const BLUMI_QA_UNLOCK_AVATAR_ITEMS_FLAG =
  process.env.EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS

export const BLUMI_SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || undefined

export const BLUMI_POSTHOG_API_KEY =
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || undefined

export const BLUMI_POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || undefined

// Paid packs are intentionally unavailable in the first release. A later
// release needs an explicit product, legal and store approval to turn this on.
export const IS_BLUMI_PAID_COINS_ENABLED =
  process.env.EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED?.trim() === "1"

/**
 * RevenueCat platform API keys are publishable SDK identifiers, not provider
 * secrets. A publishable key alone must not activate deferred purchases.
 */
export const BLUMI_REVENUECAT_IOS_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || undefined

export const BLUMI_REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || undefined
