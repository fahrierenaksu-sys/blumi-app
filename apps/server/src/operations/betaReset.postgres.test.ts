import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import test from "node:test"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  STARTER_ROOM_BED_ID,
  getDefaultOwnedItemIds,
  validateAvatarLoadout
} from "@blumi/domain"
import { Pool, type PoolClient } from "pg"
import { assertDisposablePostgresDatabase, disposablePostgresSkip } from "../db/disposablePostgres"
import { createPostgresPersonalRoomDecorRepository } from "../db/postgresPersonalRoomDecorRepository"
import { createPersonalRoomDecorService } from "../rooms/personalRoomDecorService"
import { BETA_RESET_DELETED_TABLES, BETA_RESET_WRITTEN_TABLES, applyBetaReset, planBetaReset } from "./betaReset"
import { BETA_RESET_CONFIRM_ENV, readBetaResetSource } from "./betaResetCli"
import { readBetaResetStarter } from "./betaResetStarter"

const REPOSITORY_ROOT = resolve(__dirname, "../../../..")
const PROJECT_REF = "betatestrefaaaaaaaaa"
const OTHER_PROJECT_REF = "otherprojectrefaaaaa"

interface SeededAccount { accountId: string; userId: string; phone: string }
type Accounts = Record<"girl" | "boy" | "legacy" | "fresh" | "persona", SeededAccount>

/** Kept tables the fixture fills, so their byte-for-byte check below can never pass on an empty table. */
const SEEDED_KEPT_TABLES = [
  "blumi_sessions", "blumi_push_devices", "blumi_notification_preferences", "blumi_chat_privacy_preferences",
  "blumi_discovery_watches", "blumi_discovery_quota_overrides", "blumi_safety_blocks", "blumi_safety_reports",
  "blumi_moderation_phone_bans", "blumi_economy_reward_ledger", "blumi_store_transactions", "blumi_store_events",
  "blumi_economy_iap_ledger", "blumi_referral_invites", "blumi_test_personas", "blumi_admin_user_audit",
  "blumi_push_receipts", "blumi_push_delivery_audit", "blumi_notification_policy_events",
  "blumi_realtime_connection_leases", "blumi_migrations"
] as const
// Written by triggers of the deletes, as when the app itself ends a room: the AFTER DELETE trigger on
// blumi_realtime_payload_refs returns the payload bytes to its budget row, and deleting a mini room queues a media
// revocation for both participants (migration 053). Rows that existed before stay byte-identical (see protectedState).
const TRIGGER_ADJUSTED_TABLES = ["blumi_realtime_payload_budget", "blumi_media_revocations"] as const
const RESET_ROOM_PREFIX = "lk\\_mini\\_%"

