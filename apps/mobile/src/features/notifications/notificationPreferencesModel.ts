import type { NotificationPreferences } from "./notificationApi"

export type NotificationPreferenceToggleKey =
  | "likesEnabled"
  | "messagesEnabled"
  | "matchesEnabled"
  | "discoveryWatchEnabled"

/** Row order in Settings; the labels live in the bilingual settings copy. */
export const NOTIFICATION_PREFERENCE_ROWS: readonly { key: NotificationPreferenceToggleKey }[] = [
  { key: "likesEnabled" },
  { key: "messagesEnabled" },
  { key: "matchesEnabled" },
  { key: "discoveryWatchEnabled" }
]

export function updateNotificationPreferenceToggle(
  preferences: NotificationPreferences,
  key: NotificationPreferenceToggleKey,
  enabled: boolean
): NotificationPreferences {
  return { ...preferences, [key]: enabled }
}
