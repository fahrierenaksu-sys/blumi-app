import type { QueryResultRow } from "pg"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import type {
  MovePresenceResult,
  PresenceRecord,
  PresenceRepository
} from "../presence/presenceRepository"
import {
  REALTIME_CONNECTION_LEASE_LOCK_SQL,
  realtimeConnectionLeaseLockKey
} from "./postgresRealtimeConnectionLeaseLock"

interface QueryExecutor {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: QueryResultRow[] }>
}

interface TransactionClient extends QueryExecutor {
  release(error?: Error | boolean): void
}

interface TransactionalQueryExecutor extends QueryExecutor {
  connect(): Promise<TransactionClient>
}

export function createPostgresPresenceRepository(
  pool: TransactionalQueryExecutor
): PresenceRepository {
  return {
    async listRoomPresence(roomId, now = new Date()) {
      await deleteExpired(pool, now)
      const result = await pool.query(
        `SELECT presence.room_id, presence.user_id, presence.display_name,
                account.avatar_preset_id AS avatar_preset_id,
                account.avatar_selection AS avatar_selection,
                account.avatar_revision AS avatar_revision,
                presence.spot_id, presence.in_mini_room,
                presence.joined_at, presence.updated_at, presence.expires_at
           FROM blumi_room_presence AS presence
          INNER JOIN blumi_accounts AS account
             ON account.user_id = presence.user_id
          WHERE presence.room_id = $1
          ORDER BY presence.joined_at ASC`,
        [roomId]
      )
      return result.rows.map(mapPresence)
    },
    async findUserPresence(roomId, userId, now = new Date()) {
      await deleteExpired(pool, now)
      const result = await pool.query(
        `SELECT presence.room_id, presence.user_id, presence.display_name,
                account.avatar_preset_id AS avatar_preset_id,
                account.avatar_selection AS avatar_selection,
                account.avatar_revision AS avatar_revision,
                presence.spot_id, presence.in_mini_room,
                presence.joined_at, presence.updated_at, presence.expires_at
           FROM blumi_room_presence AS presence
          INNER JOIN blumi_accounts AS account
             ON account.user_id = presence.user_id
          WHERE presence.room_id = $1 AND presence.user_id = $2`,
        [roomId, userId]
      )
      return result.rows[0] ? mapPresence(result.rows[0]) : null
    },
    async findUserPresenceAcrossRooms(userId, now = new Date()) {
      await deleteExpired(pool, now)
      const result = await pool.query(
        `SELECT presence.room_id, presence.user_id, presence.display_name,
                account.avatar_preset_id AS avatar_preset_id,
                account.avatar_selection AS avatar_selection,
                account.avatar_revision AS avatar_revision,
                presence.spot_id, presence.in_mini_room,
                presence.joined_at, presence.updated_at, presence.expires_at
           FROM blumi_room_presence AS presence
          INNER JOIN blumi_accounts AS account
             ON account.user_id = presence.user_id
          WHERE presence.user_id = $1
          ORDER BY presence.updated_at DESC
          LIMIT 1`,
        [userId]
      )
      return result.rows[0] ? mapPresence(result.rows[0]) : null
    },
    async savePresence(record) {
      if (!(await trySavePostgresPresence(pool, record))) {
        throw new Error("That spot is not available.")
      }
    },
    async trySavePresence(record) {
      return trySavePostgresPresence(pool, record)
    },
    async tryMovePresence(record) {
      return tryMovePostgresPresence(pool, record)
    },
    async updateUserAvatarSelection() {
      // Account rows are the canonical avatar source. This legacy interface
      // remains a no-op so callers cannot reintroduce a fallible dual write.
    },
    async deletePresence(roomId, userId) {
      await pool.query(
        `DELETE FROM blumi_room_presence
          WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      )
    },
    async deleteUserPresence(userId) {
      await pool.query(
        "DELETE FROM blumi_room_presence WHERE user_id = $1",
        [userId]
      )
    },
    async registerConnectionLease(connectionId, userId, leaseMs) {
      const duration = validateConnectionLeaseMs(leaseMs)
      await withRealtimeConnectionLeaseTransaction(pool, userId, async (client) => {
        const result = await client.query(
          `INSERT INTO blumi_realtime_connection_leases (
             connection_id, user_id, expires_at, updated_at
           )
           SELECT $1, $2,
                  connection_clock.checked_at + ($3::double precision * INTERVAL '1 millisecond'),
                  connection_clock.checked_at
             FROM (SELECT clock_timestamp() AS checked_at) AS connection_clock
           ON CONFLICT (connection_id) DO UPDATE SET
             expires_at = EXCLUDED.expires_at,
             updated_at = EXCLUDED.updated_at
           WHERE blumi_realtime_connection_leases.user_id = EXCLUDED.user_id
           RETURNING connection_id`,
          [connectionId, userId, duration]
        )
        if (result.rows.length === 0) {
          throw new Error("Realtime connection ID is already assigned.")
        }
      })
    },
    async heartbeatConnectionLease(connectionId, userId, leaseMs) {
      const duration = validateConnectionLeaseMs(leaseMs)
      return withRealtimeConnectionLeaseTransaction(pool, userId, async (client) => {
        const result = await client.query(
          `WITH connection_clock AS MATERIALIZED (
             SELECT clock_timestamp() AS checked_at
           )
           UPDATE blumi_realtime_connection_leases AS lease
              SET expires_at = connection_clock.checked_at + ($3::double precision * INTERVAL '1 millisecond'),
                  updated_at = connection_clock.checked_at
             FROM connection_clock
            WHERE lease.connection_id = $1 AND lease.user_id = $2
           RETURNING lease.connection_id`,
          [connectionId, userId, duration]
        )
        return result.rows.length > 0
      })
    },
    async disconnectConnectionLease(connectionId, userId) {
      return withRealtimeConnectionLeaseTransaction(pool, userId, async (client) => {
        const removed = await client.query(
          `DELETE FROM blumi_realtime_connection_leases
            WHERE connection_id = $1 AND user_id = $2
            RETURNING connection_id`,
          [connectionId, userId]
        )
        if (removed.rows.length === 0) return []

        const otherLiveConnection = await client.query(
          `SELECT 1
             FROM blumi_realtime_connection_leases
            WHERE user_id = $1
              AND expires_at > clock_timestamp()
            LIMIT 1`,
          [userId]
        )
        if (otherLiveConnection.rows.length > 0) return []

        const cleared = await client.query(
          `DELETE FROM blumi_room_presence
            WHERE user_id = $1
            RETURNING room_id`,
          [userId]
        )
        return [...new Set(cleared.rows.map((row) => String(row.room_id)))]
      })
    },
    async purgeExpiredConnectionLeases(limit) {
      const maximum = validateConnectionLeasePurgeLimit(limit)
      const result = await pool.query(
        `WITH expired AS (
           SELECT connection_id
             FROM blumi_realtime_connection_leases
            WHERE expires_at <= clock_timestamp()
            ORDER BY expires_at
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
         DELETE FROM blumi_realtime_connection_leases AS lease
          USING expired
          WHERE lease.connection_id = expired.connection_id
          RETURNING lease.connection_id`,
        [maximum]
      )
      return result.rows.length
    },
    async updateMiniRoomStatus(userIds, inMiniRoom) {
      if (userIds.length === 0) return
      await pool.query(
        `UPDATE blumi_room_presence
            SET in_mini_room = $1,
                updated_at = now()
          WHERE user_id = ANY($2::text[])`,
        [inMiniRoom, [...userIds]]
      )
    }
  }
}

async function trySavePostgresPresence(
  pool: TransactionalQueryExecutor,
  record: PresenceRecord
): Promise<boolean> {
  return withRoomPresenceTransaction(pool, record.roomId, async (client, transactionNow) => {
    await client.query(
      `DELETE FROM blumi_room_presence
        WHERE room_id = $1 AND expires_at <= $2`,
      [record.roomId, transactionNow]
    )
    const occupied = await client.query(
        `SELECT 1
         FROM blumi_room_presence
        WHERE room_id = $1 AND spot_id = $2 AND user_id <> $3
          AND expires_at > clock_timestamp()
        LIMIT 1`,
      [record.roomId, record.spotId, record.userId]
    )
    if (occupied.rows.length > 0) return false
    const leaseMs = Math.max(0, Date.parse(record.expiresAt) - Date.parse(record.updatedAt))
    await client.query(
      `INSERT INTO blumi_room_presence (
          room_id, user_id, display_name, spot_id,
          in_mini_room, joined_at, updated_at, expires_at
        )
        SELECT $1, $2, $3, $4, false, $5,
               insert_clock.checked_at,
               insert_clock.checked_at + ($6::double precision * INTERVAL '1 millisecond')
          FROM (SELECT clock_timestamp() AS checked_at) AS insert_clock
         WHERE true
        ON CONFLICT (room_id, user_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          spot_id = EXCLUDED.spot_id,
          in_mini_room = CASE
            WHEN blumi_room_presence.expires_at > clock_timestamp()
              THEN blumi_room_presence.in_mini_room
            ELSE false
          END,
          updated_at = clock_timestamp(),
          expires_at = clock_timestamp() + ($6::double precision * INTERVAL '1 millisecond')`,
      [
        record.roomId,
        record.userId,
        record.displayName,
        record.spotId,
        record.joinedAt,
        leaseMs
      ]
    )
    return true
  })
}

async function tryMovePostgresPresence(
  pool: TransactionalQueryExecutor,
  record: Pick<PresenceRecord, "roomId" | "userId" | "spotId" | "updatedAt" | "expiresAt">
): Promise<MovePresenceResult> {
  return withRoomPresenceTransaction(pool, record.roomId, async (client, transactionNow) => {
    await client.query(
      `DELETE FROM blumi_room_presence
        WHERE room_id = $1 AND expires_at <= $2`,
      [record.roomId, transactionNow]
    )
    const current = await client.query(
      `SELECT expires_at
         FROM blumi_room_presence
        WHERE room_id = $1 AND user_id = $2
        FOR UPDATE`,
      [record.roomId, record.userId]
    )
    if (current.rows.length === 0) return "missing"

    const lockedAt = await readDatabaseClock(client)
    const storedExpiry = current.rows[0]?.expires_at
    const storedExpiryMs = storedExpiry instanceof Date
      ? storedExpiry.getTime()
      : Date.parse(String(storedExpiry))
    if (!Number.isFinite(storedExpiryMs)) {
      throw new Error("Stored presence lease expiry is invalid.")
    }
    if (storedExpiryMs <= lockedAt.getTime()) {
      await client.query(
        `DELETE FROM blumi_room_presence
          WHERE room_id = $1 AND user_id = $2`,
        [record.roomId, record.userId]
      )
      return "missing"
    }

    const occupied = await client.query(
      `SELECT 1
         FROM blumi_room_presence
        WHERE room_id = $1 AND spot_id = $2 AND user_id <> $3
          AND expires_at > clock_timestamp()
        LIMIT 1`,
      [record.roomId, record.spotId, record.userId]
    )
    if (occupied.rows.length > 0) return "occupied"

    const leaseMs = Math.max(0, Date.parse(record.expiresAt) - Date.parse(record.updatedAt))
    const updated = await client.query(
      `WITH database_clock AS MATERIALIZED (
         SELECT clock_timestamp() AS checked_at
       )
       UPDATE blumi_room_presence AS presence
          SET spot_id = $3,
              updated_at = database_clock.checked_at,
              expires_at = database_clock.checked_at + ($4::double precision * INTERVAL '1 millisecond')
         FROM database_clock
        WHERE presence.room_id = $1 AND presence.user_id = $2
          AND presence.expires_at > database_clock.checked_at
        RETURNING presence.user_id`,
      [
        record.roomId,
        record.userId,
        record.spotId,
        leaseMs
      ]
    )
    if (updated.rows.length > 0) return "moved"
    await client.query(
      `DELETE FROM blumi_room_presence
        WHERE room_id = $1 AND user_id = $2
          AND expires_at <= clock_timestamp()`,
      [record.roomId, record.userId]
    )
    return "missing"
  })
}

async function withRoomPresenceTransaction<T>(
  pool: TransactionalQueryExecutor,
  roomId: string,
  operation: (client: TransactionClient, transactionNow: Date) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  let destroyClient = false
  try {
    await client.query("BEGIN")
    // The transaction-scoped advisory lock coordinates every replica that
    // reserves or moves a spot in this room.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`blumi:room-presence:${roomId}`]
    )
    const transactionNow = await readDatabaseClock(client)
    const result = await operation(client, transactionNow)
    await client.query("COMMIT")
    return result
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch {
      destroyClient = true
    }
    throw error
  } finally {
    client.release(destroyClient)
  }
}

async function withRealtimeConnectionLeaseTransaction<T>(
  pool: TransactionalQueryExecutor,
  userId: string,
  operation: (client: TransactionClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  let destroyClient = false
  try {
    await client.query("BEGIN")
    await client.query(REALTIME_CONNECTION_LEASE_LOCK_SQL, [realtimeConnectionLeaseLockKey(userId)])
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch {
      destroyClient = true
    }
    throw error
  } finally {
    client.release(destroyClient)
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

async function readDatabaseClock(client: TransactionClient): Promise<Date> {
  const result = await client.query(
    "SELECT clock_timestamp() AS checked_at"
  )
  const value = result.rows[0]?.checked_at
  const timestamp = value instanceof Date
    ? value
    : new Date(String(value))
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("Could not read the PostgreSQL clock.")
  }
  return timestamp
}

async function deleteExpired(pool: QueryExecutor, now: Date): Promise<void> {
  await pool.query(
    "DELETE FROM blumi_room_presence WHERE expires_at <= $1",
    [now]
  )
}

function mapPresence(row: QueryResultRow): PresenceRecord {
  return {
    roomId: String(row.room_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    avatar: normalizeStoredAvatarSelection({
      presetId: row.avatar_preset_id,
      loadout: row.avatar_selection,
      revision: row.avatar_revision
    }),
    spotId: String(row.spot_id),
    inMiniRoom: Boolean(row.in_mini_room),
    joinedAt: new Date(row.joined_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString()
  }
}