test("the beta reset counts, applies once, keeps protected data and refuses wrong guards", disposablePostgresSkip(), async () => {
  const databaseUrl = process.env.DATABASE_URL
  assertDisposablePostgresDatabase(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()
  const outputs: string[] = []
  try {
    const accounts = await seed(client)
    await seedKeptTables(client, accounts)
    const operatorUrl = await createProjectRole(client, databaseUrl)
    const run = (args: string[], env: Record<string, string> = {}) => {
      const result = runCli(args, { DATABASE_URL: operatorUrl, ...env })
      outputs.push(result.stdout, result.stderr)
      return result
    }
    for (const table of SEEDED_KEPT_TABLES) {
      const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
      assert.notEqual(rows[0]?.count, "0", `${table} has a fixture row, so its byte-for-byte check is real`)
    }
    const untouched = await protectedState(client)

    const dryRun = run(["--project-ref", PROJECT_REF])
    assert.equal(dryRun.status, 0, dryRun.stderr)
    const plan = readPlan(dryRun.stdout)
    assert.deepEqual(plan.counts.delete, {
      blumi_chat_threads: 1, blumi_chat_thread_participants: 2, blumi_chat_messages: 3, blumi_chat_delivery_outbox: 1,
      blumi_chat_message_edit_audit: 1, blumi_matches: 1, blumi_connection_decisions: 2, blumi_connection_matches: 1,
      blumi_discovery_decisions: 3, blumi_discovery_snapshots: 1, blumi_discovery_snapshot_candidates: 2,
      blumi_discovery_decision_quotas: 1, blumi_mini_rooms: 1, blumi_active_mini_room_participants: 2,
      blumi_mini_room_invites: 1, blumi_reactions: 1, blumi_push_delivery_outbox: 3, blumi_room_presence: 1,
      blumi_realtime_payload_refs: 1, blumi_room_showcase_snapshots: 1
    })
    // The test persona's look and room are never written (seedTestPersonas.ts gives it its own).
    assert.deepEqual(plan.counts.reset, { coinBalances: 2, avatarLoadouts: 3, roomDecorUpdates: 2, roomDecorInserts: 1 })
    assert.equal(plan.counts.keep.blumi_accounts, 5)
    assert.equal(plan.counts.keep["test persona likes"], 1)
    assert.deepEqual(plan.activity, { liveConnections: 0, livePresence: 0 })
    assert.deepEqual(plan.starter.female, starterItemIds(DEFAULT_FEMALE_AVATAR_LOADOUT), "the printed starter is the release's")
    assert.deepEqual(plan.starter.room, ["room_v2_shell_blumi_world_v1", STARTER_ROOM_BED_ID])
    assert.deepEqual(await protectedState(client), untouched, "the dry run writes nothing")
    const deletable = await deletableTotal(client)

    // The same release code in-process gives the same hash; other starters or another commit never match it.
    const { fullCommit, ...source } = readBetaResetSource()
    const context = { source, starter: readBetaResetStarter() }
    assert.equal((await planBetaReset(client, context)).hash, plan.expect)
    const expected = { hash: plan.expect, fingerprint: plan.fingerprint }
    for (const other of [{ ...context, starter: { ...context.starter, digest: "0".repeat(16) } },
      { ...context, source: { ...source, commit: "0".repeat(12) } }]) {
      await client.query("BEGIN")
      try {
        await assert.rejects(applyBetaReset(client, other, expected), /hash mismatch/)
      } finally {
        await client.query("ROLLBACK")
      }
    }

    const confirm = { [BETA_RESET_CONFIRM_ENV]: `reset-beta-${PROJECT_REF}` }
    const applyArgs = ["--project-ref", PROJECT_REF, "--apply", "--expect", plan.expect, "--fingerprint", plan.fingerprint,
      "--deployed-commit", fullCommit.slice(0, 12)]
    const refusals = [
      run(applyArgs.map((arg) => (arg === PROJECT_REF ? OTHER_PROJECT_REF : arg)),
        { [BETA_RESET_CONFIRM_ENV]: `reset-beta-${OTHER_PROJECT_REF}` }),
      run(applyArgs.map((arg) => (arg === plan.expect ? "0".repeat(64) : arg)), confirm),
      run(applyArgs.map((arg) => (arg === plan.fingerprint ? "f".repeat(16) : arg)), confirm),
      run(applyArgs.map((arg) => (arg === fullCommit.slice(0, 12) ? "0123456789ab" : arg)), confirm),
      run(applyArgs.slice(0, -2), confirm),
      run(applyArgs),
      run(applyArgs, { [BETA_RESET_CONFIRM_ENV]: "yes" }),
      run(["--project-ref", PROJECT_REF, "--apply"], confirm)
    ]
    for (const refusal of refusals) {
      assert.notEqual(refusal.status, 0)
      assert.match(refusal.stderr, /refused|mismatch|needs/)
    }
    assert.match(refusals[3]!.stderr, /not the deployed commit/)
    assert.deepEqual(await protectedState(client), untouched, "a refused run writes nothing")
    assert.equal(await deletableTotal(client), deletable, "a refused run deletes nothing")

    await assertWriteActivityRefused(client, accounts, () => run(applyArgs, confirm))

    // Churn the running app makes on its own (a quota roll-over, a sign-in) moves no hashed value.
    await client.query("INSERT INTO blumi_discovery_decision_quotas (user_id, quota_day, used_decisions) VALUES ($1, current_date, 1)",
      [accounts.boy.userId])
    await client.query(`INSERT INTO blumi_sessions (session_token_hash, session_id, account_id, user_id, expires_at)
      VALUES ($1, $2, $3, $4, now() + interval '30 days')`, [randomUUID(), randomUUID(), accounts.boy.accountId, accounts.boy.userId])
    const untouchedAtApply = await protectedState(client)

    const applied = run(applyArgs, confirm)
    assert.equal(applied.status, 0, applied.stderr)
    const appliedCounts = readPlan(applied.stdout).counts
    assert.deepEqual({ delete: appliedCounts.delete, reset: appliedCounts.reset }, {
      delete: { ...plan.counts.delete, blumi_discovery_decision_quotas: 2 }, reset: plan.counts.reset
    }, "apply changes what the dry run counted, plus the volatile rows present at the apply")
    await assertResetState(client, accounts, untouchedAtApply)

    const second = run(["--project-ref", PROJECT_REF])
    assert.equal(second.status, 0, second.stderr)
    const secondPlan = readPlan(second.stdout)
    assert.ok(Object.values(secondPlan.counts.delete).every((count) => count === 0))
    assert.deepEqual(secondPlan.counts.reset, { coinBalances: 0, avatarLoadouts: 0, roomDecorUpdates: 0, roomDecorInserts: 0 })
    const afterFirst = await resetState(client)
    const secondApply = run(["--project-ref", PROJECT_REF, "--apply", "--expect", secondPlan.expect,
      "--fingerprint", secondPlan.fingerprint, "--deployed-commit", fullCommit], confirm)
    assert.equal(secondApply.status, 0, secondApply.stderr)
    assert.deepEqual(await resetState(client), afterFirst, "a second apply is a no-op")
    assert.deepEqual(await protectedState(client), untouchedAtApply, "a second apply keeps every kept row")

    const printed = outputs.join("\n")
    for (const account of Object.values(accounts)) {
      for (const secret of [account.accountId, account.userId, account.phone, account.phone.slice(1)]) {
        assert.equal(printed.includes(secret), false, "the output never contains a seeded ID or phone")
      }
    }
    assert.doesNotMatch(printed, /hello from the fixture/)
  } finally {
    client.release()
    await pool.end()
  }
})

/** Writes by the app between the dry run and the apply (a new row, an edit, a live connection) make the apply refuse. */
async function assertWriteActivityRefused(
  client: PoolClient,
  accounts: Accounts,
  apply: () => { status: number | null; stderr: string }
): Promise<void> {
  const lateReaction = `reaction_${randomUUID()}`
  await client.query(`INSERT INTO blumi_reactions (reaction_id, room_id, actor_user_id, target_user_id, reaction, created_at)
    VALUES ($1, 'lobby', $2, $3, 'heart', now())`, [lateReaction, accounts.boy.userId, accounts.girl.userId])
  assert.match(apply().stderr, /hash mismatch/, "a new row since the dry run")
  await client.query("DELETE FROM blumi_reactions WHERE reaction_id = $1", [lateReaction])

  const edited = await client.query(
    "UPDATE blumi_chat_messages SET body = body || '!' WHERE message_id = (SELECT min(message_id) FROM blumi_chat_messages)"
  )
  assert.equal(edited.rowCount, 1)
  assert.match(apply().stderr, /hash mismatch/, "an edit since the dry run changes no count but is still caught")
  await client.query("UPDATE blumi_chat_messages SET body = rtrim(body, '!') WHERE message_id = (SELECT min(message_id) FROM blumi_chat_messages)")

  const lease = `lease_${randomUUID()}`
  await client.query(`INSERT INTO blumi_realtime_connection_leases (connection_id, user_id, expires_at)
    VALUES ($1, $2, now() + interval '90 seconds')`, [lease, accounts.girl.userId])
  const live = apply()
  assert.notEqual(live.status, 0)
  assert.match(live.stderr, /still serving users/, "a live connection means the quiet step is not done")
  await client.query("DELETE FROM blumi_realtime_connection_leases WHERE connection_id = $1", [lease])
}

function starterItemIds(loadout: Readonly<Record<string, unknown>>): unknown[] {
  return Object.entries(loadout).filter(([key]) => key.endsWith("Id") || key === "accessoryIds").map(([, value]) => value).flat()
}

function runCli(args: string[], env: Record<string, string>) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "apps/server/scripts/betaReset.ts", ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    timeout: 60_000,
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env }
  })
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

