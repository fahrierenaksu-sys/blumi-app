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
  updateUserAvatarSelection(
    userId: string,
    selection: CompleteAvatarSelection,
    now?: Date
  ): Promise<void>
  deletePresence(roomId: string, userId: string): Promise<void>
  deleteUserPresence(userId: string): Promise<void>
  updateMiniRoomStatus(userIds: readonly string[], inMiniRoom: boolean): Promise<void>
}

export interface InMemoryPresenceStore {
  records: Map<string, PresenceRecord>
}

export interface InMemoryPresenceRepositoryOptions {
  resolveAvatarSelection?: (
    userId: string
  ) => Promise<CompleteAvatarSelection | null>
}

export function createInMemoryPresenceStore(): InMemoryPresenceStore {
  return {
    records: new Map()
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
      store.records.set(presenceKey(record.roomId, record.userId), clonePresence(record))
    },
    async updateUserAvatarSelection(userId, selection, now = new Date()) {
      deleteExpiredRecords(store, now)
      for (const [key, record] of store.records.entries()) {
        if (
          record.userId === userId &&
          record.avatar.revision < selection.revision
        ) {
          store.records.set(key, {
            ...record,
            avatar: cloneCompleteAvatarSelection(selection),
            updatedAt: now.toISOString()
          })
        }
      }
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
