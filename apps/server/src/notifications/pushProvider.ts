const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"
const EXPO_PUSH_TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, string>
}

export interface PushProvider {
  sendPush(pushToken: string, notification: PushNotification, options?: { signal?: AbortSignal }): Promise<void | { ticketId: string }>
  getReceipt?(ticketId: string, options?: { signal?: AbortSignal }): Promise<PushReceipt | null>
}

export interface PushReceipt { status: "ok" | "error"; errorCode?: string }

export class PushProviderRejection extends Error {
  constructor(readonly code: string) { super(`Expo push ticket was rejected: ${code}.`) }
}

export function createDevelopmentPushProvider(): PushProvider {
  return {
    async sendPush() {
      return
    }
  }
}

export function createExpoPushProvider({
  accessToken,
  fetcher = fetch
}: {
  accessToken?: string
  fetcher?: typeof fetch
}): PushProvider {
  const normalizedAccessToken = accessToken?.trim()

  return {
    async getReceipt(ticketId, options) {
      const response = await fetcher("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST", signal: options?.signal,
        headers: { "content-type": "application/json", ...(normalizedAccessToken ? { authorization: `Bearer ${normalizedAccessToken}` } : {}) },
        body: JSON.stringify({ ids: [ticketId] })
      })
      if (!response.ok) throw new Error("Receipt provider unavailable")
      const payload = await readJsonPayload(response) as { data?: Record<string, unknown> } | null
      const receipt = payload?.data?.[ticketId] as { status?: unknown; details?: { error?: unknown } } | undefined
      if (!receipt) return null
      if (receipt.status !== "ok" && receipt.status !== "error") throw new Error("Invalid push receipt")
      return { status: receipt.status, ...(typeof receipt.details?.error === "string" ? { errorCode: receipt.details.error } : {}) }
    },
    async sendPush(pushToken, notification, options) {
      const normalizedPushToken = pushToken.trim()
      if (!EXPO_PUSH_TOKEN_PATTERN.test(normalizedPushToken)) {
        throw new Error("A valid Expo push token is required.")
      }

      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json"
      }
      if (normalizedAccessToken) {
        headers.authorization = `Bearer ${normalizedAccessToken}`
      }

      const response = await fetcher(EXPO_PUSH_ENDPOINT, {
        signal: options?.signal,
        method: "POST",
        headers,
        body: JSON.stringify({
          to: normalizedPushToken,
          sound: "default",
          title: notification.title,
          body: notification.body,
          ...(notification.data ? { data: notification.data } : {})
        })
      })
      const payload = await readJsonPayload(response)

      if (!response.ok) {
        throw new Error(`Expo push request failed with status ${response.status}.`)
      }

      const ticket = readExpoPushTicket(payload)
      if (ticket.status === "error") {
        const reason = ticket.details?.error ?? ticket.message ?? "PushRejected"
        throw new PushProviderRejection(reason)
      }
      if (!ticket.id) throw new Error("Expo push returned an invalid ticket ID.")
      return { ticketId: ticket.id }
    }
  }
}

interface ExpoPushTicket {
  id?: string
  status: "ok" | "error"
  message?: string
  details?: { error?: string }
}

function readExpoPushTicket(payload: unknown): ExpoPushTicket {
  if (!payload || typeof payload !== "object") {
    throw new Error("Expo push returned an invalid ticket.")
  }
  const data = (payload as { data?: unknown }).data
  const candidate = Array.isArray(data) ? data[0] : data
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Expo push returned an invalid ticket.")
  }
  const ticket = candidate as Partial<ExpoPushTicket>
  if (ticket.status !== "ok" && ticket.status !== "error") {
    throw new Error("Expo push returned an invalid ticket.")
  }
  return {
    status: ticket.status,
    ...(typeof ticket.id === "string" && ticket.id.length > 0 && ticket.id.length <= 200 ? { id: ticket.id } : {}),
    ...(typeof ticket.message === "string" ? { message: ticket.message } : {}),
    ...(ticket.details && typeof ticket.details === "object"
      ? {
          details: {
            ...(typeof ticket.details.error === "string"
              ? { error: ticket.details.error }
              : {})
          }
        }
      : {})
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}
