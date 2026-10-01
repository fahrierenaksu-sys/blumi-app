import assert from "node:assert/strict"
import test from "node:test"
import { Pool, type QueryResultRow } from "pg"
import { DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT } from "../matches/discoverySnapshot"
import { createPostgresDiscoverySnapshots } from "./postgresDiscoverySnapshots"

// A Discover page read re-checks only the page's snapshot candidates. It used
// to re-rank every eligible account once per page row: with 20k
// accounts one page took about 3 s (61 external sorts of the whole pool).

const skip = !process.env.DATABASE_URL
const filters = { ageMin: 18, ageMax: 99, genders: [], vibes: [] }
const avatar = {
  schemaVersion: 1, bodyId: "avatar_v2_body_default", faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe", noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile", hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default", bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers", accessoryIds: []
}
const POOL_SIZE = 3000
const PAGE_ROWS = 61

interface PlanNode {
  "Relation Name"?: string
  "Actual Rows"?: number
  "Actual Loops"?: number
  Plans?: PlanNode[]
}

function accountRowsVisited(node: PlanNode): number {
  const own = node["Relation Name"] === "blumi_accounts"
    ? (node["Actual Rows"] ?? 0) * (node["Actual Loops"] ?? 1)
    : 0
  return own + (node.Plans ?? []).reduce((total, child) => total + accountRowsVisited(child), 0)
}

test("a Discover page read checks only the page's candidates, not the whole account pool", { skip }, async () => {
  assert.equal(process.env.BLUMI_TEST_REQUIRE_POSTGRES, "1", "run only through the disposable PostgreSQL gate")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const existing = await pool.query("SELECT EXISTS(SELECT 1 FROM blumi_accounts) AS accounts")
    assert.equal(existing.rows[0].accounts, false, "requires its own empty disposable database")
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
        avatar_preset_id,avatar_selection,avatar_revision,onboarding_profile_complete,onboarding_avatar_complete,
        onboarding_room_complete,created_at,updated_at)
      SELECT 'read_cost_'||n,'read_cost_'||lpad(n::text,5,'0'),'test+read_cost_'||n,'Profile '||n,25,'woman',
        $1,$2,1,TRUE,TRUE,TRUE,NOW(),NOW()
        FROM generate_series(0,$3) n`, [avatar.bodyId, avatar, POOL_SIZE])
    const viewer = "read_cost_00000"

    const statements: Array<{ sql: string; values: readonly unknown[] }> = []
    const recordingPool = {
      async query(sql: string, values?: readonly unknown[]) {
        statements.push({ sql, values: values ?? [] })
        return pool.query(sql, values as unknown[]) as Promise<{ rows: QueryResultRow[] }>
      },
      connect: () => pool.connect()
    }
    const repository = createPostgresDiscoverySnapshots(recordingPool)
    const meta = await repository.create({ userId: viewer, filters, filterHash: "read-cost", now: new Date() })
    // All accounts are ranked; the snapshot keeps the top capped slice.
    assert.equal(meta.count, Math.min(POOL_SIZE, DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT))

    const rows = await repository.read({ meta, filters, position: 0, limit: PAGE_ROWS })
    assert.equal(rows.length, PAGE_ROWS)
    assert.deepEqual(rows.map((row) => row.position), Array.from({ length: PAGE_ROWS }, (_, index) => index))
    assert.ok(rows.every((row) => row.profile !== null), "every current candidate stays available")
    assert.deepEqual(
      rows.map((row) => row.profile?.userId),
      Array.from({ length: PAGE_ROWS }, (_, index) => `read_cost_${String(index + 1).padStart(5, "0")}`),
      "the page keeps the snapshot order"
    )

    const read = statements.at(-1)!
    const explained = await pool.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${read.sql}`, read.values as unknown[])
    const plan = (explained.rows[0]!["QUERY PLAN"] as Array<{ Plan: PlanNode }>)[0]!.Plan
    const visited = accountRowsVisited(plan)
    assert.ok(visited <= PAGE_ROWS * 10, `a page read visited ${visited} account rows for ${PAGE_ROWS} candidates`)
  } finally {
    await pool.end()
  }
})
