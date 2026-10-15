import { resolveAvatarBodyId, validateAvatarLoadout } from "@blumi/domain"
import type { PoolClient } from "pg"
import { getDefaultOwnedItemIds, resolveProductionEconomyCatalog } from "../economy/economyCatalog"
import { PUSH_ROUTED_TYPES } from "../notifications/pushMessagePolicy"
import { canonicalJson, isRecord, sha256, type BetaResetStarter } from "./betaResetStarter"
import { assertBetaResetRunsReady, assertResetMayRun, BETA_RESET_RUNS_TABLE, recordBetaResetRun } from "./betaResetRuns"

/**
 * The owner-approved full beta reset (option "c", 2026-10-10; spec: release plan 13/10 §4).
 * Coins go to the starter amount, every loadout to its body's starter look, every finished room to the starter
 * room with the bed; all chats, messages, matches, mini rooms and their pending pushes are deleted.
 * Accounts, profiles, gender, sessions, blocks, money ledgers and settings are never written. The test personas
 * are never written either: not their coins, look or room (scripts/seedTestPersonas.ts gives each its own), and
 * not the likes they hand out, so persona QA can still match instantly.
 * Every count is computed, hashed and printed; IDs, phone numbers and bodies never leave this module.
 */

// Every push about a chat, like, match or invite; a pending watch push ("discovery.watch_match") is kept.
// "match" is a legacy type no current code queues.
const PUSH_TYPES_ABOUT_DELETED_DATA = [
  ...PUSH_ROUTED_TYPES.filter((type) => type !== "discovery.watch_match"), "match"
] as const

interface DeletedTable {
  readonly table: string
  /** Rows go with this parent through ON DELETE CASCADE; they are counted, never deleted directly. */
  readonly cascadeFrom?: string
  readonly where?: string
  /**
   * Short-lived rows the running service creates and drains on its own (TTL caches, outboxes, daily quotas).
   * They are deleted and counted under the lock, but stay out of the hash, so routine churn never blocks the apply.
   */
  readonly volatile?: true
}

// Order matters: a child is counted before its parent is deleted.
const DELETED_TABLES: readonly DeletedTable[] = [
  { table: "blumi_chat_threads" },
  { table: "blumi_chat_thread_participants", cascadeFrom: "blumi_chat_threads" },
  { table: "blumi_chat_messages", cascadeFrom: "blumi_chat_threads" },
  { table: "blumi_chat_delivery_outbox", cascadeFrom: "blumi_chat_threads", volatile: true },
  { table: "blumi_chat_message_edit_audit" },
  { table: "blumi_matches" },
  { table: "blumi_connection_decisions" },
  { table: "blumi_connection_matches" },
  // The test personas' own likes stay (scripts/seedTestPersonas.ts): testers can still match a persona instantly.
  { table: "blumi_discovery_decisions", where: "from_user_id NOT IN (SELECT user_id FROM blumi_test_personas)" },
  { table: "blumi_discovery_snapshots", volatile: true },
  { table: "blumi_discovery_snapshot_candidates", cascadeFrom: "blumi_discovery_snapshots", volatile: true },
  { table: "blumi_discovery_decision_quotas", volatile: true },
  // Its delete trigger (migration 053) queues a media revocation per participant, as when the app ends a room.
  { table: "blumi_mini_rooms" },
  { table: "blumi_active_mini_room_participants", cascadeFrom: "blumi_mini_rooms" },
  { table: "blumi_mini_room_invites" },
  { table: "blumi_reactions" },
  {
    table: "blumi_push_delivery_outbox",
    where: `data->>'type' IN (${PUSH_TYPES_ABOUT_DELETED_DATA.map((type) => `'${type}'`).join(", ")})`,
    volatile: true
  },
  { table: "blumi_room_presence", volatile: true },
  { table: "blumi_realtime_payload_refs", volatile: true },
  // Old room renders; Discover shows a room picture again after the user's next room save.
  { table: "blumi_room_showcase_snapshots" }
]

/** Printed for the operator. The reset issues no statement against them; accounts and inventories keep their row count. */
export const BETA_RESET_KEPT_TABLES = [
  "blumi_accounts", "blumi_sessions", "blumi_push_devices", "blumi_notification_preferences",
  "blumi_discovery_watches", "blumi_discovery_quota_overrides", "blumi_safety_blocks", "blumi_safety_reports",
  "blumi_moderation_phone_bans", "blumi_economy_inventories", "blumi_economy_reward_ledger",
  "blumi_store_transactions", "blumi_economy_iap_ledger", "blumi_referral_invites", "blumi_test_personas",
  "blumi_admin_user_audit", "blumi_migrations"
] as const

