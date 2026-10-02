import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresDiscoverySnapshots } from "../db/postgresDiscoverySnapshots"
import { DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT, createDiscoverySnapshotService } from "./discoverySnapshot"

const filters = {ageMin:18,ageMax:99,genders:[],vibes:[]}
const avatar = {schemaVersion:1,bodyId:"avatar_v2_body_default",faceId:"avatar_v2_face_default",
  eyesId:"avatar_v2_eyes_mocha_doe",noseId:"avatar_v2_nose_soft_button",mouthId:"avatar_v2_mouth_peach_whisper_smile",
  hairId:"avatar_v2_hair_mocha_ribbon_blowout",topId:"avatar_v2_top_default",bottomId:"avatar_v2_bottom_default",
  shoesId:"avatar_v2_shoes_milk_tea_court_sneakers",accessoryIds:["avatar_v2_accessory_golden_heart_locket"]}

function assertDisposablePostgresDatabase(databaseUrl: string | undefined): asserts databaseUrl is string {
  assert.ok(databaseUrl, "DATABASE_URL is required")
  assert.equal(process.env.BLUMI_TEST_REQUIRE_POSTGRES,"1",
    "run this integration test only through the disposable PostgreSQL gate")
  const url = new URL(databaseUrl)
  assert.equal(url.hostname,"localhost","PostgreSQL gate must use its local Unix socket")
  assert.match(url.searchParams.get("host") ?? "",/blumi-pg-gate-/,
    "PostgreSQL socket must belong to a disposable blumi-pg-gate cluster")
  assert.match(url.pathname,/^\/blumi_gate_\d+$/,
    "integration tests require a per-file disposable blumi_gate database")
}

async function cleanupSnapshotFixtures(pool: Pool, userIds: string[]): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    try {
      await client.query(`DELETE FROM blumi_discovery_snapshot_candidates candidate
        USING blumi_discovery_snapshots snapshot
        WHERE candidate.snapshot_id=snapshot.snapshot_id AND snapshot.user_id=ANY($1::text[])`,[userIds])
      await client.query("DELETE FROM blumi_discovery_snapshots WHERE user_id=ANY($1::text[])",[userIds])
      await client.query(`DELETE FROM blumi_discovery_decisions
        WHERE from_user_id=ANY($1::text[]) AND to_user_id=ANY($1::text[])`,[userIds])
      await client.query(`DELETE FROM blumi_safety_blocks
        WHERE actor_user_id=ANY($1::text[]) AND blocked_user_id=ANY($1::text[])`,[userIds])
      await client.query("DELETE FROM blumi_accounts WHERE user_id=ANY($1::text[])",[userIds])
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    }
  } finally {
    client.release()
  }
}

