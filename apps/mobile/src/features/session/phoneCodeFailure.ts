/**
 * Release-safe diagnostics for the SMS request path. A failed request shows a
 * short code such as "E-APPCHECK-TOKEN" so a phone screenshot names the failed
 * step. Codes never carry tokens, phone numbers, IDs or native messages.
 */
export type PhoneCodeStage = "APPCHECK" | "PERMIT" | "FIREBASE"

type PhoneCodeError = Error & { phoneCodeDetail: string }

const DETAIL_PATTERN = /^[A-Za-z0-9-]{1,40}$/
const FIREBASE_AUTH_PREFIX = "auth/"

/** Creates a user-facing error that also names its failed sub-step. */
export function phoneCodeError(message: string, detail: string): PhoneCodeError {
  return Object.assign(new Error(message), { phoneCodeDetail: detail })
}

export function isPhoneCodeError(error: unknown): error is PhoneCodeError {
  return error instanceof Error && typeof (error as Partial<PhoneCodeError>).phoneCodeDetail === "string"
}

function readFirebaseAuthCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null
  const code = (error as { code?: unknown }).code
  if (typeof code !== "string") return null
  return code.startsWith(FIREBASE_AUTH_PREFIX) ? code.slice(FIREBASE_AUTH_PREFIX.length) : code
}

function readDetail(stage: PhoneCodeStage, error: unknown): string | null {
  if (isPhoneCodeError(error)) return error.phoneCodeDetail
  return stage === "FIREBASE" ? readFirebaseAuthCode(error) : null
}

/** Returns e.g. "E-PERMIT-GATE403" or "E-FIREBASE-too-many-requests". */
export function describePhoneCodeFailure(stage: PhoneCodeStage, error: unknown): string {
  const detail = readDetail(stage, error)
  return detail && DETAIL_PATTERN.test(detail) ? `E-${stage}-${detail}` : `E-${stage}`
}