/** Every table the reset deletes from or writes to; the postgres test proves all other tables stay byte-identical. */
export const BETA_RESET_DELETED_TABLES: readonly string[] = DELETED_TABLES.map((entry) => entry.table)
export const BETA_RESET_WRITTEN_TABLES = [
  "blumi_accounts", "blumi_economy_inventories", "blumi_personal_room_decor", BETA_RESET_RUNS_TABLE
] as const
const LOCKED_KEPT_TABLES = ["blumi_accounts", "blumi_economy_inventories"] as const

/**
 * Rows the reset reads to decide what to write. Their content (not just their count) is hashed, so any write by
 * the app between the dry run and the apply (a message, a like, a room or avatar save) makes the apply refuse.
 */
const CONTENT_SOURCES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(DELETED_TABLES.filter((entry) => !entry.volatile).map((entry) =>
    [entry.table, `SELECT t::text AS row FROM ${entry.table} t${entry.where ? ` WHERE ${entry.where}` : ""}`])),
  blumi_accounts: `SELECT jsonb_build_array(user_id, avatar_selection, avatar_preset_id, avatar_revision, gender,
    identity_gender, onboarding_room_complete)::text AS row FROM blumi_accounts`,
  blumi_economy_inventories: `SELECT jsonb_build_array(user_id, coins, coin_debt, owned_avatar_item_ids,
    owned_room_item_ids)::text AS row FROM blumi_economy_inventories`,
  blumi_personal_room_decor: "SELECT jsonb_build_array(user_id, revision, decor)::text AS row FROM blumi_personal_room_decor"
}

export interface BetaResetCounts {
  readonly delete: Readonly<Record<string, number>>
  readonly reset: {
    readonly coinBalances: number
    readonly avatarLoadouts: number
    readonly roomDecorUpdates: number
    readonly roomDecorInserts: number
  }
  readonly keep: Readonly<Record<string, number>>
}

/** Signs that the app is still serving someone: unexpired realtime connection leases and room presence rows. */
export interface BetaResetActivity {
  readonly liveConnections: number
  readonly livePresence: number
}

/** Where the reset runs from: the checkout's commit and whether its tracked files are modified. */
export interface BetaResetSource {
  readonly commit: string
  readonly modified: boolean
}

export interface BetaResetContext {
  readonly source: BetaResetSource
  readonly starter: BetaResetStarter
}

export interface BetaResetPlan {
  readonly fingerprint: string
  readonly counts: BetaResetCounts
  readonly activity: BetaResetActivity
  /** sha256 over the fingerprint, the source commit, the starter digest, the stable counts and the read rows' content. */
  readonly hash: string
}

interface LoadoutChange {
  readonly loadout: BetaResetStarter["femaleLoadout"]
  readonly accountIds: readonly string[]
}

/** One database's identity: its name and when its first migration ran. Holds no secret and no user data. */
export async function readDatabaseFingerprint(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ name: string; first: string | null }>(
    `SELECT current_database() AS name,
            (SELECT extract(epoch FROM applied_at)::text FROM blumi_migrations ORDER BY id LIMIT 1) AS first`
  )
  if (!rows[0]?.first) throw new Error("The database has no migration ledger; reset refused.")
  return sha256(`${rows[0].name}|${rows[0].first}`).slice(0, 16)
}

export async function planBetaReset(client: PoolClient, context: BetaResetContext): Promise<BetaResetPlan> {
  const { starter } = context
  const fingerprint = await readDatabaseFingerprint(client)
  const loadoutChanges = await planLoadoutChanges(client, starter)
  const starterDecor = JSON.stringify(starter.roomDecor)
  const counts: BetaResetCounts = {
    delete: Object.fromEntries(await Promise.all(DELETED_TABLES.map(async (entry) =>
      [entry.table, await countRows(client, entry.table, entry.where)] as const))),
    reset: {
      coinBalances: await countRows(client, "blumi_economy_inventories", coinsOffStarter(starter)),
      avatarLoadouts: loadoutChanges.reduce((sum, change) => sum + change.accountIds.length, 0),
      roomDecorUpdates: await countRows(client, "blumi_personal_room_decor", DECOR_OFF_STARTER, [starterDecor]),
      roomDecorInserts: await countRows(client, "blumi_accounts", ACCOUNTS_MISSING_DECOR)
    },
    keep: Object.fromEntries(await Promise.all([
      ...BETA_RESET_KEPT_TABLES.map(async (table) => [table, await countRows(client, table)] as const),
      (async () => ["test persona likes", await countRows(client, "blumi_discovery_decisions", PERSONA_LIKES)] as const)()
    ]))
  }
  const activity: BetaResetActivity = {
    liveConnections: await countRows(client, "blumi_realtime_connection_leases", "expires_at > now()"),
    livePresence: await countRows(client, "blumi_room_presence", "expires_at > now()")
  }
  const content = await readContentDigest(client)
  return { fingerprint, counts, activity, hash: hashPlan({ fingerprint, counts, content, context }) }
}