test("PostgreSQL snapshot survives decisions, current eligibility changes, another instance and expiration", {skip:!process.env.DATABASE_URL}, async () => {
  assertDisposablePostgresDatabase(process.env.DATABASE_URL)
  const fixtureRunId = randomUUID().replaceAll("-","")
  const fixturePrefix = `snapshot_test_${fixtureRunId}`
  const viewerUserId = `${fixturePrefix}_viewer`
  const ids = Array.from({length:30},(_,i) => `${fixturePrefix}_profile_${String(i).padStart(2,"0")}`)
  const budgetPrefix = `${fixturePrefix}_budget_`
  const budgetIds = Array.from({length:1100},(_,i) => `${budgetPrefix}${i+1}`)
  const racePrefix = `${fixturePrefix}_race_`
  const raceIds = Array.from({length:6000},(_,i) => `${racePrefix}${i+1}`)
  const fixtureUserIds = [viewerUserId,...ids,...budgetIds,...raceIds]
  const pool = new Pool({connectionString:process.env.DATABASE_URL})
  const otherPool = new Pool({connectionString:process.env.DATABASE_URL})
  let fixtureDatabaseValidated = false
  try {
    const existingRows = await pool.query(`SELECT
      EXISTS(SELECT 1 FROM blumi_accounts) AS accounts,
      EXISTS(SELECT 1 FROM blumi_discovery_decisions) AS decisions,
      EXISTS(SELECT 1 FROM blumi_safety_blocks) AS blocks,
      EXISTS(SELECT 1 FROM blumi_discovery_snapshots) AS snapshots,
      EXISTS(SELECT 1 FROM blumi_discovery_snapshot_candidates) AS candidates`)
    assert.deepEqual(existingRows.rows[0],{accounts:false,decisions:false,blocks:false,snapshots:false,candidates:false},
      "the PostgreSQL integration test requires its own empty disposable database")
    fixtureDatabaseValidated = true

    for (const [index,id] of [viewerUserId,...ids].entries()) {
      await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
        avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,onboarding_room_complete,created_at,updated_at)
        VALUES($1,$1,$2,'Profile',25,'woman',$3,$4,TRUE,TRUE,TRUE,NOW(),NOW())`,
        [id,`test+${fixtureRunId}_profile_${index}`,avatar.bodyId,avatar])
    }
    const repository = createPostgresDiscoverySnapshots(pool)
    const service = createDiscoverySnapshotService(repository)
    const first = await service.page({userId:viewerUserId,filters,limit:12})
    assert.deepEqual(first.profiles.map(p=>p.userId),ids.slice(0,12))
    for (const id of ids.slice(0,9)) await pool.query(`INSERT INTO blumi_discovery_decisions VALUES($1,$2,'like',NOW())`,[viewerUserId,id])
    const otherService = createDiscoverySnapshotService(createPostgresDiscoverySnapshots(otherPool))
    const second = await otherService.page({userId:viewerUserId,filters,limit:12,cursor:first.page.nextCursor!})
    assert.deepEqual(second.profiles.map(p=>p.userId),ids.slice(12,24))
    await pool.query(`INSERT INTO blumi_safety_blocks(actor_user_id,blocked_user_id,created_at) VALUES($1,$2,NOW())`,[ids[12],viewerUserId])
    await pool.query(`UPDATE blumi_accounts SET moderation_status='suspended' WHERE user_id=$1`,[ids[13]])
    await otherPool.query(`INSERT INTO blumi_discovery_decisions VALUES($1,$2,'like',NOW())`,[viewerUserId,ids[14]])
    await pool.query(`DELETE FROM blumi_accounts WHERE user_id=$1`,[ids[15]])
    const live = await otherService.page({userId:viewerUserId,filters,limit:12,cursor:first.page.nextCursor!})
    assert.deepEqual(live.profiles.map(p=>p.userId),ids.slice(16,28))
    await assert.rejects(service.page({userId:ids[0]!,filters,limit:12,cursor:first.page.nextCursor!}),/cursor/i)
    await assert.rejects(service.page({userId:viewerUserId,filters:{...filters,ageMin:24},limit:12,cursor:first.page.nextCursor!}),/cursor/i)
    await pool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 minute' WHERE user_id=$1`,[viewerUserId])
    await assert.rejects(otherService.page({userId:viewerUserId,filters,limit:12,cursor:first.page.nextCursor!}),
      (error:any)=>error.code==="DISCOVERY_CURSOR_EXPIRED")
    await repository.purgeExpired()
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates c
      JOIN blumi_discovery_snapshots s ON s.snapshot_id=c.snapshot_id WHERE s.user_id=ANY($1::text[])`,[fixtureUserIds])).rows[0].count),0)
    const refreshed=await service.page({userId:viewerUserId,filters,limit:12})
    assert.equal(refreshed.profiles[0]?.userId,ids[9])

    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,onboarding_room_complete,created_at,updated_at)
      SELECT $3||n,$3||n,'test+'||$3||n,'Budget profile',25,'woman',$1,$2,TRUE,TRUE,TRUE,NOW(),NOW()
      FROM generate_series(1,1100) n`,[avatar.bodyId,avatar,budgetPrefix])
    await pool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=ANY($1::text[])`,[fixtureUserIds])
    const refreshes=await Promise.allSettled(Array.from({length:35},(_,i)=>(i%2 ? otherService : service).page({userId:viewerUserId,filters,limit:12})))
    for (const refresh of refreshes) {
      if (refresh.status==="rejected") assert.equal(refresh.reason.code,"DISCOVERY_REFRESH_LIMIT")
      else assert.equal((await otherService.page({userId:viewerUserId,filters,limit:12,cursor:refresh.value.page.nextCursor!})).profiles.length,12)
    }
    assert.equal(refreshes.filter(result=>result.status==="fulfilled").length,30)
    const budget = await pool.query(`SELECT COUNT(*) AS snapshots,MAX(candidate_count) AS max_candidates
      FROM blumi_discovery_snapshots WHERE user_id=$1`,[viewerUserId])
    assert.equal(Number(budget.rows[0].snapshots),30)
    // 1117 eligible accounts, but one snapshot stores at most the ranked cap.
    assert.equal(Number(budget.rows[0].max_candidates),DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT)
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates c
      JOIN blumi_discovery_snapshots s ON s.snapshot_id=c.snapshot_id WHERE s.user_id=$1`,[viewerUserId])).rows[0].count),30*DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT)
    const beforeFailure=await pool.query(`SELECT snapshot_id FROM blumi_discovery_snapshots WHERE user_id=ANY($1::text[]) ORDER BY snapshot_id`,[fixtureUserIds])
    // Use an owner below the active-snapshot cap so this exercises the SQL
    // failure/rollback path rather than the earlier refresh-budget guard.
    await assert.rejects(repository.create({userId:ids[0]!,filters:{...filters,ageMin:NaN},filterHash:"failure",now:new Date()}))
    assert.deepEqual((await pool.query(`SELECT snapshot_id FROM blumi_discovery_snapshots WHERE user_id=ANY($1::text[]) ORDER BY snapshot_id`,[fixtureUserIds])).rows,beforeFailure.rows)
    const indexes=(await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename='blumi_discovery_snapshots'`)).rows.map(row=>row.indexname)
    assert.ok(indexes.includes("blumi_discovery_snapshots_owner_recent_idx"))
    assert.ok(indexes.includes("blumi_discovery_snapshots_expiry_idx"))
    for (let i=0;i<3;i++) await otherService.page({userId:ids[0]!,filters,limit:12})
    const beforeCleanup=Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates c
      JOIN blumi_discovery_snapshots s ON s.snapshot_id=c.snapshot_id WHERE s.user_id=ANY($1::text[])`,[fixtureUserIds])).rows[0].count)
    assert.ok(beforeCleanup>5000)
    await pool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 minute' WHERE user_id=ANY($1::text[])`,[fixtureUserIds])
    // One purge tick drains the whole expired backlog in bounded batches; a
    // single 5000-row batch per minute fell behind snapshot creation.
    await repository.purgeExpired()
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates c
      JOIN blumi_discovery_snapshots s ON s.snapshot_id=c.snapshot_id WHERE s.user_id=ANY($1::text[])`,[fixtureUserIds])).rows[0].count),0)
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshots
      WHERE user_id=ANY($1::text[])`,[fixtureUserIds])).rows[0].count),0)
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,onboarding_room_complete,created_at,updated_at)
      SELECT $3||n,$3||n,'test+'||$3||n,'Race profile',25,'woman',$1,$2,TRUE,TRUE,TRUE,NOW(),NOW()
      FROM generate_series(1,6000) n`,[avatar.bodyId,avatar,racePrefix])
    const racePage=await service.page({userId:viewerUserId,filters,limit:12})
    const racingService=createDiscoverySnapshotService({...repository,get:async (...args)=>{
      const validMeta=await repository.get(...args)
      await otherPool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=ANY($1::text[])`,[fixtureUserIds])
      await createPostgresDiscoverySnapshots(otherPool).purgeExpired()
      assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates c
        JOIN blumi_discovery_snapshots s ON s.snapshot_id=c.snapshot_id WHERE s.user_id=$1`,[viewerUserId])).rows[0].count),0)
      return validMeta
    }})
    await assert.rejects(racingService.page({userId:viewerUserId,filters,limit:12,cursor:racePage.page.nextCursor!}),
      (error:any)=>error.code==="DISCOVERY_CURSOR_INVALID")
  } finally {
    try {
      if (fixtureDatabaseValidated) await cleanupSnapshotFixtures(pool,fixtureUserIds)
    } finally {
      await otherPool.end()
      await pool.end()
    }
  }
})
