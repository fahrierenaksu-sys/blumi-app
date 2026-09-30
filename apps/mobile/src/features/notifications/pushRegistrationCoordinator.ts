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
  signal?: AbortSignal
  waitForRetry?: (delayMs: number) => Promise<void>
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
  for (let attempt = 0; attempt < 3; attempt++) {
    input.signal?.throwIfAborted()
    try {
      await dependencies.registerDevice({ platform: dependencies.platform, pushToken })
      break
    } catch (error) {
      input.signal?.throwIfAborted()
      const status = error && typeof error === "object" && "status" in error ? error.status : undefined
      if (attempt === 2 || (error instanceof Error && error.name === "AbortError") ||
        (typeof status === "number" && status < 500 && status !== 429)) throw error
      const delay = 1000 * 2 ** attempt
      await (input.waitForRetry ? input.waitForRetry(delay) : waitForRetry(delay, input.signal))
    }
  }
  return { status: "registered", pushToken }
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason) }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, delayMs)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}