function readPlan(stdout: string) {
  const expect = /^expect=([0-9a-f]{64})$/m.exec(stdout)?.[1]
  const fingerprint = /^fingerprint=([0-9a-f]{16})$/m.exec(stdout)?.[1]
  const json = stdout.slice(0, stdout.indexOf("\ncommit="))
  assert.ok(expect && fingerprint, "the dry run prints its hash and fingerprint")
  const parsed = JSON.parse(json) as {
    counts: { delete: Record<string, number>; reset: Record<string, number>; keep: Record<string, number> }
    activity: Record<string, number>
    starter: { female: unknown[]; male: unknown[]; room: unknown[] }
  }
  return { expect, fingerprint, counts: parsed.counts, activity: parsed.activity, starter: parsed.starter }
}

/** The Supabase pooler user is `postgres.<ref>`; the throwaway cluster gets one so the real guard runs. */
async function createProjectRole(client: PoolClient, databaseUrl: string): Promise<string> {
  const role = `postgres.${PROJECT_REF}`
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE "${role}" LOGIN SUPERUSER; END IF;
  END $$`)
  const url = new URL(databaseUrl)
  url.username = encodeURIComponent(role)
  return url.toString()
}

async function assertResetState(client: PoolClient, accounts: Accounts, untouched: ProtectedState): Promise<void> {
  assert.deepEqual(await protectedState(client), untouched, "kept tables and profile columns stay byte-identical")
  assert.equal(await deletableTotal(client), 0)
  const kept = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM blumi_push_delivery_outbox WHERE data->>'type' = 'discovery.watch_match'"
  )
  assert.equal(kept.rows[0]?.count, "1", "a pending watch push survives")
  const revocations = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM blumi_media_revocations WHERE room_name LIKE '${RESET_ROOM_PREFIX}'`
  )
  assert.equal(revocations.rows[0]?.count, "2", "the deleted mini room queues one media revocation per participant")
  const coins = await client.query<{ coins: number; coin_debt: number }>("SELECT coins, coin_debt FROM blumi_economy_inventories")
  assert.ok(coins.rows.every((row) => row.coins === 1250 && row.coin_debt === 0))

  const expected = { girl: DEFAULT_FEMALE_AVATAR_LOADOUT, boy: DEFAULT_MALE_AVATAR_LOADOUT,
    legacy: DEFAULT_MALE_AVATAR_LOADOUT, fresh: DEFAULT_FEMALE_AVATAR_LOADOUT }
  const defaultsOwned = getDefaultOwnedItemIds("avatar")
  for (const [name, loadout] of Object.entries(expected)) {
    const { rows } = await client.query<{ avatar_selection: unknown; avatar_preset_id: string; avatar_revision: number }>(
      "SELECT avatar_selection, avatar_preset_id, avatar_revision FROM blumi_accounts WHERE account_id = $1",
      [accounts[name as keyof Accounts].accountId]
    )
    assert.deepEqual(rows[0]?.avatar_selection, loadout, `${name} wears the body's starter look`)
    assert.equal(rows[0]?.avatar_preset_id, loadout.bodyId)
    assert.equal(rows[0]?.avatar_revision, name === "fresh" ? 0 : 1, "only a changed look bumps its revision")
    assert.equal(validateAvatarLoadout(rows[0]?.avatar_selection, defaultsOwned).ok, true)
    if (loadout === DEFAULT_MALE_AVATAR_LOADOUT) {
      const worn = rows[0]?.avatar_selection as { hairId?: string; topId?: string } | undefined
      assert.equal(worn?.hairId, "avatar_v2_hair_male_blue_black_curls", `${name} wears the curls`)
      assert.equal(worn?.topId, "avatar_v2_top_male_white_basic_tee", `${name} wears basic_a`)
    }
  }

  const rooms = createPersonalRoomDecorService({
    repository: createPostgresPersonalRoomDecorRepository(client),
    getOwnedRoomItemIds: async () => getDefaultOwnedItemIds("room")
  })
  for (const name of ["girl", "boy", "legacy"] as const) {
    const room = await rooms.get(accounts[name].userId)
    assert.deepEqual(room?.decor.placedItems.map((item) => item.itemId), [STARTER_ROOM_BED_ID], `${name} gets the starter room`)
  }
  const persona = await client.query<{ avatar_selection: unknown; avatar_revision: number }>(
    "SELECT avatar_selection, avatar_revision FROM blumi_accounts WHERE account_id = $1", [accounts.persona.accountId])
  assert.deepEqual(persona.rows[0]?.avatar_selection, { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: "avatar_v2_top_retired_tee" },
    "the test persona keeps its seeded look")
  assert.equal(persona.rows[0]?.avatar_revision, 0)
  assert.equal(await rooms.get(accounts.persona.userId), null, "the test persona's room is never written")
  assert.equal(await rooms.get(accounts.fresh.userId), null, "an account still in onboarding saves its own first room")
}