/** Kept-table counts and volatile tables are printed only: sign-ins and the app's own TTL churn move them. */
function hashPlan(input: {
  fingerprint: string; counts: BetaResetCounts; content: string; context: BetaResetContext
}): string {
  const stable = Object.fromEntries(Object.entries(input.counts.delete)
    .filter(([table]) => !DELETED_TABLES.find((entry) => entry.table === table)?.volatile))
  return sha256(canonicalJson({
    version: 2,
    fingerprint: input.fingerprint,
    source: input.context.source,
    starter: input.context.starter.digest,
    delete: stable,
    reset: input.counts.reset,
    content: input.content
  }))
}

/**
 * Applies the reset inside the caller's open transaction. Locks every written table first, so the counts that
 * matched `expected.hash` are exactly the rows changed; any difference throws and the caller rolls back.
 * One-shot (migration 076): a database that recorded a reset needs `expected.repeatReason`; the run is recorded
 * in the same transaction.
 */
export async function applyBetaReset(
  client: PoolClient,
  context: BetaResetContext,
  expected: { readonly hash: string; readonly fingerprint: string; readonly repeatReason?: string | null }
): Promise<{ readonly before: BetaResetPlan; readonly after: BetaResetPlan }> {
  await assertBetaResetRunsReady(client)
  const lockedTables = [...new Set([...DELETED_TABLES.map((entry) => entry.table), ...BETA_RESET_WRITTEN_TABLES])]
  await client.query(`LOCK TABLE ${lockedTables.join(", ")} IN EXCLUSIVE MODE`)
  const repeatReason = expected.repeatReason ?? null
  await assertResetMayRun(client, repeatReason)
  const before = await planBetaReset(client, context)
  if (before.fingerprint !== expected.fingerprint) throw new Error("Database fingerprint does not match; reset refused.")
  if (before.hash !== expected.hash) {
    throw new Error("Data, starter content or source commit changed since the dry run (hash mismatch); "
      + "stop app writes (runbook quiet step) and run the dry run again.")
  }
  if (before.activity.liveConnections > 0 || before.activity.livePresence > 0) {
    throw new Error("The app is still serving users (live connections or room presence); finish the quiet step. Reset refused.")
  }

  for (const entry of DELETED_TABLES.filter((candidate) => !candidate.cascadeFrom)) {
    const result = await client.query(`DELETE FROM ${entry.table}${entry.where ? ` WHERE ${entry.where}` : ""}`)
    expectRowCount(entry.table, result.rowCount, before.counts.delete[entry.table])
  }
  await resetAccountState(client, context.starter, before.counts)
  const after = await planBetaReset(client, context)
  assertResetComplete(before.counts, after.counts)
  await recordBetaResetRun(client, { commit: context.source.commit, planHash: before.hash, repeatReason })
  return { before, after }
}

async function resetAccountState(client: PoolClient, starter: BetaResetStarter, planned: BetaResetCounts): Promise<void> {
  const starterDecor = JSON.stringify(starter.roomDecor)
  const coins = await client.query(
    `UPDATE blumi_economy_inventories SET coins = $1, coin_debt = 0, updated_at = now() WHERE ${coinsOffStarter(starter)}`,
    [starter.coins]
  )
  expectRowCount("coin balances", coins.rowCount, planned.reset.coinBalances)
  let loadouts = 0
  for (const change of await planLoadoutChanges(client, starter)) {
    const result = await client.query(
      `UPDATE blumi_accounts SET avatar_selection = $2::jsonb, avatar_preset_id = $3, avatar_revision = avatar_revision + 1
        WHERE account_id = ANY($1::text[])`,
      [change.accountIds, JSON.stringify(change.loadout), change.loadout.bodyId]
    )
    loadouts += result.rowCount ?? 0
  }
  expectRowCount("avatar loadouts", loadouts, planned.reset.avatarLoadouts)
  const decorUpdates = await client.query(
    `UPDATE blumi_personal_room_decor SET decor = $1::jsonb, revision = revision + 1, updated_at = now()
      WHERE ${DECOR_OFF_STARTER}`,
    [starterDecor]
  )
  expectRowCount("room decor updates", decorUpdates.rowCount, planned.reset.roomDecorUpdates)
  const decorInserts = await client.query(
    `INSERT INTO blumi_personal_room_decor (user_id, revision, decor, updated_at)
     SELECT a.user_id, 1, $1::jsonb, now() FROM blumi_accounts a WHERE ${ACCOUNTS_MISSING_DECOR}`,
    [starterDecor]
  )
  expectRowCount("room decor inserts", decorInserts.rowCount, planned.reset.roomDecorInserts)
}

