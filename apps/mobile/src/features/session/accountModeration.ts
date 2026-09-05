export type AccountModerationStatus = "active" | "warned" | "suspended" | "banned"

export interface AccountModerationState {
  status: AccountModerationStatus
  updatedAt: string
  suspendedUntil?: string
}

export function normalizeAccountModeration(
  value: unknown
): AccountModerationState | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (
    !isAccountModerationStatus(record.status) ||
    typeof record.updatedAt !== "string" ||
    !isIsoDate(record.updatedAt)
  ) {
    return null
  }

  if (record.status !== "suspended" && record.suspendedUntil !== undefined) {
    return null
  }
  if (
    record.suspendedUntil !== undefined &&
    (typeof record.suspendedUntil !== "string" || !isIsoDate(record.suspendedUntil))
  ) {
    return null
  }

  return {
    status: record.status,
    updatedAt: record.updatedAt,
    ...(typeof record.suspendedUntil === "string"
      ? { suspendedUntil: record.suspendedUntil }
      : {})
  }
}

export function needsModerationInterruption(
  moderation: AccountModerationState | null | undefined
): moderation is AccountModerationState {
  return moderation?.status === "warned" ||
    moderation?.status === "suspended" ||
    moderation?.status === "banned"
}

function isAccountModerationStatus(value: unknown): value is AccountModerationStatus {
  return value === "active" ||
    value === "warned" ||
    value === "suspended" ||
    value === "banned"
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}