type ProtectedState = Record<string, string>

/**
 * Digests of every row in every table the reset must not write (found in the catalog, so a new table is covered
 * too), of every account column except the three avatar columns it rewrites, of the owned items, and of the test
 * personas' likes.
 */
async function protectedState(client: PoolClient): Promise<ProtectedState> {
  const skipped = new Set<string>([...BETA_RESET_DELETED_TABLES, ...BETA_RESET_WRITTEN_TABLES, ...TRIGGER_ADJUSTED_TABLES])
  const { rows: tables } = await client.query<{ name: string }>(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  )
  const sources: Record<string, string> = {
    ...Object.fromEntries(tables.filter((table) => !skipped.has(table.name))
      .map((table) => [table.name, `SELECT t::text AS row FROM ${table.name} t`])),
    accounts: "SELECT (to_jsonb(a) - 'avatar_selection' - 'avatar_preset_id' - 'avatar_revision')::text AS row FROM blumi_accounts a",
    owned: "SELECT jsonb_build_array(user_id, owned_avatar_item_ids, owned_room_item_ids)::text AS row FROM blumi_economy_inventories",
    personaLikes: `SELECT t::text AS row FROM blumi_discovery_decisions t
      WHERE from_user_id IN (SELECT user_id FROM blumi_test_personas)`,
    earlierMediaRevocations: `SELECT t::text AS row FROM blumi_media_revocations t WHERE room_name NOT LIKE '${RESET_ROOM_PREFIX}'`
  }
  assert.ok(SEEDED_KEPT_TABLES.every((table) => table in sources), "every seeded kept table is digested")
  const digests: Record<string, string> = {}
  for (const [name, sql] of Object.entries(sources)) {
    const { rows } = await client.query<{ digest: string | null }>(
      `SELECT md5(string_agg(row, '|' ORDER BY row)) AS digest FROM (${sql}) rows`
    )
    digests[name] = rows[0]?.digest ?? "empty"
  }
  return digests
}