function assertResetComplete(before: BetaResetCounts, after: BetaResetCounts): void {
  const leftovers = [...Object.values(after.delete), ...Object.values(after.reset)].reduce((sum, count) => sum + count, 0)
  if (leftovers !== 0) throw new Error(`Post-check failed: ${leftovers} rows still need a reset; rolled back.`)
  // Only locked tables can be compared inside the transaction; the reset issues no statement against the others.
  const changedKeep = [...LOCKED_KEPT_TABLES, "test persona likes"].filter((table) => before.keep[table] !== after.keep[table])
  if (changedKeep.length > 0) throw new Error(`Post-check failed: kept tables changed (${changedKeep.join(", ")}); rolled back.`)
}

const NOT_PERSONA = "user_id NOT IN (SELECT user_id FROM blumi_test_personas)"
const coinsOffStarter = (starter: BetaResetStarter): string =>
  `(coins <> ${Math.trunc(starter.coins)} OR coin_debt <> 0) AND ${NOT_PERSONA}`
const DECOR_OFF_STARTER = `decor <> $1::jsonb AND ${NOT_PERSONA}`
const PERSONA_LIKES = "from_user_id IN (SELECT user_id FROM blumi_test_personas)"
// Only finished rooms get a starter row; an account still in onboarding saves its first room itself (revision 0).
const ACCOUNTS_MISSING_DECOR = `a.onboarding_room_complete AND a.${NOT_PERSONA}
  AND NOT EXISTS (SELECT 1 FROM blumi_personal_room_decor d WHERE d.user_id = a.user_id)`

async function countRows(client: PoolClient, table: string, where?: string, values: unknown[] = []): Promise<number> {
  const alias = table === "blumi_accounts" ? " a" : ""
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table}${alias}${where ? ` WHERE ${where}` : ""}`,
    values
  )
  return Number(rows[0]?.count ?? 0)
}

async function readContentDigest(client: PoolClient): Promise<string> {
  const digests: Record<string, string> = {}
  for (const [table, sql] of Object.entries(CONTENT_SOURCES)) {
    const { rows } = await client.query<{ digest: string | null }>(
      `SELECT md5(string_agg(row, '|' ORDER BY row)) AS digest FROM (${sql}) source`
    )
    digests[table] = rows[0]?.digest ?? "empty"
  }
  return sha256(canonicalJson(digests))
}

async function planLoadoutChanges(client: PoolClient, starter: BetaResetStarter): Promise<LoadoutChange[]> {
  const { rows } = await client.query<{
    account_id: string
    avatar_selection: unknown
    avatar_preset_id: string | null
    gender: string | null
    owned: string[] | null
  }>(
    `SELECT a.account_id, a.avatar_selection, a.avatar_preset_id, COALESCE(a.identity_gender, a.gender) AS gender,
            i.owned_avatar_item_ids AS owned
       FROM blumi_accounts a LEFT JOIN blumi_economy_inventories i ON i.user_id = a.user_id
      WHERE a.${NOT_PERSONA}
      ORDER BY a.account_id`
  )
  const defaultOwned = getDefaultOwnedItemIds("avatar", resolveProductionEconomyCatalog())
  const changes = [starter.femaleLoadout, starter.maleLoadout].map((loadout) => ({ loadout, accountIds: [] as string[] }))
  let invalid = 0
  for (const row of rows) {
    const stored = isRecord(row.avatar_selection) ? row.avatar_selection : {}
    const bodyId = resolveAvatarBodyId(stored.bodyId, { presetId: row.avatar_preset_id, gender: row.gender })
    const change = changes.find((candidate) => candidate.loadout.bodyId === bodyId) ?? changes[0]!
    if (!validateAvatarLoadout(change.loadout, [...(row.owned ?? []), ...defaultOwned]).ok) invalid += 1
    const isStarter = canonicalJson(row.avatar_selection) === canonicalJson(change.loadout) &&
      row.avatar_preset_id === change.loadout.bodyId
    if (!isStarter) change.accountIds.push(row.account_id)
  }
  if (invalid > 0) throw new Error(`The starter look does not validate for ${invalid} accounts; reset refused.`)
  return changes.filter((change) => change.accountIds.length > 0)
}

function expectRowCount(label: string, actual: number | null, expected: number | undefined): void {
  if ((actual ?? 0) !== expected) {
    throw new Error(`Post-check failed: ${label} changed ${actual ?? 0} rows, the dry run counted ${expected}; rolled back.`)
  }
}
