import type { PushPlatform } from "./notificationApi"

export function shouldRemovePushRegistration(capturedUserId: string | undefined, currentUserId: string | undefined): boolean {
  return Boolean(capturedUserId) && capturedUserId !== currentUserId
}

export type PushPermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"

export interface PushRegistrationDependencies {
  isPhysicalDevice: boolean
  platform: PushPlatform
  createAndroidChannel(): Promise<void>
  getPermissionStatus(): Promise<PushPermissionStatus>
  requestPermission(): Promise<PushPermissionStatus>
  getExpoPushToken(): Promise<string>
  registerDevice(input: {
    platform: PushPlatform
    pushToken: string
  }): Promise<void>
}

export type PushRegistrationResult =
  | { status: "registered"; pushToken: string }
  | {
      status: "skipped"
      reason:
        | "non-production-session"
        | "physical-device-required"
        | "permission-not-requested"
        | "permission-denied"
    }

export async function syncPushRegistration(input: {
  mode: "demo" | "production"
  allowPermissionPrompt: boolean
  dependencies: PushRegistrationDependencies
}): Promise<PushRegistrationResult> {
  const { dependencies } = input
  if (input.mode !== "production") {
    return { status: "skipped", reason: "non-production-session" }
  }
  if (!dependencies.isPhysicalDevice) {
    return { status: "skipped", reason: "physical-device-required" }
  }

  if (dependencies.platform === "android") {
    await dependencies.createAndroidChannel()
  }

  const existingStatus = await dependencies.getPermissionStatus()
  if (existingStatus === "undetermined" && !input.allowPermissionPrompt) {
    return { status: "skipped", reason: "permission-not-requested" }
  }
  const finalStatus = existingStatus === "undetermined"
    ? await dependencies.requestPermission()
    : existingStatus
  if (finalStatus !== "granted") {
    return { status: "skipped", reason: "permission-denied" }
  }

  const pushToken = await dependencies.getExpoPushToken()
  await dependencies.registerDevice({
    platform: dependencies.platform,
    pushToken
  })
  return { status: "registered", pushToken }
}
