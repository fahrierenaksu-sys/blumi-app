export type NativeNotificationPlatform = "ios" | "android" | string

/**
 * Development builds do not own a production push-registration entitlement.
 * Keeping the auto-registration module out of the dev bundle prevents iOS
 * Simulator Keychain noise while preserving push registration in signed builds.
 */
export function shouldInitializeNativeNotifications(
  platform: NativeNotificationPlatform,
  isDevelopmentBuild: boolean
): boolean {
  if (isDevelopmentBuild) return false
  return platform === "ios" || platform === "android"
}
