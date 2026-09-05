export type PushPlatform = "ios" | "android"

export interface DeviceRegistration {
  userId: string
  platform: PushPlatform
  pushToken: string
  registeredAt: string
}

export interface RegisterDeviceInput {
  platform: PushPlatform
  pushToken: string
}

export interface NotificationPreferences {
  quietHoursTimeZone?: string | null
  likesEnabled: boolean
  messagesEnabled: boolean
  matchesEnabled: boolean
  discoveryWatchEnabled: boolean
  quietHours: { startMinute: number; endMinute: number } | null
  quietHoursUtcOffsetMinutes: number
  maxPushesPerHour: number
}

export type UpdateNotificationPreferencesInput = Partial<NotificationPreferences>

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const trimmed = baseHttpUrl.endsWith("/") ? baseHttpUrl.slice(0, -1) : baseHttpUrl
  return `${trimmed}${path}`
}

export async function registerDevice(
  baseHttpUrl: string,
  sessionToken: string,
  input: RegisterDeviceInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<DeviceRegistration> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/devices"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "This device could not be registered."))
  }

  return normalizeDevicePayload(payload)
}

export async function removeDevice(
  baseHttpUrl: string,
  sessionToken: string,
  pushToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, "/v1/devices"),
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ pushToken }),
      signal
    }
  )
  if (!response.ok) {
    const payload = await readJsonPayload(response)
    throw new Error(getApiErrorMessage(payload, "This device could not be removed."))
  }
}

export async function getNotificationPreferences(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<NotificationPreferences> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/notification-preferences"), {
    method: "GET",
    headers: { authorization: `Bearer ${sessionToken}` },
    signal
  })
  const payload = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Notification settings could not be loaded."))
  }
  return normalizePreferencesPayload(payload)
}

export async function updateNotificationPreferences(
  baseHttpUrl: string,
  sessionToken: string,
  input: UpdateNotificationPreferencesInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<NotificationPreferences> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/notification-preferences"), {
    method: "PUT",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ ...input, quietHoursTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    signal
  })
  const payload = await readJsonPayload(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Notification settings could not be saved."))
  }
  return normalizePreferencesPayload(payload)
}

function normalizeDevicePayload(payload: unknown): DeviceRegistration {
  const device = (payload as { device?: unknown } | null)?.device
  if (!device || typeof device !== "object") {
    throw new Error("Blumi could not read this device registration.")
  }
  const record = device as Partial<DeviceRegistration>
  if (
    typeof record.userId !== "string" ||
    (record.platform !== "ios" && record.platform !== "android") ||
    typeof record.pushToken !== "string" ||
    typeof record.registeredAt !== "string"
  ) {
    throw new Error("Blumi could not read this device registration.")
  }
  return {
    userId: record.userId,
    platform: record.platform,
    pushToken: record.pushToken,
    registeredAt: record.registeredAt
  }
}

function normalizePreferencesPayload(payload: unknown): NotificationPreferences {
  const preferences = (payload as { preferences?: unknown } | null)?.preferences
  if (!preferences || typeof preferences !== "object") {
    throw new Error("Blumi could not read notification settings.")
  }
  const record = preferences as Partial<NotificationPreferences>
  const quietHours = record.quietHours
  const validQuietHours = quietHours === null || (
    typeof quietHours === "object" && quietHours !== null &&
    Number.isSafeInteger(quietHours.startMinute) &&
    Number.isSafeInteger(quietHours.endMinute)
  )
  if (
    typeof record.likesEnabled !== "boolean" ||
    typeof record.messagesEnabled !== "boolean" ||
    typeof record.matchesEnabled !== "boolean" ||
    typeof record.discoveryWatchEnabled !== "boolean" ||
    !validQuietHours ||
    !Number.isSafeInteger(record.quietHoursUtcOffsetMinutes) ||
    !Number.isSafeInteger(record.maxPushesPerHour)
  ) {
    throw new Error("Blumi could not read notification settings.")
  }
  const normalizedQuietHours = quietHours === null
    ? null
    : quietHours as { startMinute: number; endMinute: number }
  return {
    likesEnabled: record.likesEnabled as boolean,
    messagesEnabled: record.messagesEnabled as boolean,
    matchesEnabled: record.matchesEnabled as boolean,
    discoveryWatchEnabled: record.discoveryWatchEnabled as boolean,
    quietHours: normalizedQuietHours === null
      ? null
      : {
          startMinute: normalizedQuietHours.startMinute,
          endMinute: normalizedQuietHours.endMinute
        },
    quietHoursUtcOffsetMinutes: record.quietHoursUtcOffsetMinutes as number,
    ...(typeof record.quietHoursTimeZone === "string" ? { quietHoursTimeZone: record.quietHoursTimeZone } : {}),
    maxPushesPerHour: record.maxPushesPerHour as number
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).error === "string"
  )
    ? ((payload as Record<string, unknown>).error as string)
    : fallback
}
