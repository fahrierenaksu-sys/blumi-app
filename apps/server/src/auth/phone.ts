export interface NormalizedPhoneNumber {
  e164: string
}

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/

export function normalizePhoneNumber(value: unknown): NormalizedPhoneNumber | null {
  if (typeof value !== "string") return null

  const trimmed = value.replace(/[\s()-]/g, "")
  if (!E164_PHONE_PATTERN.test(trimmed)) return null

  return { e164: trimmed }
}

export function normalizeVerificationCode(value: unknown): string | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  if (!/^\d{6}$/.test(trimmed)) return null

  return trimmed
}
