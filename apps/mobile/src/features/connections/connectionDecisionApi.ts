import type {
  ConnectionDecisionRecord,
  ConnectionDecisionStatus,
  ConnectionMatch
} from "@blumi/contracts"

export interface ConnectionDecisionRequest {
  miniRoomId: string
  partnerUserId: string
  status: ConnectionDecisionStatus
}

export interface ConnectionDecisionResponse {
  decision: ConnectionDecisionRecord
  match: ConnectionMatch | null
}

export class ConnectionDecisionApiError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = "ConnectionDecisionApiError"
    this.retryable = retryable
  }
}

export async function submitConnectionDecision(
  baseHttpUrl: string,
  sessionToken: string,
  input: ConnectionDecisionRequest,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ConnectionDecisionResponse> {
  const response = await fetcher(withBaseUrl(baseHttpUrl, "/v1/connections/decision"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(input),
    signal
  })
  const payload: unknown = await readJsonPayload(response)
  if (!response.ok) {
    throw new ConnectionDecisionApiError(
      readApiError(payload, "We could not save that connection choice yet."),
      response.status !== 400 && response.status !== 409
    )
  }
  return normalizeConnectionDecisionResponse(payload)
}

export function isRetryableConnectionDecisionError(error: unknown): boolean {
  return !(error instanceof ConnectionDecisionApiError) || error.retryable
}

export function normalizeConnectionDecisionResponse(payload: unknown): ConnectionDecisionResponse {
  if (!payload || typeof payload !== "object") {
    throw new ConnectionDecisionApiError("Blumi could not read that connection choice.", false)
  }
  const record = payload as { decision?: unknown; match?: unknown }
  return {
    decision: normalizeDecision(record.decision),
    match: normalizeMatch(record.match)
  }
}

function normalizeDecision(value: unknown): ConnectionDecisionRecord {
  if (!value || typeof value !== "object") {
    throw new ConnectionDecisionApiError("Blumi could not read that connection choice.", false)
  }
  const record = value as Partial<ConnectionDecisionRecord>
  if (
    !hasText(record.miniRoomId) ||
    !hasText(record.actorUserId) ||
    !hasText(record.partnerUserId) ||
    !isDecisionStatus(record.status) ||
    !hasDate(record.decidedAt)
  ) {
    throw new ConnectionDecisionApiError("Blumi could not read that connection choice.", false)
  }
  return {
    miniRoomId: record.miniRoomId.trim(),
    actorUserId: record.actorUserId.trim(),
    partnerUserId: record.partnerUserId.trim(),
    status: record.status,
    decidedAt: record.decidedAt
  }
}

function normalizeMatch(value: unknown): ConnectionMatch | null {
  if (value === null) return null
  if (!value || typeof value !== "object") {
    throw new ConnectionDecisionApiError("Blumi could not read that connection choice.", false)
  }
  const record = value as Partial<ConnectionMatch>
  if (
    !hasText(record.miniRoomId) ||
    !Array.isArray(record.participantUserIds) ||
    record.participantUserIds.length !== 2 ||
    !record.participantUserIds.every(hasText) ||
    !hasDate(record.matchedAt)
  ) {
    throw new ConnectionDecisionApiError("Blumi could not read that connection choice.", false)
  }
  return {
    miniRoomId: record.miniRoomId.trim(),
    participantUserIds: [record.participantUserIds[0].trim(), record.participantUserIds[1].trim()],
    matchedAt: record.matchedAt
  }
}

function withBaseUrl(baseHttpUrl: string, path: string): string {
  return `${baseHttpUrl.endsWith("/") ? baseHttpUrl.slice(0, -1) : baseHttpUrl}${path}`
}

async function readJsonPayload(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}))
}

function readApiError(payload: unknown, fallback: string): string {
  return typeof payload === "object" && payload !== null && typeof (payload as { error?: unknown }).error === "string"
    ? (payload as { error: string }).error
    : fallback
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim())
}

function hasDate(value: unknown): value is string {
  return hasText(value) && !Number.isNaN(Date.parse(value))
}

function isDecisionStatus(value: unknown): value is ConnectionDecisionStatus {
  return value === "saved" || value === "passed"
}
