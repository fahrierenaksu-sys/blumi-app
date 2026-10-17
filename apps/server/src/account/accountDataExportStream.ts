import type { QueryResultRow } from "pg"
import type { AccountRecord } from "../auth/authStore"
import { readPostgresAccountExportSnapshot } from "../db/postgresAuthRepository"
import { exportAccountFields } from "./accountDataExporter"

export interface AccountExportMetadata {
  schemaVersion: "2026-07-21"
  exportedAt: string
  exclusions: readonly string[]
}
export interface ExportConnection {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: QueryResultRow[] }>
  release(): void
}

const sections = [
  ["inventory", "SELECT coins, coin_debt, owned_avatar_item_ids, owned_room_item_ids, updated_at FROM blumi_economy_inventories WHERE user_id = $1", true],
  ["roomDecor", "SELECT revision, decor, updated_at FROM blumi_personal_room_decor WHERE user_id = $1", true],
  ["rewardLedger", "SELECT reward_type, idempotency_key, coins, created_at FROM blumi_economy_reward_ledger WHERE user_id = $1 ORDER BY created_at ASC", false],
  ["iapLedger", "SELECT provider, provider_transaction_id, entry_type, product_id, coins, created_at FROM blumi_economy_iap_ledger WHERE user_id = $1 ORDER BY created_at ASC", false],
  ["discoveryDecisions", "SELECT to_user_id, decision, decided_at FROM blumi_discovery_decisions WHERE from_user_id = $1 ORDER BY decided_at ASC", false],
  ["matches", "SELECT match_id, participant_a_user_id, participant_b_user_id, matched_at FROM blumi_matches WHERE participant_a_user_id = $1 OR participant_b_user_id = $1 ORDER BY matched_at ASC", false],
  ["connectionDecisions", "SELECT mini_room_id, partner_user_id, status, decided_at FROM blumi_connection_decisions WHERE actor_user_id = $1 ORDER BY decided_at ASC", false],
  ["connectionMatches", "SELECT mini_room_id, participant_a_user_id, participant_b_user_id, matched_at FROM blumi_connection_matches WHERE participant_a_user_id = $1 OR participant_b_user_id = $1 ORDER BY matched_at ASC", false],
  ["reactions", "SELECT reaction_id, room_id, target_user_id, reaction, created_at FROM blumi_reactions WHERE actor_user_id = $1 ORDER BY created_at ASC", false],
  ["blocks", "SELECT blocked_user_id, created_at FROM blumi_safety_blocks WHERE actor_user_id = $1 ORDER BY created_at ASC", false],
  ["messages", "SELECT message_id, thread_id, body, sent_at FROM blumi_chat_messages WHERE sender_user_id = $1 ORDER BY sent_at ASC, message_id ASC", false],
] as const

/**
 * Release 3 tables (migrations 077-080) are optional: a database without one exports an empty section.
 * A hosted trip names its owner only after the host opened the reveal, as in the app.
 */
