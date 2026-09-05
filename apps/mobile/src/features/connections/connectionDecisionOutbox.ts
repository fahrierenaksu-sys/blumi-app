import type { ConnectionDecisionStatus } from "@blumi/contracts"

const STORAGE_PREFIX = "@blumi/connectionDecisionOutbox/v1"

export interface ConnectionDecisionOutboxStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

export interface PendingConnectionDecision {
  actorUserId: string
  miniRoomId: string
  partnerUserId: string
  status: ConnectionDecisionStatus
  queuedAt: string
}

export async function queueConnectionDecision(
  storage: ConnectionDecisionOutboxStorage,
  input: Omit<PendingConnectionDecision, "queuedAt">
): Promise<void> {
  const actorUserId = normalizeId(input.actorUserId)
  const miniRoomId = normalizeId(input.miniRoomId)
  const partnerUserId = normalizeId(input.partnerUserId)
  if (!isDecisionStatus(input.status)) {
    throw new Error("A valid connection decision is required.")
  }
  const existing = await readPending(storage, actorUserId)
  const next: PendingConnectionDecision = {
    actorUserId,
    miniRoomId,
    partnerUserId,
    status: input.status,
    queuedAt: new Date().toISOString()
  }
  const queue = existing.some((item) => item.miniRoomId === miniRoomId)
    ? existing.map((item) => item.miniRoomId === miniRoomId ? next : item)
    : [...existing, next]
  await storage.setItem(storageKey(actorUserId), JSON.stringify(queue))
}

export async function flushPendingConnectionDecisions(
  storage: ConnectionDecisionOutboxStorage,
  actorUserId: string,
  deliver: (intent: PendingConnectionDecision) => Promise<void>,
  shouldRetryFailure: (error: unknown, intent: PendingConnectionDecision) => boolean = () => true
): Promise<{ delivered: number; pending: number; rejectedMiniRoomIds: string[] }> {
  const normalizedActorUserId = normalizeId(actorUserId)
  const queue = await readPending(storage, normalizedActorUserId)
  const remaining: PendingConnectionDecision[] = []
  let delivered = 0
  const rejectedMiniRoomIds: string[] = []
  for (const intent of queue) {
    try {
      await deliver({ ...intent })
      delivered += 1
    } catch (error) {
      if (shouldRetryFailure(error, intent)) {
        remaining.push(intent)
      } else {
        rejectedMiniRoomIds.push(intent.miniRoomId)
      }
    }
  }
  if (remaining.length === 0) {
    await storage.removeItem(storageKey(normalizedActorUserId))
  } else {
    await storage.setItem(storageKey(normalizedActorUserId), JSON.stringify(remaining))
  }
  return { delivered, pending: remaining.length, rejectedMiniRoomIds }
}

export async function discardPendingConnectionDecision(
  storage: ConnectionDecisionOutboxStorage,
  actorUserId: string,
  miniRoomId: string
): Promise<void> {
  const normalizedActorUserId = normalizeId(actorUserId)
  const normalizedMiniRoomId = normalizeId(miniRoomId)
  const queue = await readPending(storage, normalizedActorUserId)
  const remaining = queue.filter((intent) => intent.miniRoomId !== normalizedMiniRoomId)
  if (remaining.length === queue.length) return
  if (remaining.length === 0) {
    await storage.removeItem(storageKey(normalizedActorUserId))
    return
  }
  await storage.setItem(storageKey(normalizedActorUserId), JSON.stringify(remaining))
}

async function readPending(
  storage: ConnectionDecisionOutboxStorage,
  actorUserId: string
): Promise<PendingConnectionDecision[]> {
  const raw = await storage.getItem(storageKey(actorUserId))
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value) => normalizePending(value, actorUserId) ?? [])
  } catch {
    return []
  }
}

function normalizePending(value: unknown, actorUserId: string): PendingConnectionDecision | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<PendingConnectionDecision>
  if (
    record.actorUserId !== actorUserId ||
    typeof record.miniRoomId !== "string" ||
    !record.miniRoomId.trim() ||
    typeof record.partnerUserId !== "string" ||
    !record.partnerUserId.trim() ||
    !isDecisionStatus(record.status) ||
    typeof record.queuedAt !== "string" ||
    Number.isNaN(Date.parse(record.queuedAt))
  ) return null
  return {
    actorUserId,
    miniRoomId: record.miniRoomId.trim(),
    partnerUserId: record.partnerUserId.trim(),
    status: record.status,
    queuedAt: record.queuedAt
  }
}

function storageKey(actorUserId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(actorUserId)}`
}

function normalizeId(value: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error("A connection decision owner is required.")
  return normalized
}

function isDecisionStatus(value: unknown): value is ConnectionDecisionStatus {
  return value === "saved" || value === "passed"
}
