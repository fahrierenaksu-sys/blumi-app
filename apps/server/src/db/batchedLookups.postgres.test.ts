import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import pg from "pg"
import { createAvatarSelection, DEFAULT_FEMALE_AVATAR_LOADOUT, toAvatarLoadoutV2 } from "@blumi/domain"
import { createAuthService, type AuthService } from "../auth/authService"
import { createChatService } from "../chat/chatService"
import { createMatchService } from "../matches/matchService"
import { createInMemoryPresenceRepository, createInMemoryPresenceStore, type PresenceRecord } from "../presence/presenceRepository"
import { createSafetyService } from "../safety/safetyService"
import { createServer } from "../server"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPostgresChatRepository } from "./postgresChatRepository"
import { createPostgresMatchRepository } from "./postgresMatchRepository"
import { createPostgresPresenceRepository } from "./postgresPresenceRepository"
import { createPostgresSafetyRepository } from "./postgresSafetyRepository"

// Runs only inside the isolated PostgreSQL gate (npm run verify:postgres).
const databaseUrl = process.env.DATABASE_URL?.trim()
const skip = process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !databaseUrl
const avatarSelection = JSON.stringify(toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT))

/** Wraps pool.query and pooled clients so every SQL statement is recorded. */
function recordQueries(pool: pg.Pool): string[] {
  const statements: string[] = []
  const record = (text: unknown) => {
    statements.push(typeof text === "string" ? text : String((text as { text?: string })?.text ?? ""))
  }
  const poolQuery = pool.query.bind(pool) as (...args: unknown[]) => unknown
  ;(pool as unknown as { query: unknown }).query = (...args: unknown[]) => { record(args[0]); return poolQuery(...args) }
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown
  ;(pool as unknown as { connect: unknown }).connect = (...args: unknown[]) => {
    // pool.query() checks out a client via the callback form; it is already
    // recorded above, so pass it through untouched.
    if (typeof args[0] === "function") return connect(...args)
    return (connect() as Promise<pg.PoolClient>).then((client) => new Proxy(client, {
      get(target, property, receiver) {
        if (property === "query") {
          return (...queryArgs: unknown[]) => {
            record(queryArgs[0])
            return (target.query as (...a: unknown[]) => unknown).apply(target, queryArgs)
          }
        }
        const value = Reflect.get(target, property, receiver) as unknown
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value
      }
    }))
  }
  return statements
}

async function insertAccounts(pool: pg.Pool, rows: Array<{ userId: string; displayName: string }>): Promise<void> {
  for (const row of rows) {
    await pool.query(
      `INSERT INTO blumi_accounts (
         account_id, user_id, phone_number, display_name, avatar_preset_id,
         avatar_selection, avatar_revision, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'avatar_v2_body_default', $5::jsonb, 1, NOW(), NOW())`,
      [`account_${row.userId}`, row.userId, `+1555${randomUUID().replace(/\D/g, "").slice(0, 7)}`, row.displayName, avatarSelection]
    )
  }
}

async function registerEligibleViewer(
  app: ReturnType<typeof createServer>,
  authService: AuthService,
  phoneNumber: string
): Promise<{ token: string; userId: string }> {
  assert.equal((await app.inject({ method: "POST", url: "/v1/auth/send-code", payload: { phoneNumber } })).statusCode, 202)
  const verified = await app.inject({
    method: "POST",
    url: "/v1/accounts/register",
    payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber, verificationCode: "482931" }
  })
  assert.equal(verified.statusCode, 200)
  const token = verified.json().session.sessionToken as string
  assert.ok(await authService.updateProfile(token, {
    displayName: "Viewer", age: 24, gender: "woman", avatarPresetId: "avatar_v2_body_default"
  }))
  for (const step of ["profile", "avatar", "room"] as const) {
    assert.ok(await authService.completeOnboardingStep(token, step))
  }
  return { token, userId: (await authService.getSession(token))!.account.userId }
}

function countTableReads(statements: readonly string[]) {
  const selects = statements.filter((sql) => /^\s*(WITH|SELECT)/i.test(sql))
  return {
    blockReads: selects.filter((sql) => /blumi_safety_blocks/.test(sql)).length,
    accountReads: selects.filter((sql) => /FROM blumi_accounts\b/.test(sql)).length,
    batchAccountReads: selects.filter((sql) => /user_id = ANY\(\$1::text\[\]\)/.test(sql)).length
  }
}