async function deletableTotal(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ total: string }>(`SELECT (
    (SELECT count(*) FROM blumi_chat_threads) + (SELECT count(*) FROM blumi_chat_messages) +
    (SELECT count(*) FROM blumi_chat_message_edit_audit) + (SELECT count(*) FROM blumi_matches) +
    (SELECT count(*) FROM blumi_connection_decisions) + (SELECT count(*) FROM blumi_connection_matches) +
    (SELECT count(*) FROM blumi_discovery_decisions WHERE from_user_id NOT IN (SELECT user_id FROM blumi_test_personas)) +
    (SELECT count(*) FROM blumi_discovery_snapshots) +
    (SELECT count(*) FROM blumi_discovery_decision_quotas) + (SELECT count(*) FROM blumi_mini_rooms) +
    (SELECT count(*) FROM blumi_mini_room_invites) + (SELECT count(*) FROM blumi_reactions) +
    (SELECT count(*) FROM blumi_room_presence) + (SELECT count(*) FROM blumi_realtime_payload_refs) +
    (SELECT count(*) FROM blumi_room_showcase_snapshots) +
    (SELECT count(*) FROM blumi_push_delivery_outbox WHERE data->>'type' <> 'discovery.watch_match') +
    (SELECT count(*) FROM blumi_active_mini_room_participants)
  )::text AS total`)
  return Number(rows[0]?.total)
}

async function resetState(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ state: string }>(`SELECT jsonb_build_array(
    (SELECT jsonb_agg(jsonb_build_array(account_id, avatar_selection, avatar_revision) ORDER BY account_id) FROM blumi_accounts),
    (SELECT jsonb_agg(jsonb_build_array(user_id, revision, decor) ORDER BY user_id) FROM blumi_personal_room_decor),
    (SELECT jsonb_agg(jsonb_build_array(user_id, coins, coin_debt) ORDER BY user_id) FROM blumi_economy_inventories)
  )::text AS state`)
  return rows[0]!.state
}

