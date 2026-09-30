import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createChatService } from "../chat/chatService"
import { PublicRequestError } from "../errors/publicRequestError"
import { DiscoveryDecisionNotEligibleError, createMatchService } from "../matches/matchService"
import { createLivekitTokenService } from "../miniRooms/livekitTokenService"
import { createMiniRoomService } from "../miniRooms/miniRoomService"
import { createPresenceService } from "../presence/presenceService"
import { createRoomService } from "../rooms/roomService"
import { createSafetyService } from "../safety/safetyService"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createPostgresMatchRepository } from "./postgresMatchRepository"
import { createPostgresMiniRoomRepository } from "./postgresMiniRoomRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"

// Adversarial PostgreSQL proofs for the social loop. Concurrency and storage
// errors (for example NUL bytes, which PostgreSQL text rejects) only show up
// against the real database, so these run through the disposable gate.

const requirePostgres = { skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" }
const filters = { ageMin: 18, ageMax: 99, genders: [], vibes: [] }
const avatar = {
  schemaVersion: 1, bodyId: "avatar_v2_body_default", faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe", noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile", hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default", bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers", accessoryIds: ["avatar_v2_accessory_golden_heart_locket"]
}

function openPool(): Pool {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 25 })
}

async function insertDiscoverableAccount(
  pool: Pool,
  userId: string,
  gender: "woman" | "man",
  moderationStatus: "active" | "suspended" | "banned" = "active"
): Promise<void> {
  await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,
      onboarding_room_complete,moderation_status,created_at,updated_at)
    VALUES($1,$1,$1,'Profile',25,$2,$3,$4,TRUE,TRUE,TRUE,$5,NOW(),NOW())`,
  [userId, gender, avatar.bodyId, avatar, moderationStatus])
}

test("PostgreSQL chat keeps one row and one outbox job for twenty concurrent retries and rejects NUL bodies as a public error", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`chat_ada_${suffix}`, `chat_bora_${suffix}`]
  const threadId = `thread_${suffix}`
  const chatService = createChatService({ repository: createPostgresChatRepository(pool) })
  try {
    await chatService.createThread({
      threadId, miniRoomId: `room_${suffix}`, participantUserIds: [ada, bora],
      participants: [{ userId: ada }, { userId: bora }]
    })
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      chatService.sendMessageIdempotently(ada, threadId, "same tap", "client-pg-concurrent-01")
    ))
    assert.equal(results.filter((result) => result.created).length, 1)
    assert.equal(new Set(results.map((result) => result.message.messageId)).size, 1)
    const rows = await pool.query("SELECT count(*)::int AS count FROM blumi_chat_messages WHERE thread_id = $1", [threadId])
    assert.equal(rows.rows[0].count, 1)
    const jobs = await pool.query(`SELECT count(*)::int AS count FROM blumi_chat_delivery_outbox o
      JOIN blumi_chat_messages m USING (message_id) WHERE m.thread_id = $1`, [threadId])
    assert.equal(jobs.rows[0].count, 1)

    for (const body of ["hi\u0000there", "\u0000", "bell\u0007"]) {
      await assert.rejects(
        chatService.sendMessageIdempotently(ada, threadId, body, `client-pg-control-${body.length}0`),
        (error: unknown) => error instanceof PublicRequestError,
        `${JSON.stringify(body)} must fail as a public validation error, not a storage error`
      )
    }
    const afterControl = await pool.query("SELECT count(*)::int AS count FROM blumi_chat_messages WHERE thread_id = $1", [threadId])
    assert.equal(afterControl.rows[0].count, 1)
  } finally {
    await pool.end()
  }
})

test("PostgreSQL blocks and reports stay single under concurrency and NUL report notes fail as a public error", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`safety_ada_${suffix}`, `safety_bora_${suffix}`]
  const safetyService = createSafetyService({ repository: createPostgresSafetyRepository(pool) })
  try {
    const blocks = await Promise.allSettled(Array.from({ length: 10 }, () => safetyService.blockUser(ada, bora)))
    assert.deepEqual(blocks.filter((result) => result.status === "rejected"), [])
    const blockRows = await pool.query(
      "SELECT count(*)::int AS count FROM blumi_safety_blocks WHERE actor_user_id = $1 AND blocked_user_id = $2",
      [ada, bora]
    )
    assert.equal(blockRows.rows[0].count, 1)

    const reports = await Promise.all(Array.from({ length: 10 }, () =>
      safetyService.reportUser(ada, { reportedUserId: bora, reason: "harassment", idempotencyKey: `key_${suffix.slice(0, 8)}` })
    ))
    assert.equal(new Set(reports.map((result) => result.report.reportId)).size, 1)
    assert.equal(reports.filter((result) => !result.replayed).length, 1)

    await assert.rejects(
      safetyService.reportUser(ada, { reportedUserId: bora, reason: "harassment", note: "see\u0000this" }),
      (error: unknown) => error instanceof PublicRequestError
    )
    const reportRows = await pool.query("SELECT count(*)::int AS count FROM blumi_safety_reports WHERE actor_user_id = $1", [ada])
    assert.equal(reportRows.rows[0].count, 1)
  } finally {
    await pool.end()
  }
})

test("PostgreSQL concurrent reciprocal likes create one match and spend one decision per side", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`like_ada_${suffix}`, `like_bora_${suffix}`]
  const matchService = createMatchService({ repository: createPostgresMatchRepository(pool) })
  try {
    await insertDiscoverableAccount(pool, ada, "woman")
    await insertDiscoverableAccount(pool, bora, "man")
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => index % 2
      ? matchService.decideEligible(bora, ada, "like", filters, "man")
      : matchService.decideEligible(ada, bora, "like", filters, "woman")))
    const matches = await pool.query(
      `SELECT match_id FROM blumi_matches WHERE participant_key = $1`,
      [[ada, bora].sort().join(":")]
    )
    assert.equal(matches.rows.length, 1)
    const matchIds = new Set(results.filter((result) => result.matched).map((result) => result.match?.matchId))
    assert.deepEqual(matchIds, new Set([matches.rows[0].match_id]))
    assert.ok(results.some((result) => result.matched))
    assert.equal((await matchService.getDecisionQuota(ada)).used, 1)
    assert.equal((await matchService.getDecisionQuota(bora)).used, 1)
    const decisions = await pool.query(
      "SELECT count(*)::int AS count FROM blumi_discovery_decisions WHERE from_user_id = ANY($1::text[])",
      [[ada, bora]]
    )
    assert.equal(decisions.rows[0].count, 2)
  } finally {
    await pool.end()
  }
})

test("PostgreSQL discovery never opens a banned or suspended account for viewing or deciding", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const viewer = `mod_viewer_${suffix}`
  const banned = `mod_banned_${suffix}`
  const suspended = `mod_suspended_${suffix}`
  const matchService = createMatchService({ repository: createPostgresMatchRepository(pool) })
  try {
    await insertDiscoverableAccount(pool, viewer, "woman")
    await insertDiscoverableAccount(pool, banned, "man", "banned")
    await insertDiscoverableAccount(pool, suspended, "man", "suspended")
    // The banned account liked the viewer before its ban.
    await pool.query("INSERT INTO blumi_discovery_decisions VALUES($1,$2,'like',NOW())", [banned, viewer])
    const outcomes = await Promise.allSettled([banned, suspended].map((target) =>
      matchService.decideEligible(viewer, target, "like", filters, "woman")))
    const matches = await pool.query(
      "SELECT count(*)::int AS count FROM blumi_matches WHERE participant_a_user_id = $1 OR participant_b_user_id = $1",
      [viewer]
    )
    assert.equal(matches.rows[0].count, 0, "a like must never complete a match with a banned account")
    assert.equal((await matchService.getDecisionQuota(viewer)).used, 0)
    for (const outcome of outcomes) {
      assert.equal(outcome.status, "rejected")
      assert.ok(outcome.status === "rejected" && outcome.reason instanceof DiscoveryDecisionNotEligibleError)
    }
    for (const target of [banned, suspended]) {
      assert.equal(await matchService.findProfileForViewer(viewer, target, filters, "woman"), null)
    }
    // Discovery Watch scans this list; it must never push a moderated profile.
    const watchPage = await matchService.listDiscoveryPage(viewer, filters, { offset: 0, limit: 50 })
    assert.deepEqual(watchPage.filter((profile) => profile.userId === banned || profile.userId === suspended), [])
    await pool.query("UPDATE blumi_accounts SET moderation_status = 'warned' WHERE user_id = $1", [suspended])
    assert.ok((await matchService.listDiscoveryPage(viewer, filters, { offset: 0, limit: 50 }))
      .some((profile) => profile.userId === suspended), "a warned account stays discoverable")
  } finally {
    await pool.end()
  }
})

test("PostgreSQL a block that lands while an invite accept is in flight leaves no active room for the pair", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`race_ada_${suffix}`, `race_bora_${suffix}`]
  const threadId = `thread_race_${suffix}`
  const chatService = createChatService({ repository: createPostgresChatRepository(pool) })
  const safetyService = createSafetyService({ repository: createPostgresSafetyRepository(pool) })
  const repository = createPostgresMiniRoomRepository(pool)
  let separationDuringAccept: Promise<unknown> | null = null
  // Production runs the accept as one autocommit statement. Hold that
  // statement's transaction open while the recipient blocks the sender and the
  // block route's pair separation starts, then commit: the exact overlap a
  // real block and a real accept can produce.
  const racingRepository: typeof repository = {
    ...repository,
    async acceptPendingInvite(input) {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const outcome = await createPostgresMiniRoomRepository(client).acceptPendingInvite(input)
        await safetyService.blockUser(bora, ada)
        separationDuringAccept = repository.separateUserPair({ actorUserId: bora, otherUserId: ada, endedAt: new Date().toISOString() })
        await new Promise((resolve) => setTimeout(resolve, 200))
        await client.query("COMMIT")
        return outcome
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    }
  }
  let next = 0
  const miniRoomService = createMiniRoomService({
    repository: racingRepository,
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService(),
    idFactory: () => `${suffix}_${++next}`
  })
  const sender = { userId: ada, displayName: "Ada", avatar: { presetId: "avatar_v2_body_default" } } as unknown as Parameters<typeof miniRoomService.createChatInvite>[0]["senderProfile"]
  const recipient = { userId: bora, displayName: "Bora", avatar: { presetId: "avatar_v2_body_default" } } as unknown as Parameters<typeof miniRoomService.createChatInvite>[0]["senderProfile"]
  try {
    await insertDiscoverableAccount(pool, ada, "woman")
    await insertDiscoverableAccount(pool, bora, "man")
    await chatService.createThread({
      threadId, miniRoomId: `match_${suffix}`, participantUserIds: [ada, bora],
      participants: [{ userId: ada, displayName: "Ada" }, { userId: bora, displayName: "Bora" }]
    })
    const { invite } = await miniRoomService.createChatInvite({ threadId, senderProfile: sender, recipientProfile: recipient })
    const decision = await Promise.allSettled([miniRoomService.decideChatInvite({
      inviteId: invite.inviteId, actorUserId: bora, senderProfile: sender, recipientProfile: recipient, status: "accepted"
    })])
    await separationDuringAccept
    assert.equal(await safetyService.hasBlockBetween(ada, bora), true)
    assert.equal(await repository.findActiveMiniRoomForUser(ada), null, "a blocked pair must not keep an active shared room")
    const claims = await pool.query(
      "SELECT count(*)::int AS count FROM blumi_active_mini_room_participants WHERE user_id = ANY($1::text[])",
      [[ada, bora]]
    )
    assert.equal(claims.rows[0].count, 0)
    assert.equal(decision[0]!.status, "rejected", "the accepting user must not receive a media session for a blocked pair")
    assert.equal((decision[0] as PromiseRejectedResult).reason.code, "PAIR_BLOCKED")
  } finally {
    await pool.end()
  }
})

test("PostgreSQL room invite reaches exactly one outcome under concurrent accept and decline", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`invite_ada_${suffix}`, `invite_bora_${suffix}`]
  const threadId = `thread_invite_${suffix}`
  const chatService = createChatService({ repository: createPostgresChatRepository(pool) })
  const safetyService = createSafetyService({ repository: createPostgresSafetyRepository(pool) })
  let next = 0
  const miniRoomService = createMiniRoomService({
    repository: createPostgresMiniRoomRepository(pool),
    presenceService: createPresenceService({ roomService: createRoomService() }),
    safetyService,
    chatService,
    livekitTokenService: createLivekitTokenService(),
    idFactory: () => `${suffix}_${++next}`
  })
  const profiles = {
    sender: { userId: ada, displayName: "Ada", avatar: { presetId: "avatar_v2_body_default" } },
    recipient: { userId: bora, displayName: "Bora", avatar: { presetId: "avatar_v2_body_default" } }
  } as unknown as { sender: Parameters<typeof miniRoomService.createChatInvite>[0]["senderProfile"]; recipient: Parameters<typeof miniRoomService.createChatInvite>[0]["senderProfile"] }
  try {
    await insertDiscoverableAccount(pool, ada, "woman")
    await insertDiscoverableAccount(pool, bora, "man")
    await chatService.createThread({
      threadId, miniRoomId: `match_${suffix}`, participantUserIds: [ada, bora],
      participants: [{ userId: ada, displayName: "Ada" }, { userId: bora, displayName: "Bora" }]
    })
    const creations = await Promise.all(Array.from({ length: 6 }, (_, index) => miniRoomService.createChatInvite({
      threadId,
      senderProfile: index % 2 ? profiles.recipient : profiles.sender,
      recipientProfile: index % 2 ? profiles.sender : profiles.recipient
    })))
    assert.equal(creations.filter((result) => result.created).length, 1)
    const invite = creations.find((result) => result.created)!.invite
    const pending = await pool.query(
      "SELECT count(*)::int AS count FROM blumi_mini_room_invites WHERE source_thread_id = $1 AND status = 'pending'",
      [threadId]
    )
    assert.equal(pending.rows[0].count, 1)
    const [inviteSender, inviteRecipient] = invite.senderUserId === ada
      ? [profiles.sender, profiles.recipient]
      : [profiles.recipient, profiles.sender]
    const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => miniRoomService.decideChatInvite({
      inviteId: invite.inviteId,
      actorUserId: invite.recipientUserId,
      senderProfile: inviteSender,
      recipientProfile: inviteRecipient,
      status: index % 2 ? "declined" : "accepted"
    })))
    const finalInvite = await miniRoomService.repository.findInvite(invite.inviteId)
    const rooms = await pool.query("SELECT mini_room_id FROM blumi_mini_rooms WHERE source_thread_id = $1", [threadId])
    const claims = await pool.query(
      "SELECT count(*)::int AS count FROM blumi_active_mini_room_participants WHERE user_id = ANY($1::text[])",
      [[ada, bora]]
    )
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        assert.equal((outcome.reason as { code?: string }).code, "INVITE_NOT_AVAILABLE", String(outcome.reason))
      }
    }
    if (finalInvite?.status === "accepted") {
      assert.equal(rooms.rows.length, 1)
      assert.equal(claims.rows[0].count, 2)
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") assert.equal(outcome.value.miniRoom?.miniRoomId, rooms.rows[0].mini_room_id)
      }
    } else {
      assert.equal(finalInvite?.status, "declined")
      assert.equal(rooms.rows.length, 0)
      assert.equal(claims.rows[0].count, 0)
    }
  } finally {
    await pool.end()
  }
})
