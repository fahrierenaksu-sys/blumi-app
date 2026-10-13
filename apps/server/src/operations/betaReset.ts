import { createHash } from "node:crypto"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  STARTER_COIN_BALANCE,
  STARTER_ROOM_BED_ID,
  resolveAvatarBodyId,
  validateAvatarLoadout
} from "@blumi/domain"
import type { PoolClient } from "pg"
import { getDefaultOwnedItemIds, resolveProductionEconomyCatalog } from "../economy/economyCatalog"

/**
 * The owner-approved full beta reset (option "c", 2026-10-10; spec: release plan 13/10 §4).
 * Coins go to the starter amount, every loadout to its body's starter look, every finished room to the starter
 * room with the bed; all chats, messages, matches, mini rooms and their pending pushes are deleted.
 * Accounts, profiles, gender, sessions, blocks, money ledgers and settings are never written.
 * Every count is computed, hashed and printed; IDs, phone numbers and bodies never leave this module.
 */

const PUSH_TYPES_ABOUT_DELETED_DATA = [
  "chat.message", "chat.room_invite", "discovery.like", "discovery.match", "match", "mini_room.invite"
] as const

interface DeletedTable {
  readonly table: string
  /** Rows go with this parent through ON DELETE CASCADE; they are counted, never deleted directly. */
  readonly cascadeFrom?: string
  readonly where?: string
}

