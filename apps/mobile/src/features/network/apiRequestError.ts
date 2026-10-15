/**
 * Typed failure of an HTTP request to the Blumi API. Callers decide by
 * `code` and `retryable`, never by the English message text, so a proxy or
 * gateway body without our `{ error }` shape cannot read as a sign-out.
 */
export type ApiRequestErrorCode =
  | "session_invalid"
  | "rate_limited"
  | "server_unavailable"
  | "conflict"
  | "request_rejected"

export const SESSION_INVALID_STATUS = 401
const CONFLICT_STATUS = 409
const RATE_LIMITED_STATUS = 429
const FIRST_SERVER_ERROR_STATUS = 500

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: ApiRequestErrorCode
  readonly retryable: boolean

  constructor(input: {
    status: number
    code: ApiRequestErrorCode
    message: string
  }) {
    super(input.message)
    this.name = "ApiRequestError"
    this.status = input.status
    this.code = input.code
    this.retryable =
      input.code === "rate_limited" || input.code === "server_unavailable"
  }
}

function readPayloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : null
}

/**
 * Only a readable 401 from the Blumi API with no domain-specific `code` (our
 * server answers a missing, expired or revoked session that way) proves the
 * session is invalid. An unreadable 401 body did not come from our server.
 */
function isVerifiedSessionInvalid(status: number, payload: unknown): boolean {
  if (status !== SESSION_INVALID_STATUS) return false
  const record = readPayloadRecord(payload)
  return record !== null && record.code === undefined
}

export function classifyApiFailure(
  status: number,
  payload: unknown
): ApiRequestErrorCode {
  if (isVerifiedSessionInvalid(status, payload)) return "session_invalid"
  if (status === RATE_LIMITED_STATUS) return "rate_limited"
  if (status >= FIRST_SERVER_ERROR_STATUS) return "server_unavailable"
  if (status === CONFLICT_STATUS) return "conflict"
  return "request_rejected"
}

export function readApiErrorMessage(payload: unknown): string | null {
  const record = readPayloadRecord(payload)
  return typeof record?.error === "string" ? record.error : null
}

export function createApiRequestError(
  status: number,
  payload: unknown,
  fallbackMessage: string
): ApiRequestError {
  return new ApiRequestError({
    status,
    code: classifyApiFailure(status, payload),
    message: readApiErrorMessage(payload) ?? fallbackMessage
  })
}

export function isSessionInvalidError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "session_invalid"
}

/**
 * A failure after which the same request may succeed: rate limits, server
 * errors, timeouts and transport errors. Cancellation is not retryable.
 */
export function isRetryableRequestFailure(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.retryable
  if (!(error instanceof Error)) return false
  return error.name === "TimeoutError" || error.name === "TypeError"
}
