import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import type { AccountRecord } from "../auth/authStore"
import { createPhoneBanHasher } from "../auth/moderationPhoneBan"
import { createChatService } from "../chat/chatService"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createPostgresMiniRoomRepository } from "./postgresMiniRoomRepository"

// Account deletion against the real schema. Foreign keys (for example
// blumi_mini_rooms.invite_id -> blumi_mini_room_invites, NO ACTION) only fail
// on a real database, so a statement-list test cannot prove the order works.

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }
const phoneBanHash = createPhoneBanHasher("account-deletion-integrity-secret-0123456789")
const avatar = {
  schemaVersion: 1 as const, bodyId: "avatar_v2_body_default", faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe", noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile", hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default", bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers", accessoryIds: [] as string[]
}

// Rows that must outlive the account by design, each with its reason.
const RETAINED_AFTER_DELETION = new Set([
  // The LiveKit grant of a deleted participant is revoked after the commit by
  // the media revocation worker; the row is that pending work.
  "blumi_media_revocations.user_id",
  // External Firebase user deletion is retried after the account row is gone.
  "blumi_firebase_user_deletion_outbox.account_id"
])

function openPool(): Pool {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
}

async function insertAccount(pool: Pool, userId: string): Promise<AccountRecord> {
  const accountId = `acct_${userId}`
  const phoneNumber = `+90555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`
  await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,
      onboarding_room_complete,created_at,updated_at)
    VALUES($1,$2,$3,'Profile',25,$4,$5,TRUE,TRUE,TRUE,NOW(),NOW())`,
  [accountId, userId, phoneNumber, avatar.bodyId, avatar])
  const now = new Date().toISOString()
  return {
    accountId, userId, phoneNumber,
    onboarding: { profile: "complete", avatar: "complete", room: "complete" },
    createdAt: now, updatedAt: now,
    profile: { userId, displayName: "Profile", age: 25, avatar: { presetId: avatar.bodyId, loadout: avatar, revision: 0 } }
  }
}

async function remainingReferences(pool: Pool, account: AccountRecord): Promise<string[]> {
  const columns = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.data_type = 'text'
        AND (c.column_name LIKE '%user_id' OR c.column_name = 'account_id')
      ORDER BY 1, 2`
  )
  const remaining: string[] = []
  for (const { table_name: table, column_name: column } of columns.rows) {
    const key = `${table}.${column}`
    if (RETAINED_AFTER_DELETION.has(key)) continue
    const value = column === "account_id" ? account.accountId : account.userId
    const result = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`,
      [value]
    )
    if ((result.rows[0]?.count ?? 0) > 0) remaining.push(key)
  }
  return remaining
}

test("PostgreSQL account deletion succeeds after an accepted chat room invite and leaves no rows naming the account", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  try {
    const ada = await insertAccount(pool, `del_ada_${suffix}`)
    const bora = await insertAccount(pool, `del_bora_${suffix}`)
    const threadId = `thread_${suffix}`
    const chatService = createChatService({ repository: createPostgresChatRepository(pool) })
    await chatService.createThread({
      threadId, miniRoomId: `match_${suffix}`,
      participantUserIds: [ada.userId, bora.userId],
      participants: [{ userId: ada.userId }, { userId: bora.userId }]
    })
    await chatService.sendMessageIdempotently(ada.userId, threadId, "hello", `client-del-${suffix.slice(0, 8)}`)
    await pool.query(
      `INSERT INTO blumi_matches(match_id, participant_a_user_id, participant_b_user_id, matched_at)
       VALUES ($1, $2, $3, NOW())`,
      [`match_${suffix}`, ada.userId, bora.userId]
    )

    const miniRooms = createPostgresMiniRoomRepository(pool)
    const createdAt = new Date()
    const inviteId = `invite_${suffix}`
    await miniRooms.createOrFindPendingChatInvite({
      inviteId, senderUserId: bora.userId, recipientUserId: ada.userId,
      sourceThreadId: threadId, status: "pending",
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 600_000).toISOString()
    }, createdAt)
    const accepted = await miniRooms.acceptPendingInvite({
      inviteId, decidedAt: new Date(createdAt.getTime() + 1_000).toISOString(),
      miniRoom: {
        miniRoomId: `mini_${suffix}`, lobbyRoomId: `lobby_${suffix}`,
        sourceThreadId: threadId, participantUserIds: [bora.userId, ada.userId],
        livekitRoomName: `livekit_${suffix}`, startedAt: new Date(createdAt.getTime() + 1_000).toISOString()
      }
    })
    assert.equal(accepted, "accepted")

    const deleted = await createPostgresAuthRepository(pool).deleteAccountData(ada, undefined, { phoneBanHash })
    assert.equal(deleted, true)

    assert.deepEqual(await remainingReferences(pool, ada), [])
    const account = await pool.query("SELECT 1 FROM blumi_accounts WHERE account_id = $1", [ada.accountId])
    assert.equal(account.rowCount, 0)
    // The partner keeps their own account; only the shared pair data goes.
    const partner = await pool.query("SELECT 1 FROM blumi_accounts WHERE account_id = $1", [bora.accountId])
    assert.equal(partner.rowCount, 1)
    const revocations = await pool.query(
      "SELECT user_id FROM blumi_media_revocations WHERE room_name = $1 ORDER BY user_id",
      [`livekit_${suffix}`]
    )
    assert.deepEqual(revocations.rows.map((row) => row.user_id).sort(), [ada.userId, bora.userId].sort())
  } finally {
    await pool.end()
  }
})
