const LOCAL_API_HTTP_URL = "http://127.0.0.1:4000"
const LOCAL_REALTIME_WS_URL = "ws://127.0.0.1:4100"
const EXTERNAL_BUILD_PROFILES = new Set(["preview", "production"])

function resolveMobileReleaseEnvironment(environment = process.env) {
  const buildProfile = normalizeValue(environment.EAS_BUILD_PROFILE) || "development"
  const isExternalBuild = EXTERNAL_BUILD_PROFILES.has(buildProfile)
  const apiHttpUrl = normalizeUrl(
    environment.EXPO_PUBLIC_BLUMI_API_HTTP_URL,
    isExternalBuild ? undefined : LOCAL_API_HTTP_URL,
    "EXPO_PUBLIC_BLUMI_API_HTTP_URL"
  )
  const realtimeWsUrl = normalizeUrl(
    environment.EXPO_PUBLIC_REALTIME_EDGE_WS_URL,
    isExternalBuild ? undefined : LOCAL_REALTIME_WS_URL,
    "EXPO_PUBLIC_REALTIME_EDGE_WS_URL"
  )
  const mediaMode = normalizeValue(environment.EXPO_PUBLIC_BLUMI_MEDIA_MODE) || "demo"
  const qaUnlockAvatarItems =
    normalizeValue(environment.EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS) || "0"
  const enableDemo =
    normalizeValue(environment.EXPO_PUBLIC_BLUMI_ENABLE_DEMO) ||
    (isExternalBuild ? "0" : "1")
  const devEntryRoute = normalizeValue(
    environment.EXPO_PUBLIC_BLUMI_DEV_ENTRY_ROUTE
  ) || undefined
  const sentryDsn = normalizeValue(environment.EXPO_PUBLIC_SENTRY_DSN) || undefined
  const posthogApiKey =
    normalizeValue(environment.EXPO_PUBLIC_POSTHOG_API_KEY) || undefined
  const posthogHost = normalizeValue(environment.EXPO_PUBLIC_POSTHOG_HOST) || undefined
  const revenueCatIosApiKey =
    normalizeValue(environment.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY) || undefined
  const revenueCatAndroidApiKey =
    normalizeValue(environment.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY) || undefined

  if (mediaMode !== "demo" && mediaMode !== "native") {
    throw new Error("EXPO_PUBLIC_BLUMI_MEDIA_MODE must be demo or native.")
  }
  if (enableDemo !== "0" && enableDemo !== "1") {
    throw new Error("EXPO_PUBLIC_BLUMI_ENABLE_DEMO must be 0 or 1.")
  }

  if (isExternalBuild) {
    requireProtocol(apiHttpUrl, "https:", "Release API must use HTTPS.")
    requireProtocol(realtimeWsUrl, "wss:", "Release realtime must use WSS.")
    if (mediaMode !== "native") {
      throw new Error("Preview and production builds require native media.")
    }
    if (qaUnlockAvatarItems !== "0") {
      throw new Error("QA avatar unlock cannot be enabled in preview or production.")
    }
    if (enableDemo !== "0") {
      throw new Error("Demo sessions cannot be enabled in preview or production.")
    }
    if (devEntryRoute) {
      throw new Error("Development entry routes cannot be enabled in preview or production.")
    }
    if (!sentryDsn) {
      throw new Error("EXPO_PUBLIC_SENTRY_DSN is required for preview and production builds.")
    }
    requireProtocol(sentryDsn, "https:", "Release Sentry DSN must use HTTPS.")
    if (!posthogApiKey) {
      throw new Error("EXPO_PUBLIC_POSTHOG_API_KEY is required for preview and production builds.")
    }
    if (!posthogHost) {
      throw new Error("EXPO_PUBLIC_POSTHOG_HOST is required for preview and production builds.")
    }
    requireProtocol(posthogHost, "https:", "Release PostHog host must use HTTPS.")
    if (!revenueCatIosApiKey) {
      throw new Error("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is required for preview and production builds.")
    }
    if (!revenueCatAndroidApiKey) {
      throw new Error("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is required for preview and production builds.")
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
