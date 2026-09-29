import type { CompleteAvatarSelection } from "@blumi/contracts"
import { cloneCompleteAvatarSelection } from "../avatar/avatarSelectionPersistence"

export interface PresenceRecord {
  roomId: string
  userId: string
  displayName: string
  avatar: CompleteAvatarSelection
  spotId: string
  inMiniRoom: boolean
  joinedAt: string
  updatedAt: string
  expiresAt: string
}

export type MovePresenceResult = "moved" | "occupied" | "missing"

export interface RealtimeConnectionLease {
  connectionId: string
  userId: string
  expiresAt: number
}

export interface PresenceRepository {
  listRoomPresence(roomId: string, now?: Date): Promise<PresenceRecord[]>
  findUserPresence(
    roomId: string,
    userId: string,
    now?: Date
  ): Promise<PresenceRecord | null>
  findUserPresenceAcrossRooms(
    userId: string,
    now?: Date
  ): Promise<PresenceRecord | null>
  savePresence(record: PresenceRecord): Promise<void>
  trySavePresence(record: PresenceRecord, now?: Date): Promise<boolean>
  tryMovePresence(
    record: Pick<PresenceRecord, "roomId" | "userId" | "spotId" | "updatedAt" | "expiresAt">,
    now?: Date
  ): Promise<MovePresenceResult>
  deletePresence(roomId: string, userId: string): Promise<void>
  deleteUserPresence(userId: string): Promise<void>
  registerConnectionLease(connectionId: string, userId: string, leaseMs: number): Promise<void>
  heartbeatConnectionLease(connectionId: string, userId: string, leaseMs: number): Promise<boolean>
  disconnectConnectionLease(connectionId: string, userId: string): Promise<string[]>
  purgeExpiredConnectionLeases(limit: number): Promise<number>
  updateMiniRoomStatus(userIds: readonly string[], inMiniRoom: boolean): Promise<void>
}

export interface InMemoryPresenceStore {
  records: Map<string, PresenceRecord>
  connectionLeases: Map<string, RealtimeConnectionLease>
}

export interface InMemoryPresenceRepositoryOptions {
  resolveAvatarSelection?: (
    userId: string
  ) => Promise<CompleteAvatarSelection | null>
}

export function createInMemoryPresenceStore(): InMemoryPresenceStore {
  return {
    records: new Map(),
    connectionLeases: new Map()
  }
}