function fakeAccount(): SeededAccount {
  const id = randomUUID().replaceAll("-", "")
  return { accountId: `acct_${id}`, userId: `user_${id}`, phone: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}` }
}

async function seed(client: PoolClient): Promise<Accounts> {
  const accounts: Accounts = {
    girl: fakeAccount(), boy: fakeAccount(), legacy: fakeAccount(), fresh: fakeAccount(), persona: fakeAccount()
  }
  const looks = {
    girl: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "avatar_v2_hair_retired_curl" },
    boy: { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: "avatar_v2_top_retired_tee" },
    legacy: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bodyId: "legacy_body_retired" },
    fresh: DEFAULT_FEMALE_AVATAR_LOADOUT,
    persona: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: "avatar_v2_top_retired_tee" }
  }
  const profile = { girl: ["woman", "avatar_v2_body_default", true], boy: ["man", DEFAULT_MALE_AVATAR_LOADOUT.bodyId, true],
    legacy: ["man", "dusk", true], fresh: ["woman", DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId, false],
    persona: ["woman", DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId, true] } as const
  for (const name of Object.keys(accounts) as (keyof Accounts)[]) {
    const account = accounts[name]
    await client.query(
      `INSERT INTO blumi_accounts (account_id, user_id, phone_number, display_name, created_at, updated_at, gender,
         identity_gender, avatar_preset_id, avatar_selection, onboarding_room_complete)
       VALUES ($1, $2, $3, $4, now() - interval '3 days', now() - interval '2 days', $5, $5, $6, $7::jsonb, $8)`,
      [account.accountId, account.userId, account.phone, `Fixture ${name}`, profile[name][0], profile[name][1],
        JSON.stringify(looks[name]), profile[name][2]]
    )
  }
  const { girl, boy, legacy, fresh, persona } = accounts
  const inventory = `INSERT INTO blumi_economy_inventories (user_id, coins, coin_debt, owned_avatar_item_ids, owned_room_item_ids, updated_at)
    VALUES ($1, $2, $3, ARRAY['avatar_v2_hair_retired_curl'], ARRAY['room_v2_old_sofa'], now() - interval '1 day')`
  await client.query(inventory, [girl.userId, 40, 0])
  await client.query(inventory, [boy.userId, 9000, 5])
  await client.query(inventory, [fresh.userId, 1250, 0])
  const oldDecor = JSON.stringify({ roomShellId: "room_v2_shell_old", placedItems: [
    { instanceId: "sofa-1", itemId: "room_v2_old_sofa", x: 0.4, y: 0.6, rotation: "front" }] })
  for (const owner of [girl, boy]) {
    await client.query(`INSERT INTO blumi_personal_room_decor (user_id, revision, decor, updated_at)
      VALUES ($1, 4, $2::jsonb, now())`, [owner.userId, oldDecor])
  }
  await client.query(`INSERT INTO blumi_room_showcase_snapshots (user_id, room_revision, asset_key, mime_type, renderer_version,
    body, is_public, updated_at, created_at) VALUES ($1, 4, $2, 'image/webp', 'room-snapshot-v1', '\\x00'::bytea, true, now(), now())`,
  [girl.userId, `asset_${randomUUID()}`])

  const thread = `thread_${randomUUID()}`
  const room = `mini_${randomUUID()}`
  await client.query("INSERT INTO blumi_chat_threads (thread_id, mini_room_id, created_at) VALUES ($1, $2, now())", [thread, room])
  for (const [order, owner] of [girl, boy].entries()) {
    await client.query(`INSERT INTO blumi_chat_thread_participants (thread_id, user_id, display_name, participant_order)
      VALUES ($1, $2, 'Fixture', $3)`, [thread, owner.userId, order])
  }
  const messages = [randomUUID(), randomUUID(), randomUUID()].map((id) => `msg_${id}`)
  for (const message of messages) {
    await client.query(`INSERT INTO blumi_chat_messages (message_id, thread_id, sender_user_id, body, sent_at)
      VALUES ($1, $2, $3, 'hello from the fixture', now())`, [message, thread, girl.userId])
  }
  await client.query("INSERT INTO blumi_chat_delivery_outbox (message_id, available_at) VALUES ($1, now())", [messages[0]])
  await client.query(`INSERT INTO blumi_chat_message_edit_audit (message_id, thread_id, revision, editor_user_id, body_before,
    body_after, edited_at) VALUES ($1, $2, 1, $3, 'hello from the fixture', 'hello from the fixture!', now())`,
  [messages[1], thread, girl.userId])
  await client.query(`INSERT INTO blumi_matches (match_id, participant_a_user_id, participant_b_user_id, matched_at)
    VALUES ($1, $2, $3, now())`, [`match_${randomUUID()}`, girl.userId, boy.userId])
  for (const [actor, partner] of [[girl, boy], [boy, girl]]) {
    await client.query(`INSERT INTO blumi_connection_decisions (mini_room_id, actor_user_id, partner_user_id, status, decided_at)
      VALUES ($1, $2, $3, 'saved', now())`, [room, actor!.userId, partner!.userId])
    await client.query(`INSERT INTO blumi_discovery_decisions (from_user_id, to_user_id, decision, decided_at)
      VALUES ($1, $2, 'like', now())`, [actor!.userId, partner!.userId])
  }
  // The persona keeps the like it hands out (seedTestPersonas.ts); a like sent to the persona is deleted.
  await client.query("INSERT INTO blumi_test_personas (user_id, greeting, replies) VALUES ($1, 'Merhaba!', ARRAY['Selam'])",
    [persona.userId])
  for (const [from, to] of [[persona, girl], [girl, persona]]) {
    await client.query(`INSERT INTO blumi_discovery_decisions (from_user_id, to_user_id, decision, decided_at)
      VALUES ($1, $2, 'like', now())`, [from!.userId, to!.userId])
  }
  await client.query(`INSERT INTO blumi_connection_matches (mini_room_id, participant_a_user_id, participant_b_user_id, matched_at)
    VALUES ($1, $2, $3, now())`, [room, girl.userId, boy.userId])
  const snapshot = randomUUID()
  await client.query(`INSERT INTO blumi_discovery_snapshots (snapshot_id, user_id, filter_hash, created_at, expires_at, candidate_count)
    VALUES ($1, $2, 'filter', now(), now() + interval '1 hour', 2)`, [snapshot, girl.userId])
  for (const [position, candidate] of [boy, legacy].entries()) {
    await client.query("INSERT INTO blumi_discovery_snapshot_candidates (snapshot_id, position, user_id) VALUES ($1, $2, $3)",
      [snapshot, position, candidate.userId])
  }
  await client.query("INSERT INTO blumi_discovery_decision_quotas (user_id, quota_day, used_decisions) VALUES ($1, current_date, 3)",
    [girl.userId])
  // The chat's room invitation: the mini room points at its invite (FK, NO ACTION), so the room must go first.
  const invite = `invite_${randomUUID()}`
  await client.query(`INSERT INTO blumi_mini_room_invites (invite_id, room_id, sender_user_id, recipient_user_id, sender_spot_id,
    status, created_at) VALUES ($1, 'lobby', $2, $3, 'spot', 'accepted', now())`, [invite, girl.userId, boy.userId])
  await client.query(`INSERT INTO blumi_mini_rooms (mini_room_id, lobby_room_id, participant_a_user_id, participant_b_user_id,
    livekit_room_name, started_at, invite_id, source_thread_id, shared_decor)
    VALUES ($1, 'lobby', $2, $3, $4, now(), $5, $6, $7::jsonb)`,
  [room, girl.userId, boy.userId, `lk_${room}`, invite, thread, oldDecor])
  for (const owner of [girl, boy]) {
    await client.query("INSERT INTO blumi_active_mini_room_participants (user_id, mini_room_id) VALUES ($1, $2)", [owner.userId, room])
  }
  await client.query(`INSERT INTO blumi_reactions (reaction_id, room_id, actor_user_id, target_user_id, reaction, created_at)
    VALUES ($1, 'lobby', $2, $3, 'wave', now())`, [`reaction_${randomUUID()}`, girl.userId, boy.userId])
  for (const type of ["chat.message", "discovery.match", "connection.matched", "discovery.watch_match"]) {
    await client.query(`INSERT INTO blumi_push_delivery_outbox (delivery_id, user_id, push_token, title, body, data, available_at)
      VALUES ($1, $2, 'ExponentPushToken[fixture]', 'Blumi', 'hello from the fixture', $3::jsonb, now())`,
    [`delivery_${randomUUID()}`, boy.userId, JSON.stringify({ type })])
  }
  await client.query(`INSERT INTO blumi_room_presence (room_id, user_id, display_name, avatar_preset_id, spot_id, expires_at,
    avatar_selection) VALUES ('lobby', $1, 'Fixture', 'avatar_v2_body_default', 'spot', now() - interval '1 minute', $2::jsonb)`,
  [girl.userId, JSON.stringify(looks.girl)])
  await client.query("INSERT INTO blumi_realtime_payload_refs (payload_id, payload) VALUES ($1, '{\"kind\":\"fixture\"}'::jsonb)",
    [randomUUID()])

  await client.query(`INSERT INTO blumi_sessions (session_token_hash, session_id, account_id, user_id, expires_at)
    VALUES ($1, $2, $3, $4, now() + interval '30 days')`, [randomUUID(), randomUUID(), girl.accountId, girl.userId])
  await client.query("INSERT INTO blumi_safety_blocks (actor_user_id, blocked_user_id, created_at) VALUES ($1, $2, now())",
    [boy.userId, legacy.userId])
  await client.query(`INSERT INTO blumi_economy_reward_ledger (user_id, reward_type, idempotency_key, coins, created_at)
    VALUES ($1, 'mutual_match', 'fixture', 50, now())`, [girl.userId])
  return accounts
}

/** One row in each kept table the reset must never touch (identity, settings, safety, money, operations). */
async function seedKeptTables(client: PoolClient, accounts: Accounts): Promise<void> {
  const { girl, boy, persona } = accounts
  const hex = () => randomUUID().replaceAll("-", "").repeat(2)
  const transaction = `tx_${randomUUID()}`
  const event = `event_${randomUUID()}`
  const statements: [string, unknown[]][] = [
    ["INSERT INTO blumi_push_devices (user_id, platform, push_token) VALUES ($1, 'ios', 'ExponentPushToken[kept]')", [girl.userId]],
    ["INSERT INTO blumi_notification_preferences (user_id, likes_enabled) VALUES ($1, false)", [boy.userId]],
    ["INSERT INTO blumi_chat_privacy_preferences (user_id) VALUES ($1)", [girl.userId]],
    [`INSERT INTO blumi_discovery_watches (user_id, status, age_min, age_max, radius_km, updated_at, expires_at)
      VALUES ($1, 'active', 18, 30, 25, now(), now() + interval '7 days')`, [boy.userId]],
    [`INSERT INTO blumi_discovery_quota_overrides (user_id, reason, enabled_by)
      VALUES ($1, 'fixture override for the beta reset test', 'operator')`, [girl.userId]],
    [`INSERT INTO blumi_safety_reports (report_id, actor_user_id, reported_user_id, reason, created_at)
      VALUES ($1, $2, $3, 'spam', now())`, [`report_${randomUUID()}`, girl.userId, boy.userId]],
    ["INSERT INTO blumi_moderation_phone_bans (phone_hash, source) VALUES ($1, 'phone_change')", [hex()]],
    [`INSERT INTO blumi_store_transactions (provider, provider_transaction_id, user_id, product_id, store, payload_hash,
      created_at, updated_at) VALUES ('revenuecat', $1, $2, 'coins_small', 'ios', $3, now(), now())`, [transaction, girl.userId, hex()]],
    [`INSERT INTO blumi_store_events (provider, provider_event_id, provider_transaction_id, event_type, payload_hash,
      occurred_at, received_at) VALUES ('revenuecat', $1, $2, 'credit', $3, now(), now())`, [event, transaction, hex()]],
    [`INSERT INTO blumi_economy_iap_ledger (provider, provider_transaction_id, entry_type, user_id, product_id, coins,
      provider_event_id, created_at) VALUES ('revenuecat', $1, 'credit', $2, 'coins_small', 100, $3, now())`,
    [transaction, girl.userId, event]],
    ["INSERT INTO blumi_referral_invites (code, inviter_user_id, created_at) VALUES ($1, $2, now())",
      [`r_${hex()}`, boy.userId]],
    [`INSERT INTO blumi_admin_user_audit (audit_id, target_user_id, action, reason, operator_id, token_id,
      previous_quota, current_quota, created_at) VALUES ($1, $2, 'quota_reset', 'fixture quota reset reason', 'operator',
      'token', '{}'::jsonb, '{}'::jsonb, now())`, [randomUUID(), persona.userId]],
    [`INSERT INTO blumi_push_receipts (ticket_id, delivery_id, user_id, push_token, registration_id, created_at, available_at)
      VALUES ($1, $2, $3, 'ExponentPushToken[kept]', 'registration', now(), now())`, [`ticket_${randomUUID()}`, `delivery_${randomUUID()}`, girl.userId]],
    ["INSERT INTO blumi_push_delivery_audit (delivery_id, attempt, outcome) VALUES ($1, 1, 'sent')", [`delivery_${randomUUID()}`]],
    ["INSERT INTO blumi_notification_policy_events (user_id, notification_type, dedupe_key) VALUES ($1, 'match', 'kept')", [boy.userId]],
    // An expired lease: a dead connection from before the quiet step; a live one blocks the apply.
    [`INSERT INTO blumi_realtime_connection_leases (connection_id, user_id, expires_at)
      VALUES ($1, $2, now() - interval '5 minutes')`, [`lease_${randomUUID()}`, boy.userId]],
    ["INSERT INTO blumi_media_revocations (room_name, user_id) VALUES ($1, $2)", [`room_${randomUUID()}`, girl.userId]]
  ]
  for (const [sql, values] of statements) await client.query(sql, values)
}