// Order matters: a child is counted before its parent is deleted.
const DELETED_TABLES: readonly DeletedTable[] = [
  { table: "blumi_chat_threads" },
  { table: "blumi_chat_thread_participants", cascadeFrom: "blumi_chat_threads" },
  { table: "blumi_chat_messages", cascadeFrom: "blumi_chat_threads" },
  { table: "blumi_chat_delivery_outbox", cascadeFrom: "blumi_chat_threads" },
  { table: "blumi_chat_message_edit_audit" },
  { table: "blumi_matches" },
  { table: "blumi_connection_decisions" },
  { table: "blumi_connection_matches" },
  { table: "blumi_discovery_decisions" },
  { table: "blumi_discovery_snapshots" },
  { table: "blumi_discovery_snapshot_candidates", cascadeFrom: "blumi_discovery_snapshots" },
  { table: "blumi_discovery_decision_quotas" },
  { table: "blumi_mini_rooms" },
  { table: "blumi_active_mini_room_participants", cascadeFrom: "blumi_mini_rooms" },
  { table: "blumi_mini_room_invites" },
  { table: "blumi_reactions" },
  {
    table: "blumi_push_delivery_outbox",
    where: `data->>'type' IN (${PUSH_TYPES_ABOUT_DELETED_DATA.map((type) => `'${type}'`).join(", ")})`
  },
  { table: "blumi_room_presence" },
  { table: "blumi_realtime_payload_refs" },
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

const WRITTEN_TABLES = ["blumi_accounts", "blumi_economy_inventories", "blumi_personal_room_decor"] as const
const LOCKED_KEPT_TABLES = ["blumi_accounts", "blumi_economy_inventories"] as const

/** The starter room: the production shell with only the free starter bed at its default point (mobile `roomStarterModel.ts`). */
export const BETA_RESET_STARTER_ROOM_DECOR = Object.freeze({
  schemaVersion: 3,
  geometryVersion: "room_v2",
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [{ instanceId: "starter-room-bed", itemId: STARTER_ROOM_BED_ID, x: 0.52, y: 0.7, rotation: "front" }]
})

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

export interface BetaResetPlan {
  readonly fingerprint: string
  readonly counts: BetaResetCounts
  /** sha256 over the fingerprint and the delete and reset counts; `--apply` must quote it exactly. */
  readonly hash: string
}

interface LoadoutChange {
  readonly loadout: typeof DEFAULT_FEMALE_AVATAR_LOADOUT
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

export async function planBetaReset(client: PoolClient): Promise<BetaResetPlan> {
  const fingerprint = await readDatabaseFingerprint(client)
  const loadoutChanges = await planLoadoutChanges(client)
  const counts: BetaResetCounts = {
    delete: Object.fromEntries(await Promise.all(DELETED_TABLES.map(async (entry) =>
      [entry.table, await countRows(client, entry.table, entry.where)] as const))),
    reset: {
      coinBalances: await countRows(client, "blumi_economy_inventories", COINS_OFF_STARTER),
      avatarLoadouts: loadoutChanges.reduce((sum, change) => sum + change.accountIds.length, 0),
      roomDecorUpdates: await countRows(client, "blumi_personal_room_decor", DECOR_OFF_STARTER, [starterDecorJson()]),
      roomDecorInserts: await countRows(client, "blumi_accounts", ACCOUNTS_MISSING_DECOR)
    },
    keep: Object.fromEntries(await Promise.all(BETA_RESET_KEPT_TABLES.map(async (table) =>
      [table, await countRows(client, table)] as const)))
  }
  return { fingerprint, counts, hash: hashPlan(fingerprint, counts) }
}

/** Covers what the reset changes. Kept-table counts are printed only: sign-ins move them on a live database. */
export function hashPlan(fingerprint: string, counts: BetaResetCounts): string {
  return sha256(canonicalJson({ version: 1, fingerprint, delete: counts.delete, reset: counts.reset }))
}

/**
 * Applies the reset inside the caller's open transaction. Locks every written table first, so the counts that
 * matched `expectedHash` are exactly the rows changed; any difference throws and the caller rolls back.
 */
export async function applyBetaReset(
  client: PoolClient,
  expected: { readonly hash: string; readonly fingerprint: string }
): Promise<{ readonly before: BetaResetPlan; readonly after: BetaResetPlan }> {
  const lockedTables = [...new Set([...DELETED_TABLES.map((entry) => entry.table), ...WRITTEN_TABLES])]
  await client.query(`LOCK TABLE ${lockedTables.join(", ")} IN EXCLUSIVE MODE`)
  const before = await planBetaReset(client)
  if (before.fingerprint !== expected.fingerprint) throw new Error("Database fingerprint does not match; reset refused.")
  if (before.hash !== expected.hash) throw new Error("Counts changed since the dry run (hash mismatch); run the dry run again.")

  for (const entry of DELETED_TABLES.filter((candidate) => !candidate.cascadeFrom)) {
    const result = await client.query(`DELETE FROM ${entry.table}${entry.where ? ` WHERE ${entry.where}` : ""}`)
    expectRowCount(entry.table, result.rowCount, before.counts.delete[entry.table])
  }
  const coins = await client.query(
    `UPDATE blumi_economy_inventories SET coins = $1, coin_debt = 0, updated_at = now() WHERE ${COINS_OFF_STARTER}`,
    [STARTER_COIN_BALANCE]
  )
  expectRowCount("coin balances", coins.rowCount, before.counts.reset.coinBalances)
  let loadouts = 0
  for (const change of await planLoadoutChanges(client)) {
    const result = await client.query(
      `UPDATE blumi_accounts SET avatar_selection = $2::jsonb, avatar_preset_id = $3, avatar_revision = avatar_revision + 1
        WHERE account_id = ANY($1::text[])`,
      [change.accountIds, JSON.stringify(change.loadout), change.loadout.bodyId]
    )
    loadouts += result.rowCount ?? 0
  }
  expectRowCount("avatar loadouts", loadouts, before.counts.reset.avatarLoadouts)
  const decorUpdates = await client.query(
    `UPDATE blumi_personal_room_decor SET decor = $1::jsonb, revision = revision + 1, updated_at = now()
      WHERE ${DECOR_OFF_STARTER}`,
    [starterDecorJson()]
  )
  expectRowCount("room decor updates", decorUpdates.rowCount, before.counts.reset.roomDecorUpdates)
  const decorInserts = await client.query(
    `INSERT INTO blumi_personal_room_decor (user_id, revision, decor, updated_at)
     SELECT a.user_id, 1, $1::jsonb, now() FROM blumi_accounts a WHERE ${ACCOUNTS_MISSING_DECOR}`,
    [starterDecorJson()]
  )
  expectRowCount("room decor inserts", decorInserts.rowCount, before.counts.reset.roomDecorInserts)

  const after = await planBetaReset(client)
  assertResetComplete(before.counts, after.counts)
  return { before, after }
}

function assertResetComplete(before: BetaResetCounts, after: BetaResetCounts): void {
  const leftovers = [...Object.values(after.delete), ...Object.values(after.reset)].reduce((sum, count) => sum + count, 0)
  if (leftovers !== 0) throw new Error(`Post-check failed: ${leftovers} rows still need a reset; rolled back.`)
  // Only locked tables can be compared inside the transaction; the reset issues no statement against the others.
  const changedKeep = LOCKED_KEPT_TABLES.filter((table) => before.keep[table] !== after.keep[table])
  if (changedKeep.length > 0) throw new Error(`Post-check failed: kept tables changed (${changedKeep.join(", ")}); rolled back.`)
}

const COINS_OFF_STARTER = `coins <> ${STARTER_COIN_BALANCE} OR coin_debt <> 0`
const DECOR_OFF_STARTER = "decor <> $1::jsonb"
// Only finished rooms get a starter row; an account still in onboarding saves its first room itself (revision 0).
const ACCOUNTS_MISSING_DECOR = `a.onboarding_room_complete
  AND NOT EXISTS (SELECT 1 FROM blumi_personal_room_decor d WHERE d.user_id = a.user_id)`

async function countRows(client: PoolClient, table: string, where?: string, values: unknown[] = []): Promise<number> {
  const alias = table === "blumi_accounts" ? " a" : ""
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table}${alias}${where ? ` WHERE ${where}` : ""}`,
    values
  )
  return Number(rows[0]?.count ?? 0)
}

async function planLoadoutChanges(client: PoolClient): Promise<LoadoutChange[]> {
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
      ORDER BY a.account_id`
  )
  const defaultOwned = getDefaultOwnedItemIds("avatar", resolveProductionEconomyCatalog())
  const starters = [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]
  const changes = starters.map((loadout) => ({ loadout, accountIds: [] as string[] }))
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

function starterDecorJson(): string {
  return JSON.stringify(BETA_RESET_STARTER_ROOM_DECOR)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
