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
    let firstSection = true
    for (const [name, query, singleton] of sections) {
      yield (firstSection ? "" : ",") + JSON.stringify(name) + ":"
      firstSection = false
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
