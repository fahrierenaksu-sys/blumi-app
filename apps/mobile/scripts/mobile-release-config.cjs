const LOCAL_API_HTTP_URL = "http://127.0.0.1:4000"
const LOCAL_REALTIME_WS_URL = "ws://127.0.0.1:4100"
const EXTERNAL_BUILD_PROFILES = new Set(["preview", "production"])
const SERVER_TEST_BUILD_PROFILE = "server-test"

function resolveMobileReleaseEnvironment(environment = process.env) {
  const buildProfile = normalizeValue(environment.EAS_BUILD_PROFILE) || "development"
  const isExternalBuild = EXTERNAL_BUILD_PROFILES.has(buildProfile)
  const isConnectedBuild = isExternalBuild || buildProfile === SERVER_TEST_BUILD_PROFILE
  const apiHttpUrl = normalizeUrl(
    environment.EXPO_PUBLIC_BLUMI_API_HTTP_URL,
    isConnectedBuild ? undefined : LOCAL_API_HTTP_URL,
    "EXPO_PUBLIC_BLUMI_API_HTTP_URL"
  )
  const realtimeWsUrl = normalizeUrl(
    environment.EXPO_PUBLIC_REALTIME_EDGE_WS_URL,
    isConnectedBuild ? undefined : LOCAL_REALTIME_WS_URL,
    "EXPO_PUBLIC_REALTIME_EDGE_WS_URL"
  )
  const mediaMode = normalizeValue(environment.EXPO_PUBLIC_BLUMI_MEDIA_MODE) || "demo"
  const qaUnlockAvatarItems =
    normalizeValue(environment.EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS) || "0"
  const enableDemo =
    normalizeValue(environment.EXPO_PUBLIC_BLUMI_ENABLE_DEMO) ||
    (isConnectedBuild ? "0" : "1")
  const devEntryRoute = normalizeValue(
    environment.EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE
  ) || undefined
  const sentryDsn = normalizeValue(environment.EXPO_PUBLIC_SENTRY_DSN) || undefined
  const posthogApiKey =
    normalizeValue(environment.EXPO_PUBLIC_POSTHOG_API_KEY) || undefined
  const posthogHost = normalizeValue(environment.EXPO_PUBLIC_POSTHOG_HOST) || undefined
  const paidCoinsEnabled = normalizeValue(environment.EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED) || "0"
  const voiceFlag = normalizeValue(environment.EXPO_PUBLIC_BLUMI_VOICE_ENABLED)
  if (voiceFlag && voiceFlag !== "0") {
    throw new Error("Live voice and microphone access are disabled in Blumi builds.")
  }
  const voiceEnabled = "0"
  const revenueCatIosApiKey =
    normalizeValue(environment.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) || undefined
  const revenueCatAndroidApiKey =
    normalizeValue(environment.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) || undefined

  if (enableDemo !== "0" && enableDemo !== "1") {
    throw new Error("EXPO_PUBLIC_BLUMI_ENABLE_DEMO must be 0 or 1.")
  }
  if (paidCoinsEnabled !== "0" && paidCoinsEnabled !== "1") {
    throw new Error("EXPO_PUBLIC_BLUMI_PAID_COINS_ENABLED must be 0 or 1.")
  }

  if (isConnectedBuild) {
    requireProtocol(apiHttpUrl, "https:", "Connected mobile API must use HTTPS.")
    requireProtocol(realtimeWsUrl, "wss:", "Connected mobile realtime must use WSS.")
    if (qaUnlockAvatarItems !== "0") {
      throw new Error("QA avatar unlock cannot be enabled in connected builds.")
    }
    if (enableDemo !== "0") {
      throw new Error("Demo sessions cannot be enabled in connected builds.")
    }
    if (devEntryRoute) {
      throw new Error("Development entry routes cannot be enabled in connected builds.")
    }
  }

  if (isExternalBuild) {
    if (paidCoinsEnabled !== "0") {
      throw new Error("First-release paid coin sales are deferred in preview and production builds.")
    }
    if (sentryDsn) {
      requireProtocol(sentryDsn, "https:", "Release Sentry DSN must use HTTPS.")
    }
    if (posthogApiKey && !posthogHost) {
      throw new Error("EXPO_PUBLIC_POSTHOG_HOST is required when PostHog is configured.")
    }
    if (posthogHost) {
      requireProtocol(posthogHost, "https:", "Release PostHog host must use HTTPS.")
    }
  }

  return {
    buildProfile,
    apiHttpUrl,
    realtimeWsUrl,
    mediaMode,
    qaUnlockAvatarItems,
    enableDemo,
    devEntryRoute,
    sentryDsn,
    posthogApiKey,
    posthogHost,
    paidCoinsEnabled,
    voiceEnabled,
    revenueCatIosApiKey,
    revenueCatAndroidApiKey
  }
}

function normalizeUrl(value, fallback, variableName) {
  const normalized = normalizeValue(value) || fallback
  if (!normalized) {
    throw new Error(`${variableName} is required for preview and production builds.`)
  }
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL.`)
  }
  if (!parsed.hostname) {
    throw new Error(`${variableName} must include a hostname.`)
  }
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
}

function requireProtocol(value, protocol, message) {
  if (new URL(value).protocol !== protocol) throw new Error(message)
}

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : ""
}

module.exports = {
  resolveMobileReleaseEnvironment
}
