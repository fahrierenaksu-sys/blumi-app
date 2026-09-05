import type { ReportReason } from "@blumi/contracts"

export interface SafetyBlockRecord {
  actorUserId: string
  blockedUserId: string
  createdAt: string
  blockedProfile?: BlockedProfileSummary
}

export interface BlockedProfileSummary {
  userId: string
  displayName: string
  avatarPresetId?: string
}

export interface SafetyReportRecord {
  reportId: string
  actorUserId: string
  reportedUserId: string
  reason: ReportReason
  note?: string
  createdAt: string
}

export interface SafetyReportInput {
  reportedUserId: string
  reason: ReportReason
  note?: string
  /**
   * One stable client-generated key per visible report attempt. It is sent as
   * an HTTP header, never included in the report body.
   */
  idempotencyKey: string
}

function withBaseUrl(baseHttpUrl: string, path: string): string {
  const trimmed = baseHttpUrl.endsWith("/") ? baseHttpUrl.slice(0, -1) : baseHttpUrl
  return `${trimmed}${path}`
}

export async function fetchSafetyBlocks(
  baseHttpUrl: string,
  sessionToken: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SafetyBlockRecord[]> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/safety/blocks"), {
    headers: createAuthHeaders(sessionToken),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "We could not refresh hidden people yet."))
  }

  return normalizeBlocksPayload(payload)
}

export async function blockSafetyUser(
  baseHttpUrl: string,
  sessionToken: string,
  blockedUserId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SafetyBlockRecord> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/safety/blocks"), {
    method: "POST",
    headers: {
      ...createAuthHeaders(sessionToken),
      "content-type": "application/json"
    },
    body: JSON.stringify({ blockedUserId }),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That person could not be hidden."))
  }

  return normalizeBlockPayload(payload)
}

export async function unblockSafetyUser(
  baseHttpUrl: string,
  sessionToken: string,
  blockedUserId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetcher(
    withBaseUrl(baseHttpUrl, `/v1/safety/blocks/${encodeURIComponent(blockedUserId)}`),
    {
      method: "DELETE",
      headers: createAuthHeaders(sessionToken),
      signal
    }
  )

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}))
    throw new Error(getApiErrorMessage(payload, "That person could not be shown again."))
  }
}

export async function reportSafetyUser(
  baseHttpUrl: string,
  sessionToken: string,
  input: SafetyReportInput,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<{ report: SafetyReportRecord; block: SafetyBlockRecord }> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/safety/reports"), {
    method: "POST",
    headers: {
      ...createAuthHeaders(sessionToken),
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey
    },
    body: JSON.stringify({
      reportedUserId: input.reportedUserId,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {})
    }),
    signal
  })
  const payload: unknown = await response.json()

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "That report could not be sent."))
  }

  return normalizeReportPayload(payload)
}

export function normalizeBlocksPayload(payload: unknown): SafetyBlockRecord[] {
  const blocks = (payload as { blocks?: unknown } | null)?.blocks
  if (!Array.isArray(blocks)) {
    throw new Error("Blumi could not read hidden people.")
  }
  return blocks.map(normalizeBlockRecord)
}

function normalizeBlockPayload(payload: unknown): SafetyBlockRecord {
  return normalizeBlockRecord((payload as { block?: unknown } | null)?.block)
}

function normalizeReportPayload(
  payload: unknown
): { report: SafetyReportRecord; block: SafetyBlockRecord } {
  if (!payload || typeof payload !== "object") {
    throw new Error("Blumi could not read that safety response.")
  }
  const record = payload as { report?: unknown; block?: unknown }
  return {
    report: normalizeReportRecord(record.report),
    block: normalizeBlockRecord(record.block)
  }
}

function normalizeBlockRecord(value: unknown): SafetyBlockRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Blumi could not read one hidden person.")
  }
  const record = value as Partial<SafetyBlockRecord>
  if (
    typeof record.actorUserId !== "string" ||
    typeof record.blockedUserId !== "string" ||
    typeof record.createdAt !== "string"
  ) {
    throw new Error("Blumi could not read one hidden person.")
  }
  const blockedProfile = normalizeBlockedProfile(record.blockedProfile, record.blockedUserId)
  return {
    actorUserId: record.actorUserId,
    blockedUserId: record.blockedUserId,
    createdAt: record.createdAt,
    ...(blockedProfile ? { blockedProfile } : {})
  }
}

function normalizeBlockedProfile(
  value: unknown,
  blockedUserId: string
): BlockedProfileSummary | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<BlockedProfileSummary>
  if (
    record.userId !== blockedUserId ||
    typeof record.displayName !== "string" ||
    !record.displayName.trim() ||
    (record.avatarPresetId !== undefined && typeof record.avatarPresetId !== "string")
  ) {
    return null
  }
  return {
    userId: record.userId,
    displayName: record.displayName.trim(),
    ...(typeof record.avatarPresetId === "string" && record.avatarPresetId.trim()
      ? { avatarPresetId: record.avatarPresetId }
      : {})
  }
}

function normalizeReportRecord(value: unknown): SafetyReportRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Blumi could not read that report.")
  }
  const record = value as Partial<SafetyReportRecord>
  if (
    typeof record.reportId !== "string" ||
    typeof record.actorUserId !== "string" ||
    typeof record.reportedUserId !== "string" ||
    !isReportReason(record.reason) ||
    typeof record.createdAt !== "string" ||
    (record.note !== undefined && typeof record.note !== "string")
  ) {
    throw new Error("Blumi could not read that report.")
  }
  return {
    reportId: record.reportId,
    actorUserId: record.actorUserId,
    reportedUserId: record.reportedUserId,
    reason: record.reason,
    ...(record.note ? { note: record.note } : {}),
    createdAt: record.createdAt
  }
}

function isReportReason(value: unknown): value is ReportReason {
  return (
    value === "spam" ||
    value === "harassment" ||
    value === "fake_profile" ||
    value === "fake_or_bot" ||
    value === "inappropriate" ||
    value === "underage" ||
    value === "other"
  )
}

function createAuthHeaders(sessionToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${sessionToken}`
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
