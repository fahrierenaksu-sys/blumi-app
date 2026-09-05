import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresDiscoverySnapshots } from "../db/postgresDiscoverySnapshots"
import { createDiscoverySnapshotService } from "./discoverySnapshot"

const filters = {ageMin:18,ageMax:99,genders:[],vibes:[]}
const avatar = {schemaVersion:1,bodyId:"avatar_v2_body_default",faceId:"avatar_v2_face_default",
  eyesId:"avatar_v2_eyes_mocha_doe",noseId:"avatar_v2_nose_soft_button",mouthId:"avatar_v2_mouth_peach_whisper_smile",
  hairId:"avatar_v2_hair_mocha_ribbon_blowout",topId:"avatar_v2_top_default",bottomId:"avatar_v2_bottom_default",
  shoesId:"avatar_v2_shoes_milk_tea_court_sneakers",accessoryIds:["avatar_v2_accessory_golden_heart_locket"]}

test("PostgreSQL snapshot survives decisions, current eligibility changes, another instance and expiration", {skip:!process.env.DATABASE_URL}, async () => {
  const pool = new Pool({connectionString:process.env.DATABASE_URL})
  const otherPool = new Pool({connectionString:process.env.DATABASE_URL})
  try {
    const ids = Array.from({length:30},(_,i) => `snapshot_profile_${String(i).padStart(2,"0")}`)
    for (const [index,id] of ["snapshot_viewer",...ids].entries()) {
      await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
        avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,onboarding_room_complete,created_at,updated_at)
        VALUES($1,$1,$2,'Profile',25,'woman',$3,$4,TRUE,TRUE,TRUE,NOW(),NOW())`,
        [id,`+90555007${String(index).padStart(4,"0")}`,avatar.bodyId,avatar])
    }
    const repository = createPostgresDiscoverySnapshots(pool)
    const service = createDiscoverySnapshotService(repository)
    const first = await service.page({userId:"snapshot_viewer",filters,limit:12})
    assert.deepEqual(first.profiles.map(p=>p.userId),ids.slice(0,12))
    for (const id of ids.slice(0,9)) await pool.query(`INSERT INTO blumi_discovery_decisions VALUES($1,$2,'like',NOW())`,["snapshot_viewer",id])
    const otherService = createDiscoverySnapshotService(createPostgresDiscoverySnapshots(otherPool))
    const second = await otherService.page({userId:"snapshot_viewer",filters,limit:12,cursor:first.page.nextCursor!})
    assert.deepEqual(second.profiles.map(p=>p.userId),ids.slice(12,24))
    await pool.query(`INSERT INTO blumi_safety_blocks(actor_user_id,blocked_user_id,created_at) VALUES($1,$2,NOW())`,[ids[12],"snapshot_viewer"])
    await pool.query(`UPDATE blumi_accounts SET moderation_status='suspended' WHERE user_id=$1`,[ids[13]])
    await otherPool.query(`INSERT INTO blumi_discovery_decisions VALUES($1,$2,'like',NOW())`,["snapshot_viewer",ids[14]])
    await pool.query(`DELETE FROM blumi_accounts WHERE user_id=$1`,[ids[15]])
    const live = await otherService.page({userId:"snapshot_viewer",filters,limit:12,cursor:first.page.nextCursor!})
    assert.deepEqual(live.profiles.map(p=>p.userId),ids.slice(16,28))
    await assert.rejects(service.page({userId:ids[0]!,filters,limit:12,cursor:first.page.nextCursor!}),/cursor/i)
    await assert.rejects(service.page({userId:"snapshot_viewer",filters:{...filters,ageMin:24},limit:12,cursor:first.page.nextCursor!}),/cursor/i)
    await pool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 minute' WHERE user_id=$1`,["snapshot_viewer"])
    await assert.rejects(otherService.page({userId:"snapshot_viewer",filters,limit:12,cursor:first.page.nextCursor!}),
      (error:any)=>error.code==="DISCOVERY_CURSOR_EXPIRED")
    await repository.purgeExpired()
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates`)).rows[0].count),0)
    const refreshed=await service.page({userId:"snapshot_viewer",filters,limit:12})
    assert.equal(refreshed.profiles[0]?.userId,ids[9])

    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,onboarding_room_complete,created_at,updated_at)
      SELECT 'budget_'||n,'budget_'||n,'+9055599'||LPAD(n::text,4,'0'),'Budget profile',25,'woman',$1,$2,TRUE,TRUE,TRUE,NOW(),NOW()
      FROM generate_series(1,1100) n`,[avatar.bodyId,avatar])
    await pool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 second'`)
    const refreshes=await Promise.allSettled(Array.from({length:35},(_,i)=>(i%2 ? otherService : service).page({userId:"snapshot_viewer",filters,limit:12})))
    for (const refresh of refreshes) {
      if (refresh.status==="rejected") assert.equal(refresh.reason.code,"DISCOVERY_REFRESH_LIMIT")
      else assert.equal((await otherService.page({userId:"snapshot_viewer",filters,limit:12,cursor:refresh.value.page.nextCursor!})).profiles.length,12)
    }
    assert.equal(refreshes.filter(result=>result.status==="fulfilled").length,30)
    const budget = await pool.query(`SELECT COUNT(*) AS snapshots,MAX(candidate_count) AS max_candidates
      FROM blumi_discovery_snapshots WHERE user_id='snapshot_viewer'`)
    assert.equal(Number(budget.rows[0].snapshots),30)
    assert.equal(Number(budget.rows[0].max_candidates),1117)
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates`)).rows[0].count),30*1117)
    const beforeFailure=await pool.query(`SELECT snapshot_id FROM blumi_discovery_snapshots ORDER BY snapshot_id`)
    // Use an owner below the active-snapshot cap so this exercises the SQL
    // failure/rollback path rather than the earlier refresh-budget guard.
    await assert.rejects(repository.create({userId:ids[0]!,filters:{...filters,ageMin:NaN},filterHash:"failure",now:new Date()}))
    assert.deepEqual((await pool.query(`SELECT snapshot_id FROM blumi_discovery_snapshots ORDER BY snapshot_id`)).rows,beforeFailure.rows)
    const indexes=(await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename='blumi_discovery_snapshots'`)).rows.map(row=>row.indexname)
    assert.ok(indexes.includes("blumi_discovery_snapshots_owner_recent_idx"))
    assert.ok(indexes.includes("blumi_discovery_snapshots_expiry_idx"))
    for (let i=0;i<3;i++) await otherService.page({userId:ids[0]!,filters,limit:12})
    const beforeCleanup=Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates`)).rows[0].count)
    assert.ok(beforeCleanup>5000)
    await pool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 minute'`)
    await repository.purgeExpired()
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates`)).rows[0].count),beforeCleanup-5000)
    for (let i=0;i<10;i++) await repository.purgeExpired()
    assert.equal(Number((await pool.query(`SELECT COUNT(*) FROM blumi_discovery_snapshot_candidates`)).rows[0].count),0)
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,display_name,age,gender,
      avatar_preset_id,avatar_selection,onboarding_profile_complete,onboarding_avatar_complete,onboarding_room_complete,created_at,updated_at)
      SELECT 'race_'||n,'race_'||n,'+9055588'||LPAD(n::text,4,'0'),'Race profile',25,'woman',$1,$2,TRUE,TRUE,TRUE,NOW(),NOW()
      FROM generate_series(1,6000) n`,[avatar.bodyId,avatar])
    const racePage=await service.page({userId:"snapshot_viewer",filters,limit:12})
    const racingService=createDiscoverySnapshotService({...repository,get:async (...args)=>{
      const validMeta=await repository.get(...args)
      await otherPool.query(`UPDATE blumi_discovery_snapshots SET expires_at=NOW()-INTERVAL '1 second'`)
      await createPostgresDiscoverySnapshots(otherPool).purgeExpired()
      assert.ok(Number((await pool.query(`SELECT MIN(position) AS first FROM blumi_discovery_snapshot_candidates`)).rows[0].first)>=5000)
      return validMeta
    }})
    await assert.rejects(racingService.page({userId:"snapshot_viewer",filters,limit:12,cursor:racePage.page.nextCursor!}),
      (error:any)=>error.code==="DISCOVERY_CURSOR_INVALID")
  } finally {await otherPool.end();await pool.end()}
})