export function createInMemoryPresenceRepository(
  store: InMemoryPresenceStore = createInMemoryPresenceStore(),
  options: InMemoryPresenceRepositoryOptions = {}
): PresenceRepository {
  return {
    async listRoomPresence(roomId, now = new Date()) {
      deleteExpiredRecords(store, now)
      const records = [...store.records.values()].filter(
        (record) => record.roomId === roomId
      )
      const hydrated = await Promise.all(
        records.map((record) => hydratePresence(record, options))
      )
      return hydrated.filter(isPresenceRecord)
    },
    async findUserPresence(roomId, userId, now = new Date()) {
      deleteExpiredRecords(store, now)
      const record = store.records.get(presenceKey(roomId, userId))
      return record ? hydratePresence(record, options) : null
    },
    async findUserPresenceAcrossRooms(userId, now = new Date()) {
      deleteExpiredRecords(store, now)
      const record =
        [...store.records.values()].find((entry) => entry.userId === userId) ??
        null
      return record ? hydratePresence(record, options) : null
    },
    async savePresence(record) {
      if (!(await trySavePresenceInMemory(store, record, new Date()))) {
        throw new Error("That spot is not available.")
      }
    },
    async trySavePresence(record, now = new Date()) {
      return trySavePresenceInMemory(store, record, now)
    },
    async tryMovePresence(record, now = new Date()) {
      deleteExpiredRecords(store, now)
      const key = presenceKey(record.roomId, record.userId)
      const current = store.records.get(key)
      if (!current) return "missing"
      const occupied = [...store.records.values()].some((candidate) =>
        candidate.roomId === record.roomId &&
        candidate.userId !== record.userId &&
        candidate.spotId === record.spotId
      )
      if (occupied) return "occupied"
      store.records.set(key, clonePresence({
        ...current,
        spotId: record.spotId,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt
      }))
      return "moved"
    },
    async deletePresence(roomId, userId) {
      store.records.delete(presenceKey(roomId, userId))
    },
    async deleteUserPresence(userId) {
      for (const [key, record] of store.records.entries()) {
        if (record.userId === userId) {
          store.records.delete(key)
        }
      }
    },
    async registerConnectionLease(connectionId, userId, leaseMs) {
      const current = store.connectionLeases.get(connectionId)
      if (current && current.userId !== userId) {
        throw new Error("Realtime connection ID is already assigned.")
      }
      store.connectionLeases.set(connectionId, {
        connectionId,
        userId,
        expiresAt: Date.now() + validateConnectionLeaseMs(leaseMs)
      })
    },
    async heartbeatConnectionLease(connectionId, userId, leaseMs) {
      const current = store.connectionLeases.get(connectionId)
      if (!current || current.userId !== userId) return false
      store.connectionLeases.set(connectionId, {
        ...current,
        expiresAt: Date.now() + validateConnectionLeaseMs(leaseMs)
      })
      return true
    },
    async disconnectConnectionLease(connectionId, userId) {
      const current = store.connectionLeases.get(connectionId)
      if (!current || current.userId !== userId) return []
      store.connectionLeases.delete(connectionId)
      const now = Date.now()
      deleteExpiredConnectionLeases(store, now, userId)
      const hasLiveConnection = [...store.connectionLeases.values()].some(
        (lease) => lease.userId === userId && lease.expiresAt > now
      )
      if (hasLiveConnection) return []

      const roomIds = new Set<string>()
      for (const [key, record] of store.records.entries()) {
        if (record.userId === userId) {
          roomIds.add(record.roomId)
          store.records.delete(key)
        }
      }
      return [...roomIds]
    },
    async purgeExpiredConnectionLeases(limit) {
      const maximum = validateConnectionLeasePurgeLimit(limit)
      const now = Date.now()
      let removed = 0
      for (const [connectionId, lease] of store.connectionLeases.entries()) {
        if (lease.expiresAt <= now && removed < maximum) {
          store.connectionLeases.delete(connectionId)
          removed += 1
        }
      }
      return removed
    },
    async updateMiniRoomStatus(userIds, inMiniRoom) {
      const userIdSet = new Set(userIds)
      for (const [key, record] of store.records.entries()) {
        if (userIdSet.has(record.userId)) {
          store.records.set(key, {
            ...record,
            avatar: cloneCompleteAvatarSelection(record.avatar),
            inMiniRoom
          })
        }
      }
    }
  }
}

async function hydratePresence(
  record: PresenceRecord,
  options: InMemoryPresenceRepositoryOptions
): Promise<PresenceRecord | null> {
  if (!options.resolveAvatarSelection) return clonePresence(record)
  const canonicalAvatar = await options.resolveAvatarSelection(record.userId)
  if (!canonicalAvatar) return null
  return {
    ...record,
    avatar: cloneCompleteAvatarSelection(canonicalAvatar)
  }
}

function isPresenceRecord(
  record: PresenceRecord | null
): record is PresenceRecord {
  return record !== null
}

export function clonePresence(record: PresenceRecord): PresenceRecord {
  return {
    ...record,
    avatar: cloneCompleteAvatarSelection(record.avatar)
  }
}

function presenceKey(roomId: string, userId: string): string {
  return `${roomId}:${userId}`
}

function deleteExpiredRecords(store: InMemoryPresenceStore, now: Date): void {
  const nowMs = now.getTime()
  for (const [key, record] of store.records.entries()) {
    if (Date.parse(record.expiresAt) <= nowMs) {
      store.records.delete(key)
    }
  }
}

function trySavePresenceInMemory(
  store: InMemoryPresenceStore,
  record: PresenceRecord,
  now: Date
): boolean {
  deleteExpiredRecords(store, now)
  const occupied = [...store.records.values()].some((current) =>
    current.roomId === record.roomId &&
    current.userId !== record.userId &&
    current.spotId === record.spotId
  )
  if (occupied) return false
  const key = presenceKey(record.roomId, record.userId)
  const current = store.records.get(key)
  store.records.set(key, clonePresence({
    ...record,
    inMiniRoom: current?.inMiniRoom ?? false
  }))
  return true
}

function deleteExpiredConnectionLeases(
  store: InMemoryPresenceStore,
  now: number,
  userId?: string
): void {
  for (const [connectionId, lease] of store.connectionLeases.entries()) {
    if (lease.expiresAt <= now && (!userId || lease.userId === userId)) {
      store.connectionLeases.delete(connectionId)
    }
  }
}

function validateConnectionLeaseMs(leaseMs: number): number {
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
    throw new Error("Realtime connection lease duration is invalid.")
  }
  return leaseMs
}

function validateConnectionLeasePurgeLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error("Realtime connection lease purge limit is invalid.")
  }
  return limit
}
