import type { AppLocale } from "../session/appLocale"
import type { NotificationPreferenceToggleKey } from "../notifications/notificationPreferencesModel"
import type { MySafetyReportStatus } from "../safety/safetyApi"
import type { SettingsCopy } from "./settingsCopy"

/** Shared remote-load lifecycle for Settings panels. */
export type SettingsLoadStatus = "idle" | "loading" | "ready" | "error"

export function isSettingsLoadPending(status: SettingsLoadStatus): boolean {
  return status === "loading" || status === "idle"
}

/** One-time codes accept digits only; the input's maxLength caps the length. */
export function sanitizeVerificationCode(value: string): string {
  return value.replace(/\D/g, "")
}

export function isVerificationCodeComplete(code: string): boolean {
  return code.length === 6
}

export type NotificationPreferenceRowIcon = "heart" | "chatbubble" | "people" | "compass"
export type NotificationPreferenceRowGradient = "primary" | "cool"

export function getNotificationPreferenceRowVisual(key: NotificationPreferenceToggleKey): {
  icon: NotificationPreferenceRowIcon
  gradient: NotificationPreferenceRowGradient
} {
  return {
    icon: key === "likesEnabled"
      ? "heart"
      : key === "messagesEnabled"
        ? "chatbubble"
        : key === "matchesEnabled"
          ? "people"
          : "compass",
    gradient: key === "messagesEnabled" ? "cool" : "primary"
  }
}

export function formatMyReportDate(createdAt: string, locale: AppLocale): string {
  return new Date(createdAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB")
}

export function getMyReportPresentation(
  status: MySafetyReportStatus,
  copy: Pick<
    SettingsCopy,
    "reportPending" | "reportReviewed" | "reportPendingResponse" | "reportClosedResponse"
  >
): { statusLabel: string; response: string } {
  return status === "pending"
    ? { statusLabel: copy.reportPending, response: copy.reportPendingResponse }
    : { statusLabel: copy.reportReviewed, response: copy.reportClosedResponse }
}
