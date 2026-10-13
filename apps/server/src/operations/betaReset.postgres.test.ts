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
import { BETA_RESET_CONFIRM_ENV } from "./betaResetCli"

const REPOSITORY_ROOT = resolve(__dirname, "../../../..")
const PROJECT_REF = "betatestrefaaaaaaaaa"
const OTHER_PROJECT_REF = "otherprojectrefaaaaa"

interface SeededAccount { accountId: string; userId: string; phone: string }
type Accounts = Record<"girl" | "boy" | "legacy" | "fresh", SeededAccount>

test("the beta reset counts, applies once, keeps protected data and refuses wrong guards", disposablePostgresSkip(), async () => {
  const databaseUrl = process.env.DATABASE_URL
  assertDisposablePostgresDatabase(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const client = await pool.connect()
  const outputs: string[] = []
  try {
    const accounts = await seed(client)
    const operatorUrl = await createProjectRole(client, databaseUrl)
    const run = (args: string[], env: Record<string, string> = {}) => {
      const result = runCli(args, { DATABASE_URL: operatorUrl, ...env })
      outputs.push(result.stdout, result.stderr)
      return result
    }
    const untouched = await protectedState(client)

    const dryRun = run(["--project-ref", PROJECT_REF])
    assert.equal(dryRun.status, 0, dryRun.stderr)
    const plan = readPlan(dryRun.stdout)
    assert.deepEqual(plan.counts.delete, {
      blumi_chat_threads: 1, blumi_chat_thread_participants: 2, blumi_chat_messages: 3, blumi_chat_delivery_outbox: 1,
      blumi_chat_message_edit_audit: 1, blumi_matches: 1, blumi_connection_decisions: 2, blumi_connection_matches: 1,
      blumi_discovery_decisions: 2, blumi_discovery_snapshots: 1, blumi_discovery_snapshot_candidates: 2,
      blumi_discovery_decision_quotas: 1, blumi_mini_rooms: 1, blumi_active_mini_room_participants: 2,
      blumi_mini_room_invites: 1, blumi_reactions: 1, blumi_push_delivery_outbox: 2, blumi_room_presence: 1,
      blumi_realtime_payload_refs: 1, blumi_room_showcase_snapshots: 1
    })
    assert.deepEqual(plan.counts.reset, { coinBalances: 2, avatarLoadouts: 3, roomDecorUpdates: 2, roomDecorInserts: 1 })
    assert.equal(plan.counts.keep.blumi_accounts, 4)
    assert.deepEqual(await protectedState(client), untouched, "the dry run writes nothing")
    const deletable = await deletableTotal(client)

    const confirm = { [BETA_RESET_CONFIRM_ENV]: `reset-beta-${PROJECT_REF}` }
    const applyArgs = ["--project-ref", PROJECT_REF, "--apply", "--expect", plan.expect, "--fingerprint", plan.fingerprint]
    const refusals = [
      run(["--project-ref", OTHER_PROJECT_REF, "--apply", "--expect", plan.expect, "--fingerprint", plan.fingerprint],
        { [BETA_RESET_CONFIRM_ENV]: `reset-beta-${OTHER_PROJECT_REF}` }),
      run(applyArgs.map((arg) => (arg === plan.expect ? "0".repeat(64) : arg)), confirm),
      run(applyArgs.map((arg) => (arg === plan.fingerprint ? "f".repeat(16) : arg)), confirm),
      run(applyArgs),
      run(applyArgs, { [BETA_RESET_CONFIRM_ENV]: "yes" }),
      run(["--project-ref", PROJECT_REF, "--apply"], confirm)
    ]
    for (const refusal of refusals) {
      assert.notEqual(refusal.status, 0)
      assert.match(refusal.stderr, /refused|mismatch|needs/)
    }
    assert.deepEqual(await protectedState(client), untouched, "a refused run writes nothing")
    assert.equal(await deletableTotal(client), deletable, "a refused run deletes nothing")

    const lateReaction = `reaction_${randomUUID()}`
    await client.query(`INSERT INTO blumi_reactions (reaction_id, room_id, actor_user_id, target_user_id, reaction, created_at)
      VALUES ($1, 'lobby', $2, $3, 'heart', now())`, [lateReaction, accounts.boy.userId, accounts.girl.userId])
    const changedSinceDryRun = run(applyArgs, confirm)
    assert.notEqual(changedSinceDryRun.status, 0)
    assert.match(changedSinceDryRun.stderr, /hash mismatch/)
    await client.query("DELETE FROM blumi_reactions WHERE reaction_id = $1", [lateReaction])
    // A sign-in between the dry run and the apply moves only kept tables; it must not block the reset.
    await client.query(`INSERT INTO blumi_sessions (session_token_hash, session_id, account_id, user_id, expires_at)
      VALUES ($1, $2, $3, $4, now() + interval '30 days')`, [randomUUID(), randomUUID(), accounts.boy.accountId, accounts.boy.userId])
    const untouchedAtApply = await protectedState(client)

    const applied = run(applyArgs, confirm)
    assert.equal(applied.status, 0, applied.stderr)
    const appliedCounts = readPlan(applied.stdout).counts
    assert.deepEqual({ delete: appliedCounts.delete, reset: appliedCounts.reset },
      { delete: plan.counts.delete, reset: plan.counts.reset }, "apply changes exactly what the dry run counted")
    await assertResetState(client, accounts, untouchedAtApply)

    const second = run(["--project-ref", PROJECT_REF])
    assert.equal(second.status, 0, second.stderr)
    const secondPlan = readPlan(second.stdout)
    assert.ok(Object.values(secondPlan.counts.delete).every((count) => count === 0))
    assert.deepEqual(secondPlan.counts.reset, { coinBalances: 0, avatarLoadouts: 0, roomDecorUpdates: 0, roomDecorInserts: 0 })
    const afterFirst = await resetState(client)
    const secondApply = run(["--project-ref", PROJECT_REF, "--apply", "--expect", secondPlan.expect,
      "--fingerprint", secondPlan.fingerprint], confirm)
    assert.equal(secondApply.status, 0, secondApply.stderr)
    assert.deepEqual(await resetState(client), afterFirst, "a second apply is a no-op")

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
  const json = stdout.slice(0, stdout.indexOf("\nfingerprint="))
  assert.ok(expect && fingerprint, "the dry run prints its hash and fingerprint")
  const parsed = JSON.parse(json) as {
    counts: { delete: Record<string, number>; reset: Record<string, number>; keep: Record<string, number> }
  }
  return { expect, fingerprint, counts: parsed.counts }
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
  }

  const rooms = createPersonalRoomDecorService({
    repository: createPostgresPersonalRoomDecorRepository(client),
    getOwnedRoomItemIds: async () => getDefaultOwnedItemIds("room")
  })
  for (const name of ["girl", "boy", "legacy"] as const) {
    const room = await rooms.get(accounts[name].userId)
    assert.deepEqual(room?.decor.placedItems.map((item) => item.itemId), [STARTER_ROOM_BED_ID], `${name} gets the starter room`)
  }
  assert.equal(await rooms.get(accounts.fresh.userId), null, "an account still in onboarding saves its own first room")
}

type ProtectedState = Record<string, string>

/** Digests of every kept row, and of every account column except the three avatar columns the reset rewrites. */
async function protectedState(client: PoolClient): Promise<ProtectedState> {
  const digests: Record<string, string> = {}
  const sources: Record<string, string> = {
    accounts: "SELECT (to_jsonb(a) - 'avatar_selection' - 'avatar_preset_id' - 'avatar_revision')::text AS row FROM blumi_accounts a",
    owned: "SELECT jsonb_build_array(user_id, owned_avatar_item_ids, owned_room_item_ids)::text AS row FROM blumi_economy_inventories",
    sessions: "SELECT t::text AS row FROM blumi_sessions t",
    blocks: "SELECT t::text AS row FROM blumi_safety_blocks t",
    rewards: "SELECT t::text AS row FROM blumi_economy_reward_ledger t",
    notificationPreferences: "SELECT t::text AS row FROM blumi_notification_preferences t",
    pushDevices: "SELECT t::text AS row FROM blumi_push_devices t",
    migrations: "SELECT t::text AS row FROM blumi_migrations t"
  }
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
    (SELECT count(*) FROM blumi_discovery_decisions) + (SELECT count(*) FROM blumi_discovery_snapshots) +
    (SELECT count(*) FROM blumi_discovery_decision_quotas) + (SELECT count(*) FROM blumi_mini_rooms) +
    (SELECT count(*) FROM blumi_mini_room_invites) + (SELECT count(*) FROM blumi_reactions) +
    (SELECT count(*) FROM blumi_room_presence) + (SELECT count(*) FROM blumi_realtime_payload_refs) +
    (SELECT count(*) FROM blumi_room_showcase_snapshots) +
    (SELECT count(*) FROM blumi_push_delivery_outbox WHERE data->>'type' <> 'discovery.watch_match')
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
  const accounts: Accounts = { girl: fakeAccount(), boy: fakeAccount(), legacy: fakeAccount(), fresh: fakeAccount() }
  const looks = {
    girl: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "avatar_v2_hair_retired_curl" },
    boy: { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: "avatar_v2_top_retired_tee" },
    legacy: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bodyId: "legacy_body_retired" },
    fresh: DEFAULT_FEMALE_AVATAR_LOADOUT
  }
  const profile = { girl: ["woman", "avatar_v2_body_default", true], boy: ["man", DEFAULT_MALE_AVATAR_LOADOUT.bodyId, true],
    legacy: ["man", "dusk", true], fresh: ["woman", DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId, false] } as const
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
  const { girl, boy, legacy, fresh } = accounts
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
  await client.query(`INSERT INTO blumi_mini_rooms (mini_room_id, lobby_room_id, participant_a_user_id, participant_b_user_id,
    livekit_room_name, started_at) VALUES ($1, 'lobby', $2, $3, $4, now())`, [room, girl.userId, boy.userId, `lk_${room}`])
  for (const owner of [girl, boy]) {
    await client.query("INSERT INTO blumi_active_mini_room_participants (user_id, mini_room_id) VALUES ($1, $2)", [owner.userId, room])
  }
  await client.query(`INSERT INTO blumi_mini_room_invites (invite_id, room_id, sender_user_id, recipient_user_id, sender_spot_id,
    status, created_at) VALUES ($1, 'lobby', $2, $3, 'spot', 'pending', now())`, [`invite_${randomUUID()}`, girl.userId, boy.userId])
  await client.query(`INSERT INTO blumi_reactions (reaction_id, room_id, actor_user_id, target_user_id, reaction, created_at)
    VALUES ($1, 'lobby', $2, $3, 'wave', now())`, [`reaction_${randomUUID()}`, girl.userId, boy.userId])
  for (const type of ["chat.message", "discovery.match", "discovery.watch_match"]) {
    await client.query(`INSERT INTO blumi_push_delivery_outbox (delivery_id, user_id, push_token, title, body, data, available_at)
      VALUES ($1, $2, 'ExponentPushToken[fixture]', 'Blumi', 'hello from the fixture', $3::jsonb, now())`,
    [`delivery_${randomUUID()}`, boy.userId, JSON.stringify({ type })])
  }
  await client.query(`INSERT INTO blumi_room_presence (room_id, user_id, display_name, avatar_preset_id, spot_id, expires_at,
    avatar_selection) VALUES ('lobby', $1, 'Fixture', 'avatar_v2_body_default', 'spot', now() + interval '1 minute', $2::jsonb)`,
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
