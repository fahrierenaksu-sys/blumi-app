const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"
const EXPO_RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts"
const EXPO_PUSH_TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/
/** Expo accepts at most 1000 receipt ids per getReceipts request. */
const MAX_RECEIPT_IDS_PER_REQUEST = 1000

export interface PushNotification {
  title: string
  body: string
  data?: Record<string, string>
  /** Derived at dispatch from the notification type; never persisted. */
  delivery?: PushDeliveryOptions
}

/** Expo push message fields Blumi sets (docs.expo.dev push message format). */
export interface PushDeliveryOptions {
  priority?: "default" | "normal" | "high"
  /** iOS `apns-collapse-id` (replaces a shown notification); Android in-transit collapse. */
  collapseId?: string
  /** iOS `thread-id`: visual grouping in Notification Center. */
  threadId?: string
  channelId?: string
  /** Unix seconds after which the provider drops an undelivered message. */
  expiration?: number
  ttlSeconds?: number
  /** iOS app icon badge: the recipient's unread message total at dispatch. */
  badge?: number
  /** iOS notification category (its action buttons are registered by the app). */
  categoryId?: string
  /** iOS: run the app's notification service extension before showing it. */
  mutableContent?: boolean
  /** The sender picture link (sent to the phone in data as `senderImage`). */
  imageUrl?: string
}

export interface PushProvider {
  sendPush(pushToken: string, notification: PushNotification, options?: { signal?: AbortSignal }): Promise<void | { ticketId: string }>
  getReceipt?(ticketId: string, options?: { signal?: AbortSignal }): Promise<PushReceipt | null>
  /** Batched receipts; a ticket missing from the map has no receipt yet. */
  getReceipts?(ticketIds: readonly string[], options?: { signal?: AbortSignal }): Promise<Map<string, PushReceipt>>
}

export interface PushReceipt { status: "ok" | "error"; errorCode?: string }

export class PushProviderRejection extends Error {
  constructor(readonly code: string) { super(`Expo push ticket was rejected: ${code}.`) }
}

/** The push service answered with a non-2xx status (429: project rate limit). */
export class PushProviderHttpError extends Error {
  constructor(readonly status: number) { super(`Expo push request failed with status ${status}.`) }
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

  const getReceiptBatch = async (ticketIds: readonly string[], signal?: AbortSignal): Promise<Map<string, PushReceipt>> => {
    const response = await fetcher(EXPO_RECEIPTS_ENDPOINT, {
      method: "POST", signal,
      headers: { "content-type": "application/json", ...(normalizedAccessToken ? { authorization: `Bearer ${normalizedAccessToken}` } : {}) },
      body: JSON.stringify({ ids: ticketIds })
    })
    if (!response.ok) throw new Error("Receipt provider unavailable")
    const payload = await readJsonPayload(response) as { data?: Record<string, unknown> } | null
    const receipts = new Map<string, PushReceipt>()
    for (const ticketId of ticketIds) {
      const receipt = readExpoPushReceipt(payload?.data?.[ticketId])
      if (receipt) receipts.set(ticketId, receipt)
    }
    return receipts
  }

  return {
    async getReceipt(ticketId, options) {
      return (await getReceiptBatch([ticketId], options?.signal)).get(ticketId) ?? null
    },
    async getReceipts(ticketIds, options) {
      const receipts = new Map<string, PushReceipt>()
      for (let start = 0; start < ticketIds.length; start += MAX_RECEIPT_IDS_PER_REQUEST) {
        const batch = await getReceiptBatch(ticketIds.slice(start, start + MAX_RECEIPT_IDS_PER_REQUEST), options?.signal)
        for (const [ticketId, receipt] of batch) receipts.set(ticketId, receipt)
      }
      return receipts
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
          ...(notification.data ? { data: notification.data } : {}),
          ...toExpoDeliveryFields(notification.delivery)
        })
      })
      const payload = await readJsonPayload(response)

      if (!response.ok) {
        throw new PushProviderHttpError(response.status)
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

function toExpoDeliveryFields(delivery: PushDeliveryOptions | undefined): Record<string, unknown> {
  if (!delivery) return {}
  return {
    ...(delivery.priority ? { priority: delivery.priority } : {}),
    // Android shows `tag` replacements; iOS uses collapseId for both.
    ...(delivery.collapseId ? { collapseId: delivery.collapseId, tag: delivery.collapseId } : {}),
    ...(delivery.threadId ? { threadId: delivery.threadId } : {}),
    ...(delivery.channelId ? { channelId: delivery.channelId } : {}),
    ...(delivery.ttlSeconds !== undefined ? { ttl: delivery.ttlSeconds } : {}),
    ...(delivery.expiration !== undefined ? { expiration: delivery.expiration } : {}),
    ...(Number.isSafeInteger(delivery.badge) && delivery.badge! >= 0 ? { badge: delivery.badge! } : {}),
    ...(delivery.categoryId ? { categoryId: delivery.categoryId } : {}),
    // The picture itself travels in data (`senderImage`), where the app's
    // notification service extension reads it.
    ...(delivery.mutableContent ? { mutableContent: true } : {})
  }
}

function readExpoPushReceipt(value: unknown): PushReceipt | null {
  if (!value || typeof value !== "object") return null
  const receipt = value as { status?: unknown; details?: { error?: unknown } }
  if (receipt.status !== "ok" && receipt.status !== "error") throw new Error("Invalid push receipt")
  return { status: receipt.status, ...(typeof receipt.details?.error === "string" ? { errorCode: receipt.details.error } : {}) }
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