const optionalSections = [
  ["roomPet", "blumi_room_pets", "SELECT pet_id, species_item_id, name, name_status, room_state, revision, created_at, updated_at FROM blumi_room_pets WHERE user_id = $1", true],
  ["catTripPrefs", "blumi_cat_trip_prefs", "SELECT travel_enabled, host_enabled, push_enabled, updated_at FROM blumi_cat_trip_prefs WHERE user_id = $1", true],
  ["streetWindow", "blumi_street_digests", "SELECT window_closed, look_kind, look_changed_at, room_kind, room_changed_at, updated_at FROM blumi_street_digests WHERE user_id = $1", true],
  ["catTripDays", "blumi_cat_trip_days", "SELECT day_key, planned_at FROM blumi_cat_trip_days WHERE owner_user_id = $1 ORDER BY day_key ASC", false],
  // The counterpart follows the app's rules (catTripService pairProblem): the owner learns the host after opening
  // the reveal of a finished trip, the host learns the owner after opening theirs, and only while the pair still
  // has no block, is still mutually matched and both accounts exist and are not banned or suspended. That check is
  // made now, not when the trip ended, so an unmatch, ban or suspension after a finished trip hides it as well.
  // Trips that have not started yet are left out.
  ["catTrips", "blumi_cat_trips", `SELECT trip.trip_id, CASE WHEN trip.owner_user_id = $1 THEN 'owner' ELSE 'host' END AS role,
      CASE WHEN counterpart_visible AND trip.owner_user_id = $1 AND trip.owner_revealed_at IS NOT NULL AND trip.ends_at <= now()
        THEN trip.host_user_id END AS host_user_id,
      CASE WHEN counterpart_visible AND trip.host_user_id = $1 AND trip.host_revealed_at IS NOT NULL
        THEN trip.owner_user_id END AS owner_user_id,
      trip.day_key, trip.starts_at, trip.ends_at, trip.kind, trip.status, trip.ended_at, trip.end_reason,
      trip.owner_revealed_at, trip.host_revealed_at, trip.created_at
    FROM blumi_cat_trips trip
    CROSS JOIN LATERAL (SELECT (trip.end_reason IS NULL OR trip.end_reason NOT IN ('block', 'unmatch', 'account'))
      AND NOT EXISTS (SELECT 1 FROM blumi_safety_blocks block
        WHERE (block.actor_user_id = trip.owner_user_id AND block.blocked_user_id = trip.host_user_id)
           OR (block.actor_user_id = trip.host_user_id AND block.blocked_user_id = trip.owner_user_id))
      AND EXISTS (SELECT 1 FROM blumi_matches pair
        WHERE (pair.participant_a_user_id = trip.owner_user_id AND pair.participant_b_user_id = trip.host_user_id)
           OR (pair.participant_a_user_id = trip.host_user_id AND pair.participant_b_user_id = trip.owner_user_id))
      AND (SELECT count(*) FROM blumi_accounts member
        WHERE member.user_id IN (trip.owner_user_id, trip.host_user_id)
          AND (member.moderation_status NOT IN ('banned', 'suspended')
            OR (member.moderation_status = 'suspended' AND member.suspended_until <= now()))) = 2 AS counterpart_visible) visibility
    WHERE (trip.owner_user_id = $1 OR trip.host_user_id = $1) AND trip.starts_at <= now()
    ORDER BY trip.starts_at ASC, trip.trip_id ASC`, false],
  ["catSouvenirs", "blumi_cat_souvenirs", "SELECT souvenir_id, trip_id, souvenir_key, rarity, acquired_at FROM blumi_cat_souvenirs WHERE owner_user_id = $1 ORDER BY acquired_at ASC, souvenir_id ASC", false],
] as const

export async function* streamPostgresAccountExport(
  client: ExportConnection, authorizedAccount: AccountRecord, metadata: AccountExportMetadata
): AsyncGenerator<string> {
  let committed = false
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    await client.query("SET LOCAL statement_timeout = '15s'")
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '120s'")
    const account = await readPostgresAccountExportSnapshot(client, authorizedAccount.accountId)
    if (!account || account.userId !== authorizedAccount.userId) throw new Error("Account export is no longer available.")
    yield JSON.stringify({ ...metadata, account: exportAccountFields(account) }).slice(0, -1) + ',"data":{'
    const present = await client.query(
      "SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass('public.' || name) IS NOT NULL",
      [optionalSections.map(([, table]) => table)]
    )
    const presentTables = new Set(present.rows.map((row) => String(row.name)))
    const allSections = [
      ...sections,
      ...optionalSections.map(([name, table, query, singleton]) => presentTables.has(table)
        ? [name, query, singleton] as const
        : [name, null, singleton] as const)
    ]
    let firstSection = true
    for (const [name, query, singleton] of allSections) {
      yield (firstSection ? "" : ",") + JSON.stringify(name) + ":"
      firstSection = false
      if (query === null) {
        yield singleton ? "null" : "[]"
        continue
      }
      if (singleton) {
        const result = await client.query(query, [account.userId])
        yield JSON.stringify(result.rows[0] ?? null)
        continue
      }
      yield "["
      await client.query("DECLARE blumi_export_rows NO SCROLL CURSOR FOR " + query, [account.userId])
      let firstRow = true
      for (;;) {
        const batch = await client.query("FETCH FORWARD 500 FROM blumi_export_rows")
        for (const row of batch.rows) {
          yield (firstRow ? "" : ",") + JSON.stringify(row)
          firstRow = false
        }
        if (batch.rows.length < 500) break
      }
      await client.query("CLOSE blumi_export_rows")
      yield "]"
    }
    await client.query("COMMIT")
    committed = true
    // Complete JSON only after commit; a failed stream is not a complete export.
    yield "}}\n"
  } finally {
    try { if (!committed) await client.query("ROLLBACK") } finally { client.release() }
  }
}
