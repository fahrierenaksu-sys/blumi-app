import { createHmac, timingSafeEqual } from "node:crypto"
import { findCoinPack } from "@blumi/domain"
import { matchesPurchaseEnvironment, type PurchaseEnvironment } from "./purchaseEnvironment"

const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export type RevenueCatStore = "ios" | "android"
export type RevenueCatWebhookTransactionKind = "credit" | "reversal"

export interface RevenueCatWebhookEvent {
  eventId: string
  userId: string
  userIdCandidates: readonly string[]
  transactionId: string
  productId: string
  store: RevenueCatStore
  kind: RevenueCatWebhookTransactionKind
  occurredAt: string
}

export function verifyRevenueCatWebhookSignature(input: {
  rawBody: Buffer
  signatureHeader: string | undefined
  secret: string
  now?: Date
  toleranceSeconds?: number
}): boolean {
  if (!input.secret) return false
  const parsed = parseSignatureHeader(input.signatureHeader)
  if (!parsed) return false

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  const toleranceSeconds = input.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS
  if (!Number.isSafeInteger(nowSeconds) || Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return false
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${parsed.timestamp}.`)
    .update(input.rawBody)
    .digest()
  const received = Buffer.from(parsed.signature, "hex")
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function parseRevenueCatWebhookEvent(
  payload: unknown,
  purchaseEnvironment: PurchaseEnvironment = "production"
): RevenueCatWebhookEvent | null {
  const root = isRecord(payload) ? payload : null
  const event = root && isRecord(root.event) ? root.event : null
  if (!event) return null
  if (!matchesPurchaseEnvironment(event.environment, purchaseEnvironment)) return null

  const eventId = readNonEmptyString(event.id)
  const userIdCandidates = readUserIdCandidates(event)
  const userId = userIdCandidates[0]
  const transactionId = readNonEmptyString(event.transaction_id)
  const productId = readNonEmptyString(event.product_id)
  const store = parseStore(event.store)
  const kind = parseTransactionKind(event.type)
  const eventTimestamp = event.event_timestamp_ms
  if (
    !eventId ||
    !userId ||
    !transactionId ||
    !productId ||
    !store ||
    !kind ||
    !findCoinPack(productId) ||
    typeof eventTimestamp !== "number" ||
    !Number.isSafeInteger(eventTimestamp)
  ) {
    return null
  }
  const occurredAt = new Date(eventTimestamp)
  if (!Number.isFinite(occurredAt.getTime())) return null

  return {
    eventId,
    userId,
    userIdCandidates,
    transactionId,
    productId,
    store,
    kind,
    occurredAt: occurredAt.toISOString()
  }
}

function readUserIdCandidates(event: Record<string, unknown>): string[] {
  const aliases = Array.isArray(event.aliases) ? event.aliases : []
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...aliases
  ].map(readNonEmptyString)
  return candidates.reduce<string[]>((uniqueCandidates, candidate) => {
    if (!candidate || uniqueCandidates.includes(candidate)) return uniqueCandidates
    return uniqueCandidates.length < 20
      ? [...uniqueCandidates, candidate]
      : uniqueCandidates
  }, [])
}

function parseSignatureHeader(
  header: string | undefined
): { timestamp: number; signature: string } | null {
  if (!header) return null
  const values = new Map<string, string>()
  for (const segment of header.split(",")) {
    const separator = segment.indexOf("=")
    if (separator <= 0) return null
    const key = segment.slice(0, separator).trim()
    const value = segment.slice(separator + 1).trim()
    if (!key || !value || values.has(key)) return null
    values.set(key, value)
  }
  const timestampValue = values.get("t")
  const signature = values.get("v1")
  if (!timestampValue || !signature || !/^\d{10,13}$/.test(timestampValue) || !/^[0-9a-f]{64}$/i.test(signature)) {
    return null
  }
  const timestamp = Number(timestampValue)
  return Number.isSafeInteger(timestamp) ? { timestamp, signature } : null
}

function parseStore(value: unknown): RevenueCatStore | null {
  if (value === "APP_STORE") return "ios"
  if (value === "PLAY_STORE") return "android"
  return null
}

function parseTransactionKind(
  value: unknown
): RevenueCatWebhookTransactionKind | null {
  if (value === "NON_RENEWING_PURCHASE" || value === "INITIAL_PURCHASE") {
    return "credit"
  }
  if (value === "CANCELLATION") return "reversal"
  return null
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= 255 ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
