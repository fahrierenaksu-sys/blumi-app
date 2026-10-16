import type { QueryResultRow } from "pg"
import type { CatTripRepository } from "../catTrips/catTripRepository"
import type {
  CatReturnState,
  CatSouvenirRecord,
  CatSouvenirRarity,
  CatTripEndReason,
  CatTripKind,
  CatTripRecord
} from "../catTrips/catTripTypes"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
}

interface TransactionalQueryExecutor extends QueryExecutor {
  connect?: () => Promise<{ query: QueryExecutor["query"]; release(): void }>
}

const TRIP_COLUMNS = `trip_id, owner_user_id, host_user_id, to_char(day_key, 'YYYY-MM-DD') AS day_key, slot,
  starts_at, ends_at, kind, status, ended_at, end_reason, return_state, seed_digest, candidate_count,
  plan_version, owner_revealed_at, host_revealed_at, owner_push_at, host_push_at, created_at`

export function createPostgresCatTripRepository(pool: TransactionalQueryExecutor): CatTripRepository {
  /** Runs `work` in one transaction on its own connection when the pool can give one. */
  async function inTransaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T> {
    const client = pool.connect ? await pool.connect() : null
    const executor = client ?? pool
    try {
      if (client) await executor.query("BEGIN")
      const result = await work(executor)
      if (client) await executor.query("COMMIT")
      return result
    } catch (error) {
      if (client) await executor.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client?.release()
    }
  }

  return {
    async planDay(input) {
      return inTransaction(async (executor) => {
        const marker = await executor.query(
          `INSERT INTO blumi_cat_trip_days (owner_user_id, day_key, seed_digest, planned_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (owner_user_id, day_key) DO NOTHING
           RETURNING owner_user_id`,
          [input.ownerUserId, input.dayKey, input.seedDigest, new Date(input.plannedAt)]
        )
        if (marker.rows.length === 0) return { created: false }
        for (const trip of input.trips) {
          await executor.query(
            `INSERT INTO blumi_cat_trips (
               trip_id, owner_user_id, host_user_id, day_key, slot, starts_at, ends_at, kind,
               return_state, seed_digest, candidate_count, plan_version, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [trip.tripId, trip.ownerUserId, trip.hostUserId, trip.dayKey, trip.slot, new Date(trip.startsAt),
              new Date(trip.endsAt), trip.kind, trip.returnState ?? null, trip.seedDigest, trip.candidateCount,
              trip.planVersion, new Date(trip.createdAt)]
          )
        }
        return { created: true }
      })
    },
    async isDayPlanned(ownerUserId, dayKey) {
      const result = await pool.query(
        "SELECT 1 FROM blumi_cat_trip_days WHERE owner_user_id = $1 AND day_key = $2",
        [ownerUserId, dayKey]
      )
      return result.rows.length > 0
    },
    async findTrip(tripId) {
      const result = await pool.query(`SELECT ${TRIP_COLUMNS} FROM blumi_cat_trips WHERE trip_id = $1`, [tripId])
      return result.rows[0] ? mapTrip(result.rows[0]) : null
    },
    async listOwnerTrips(ownerUserId, endsAfter) {
      const result = await pool.query(
        `SELECT ${TRIP_COLUMNS} FROM blumi_cat_trips
          WHERE owner_user_id = $1 AND ends_at > $2 ORDER BY starts_at, trip_id`,
        [ownerUserId, new Date(endsAfter)]
      )
      return result.rows.map(mapTrip)
    },
    async listHostTrips(hostUserId, endsAfter) {
      const result = await pool.query(
        `SELECT ${TRIP_COLUMNS} FROM blumi_cat_trips
          WHERE host_user_id = $1 AND ends_at > $2 ORDER BY starts_at, trip_id`,
        [hostUserId, new Date(endsAfter)]
      )
      return result.rows.map(mapTrip)
    },
    async endTrip({ tripId, endedAt, reason }) {
      await pool.query(
        `UPDATE blumi_cat_trips SET status = 'cancelled', ended_at = $2, end_reason = $3
          WHERE trip_id = $1 AND status = 'scheduled'`,
        [tripId, new Date(endedAt), reason]
      )
      return this.findTrip(tripId)
    },
    async endTripsBetween({ userAId, userBId, endedAt, reason }) {
      const result = await pool.query(
        `UPDATE blumi_cat_trips SET status = 'cancelled', ended_at = $3, end_reason = $4
          WHERE status = 'scheduled' AND ends_at > $3
            AND ((owner_user_id = $1 AND host_user_id = $2) OR (owner_user_id = $2 AND host_user_id = $1))
          RETURNING trip_id`,
        [userAId, userBId, new Date(endedAt), reason]
      )
      return result.rows.length
    },
    async markRevealed({ tripId, role, at }) {
      const column = role === "owner" ? "owner_revealed_at" : "host_revealed_at"
      await pool.query(
        `UPDATE blumi_cat_trips SET ${column} = $2 WHERE trip_id = $1 AND ${column} IS NULL`,
        [tripId, new Date(at)]
      )
      return this.findTrip(tripId)
    },
    async reserveTeaser({ tripId, role, at, dayStart, dayEnd, cap }) {
      const column = role === "owner" ? "owner_push_at" : "host_push_at"
      const recipientColumn = role === "owner" ? "owner_user_id" : "host_user_id"
      return inTransaction(async (executor) => {
        const trip = await executor.query(`SELECT ${recipientColumn} AS recipient FROM blumi_cat_trips WHERE trip_id = $1`, [tripId])
        const recipient = trip.rows[0]?.recipient
        if (typeof recipient !== "string") return false
        // One cat-push budget per recipient: concurrent reservations queue here.
        await executor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`cat-push:${recipient}`])
        const used = await executor.query(
          `SELECT (SELECT count(*) FROM blumi_cat_trips WHERE owner_user_id = $1 AND owner_push_at >= $2 AND owner_push_at < $3)
                + (SELECT count(*) FROM blumi_cat_trips WHERE host_user_id = $1 AND host_push_at >= $2 AND host_push_at < $3) AS used`,
          [recipient, new Date(dayStart), new Date(dayEnd)]
        )
        if (Number(used.rows[0]?.used ?? 0) >= cap) return false
        const updated = await executor.query(
          `UPDATE blumi_cat_trips SET ${column} = $2 WHERE trip_id = $1 AND ${column} IS NULL RETURNING trip_id`,
          [tripId, new Date(at)]
        )
        return updated.rows.length > 0
      })
    },
    async grantSouvenir(souvenir) {
      const inserted = await pool.query(
        `INSERT INTO blumi_cat_souvenirs (souvenir_id, owner_user_id, trip_id, souvenir_key, rarity, acquired_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (trip_id) DO NOTHING
         RETURNING souvenir_id, owner_user_id, trip_id, souvenir_key, rarity, acquired_at`,
        [souvenir.souvenirId, souvenir.ownerUserId, souvenir.tripId, souvenir.key, souvenir.rarity, new Date(souvenir.acquiredAt)]
      )
      if (inserted.rows[0]) return mapSouvenir(inserted.rows[0])
      const existing = await pool.query(
        `SELECT souvenir_id, owner_user_id, trip_id, souvenir_key, rarity, acquired_at
           FROM blumi_cat_souvenirs WHERE trip_id = $1`,
        [souvenir.tripId]
      )
      return mapSouvenir(existing.rows[0]!)
    },
    async listSouvenirs(ownerUserId, limit) {
      const result = await pool.query(
        `SELECT souvenir_id, owner_user_id, trip_id, souvenir_key, rarity, acquired_at
           FROM blumi_cat_souvenirs WHERE owner_user_id = $1
          ORDER BY acquired_at DESC, souvenir_id DESC LIMIT $2`,
        [ownerUserId, limit]
      )
      return result.rows.map(mapSouvenir)
    },
    async purgeCreatedBefore(cutoff) {
      const result = await pool.query(
        "DELETE FROM blumi_cat_trips WHERE created_at < $1 RETURNING trip_id",
        [new Date(cutoff)]
      )
      return result.rows.length
    }
  }
}

const iso = (value: unknown): string => (value instanceof Date ? value : new Date(String(value))).toISOString()
const optionalIso = (value: unknown): string | undefined => (value === null || value === undefined ? undefined : iso(value))

function mapTrip(row: QueryResultRow): CatTripRecord {
  const endedAt = optionalIso(row.ended_at)
  const returnState = row.return_state === null ? undefined : (String(row.return_state) as CatReturnState)
  const ownerRevealedAt = optionalIso(row.owner_revealed_at)
  const hostRevealedAt = optionalIso(row.host_revealed_at)
  const ownerPushAt = optionalIso(row.owner_push_at)
  const hostPushAt = optionalIso(row.host_push_at)
  return {
    tripId: String(row.trip_id),
    ownerUserId: String(row.owner_user_id),
    hostUserId: String(row.host_user_id),
    dayKey: String(row.day_key),
    slot: Number(row.slot),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    kind: String(row.kind) as CatTripKind,
    status: row.status === "cancelled" ? "cancelled" : "scheduled",
    ...(endedAt ? { endedAt } : {}),
    ...(row.end_reason ? { endReason: String(row.end_reason) as CatTripEndReason } : {}),
    ...(returnState ? { returnState } : {}),
    seedDigest: String(row.seed_digest),
    candidateCount: Number(row.candidate_count),
    planVersion: Number(row.plan_version),
    ...(ownerRevealedAt ? { ownerRevealedAt } : {}),
    ...(hostRevealedAt ? { hostRevealedAt } : {}),
    ...(ownerPushAt ? { ownerPushAt } : {}),
    ...(hostPushAt ? { hostPushAt } : {}),
    createdAt: iso(row.created_at)
  }
}

function mapSouvenir(row: QueryResultRow): CatSouvenirRecord {
  return {
    souvenirId: String(row.souvenir_id),
    ownerUserId: String(row.owner_user_id),
    tripId: String(row.trip_id),
    key: String(row.souvenir_key),
    rarity: String(row.rarity) as CatSouvenirRarity,
    acquiredAt: iso(row.acquired_at)
  }
}
