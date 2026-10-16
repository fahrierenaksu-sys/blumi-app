import type { QueryResultRow } from "pg"
import type { StreetLookKind, StreetRoomKind } from "../street/streetDigest"
import type { StreetDigestRecord, StreetRepository } from "../street/streetRepository"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
}

/** Migration 079. Callers check the street schema probe before any call. */
export function createPostgresStreetRepository(pool: QueryExecutor): StreetRepository {
  return Object.freeze({
    async readMany(userIds: readonly string[]) {
      if (userIds.length === 0) return new Map<string, StreetDigestRecord>()
      const result = await pool.query(
        `SELECT user_id, window_closed, look_kind, look_changed_at, room_kind, room_changed_at
           FROM blumi_street_digests
          WHERE user_id = ANY($1::text[])`,
        [[...userIds]]
      )
      return new Map(result.rows.map((row) => [String(row.user_id), mapRow(row)]))
    },
    async recordLookChange(userId: string, kind: StreetLookKind, at: Date) {
      await pool.query(
        `INSERT INTO blumi_street_digests (user_id, look_kind, look_changed_at, updated_at)
         VALUES ($1, $2, $3, clock_timestamp())
         ON CONFLICT (user_id) DO UPDATE SET
           look_kind = EXCLUDED.look_kind,
           look_changed_at = EXCLUDED.look_changed_at,
           updated_at = clock_timestamp()`,
        [userId, kind, at.toISOString()]
      )
    },
    async recordRoomChange(userId: string, kind: StreetRoomKind, at: Date, revision: number) {
      await pool.query(
        `INSERT INTO blumi_street_digests (user_id, room_kind, room_changed_at, room_revision, updated_at)
         VALUES ($1, $2, $3, $4, clock_timestamp())
         ON CONFLICT (user_id) DO UPDATE SET
           room_kind = EXCLUDED.room_kind,
           room_changed_at = EXCLUDED.room_changed_at,
           room_revision = EXCLUDED.room_revision,
           updated_at = clock_timestamp()`,
        [userId, kind, at.toISOString(), revision]
      )
    },
    async setWindowClosed(userId: string, closed: boolean) {
      await pool.query(
        `INSERT INTO blumi_street_digests (user_id, window_closed, updated_at)
         VALUES ($1, $2, clock_timestamp())
         ON CONFLICT (user_id) DO UPDATE SET
           window_closed = EXCLUDED.window_closed,
           updated_at = clock_timestamp()`,
        [userId, closed]
      )
    },
    async deleteForUser(userId: string) {
      await pool.query("DELETE FROM blumi_street_digests WHERE user_id = $1", [userId])
    }
  })
}

function mapRow(row: QueryResultRow): StreetDigestRecord {
  return Object.freeze({
    userId: String(row.user_id),
    windowClosed: row.window_closed === true,
    lookKind: (row.look_kind ?? null) as StreetLookKind | null,
    lookChangedAt: row.look_changed_at ? new Date(row.look_changed_at as string) : null,
    roomKind: (row.room_kind ?? null) as StreetRoomKind | null,
    roomChangedAt: row.room_changed_at ? new Date(row.room_changed_at as string) : null
  })
}
