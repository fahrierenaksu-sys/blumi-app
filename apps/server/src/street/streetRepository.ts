import type { StreetLookKind, StreetRoomKind } from "./streetDigest"

/** One account's street row. A missing row means an open window and no change. */
export interface StreetDigestRecord {
  readonly userId: string
  readonly windowClosed: boolean
  readonly lookKind: StreetLookKind | null
  readonly lookChangedAt: Date | null
  readonly roomKind: StreetRoomKind | null
  readonly roomChangedAt: Date | null
}

export interface StreetRepository {
  /** Rows for the given accounts in one read; accounts without a row are absent. */
  readMany(userIds: readonly string[]): Promise<ReadonlyMap<string, StreetDigestRecord>>
  recordLookChange(userId: string, kind: StreetLookKind, at: Date): Promise<void>
  recordRoomChange(userId: string, kind: StreetRoomKind, at: Date, revision: number): Promise<void>
  setWindowClosed(userId: string, closed: boolean): Promise<void>
  /** In-memory account deletion; PostgreSQL removes the row through its foreign key. */
  deleteForUser(userId: string): Promise<void>
}

const EMPTY_RECORD = Object.freeze({
  windowClosed: false,
  lookKind: null,
  lookChangedAt: null,
  roomKind: null,
  roomChangedAt: null
})

export function createInMemoryStreetRepository(): StreetRepository {
  let rows = new Map<string, StreetDigestRecord>()

  function upsert(userId: string, patch: Partial<Omit<StreetDigestRecord, "userId">>): void {
    const current = rows.get(userId) ?? { userId, ...EMPTY_RECORD }
    const next = new Map(rows)
    next.set(userId, Object.freeze({ ...current, ...patch }))
    rows = next
  }

  return Object.freeze({
    async readMany(userIds: readonly string[]) {
      const found = new Map<string, StreetDigestRecord>()
      for (const userId of userIds) {
        const row = rows.get(userId)
        if (row) found.set(userId, row)
      }
      return found
    },
    async recordLookChange(userId: string, kind: StreetLookKind, at: Date) {
      upsert(userId, { lookKind: kind, lookChangedAt: new Date(at.getTime()) })
    },
    async recordRoomChange(userId: string, kind: StreetRoomKind, at: Date) {
      upsert(userId, { roomKind: kind, roomChangedAt: new Date(at.getTime()) })
    },
    async setWindowClosed(userId: string, closed: boolean) {
      upsert(userId, { windowClosed: closed })
    },
    async deleteForUser(userId: string) {
      const next = new Map(rows)
      next.delete(userId)
      rows = next
    }
  })
}
