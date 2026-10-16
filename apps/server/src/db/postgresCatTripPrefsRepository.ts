import type { QueryResultRow } from "pg"
import {
  DEFAULT_CAT_TRIP_PREFS,
  pickPrefs,
  type CatTripPrefs,
  type CatTripPrefsRepository
} from "../catTrips/catTripPrefs"

interface QueryExecutor {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[]; rowCount?: number | null }>
}

function toPrefs(row: QueryResultRow): CatTripPrefs {
  return {
    travelEnabled: row.travel_enabled === true,
    hostEnabled: row.host_enabled === true,
    pushEnabled: row.push_enabled === true
  }
}

/** Migration 079. A missing row means the defaults. */
export function createPostgresCatTripPrefsRepository(pool: QueryExecutor): CatTripPrefsRepository {
  return {
    async get(userId) {
      const { rows } = await pool.query(
        "SELECT travel_enabled, host_enabled, push_enabled FROM blumi_cat_trip_prefs WHERE user_id = $1",
        [userId]
      )
      return rows[0] ? toPrefs(rows[0]) : null
    },
    async update(userId, patch, at) {
      const picked = pickPrefs(patch)
      // NULL keeps the stored value (or the default on first write).
      const { rows } = await pool.query(
        `INSERT INTO blumi_cat_trip_prefs (user_id, travel_enabled, host_enabled, push_enabled, updated_at)
         VALUES ($1, COALESCE($2::boolean, $5::boolean), COALESCE($3::boolean, $6::boolean), COALESCE($4::boolean, $7::boolean), $8::timestamptz)
         ON CONFLICT (user_id) DO UPDATE SET
           travel_enabled = COALESCE($2::boolean, blumi_cat_trip_prefs.travel_enabled),
           host_enabled = COALESCE($3::boolean, blumi_cat_trip_prefs.host_enabled),
           push_enabled = COALESCE($4::boolean, blumi_cat_trip_prefs.push_enabled),
           updated_at = $8::timestamptz
         RETURNING travel_enabled, host_enabled, push_enabled`,
        [
          userId,
          picked.travelEnabled ?? null,
          picked.hostEnabled ?? null,
          picked.pushEnabled ?? null,
          DEFAULT_CAT_TRIP_PREFS.travelEnabled,
          DEFAULT_CAT_TRIP_PREFS.hostEnabled,
          DEFAULT_CAT_TRIP_PREFS.pushEnabled,
          at
        ]
      )
      return toPrefs(rows[0]!)
    },
    async deleteUser(userId) {
      const result = await pool.query("DELETE FROM blumi_cat_trip_prefs WHERE user_id = $1", [userId])
      return result.rowCount ?? 0
    }
  }
}
