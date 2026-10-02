import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createMatchService } from "../matches/matchService"
import { createPostgresMatchRepository } from "./postgresMatchRepository"

// Mutual-match atomicity against the real database. READ COMMITTED snapshot
// races only show up here, so these run through the disposable gate.

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

async function insertDiscoverableAccount(pool: Pool, userId: string, gender: "woman" | "man"): Promise<void> {
  await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,
      onboarding_room_complete,moderation_status,created_at,updated_at)
    VALUES($1,$1,$1,'Profile',25,$2,$3,$4,TRUE,TRUE,TRUE,'active',NOW(),NOW())`,
  [userId, gender, avatar.bodyId, avatar])
}

test("PostgreSQL: two likes that miss each other in their first statement still end as exactly one match", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`miss_ada_${suffix}`, `miss_bora_${suffix}`]
  const now = new Date()
  const boraClient = await pool.connect()
  try {
    await insertDiscoverableAccount(pool, ada, "woman")
    await insertDiscoverableAccount(pool, bora, "man")
    // Bora's like is written but not committed while Ada's first statement
    // runs: Ada's statement snapshot cannot see it.
    await boraClient.query("BEGIN")
    await boraClient.query(
      "SELECT outcome FROM blumi_consume_discovery_decision($1, $2, 'like', $3, NULL)",
      [bora, ada, now]
    )
    let statements = 0
    const adaRepository = createPostgresMatchRepository({
      async query(text, values) {
        const result = await pool.query(text, values as unknown[])
        statements += 1
        // Bora commits right after Ada's first statement, before her re-check.
        if (statements === 1) await boraClient.query("COMMIT")
        return result
      }
    })
    const recorded = await adaRepository.recordDecision({
      decision: { fromUserId: ada, toUserId: bora, decision: "like", decidedAt: now.toISOString() },
      now,
      proposedMatchId: `match_ada_${suffix}`
    })
    assert.equal(recorded.match?.matchId, `match_ada_${suffix}`, "the re-check sees the like committed meanwhile")
    assert.equal(recorded.matchCreated, true)

    // Bora's request (whose own first statement also missed Ada) replays it.
    const boraRetry = await createPostgresMatchRepository(pool).recordDecision({
      decision: { fromUserId: bora, toUserId: ada, decision: "like", decidedAt: now.toISOString() },
      now,
      proposedMatchId: `match_bora_${suffix}`
    })
    assert.equal(boraRetry.match?.matchId, `match_ada_${suffix}`)
    assert.equal(boraRetry.matchCreated, false)
    assert.equal(boraRetry.created, false)
    const rows = await pool.query("SELECT count(*)::int AS count FROM blumi_matches WHERE participant_key = $1", [[ada, bora].sort().join(":")])
    assert.equal(rows.rows[0].count, 1)
  } finally {
    boraClient.release()
    await pool.end()
  }
})

test("PostgreSQL: concurrent reciprocal likes notify the match exactly once per person", requirePostgres, async () => {
  const pool = openPool()
  const suffix = randomUUID()
  const [ada, bora] = [`push_ada_${suffix}`, `push_bora_${suffix}`]
  const pushes: Array<{ userId: string; type?: string }> = []
  const matchService = createMatchService({
    repository: createPostgresMatchRepository(pool),
    notificationService: {
      async sendPushToUser(userId, notification) {
        pushes.push({ userId, type: notification.data?.type })
        return { outcome: "queued", deliveryCount: 1 }
      }
    }
  })
  try {
    await insertDiscoverableAccount(pool, ada, "woman")
    await insertDiscoverableAccount(pool, bora, "man")
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => index % 2
      ? matchService.decideEligible(bora, ada, "like", filters, "man")
      : matchService.decideEligible(ada, bora, "like", filters, "woman")))
    assert.equal(results.filter((result) => result.matchCreated).length, 1)
    const matchPushes = pushes.filter((push) => push.type === "discovery.match")
    assert.deepEqual(matchPushes.map((push) => push.userId).sort(), [ada, bora].sort())
  } finally {
    await pool.end()
  }
})
