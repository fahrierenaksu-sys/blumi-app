import type { NotificationPreferences } from "./notificationApi"

export type NotificationPreferenceToggleKey =
  | "likesEnabled"
  | "messagesEnabled"
  | "matchesEnabled"
  | "discoveryWatchEnabled"

export const NOTIFICATION_PREFERENCE_ROWS: readonly {
  key: NotificationPreferenceToggleKey
  label: string
  description: string
}[] = [
  {
    key: "likesEnabled",
    label: "Likes",
    description: "When someone likes your vibe."
  },
  {
    key: "messagesEnabled",
    label: "Messages",
    description: "When a new message is waiting."
  },
  {
    key: "matchesEnabled",
    label: "Matches",
    description: "When a connection becomes mutual."
  },
  {
    key: "discoveryWatchEnabled",
    label: "Discovery Watch",
    description: "When a fitting new person appears."
  }
]

export function updateNotificationPreferenceToggle(
  preferences: NotificationPreferences,
  key: NotificationPreferenceToggleKey,
  enabled: boolean
): NotificationPreferences {
  return { ...preferences, [key]: enabled }
}
