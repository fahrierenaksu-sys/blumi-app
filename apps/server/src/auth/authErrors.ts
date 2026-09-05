export type AuthErrorCode =
  | "TERMS_ACCEPTANCE_REQUIRED"
  | "OTP_SEND_COOLDOWN"
  | "OTP_SEND_LIMIT"
  | "OTP_INVALID_OR_EXPIRED"
  | "OTP_ATTEMPT_LIMIT"
  | "SMS_DELIVERY_UNAVAILABLE"
  | "OTP_STORAGE_UNAVAILABLE"
  | "ACCOUNT_DELETION_REAUTH_REQUIRED"
  | "ACCOUNT_DELETION_CONFIRMATION_INVALID"

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly statusCode: 401 | 409 | 429 | 503
  readonly retryAfterSeconds?: number

  constructor(input: {
    code: AuthErrorCode
    message: string
    statusCode: 401 | 409 | 429 | 503
    retryAfterMs?: number
  }) {
    super(input.message)
    this.name = "AuthError"
    this.code = input.code
    this.statusCode = input.statusCode
    this.retryAfterSeconds = input.retryAfterMs === undefined
      ? undefined
      : Math.max(1, Math.ceil(input.retryAfterMs / 1000))
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError
}