test("PostgreSQL findAccountsByUserIds and listBlockedUserIdsBetween match their single-row forms in one statement", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    const suffix = randomUUID().slice(0, 8)
    const [a, b, c] = [`user_a_${suffix}`, `user_b_${suffix}`, `user_c_${suffix}`]
    await insertAccounts(pool, [{ userId: a, displayName: "A" }, { userId: b, displayName: "B" }, { userId: c, displayName: "" }])
    const auth = createPostgresAuthRepository(pool)
    const statements = recordQueries(pool)
    const found = await auth.findAccountsByUserIds([a, b, c, a, "user_unknown"])
    assert.equal(statements.length, 1)
    assert.equal(found.length, 3)
    for (const userId of [a, b, c]) {
      assert.deepEqual(found.find((account) => account.userId === userId), await auth.findAccountByUserId(userId))
    }
    statements.length = 0
    assert.deepEqual(await auth.findAccountsByUserIds([]), [])
    assert.equal(statements.length, 0)

    const safety = createSafetyService({ repository: createPostgresSafetyRepository(pool) })
    await safety.blockUser(a, b)
    await safety.blockUser(c, a)
    statements.length = 0
    assert.deepEqual((await safety.listBlockedUserIdsBetween(a, [b, c, "user_unknown"])).sort(), [b, c].sort())
    assert.equal(statements.length, 1)
    for (const partner of [b, c, "user_unknown"]) {
      assert.equal(
        (await safety.listBlockedUserIdsBetween(a, [partner])).length > 0,
        await safety.hasBlockBetween(a, partner)
      )
    }
  } finally {
    await pool.end()
  }
})

test("PostgreSQL sync-matches and block-list SQL reads stay constant as partners grow", { skip }, async () => {
  const observed: Record<number, { sync: ReturnType<typeof countTableReads>; blocks: ReturnType<typeof countTableReads> }> = {}
  for (const partnerCount of [1, 5]) {
    const pool = new pg.Pool({ connectionString: databaseUrl })
    const authService = createAuthService({
      repository: createPostgresAuthRepository(pool),
      codeFactory: () => "482931",
      otpHmacSecret: process.env.BLUMI_OTP_HMAC_SECRET
    })
    const matchRepository = createPostgresMatchRepository(pool)
    const safetyService = createSafetyService({ repository: createPostgresSafetyRepository(pool) })
    const app = createServer({
      authService,
      safetyService,
      matchService: createMatchService({ repository: matchRepository }),
      chatService: createChatService({ repository: createPostgresChatRepository(pool) }),
      logger: false
    })
    try {
      const viewer = await registerEligibleViewer(app, authService, `+9055577${partnerCount}0001`)
      const suffix = randomUUID().slice(0, 8)
      const partners = Array.from({ length: partnerCount }, (_, index) => `user_p${index}_${suffix}`)
      await insertAccounts(pool, partners.map((userId, index) => ({ userId, displayName: `Partner ${index}` })))
      for (const [index, partner] of partners.entries()) {
        await matchRepository.createMatch({
          matchId: `match_${index}_${suffix}`,
          participantUserIds: [viewer.userId, partner],
          matchedAt: new Date(Date.UTC(2026, 8, 29, 10, index)).toISOString()
        })
      }
      const statements = recordQueries(pool)
      const synced = await app.inject({
        method: "POST", url: "/v1/threads/sync-matches", headers: { authorization: `Bearer ${viewer.token}` }
      })
      assert.equal(synced.statusCode, 200)
      assert.equal(synced.json().threads.length, partnerCount)
      const sync = countTableReads(statements)

      for (const partner of partners) await safetyService.blockUser(viewer.userId, partner)
      statements.length = 0
      const blocks = await app.inject({
        method: "GET", url: "/v1/safety/blocks", headers: { authorization: `Bearer ${viewer.token}` }
      })
      assert.equal(blocks.statusCode, 200)
      assert.equal(blocks.json().blocks.length, partnerCount)
      for (const block of blocks.json().blocks as Array<{ blockedUserId: string; blockedProfile?: { userId: string } }>) {
        assert.equal(block.blockedProfile?.userId, block.blockedUserId)
      }
      observed[partnerCount] = { sync, blocks: countTableReads(statements) }
    } finally {
      await app.close()
      await pool.end()
    }
  }
  console.log("sync-matches/blocks SQL reads by partner count", JSON.stringify(observed))
  // Before batching: sync-matches issued 4 block reads and 2 account reads per
  // partner; the block list issued 1 account read per block.
  assert.deepEqual(observed[1], observed[5])
})

