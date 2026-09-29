import type { ConnectionDecisionStatus } from "@blumi/contracts"

const STORAGE_PREFIX = "@blumi/connectionDecisionOutbox/v1"
const storageLocks = new WeakMap<ConnectionDecisionOutboxStorage, Map<string, Promise<void>>>()
let nextIntentSequence = 0

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
  intentId: string
}

export async function queueConnectionDecision(
  storage: ConnectionDecisionOutboxStorage,
  input: Omit<PendingConnectionDecision, "queuedAt" | "intentId">
): Promise<void> {
  const actorUserId = normalizeId(input.actorUserId)
  const miniRoomId = normalizeId(input.miniRoomId)
  const partnerUserId = normalizeId(input.partnerUserId)
  if (!isDecisionStatus(input.status)) {
    throw new Error("A valid connection decision is required.")
  }
  await withStorageLock(storage, actorUserId, async () => {
    const existing = await readPending(storage, actorUserId)
    const next: PendingConnectionDecision = {
      actorUserId,
      miniRoomId,
      partnerUserId,
      status: input.status,
      queuedAt: new Date().toISOString(),
      intentId: `${Date.now().toString(36)}-${(++nextIntentSequence).toString(36)}`
    }
    const queue = existing.some((item) => item.miniRoomId === miniRoomId)
      ? existing.map((item) => item.miniRoomId === miniRoomId ? next : item)
      : [...existing, next]
    await storage.setItem(storageKey(actorUserId), JSON.stringify(queue))
  })
}

export async function flushPendingConnectionDecisions(
  storage: ConnectionDecisionOutboxStorage,
  actorUserId: string,
  deliver: (intent: PendingConnectionDecision) => Promise<void>,
  shouldRetryFailure: (error: unknown, intent: PendingConnectionDecision) => boolean = () => true
): Promise<{ delivered: number; pending: number; rejectedMiniRoomIds: string[] }> {
  const normalizedActorUserId = normalizeId(actorUserId)
  const queue = await withStorageLock(storage, normalizedActorUserId,
    () => readPending(storage, normalizedActorUserId))
  const completed = new Set<string>()
  const terminal = new Set<string>()
  let delivered = 0
  for (const intent of queue) {
    try {
      await deliver({ ...intent })
      delivered += 1
      completed.add(intent.intentId)
    } catch (error) {
      if (!shouldRetryFailure(error, intent)) {
        terminal.add(intent.intentId)
        completed.add(intent.intentId)
      }
    }
  }
  const result = await withStorageLock(storage, normalizedActorUserId, async () => {
    const current = await readPending(storage, normalizedActorUserId)
    const rejectedMiniRoomIds = current
      .filter((intent) => terminal.has(intent.intentId))
      .map((intent) => intent.miniRoomId)
    const remaining = current.filter((intent) => !completed.has(intent.intentId))
    if (remaining.length === 0) {
      await storage.removeItem(storageKey(normalizedActorUserId))
    } else if (remaining.length !== current.length) {
      await storage.setItem(storageKey(normalizedActorUserId), JSON.stringify(remaining))
    }
    return { pending: remaining.length, rejectedMiniRoomIds }
  })
  return { delivered, ...result }
}

export async function discardPendingConnectionDecision(
  storage: ConnectionDecisionOutboxStorage,
  actorUserId: string,
  miniRoomId: string
): Promise<void> {
  const normalizedActorUserId = normalizeId(actorUserId)
  const normalizedMiniRoomId = normalizeId(miniRoomId)
  await withStorageLock(storage, normalizedActorUserId, async () => {
    const queue = await readPending(storage, normalizedActorUserId)
    const remaining = queue.filter((intent) => intent.miniRoomId !== normalizedMiniRoomId)
    if (remaining.length === queue.length) return
    if (remaining.length === 0) {
      await storage.removeItem(storageKey(normalizedActorUserId))
    } else {
      await storage.setItem(storageKey(normalizedActorUserId), JSON.stringify(remaining))
    }
  })
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
    queuedAt: record.queuedAt,
    intentId: typeof record.intentId === "string" && record.intentId
      ? record.intentId
      : `legacy:${record.miniRoomId}:${record.queuedAt}`
  }
}

async function withStorageLock<T>(
  storage: ConnectionDecisionOutboxStorage,
  actorUserId: string,
  action: () => Promise<T>
): Promise<T> {
  let locks = storageLocks.get(storage)
  if (!locks) {
    locks = new Map()
    storageLocks.set(storage, locks)
  }
  const previous = locks.get(actorUserId)
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  locks.set(actorUserId, current)
  if (previous) await previous
  try {
    return await action()
  } finally {
    if (locks.get(actorUserId) === current) locks.delete(actorUserId)
    release()
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
