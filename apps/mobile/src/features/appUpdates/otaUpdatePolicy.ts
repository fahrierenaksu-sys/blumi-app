/**
 * How the running binary treats EAS Update (OTA) updates.
 *
 * - `apply-on-foreground`: the owner's development build (channel `preview`).
 *   Every time the app comes to the foreground it checks, downloads and
 *   reloads, so develop pushes show up within minutes.
 * - `next-launch`: the stable build (channel `production`). expo-updates
 *   downloads on launch (`checkAutomatically: ON_LOAD`) and applies the update
 *   on the next launch, so testers are never interrupted mid-use.
 * - `off`: Metro/dev runtime, Expo Go, or updates disabled.
 */
export type OtaUpdateMode = "apply-on-foreground" | "next-launch" | "off"

export const PREVIEW_UPDATE_CHANNEL = "preview"
export const PRODUCTION_UPDATE_CHANNEL = "production"
/** Minimum time between two foreground checks. */
export const OTA_FOREGROUND_CHECK_INTERVAL_MS = 30_000

export function resolveOtaUpdateMode(input: {
  isEnabled: boolean
  channel: string | null | undefined
  isDevelopmentRuntime: boolean
}): OtaUpdateMode {
  if (!input.isEnabled || input.isDevelopmentRuntime) return "off"
  if (input.channel === PREVIEW_UPDATE_CHANNEL) return "apply-on-foreground"
  if (input.channel === PRODUCTION_UPDATE_CHANNEL) return "next-launch"
  return "off"
}

export function shouldCheckForOtaUpdate(input: {
  inFlight: boolean
  lastCheckedAt: number | null
  now: number
}): boolean {
  if (input.inFlight) return false
  if (input.lastCheckedAt === null) return true
  return input.now - input.lastCheckedAt >= OTA_FOREGROUND_CHECK_INTERVAL_MS
}

/**
 * Which JavaScript the app is running, for the Settings footer: the update
 * channel, and when the running OTA update was published ("built-in" when it
 * runs the bundle embedded in the binary). Null in Metro/dev runtimes.
 */
export function formatRunningUpdateLabel(input: {
  isEnabled: boolean
  channel: string | null | undefined
  isEmbeddedLaunch: boolean
  createdAt: Date | null | undefined
  locale: "en" | "tr"
}): string | null {
  if (!input.isEnabled || !input.channel) return null
  if (input.isEmbeddedLaunch || !input.createdAt) {
    return `${input.channel} · ${input.locale === "tr" ? "yerleşik" : "built-in"}`
  }
  const date = input.createdAt
  const pad = (value: number) => String(value).padStart(2, "0")
  const stamp = `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${input.channel} · ${input.locale === "tr" ? "güncelleme" : "update"} ${stamp}`
}
