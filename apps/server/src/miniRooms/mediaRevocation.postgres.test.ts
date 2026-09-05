import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresMediaRevocationService } from "./mediaRevocationService"

const databaseUrl = process.env.DATABASE_URL?.trim()
test("PostgreSQL atomically enqueues end/block/suspension revocation and retains provider failures", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES('media_account','media_a','+905550001234',NOW(),NOW())`)
    for (const kind of ["end", "block", "suspend", "delete"]) {
      await pool.query(`INSERT INTO blumi_mini_rooms(mini_room_id,lobby_room_id,participant_a_user_id,participant_b_user_id,livekit_room_name,started_at)
        VALUES($1,'lobby','media_a',$2,$1,NOW())`, [`media_${kind}`, `media_b_${kind}`])
    }
    await pool.query("UPDATE blumi_mini_rooms SET ended_at=NOW(), ended_by_user_id='media_a' WHERE mini_room_id='media_end'")
    await pool.query("INSERT INTO blumi_safety_blocks(actor_user_id,blocked_user_id,created_at) VALUES('media_a','media_b_block',NOW())")
    await pool.query("DELETE FROM blumi_mini_rooms WHERE mini_room_id='media_delete'")
    await pool.query("UPDATE blumi_accounts SET moderation_status='suspended' WHERE user_id='media_a'")
    assert.equal((await pool.query("SELECT * FROM blumi_media_revocations")).rows.length, 8)
    let fail = true
    const removed: string[] = []
    const service = createPostgresMediaRevocationService(pool, { async removeParticipant(room,user) {
      if (fail) throw new Error("offline")
      removed.push(`${room}:${user}`)
    } })
    await service.dispatchDue()
    const pending = await pool.query("SELECT * FROM blumi_media_revocations WHERE completed_at IS NULL")
    assert.equal(pending.rows.length, 8)
    assert.ok(pending.rows.every((row) => row.last_error === "provider_removal_failed" && row.attempt_count === 1))
    fail = false
    await pool.query("UPDATE blumi_media_revocations SET available_at = NOW()")
    await service.dispatchDue()
    assert.equal(removed.length, 8)
    assert.equal((await pool.query("SELECT * FROM blumi_media_revocations WHERE completed_at IS NULL")).rows.length, 0)
    await pool.query("UPDATE blumi_accounts SET moderation_status='active' WHERE user_id='media_a'")
    await pool.query("UPDATE blumi_accounts SET moderation_status='suspended' WHERE user_id='media_a'")
    assert.equal((await pool.query("SELECT * FROM blumi_media_revocations WHERE completed_at IS NULL")).rows.length, 4)
    await pool.query("UPDATE blumi_media_revocations SET completed_at = NOW() - INTERVAL '25 hours' WHERE completed_at IS NOT NULL")
    await service.dispatchDue()
    assert.equal((await pool.query("SELECT * FROM blumi_media_revocations")).rows.length, 4)
  } finally { await pool.end() }
})