test("PostgreSQL presence reads hide expired rows without deleting; purge is bounded and parity-matched in memory", { skip }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  try {
    const suffix = randomUUID().slice(0, 8)
    const users = [0, 1, 2, 3].map((index) => `user_presence_${index}_${suffix}`)
    await insertAccounts(pool, users.map((userId) => ({ userId, displayName: "P" })))
    const room = `room_${suffix}`
    const otherRoom = `room_other_${suffix}`
    const now = Date.now()
    const rows: Array<[string, string, number, number]> = [
      [room, users[0]!, now - 30_000, now - 60_000],
      [room, users[1]!, now - 20_000, now - 60_000],
      [room, users[2]!, now - 10_000, now - 60_000],
      [room, users[3]!, now + 600_000, now - 60_000],
      [otherRoom, users[0]!, now + 600_000, now - 50_000]
    ]
    const memoryStore = createInMemoryPresenceStore()
    for (const [index, [roomId, userId, expiresAt, updatedAt]] of rows.entries()) {
      await pool.query(
        `INSERT INTO blumi_room_presence (room_id, user_id, display_name, spot_id, in_mini_room, joined_at, updated_at, expires_at)
         VALUES ($1, $2, 'P', $3, false, $4, $4, $5)`,
        [roomId, userId, `spot_${index}`, new Date(updatedAt), new Date(expiresAt)]
      )
      const record: PresenceRecord = {
        roomId, userId, displayName: "P", avatar: createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, 1), spotId: `spot_${index}`,
        inMiniRoom: false, joinedAt: new Date(updatedAt).toISOString(), updatedAt: new Date(updatedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString()
      }
      memoryStore.records.set(`${roomId}:${userId}`, record)
    }
    const postgres = createPostgresPresenceRepository(pool)
    const memory = createInMemoryPresenceRepository(memoryStore)
    const readAt = new Date(now)
    const statements = recordQueries(pool)
    for (const repository of [postgres, memory]) {
      assert.deepEqual((await repository.listRoomPresence(room, readAt)).map((record) => record.userId), [users[3]])
      assert.equal(await repository.findUserPresence(room, users[0]!, readAt), null)
      assert.equal((await repository.findUserPresence(room, users[3]!, readAt))?.userId, users[3])
      assert.equal((await repository.findUserPresenceAcrossRooms(users[0]!, readAt))?.roomId, otherRoom)
    }
    // Before: every read ran a global DELETE first.
    assert.equal(statements.filter((sql) => /DELETE/i.test(sql)).length, 0)
    const stored = await pool.query("SELECT count(*)::int AS n FROM blumi_room_presence WHERE room_id IN ($1, $2)", [room, otherRoom])
    assert.equal(stored.rows[0]?.n, 5, "reads must not delete")
    assert.equal(memoryStore.records.size, 5)

    await assert.rejects(postgres.purgeExpiredPresence(0), /purge limit is invalid/)
    assert.equal(await postgres.purgeExpiredPresence(2), 2)
    assert.equal(await memory.purgeExpiredPresence(2), 2)
    assert.equal(await postgres.purgeExpiredPresence(500), 1)
    assert.equal(await memory.purgeExpiredPresence(500), 1)
    assert.equal(await postgres.purgeExpiredPresence(500), 0)
    const remaining = await pool.query(
      "SELECT room_id, user_id FROM blumi_room_presence WHERE room_id IN ($1, $2) ORDER BY room_id, user_id",
      [room, otherRoom]
    )
    const expectedRemaining = [[otherRoom, users[0]], [room, users[3]]].sort()
    assert.deepEqual(remaining.rows.map((row) => [row.room_id, row.user_id]).sort(), expectedRemaining)
    assert.deepEqual([...memoryStore.records.values()].map((record) => [record.roomId, record.userId]).sort(), expectedRemaining)
  } finally {
    await pool.end()
  }
})
