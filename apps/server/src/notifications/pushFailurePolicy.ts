/**
 * What an Expo push error code means for the delivery and for operations.
 * Codes are Expo's documented ticket/receipt `details.error` values
 * (docs.expo.dev push notifications, "Individual errors"); everything else is
 * treated as transient and keeps the outbox's ordinary bounded retry.
 */
export type PushFailureClass =
  | "device_unregistered"
  | "configuration"
  | "payload"
  | "rate_limited"
  | "transient"

/** Codes that are safe to log: provider vocabulary, never ids, tokens or text. */
export const SAFE_PUSH_ERROR_CODES = [
  "DeviceNotRegistered",
  "MessageTooBig",
  "MessageRateExceeded",
  "MismatchSenderId",
  "InvalidCredentials"
] as const

export function safePushErrorCode(code: string): string {
  return (SAFE_PUSH_ERROR_CODES as readonly string[]).includes(code) ? code : "provider_receipt_error"
}

export function classifyPushFailure(code: string): PushFailureClass {
  switch (code) {
    case "DeviceNotRegistered": return "device_unregistered"
    // Missing or wrong APNs key / FCM credentials in EAS: every push fails
    // until the owner fixes the credentials, so retrying the same message is noise.
    case "InvalidCredentials":
    case "MismatchSenderId": return "configuration"
    case "MessageTooBig": return "payload"
    case "MessageRateExceeded":
    case "provider_rate_limited": return "rate_limited"
    default: return "transient"
  }
}

/** Configuration and payload rejections need a person; they are logged as errors. */
export function isOperationalPushFailure(code: string): boolean {
  const kind = classifyPushFailure(code)
  return kind === "configuration" || kind === "payload"
}

export type TicketFailureAction =
  | { action: "unregister" }
  | { action: "fail" }
  | { action: "retry"; delayMs: number }
  | { action: "default" }

/** Expo asks for a slow exponential backoff when a device (or the project) is rate limited. */
const RATE_LIMIT_BASE_DELAY_MS = 30_000
const RATE_LIMIT_MAX_DELAY_MS = 5 * 60_000

/**
 * The outbox's answer to a rejected send while it still holds the delivery.
 * `default` keeps the existing short exponential retry and attempt cap.
 */
export function resolveTicketFailure(code: string, attempt: number, maxAttempts: number): TicketFailureAction {
  switch (classifyPushFailure(code)) {
    case "device_unregistered": return { action: "unregister" }
    case "configuration":
    case "payload": return { action: "fail" }
    case "rate_limited":
      return attempt >= maxAttempts
        ? { action: "fail" }
        : { action: "retry", delayMs: Math.min(RATE_LIMIT_MAX_DELAY_MS, RATE_LIMIT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1)) }
    default: return { action: "default" }
  }
}

export interface PushFailureLogger {
  warn(message: string, details: unknown): void
  error(message: string, details: unknown): void
}

/** Default diagnostics sink: allowlisted fields only, operational codes as errors. */
export function logPushFailure(
  failure: { stage: string; errorCode: string; notificationType: string; attempt: number; count: number },
  logger: PushFailureLogger = console
): void {
  if (isOperationalPushFailure(failure.errorCode)) {
    logger.error("Push provider rejected Blumi's push configuration", failure)
    return
  }
  logger.warn("Push provider failure", failure)
}
