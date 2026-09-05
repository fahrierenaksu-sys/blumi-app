import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createPostgresMatchRepository } from "./postgresMatchRepository"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createNotificationService } from "../notifications/notificationService"
import type { DiscoveryWatchClaim } from "../matches/matchRepository"
import { createSeedDiscoverProfiles } from "../matches/matchRepository"

test("F45 transaction rollback, stable reclaim, cancellation and dispatch admission share durable authority", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1", timeout: 30_000
}, async () => {
  assert.ok(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  const match = createPostgresMatchRepository(pool)
  const repository = createPostgresNotificationRepository(pool)
  const userId = "atomic_watch"
  let now = new Date("2026-09-05T10:00:00Z")
  const notification = { title: "Blumi", body: "Yeni adaylar", data: { type: "discovery.watch_match", eventId: "untrusted-worker-lease" } }
  const service = createNotificationService({ repository, now: () => now })
  const activate = async () => {
    await match.upsertDiscoveryWatch({ userId, status: "active", preferences: {
      ageMin: 18, ageMax: 99, genders: ["woman"], vibes: []
    }, updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 86400_000).toISOString() })
    const claim = await match.claimNextDiscoveryWatch(now)
    assert.ok(claim)
    return claim
  }
  const enqueue = (claim: DiscoveryWatchClaim) => service.sendPushToUser(userId, notification, claim)
  try {
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES($1,$1,$1,NOW(),NOW())`, [userId])
    await service.registerDevice(userId, { platform: "ios", pushToken: "atomic_watch_token" })

    const cancelled = await activate()
    await match.deleteDiscoveryWatch(userId)
    assert.equal((await enqueue(cancelled)).outcome, "stale_watch")
    assert.equal((await repository.listPendingDeliveries()).length, 0)
    const tombstone = await pool.query("SELECT generation,cancelled_at,claim_token FROM blumi_discovery_watches WHERE user_id=$1", [userId])
    assert.notEqual(tombstone.rows[0].generation, cancelled.generation)
    assert.ok(tombstone.rows[0].cancelled_at)
    assert.equal(tombstone.rows[0].claim_token, null)

    const raced = await activate()
    let checked!: () => void
    const checkFinished = new Promise<void>((resolve) => { checked = resolve })
    let continueEnqueue!: () => void
    const enqueueGate = new Promise<void>((resolve) => { continueEnqueue = resolve })
    const pausedRepository = createPostgresNotificationRepository({ query: pool.query.bind(pool), async connect() {
      const client = await pool.connect()
      return { release: () => client.release(), async query(sql, values) {
        const result = await client.query(sql, values ? [...values] : undefined)
        if (sql.includes("AND claim_token = $3") && sql.includes("FOR UPDATE")) {
          checked()
          await enqueueGate
        }
        return result
      } }
    } })
    const racedEnqueue = createNotificationService({ repository: pausedRepository, now: () => now })
      .sendPushToUser(userId, notification, raced)
    await checkFinished
    const racedCancel = match.deleteDiscoveryWatch(userId)
    let cancelWaiting = false
    for (let attempt = 0; attempt < 100 && !cancelWaiting; attempt++) {
      const waiting = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND query LIKE '%blumi:watch:%'`)
      cancelWaiting = waiting.rows.length > 0
    }
    continueEnqueue()
    assert.equal((await racedEnqueue).outcome, "queued")
    await racedCancel
    assert.equal(cancelWaiting, true, "cancellation cannot slip between checked authority and atomic enqueue/completion")
    assert.equal((await repository.listPendingDeliveries()).length, 0, "cancel removes even a just-committed old generation")
    // A separate generation below must not inherit this successful generation's policy key.

    const interrupted = await activate()
    const failing = createPostgresNotificationRepository({ query: pool.query.bind(pool), async connect() {
      const client = await pool.connect()
      return { release: () => client.release(), async query(sql, values) {
        if (/SET completed_at = \$3/.test(sql)) throw new Error("injected completion failure")
        return client.query(sql, values ? [...values] : undefined)
      } }
    } })
    const failingService = createNotificationService({ repository: failing, now: () => now })
    await assert.rejects(failingService.sendPushToUser(userId, notification, interrupted), /injected completion failure/)
    assert.equal((await repository.listPendingDeliveries()).length, 0, "outbox must roll back with completion")
    assert.equal((await pool.query("SELECT * FROM blumi_notification_policy_events WHERE user_id=$1 AND dedupe_key=$2", [userId, `discovery-watch:${userId}:${interrupted.generation}`])).rows.length, 0)
    now = new Date(now.getTime() + 61_000)
    const reclaimed = await match.claimNextDiscoveryWatch(now)
    assert.ok(reclaimed)
    assert.equal(reclaimed.generation, interrupted.generation)
    assert.notEqual(reclaimed.claimToken, interrupted.claimToken)
    assert.equal((await enqueue(interrupted)).outcome, "stale_watch")
    assert.equal((await enqueue(reclaimed)).outcome, "queued")
    // Crash after commit but before worker acknowledgement must not reactivate the watch.
    await match.restoreDiscoveryWatch(reclaimed)
    assert.equal(await match.claimNextDiscoveryWatch(new Date(now.getTime() + 61_000)), null)
    assert.equal((await enqueue(reclaimed)).outcome, "stale_watch")
    const events = await pool.query("SELECT dedupe_key FROM blumi_notification_policy_events WHERE user_id=$1 AND dedupe_key=$2", [userId, `discovery-watch:${userId}:${reclaimed.generation}`])
    assert.deepEqual(events.rows.map((row) => row.dedupe_key), [`discovery-watch:${userId}:${reclaimed.generation}`])
    const [claimed] = await repository.claimDueDeliveries({ now, limit: 10, leaseMs: 60_000 })
    assert.equal(claimed.discoveryWatch?.generation, reclaimed.generation)
    await match.deleteDiscoveryWatch(userId)
    let sends = 0
    assert.equal((await repository.withAuthorizedDelivery(claimed, now, async () => { sends++ })).authorized, false)
    assert.equal(sends, 0)
    assert.equal((await repository.listPendingDeliveries()).length, 0)

    const active = await activate()
    await enqueue(active)
    const [admitted] = await repository.claimDueDeliveries({ now, limit: 10, leaseMs: 60_000 })
    let entered!: () => void
    const providerEntered = new Promise<void>((resolve) => { entered = resolve })
    let release!: () => void
    const providerPending = new Promise<void>((resolve) => { release = resolve })
    const dispatch = repository.withAuthorizedDelivery(admitted, now, async () => { sends++; entered(); await providerPending })
    await providerEntered
    const cancellation = match.deleteDiscoveryWatch(userId)
    // Observe actual PostgreSQL lock waiting, not wall-clock timing assumptions.
    let blocked = false
    for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
      const waiting = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND query LIKE '%blumi:watch:%'`)
      blocked = waiting.rows.length > 0
    }
    release()
    assert.equal((await dispatch).authorized, true)
    await cancellation
    assert.equal(blocked, true, "cancel must serialize behind an already admitted bounded provider call")
    assert.equal(sends, 1, "already admitted push cannot be recalled")
    assert.equal((await repository.listPendingDeliveries()).length, 0)
    assert.equal((await repository.withAuthorizedDelivery(admitted, now, async () => { sends++ })).authorized, false)
  } finally { await pool.end() }
})

for (const first of ["delete", "dispatch"] as const) test(`F54 ${first}-first confirmed deletion and dispatch never invert device/watch locks`, {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1", timeout: 15_000
}, async () => {
  assert.ok(process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  const userId = `delete_watch_race_${first}`
  const now = new Date("2026-09-05T10:00:00Z")
  const match = createPostgresMatchRepository(pool)
  const notifications = createPostgresNotificationRepository(pool)
  const service = createNotificationService({ repository: notifications, now: () => now })
  let devicesDeleted!: () => void
  const deletedDevices = new Promise<void>((resolve) => { devicesDeleted = resolve })
  let resumeDeletion!: () => void
  const deletionGate = new Promise<void>((resolve) => { resumeDeletion = resolve })
  try {
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES($1,$1,$1,NOW(),NOW())`, [userId])
    await service.registerDevice(userId, { platform: "ios", pushToken: "delete_watch_token" })
    await match.upsertDiscoveryWatch({ userId, status: "active", preferences: {
      ageMin: 18, ageMax: 99, genders: ["woman"], vibes: []
    }, updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 86400_000).toISOString() })
    const claim = await match.claimNextDiscoveryWatch(now)
    assert.ok(claim)
    await service.sendPushToUser(userId, { title: "Blumi", body: "Candidates", data: { type: "discovery.watch_match" } }, claim)
    const [delivery] = await notifications.claimDueDeliveries({ now, limit: 10, leaseMs: 60_000 })
    const avatar = createSeedDiscoverProfiles()[0]!.avatar
    await pool.query("UPDATE blumi_accounts SET avatar_selection=$2::jsonb,avatar_revision=$3,avatar_preset_id=$4 WHERE user_id=$1", [userId, JSON.stringify(avatar.loadout), avatar.revision, avatar.presetId])
    const account = await createPostgresAuthRepository(pool).findAccountByUserId(userId)
    assert.ok(account)
    await pool.query(`INSERT INTO blumi_account_deletion_confirmations(account_id,token_digest,expires_at)
      VALUES($1,$2,$3)`, [userId, "a".repeat(64), new Date(now.getTime() + 60_000)])
    const authPool = { async connect() {
      const client = await pool.connect()
      return { release: () => client.release(), async query(sql: string, values?: unknown[]) {
        const result = await client.query(sql, values)
        if (sql === "DELETE FROM blumi_push_devices WHERE user_id = $1") { devicesDeleted(); await deletionGate }
        return result
      } }
    } } as unknown as Pool
    const deleteAccount = () => createPostgresAuthRepository(authPool).deleteAccountData(account, {
      confirmationTokenDigest: "a".repeat(64), now: now.getTime()
    })
    if (first === "dispatch") {
      let providerEntered!: () => void
      const entered = new Promise<void>((resolve) => { providerEntered = resolve })
      let finishProvider!: () => void
      const providerPending = new Promise<void>((resolve) => { finishProvider = resolve })
      const dispatch = notifications.withAuthorizedDelivery(delivery, now, async () => { providerEntered(); await providerPending })
      await entered
      const deletion = deleteAccount()
      let blocked = false
      for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
        const waiting = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%blumi:watch:%'`)
        blocked = waiting.rows.length > 0
      }
      finishProvider()
      assert.equal((await dispatch).authorized, true)
      await deletedDevices
      resumeDeletion()
      assert.equal(await deletion, true)
      assert.equal(blocked, true)
      assert.equal(await createPostgresAuthRepository(pool).findAccountByUserId(userId), null)
      return
    }
    const deletion = deleteAccount()
    await deletedDevices
    let sends = 0
    const dispatch = notifications.withAuthorizedDelivery(delivery, now, async () => { sends++ })
    let blocked = false
    for (let attempt = 0; attempt < 100 && !blocked; attempt++) {
      const waiting = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND query LIKE '%blumi:watch:%'`)
      blocked = waiting.rows.length > 0
    }
    resumeDeletion()
    const results = await Promise.allSettled([deletion, dispatch])
    assert.equal(blocked, true, "exercise concurrent lock contention")
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"],
      JSON.stringify(results.map((result) => result.status === "rejected" ? result.reason : result.value)))
    assert.equal(results[0].status === "fulfilled" && results[0].value, true)
    assert.equal(results[1].status === "fulfilled" && (results[1].value as { authorized: boolean }).authorized, false)
    assert.equal(sends, 0)
    assert.equal(await createPostgresAuthRepository(pool).findAccountByUserId(userId), null)
  } finally { resumeDeletion?.(); await pool.end() }
})

test("F56 deletion starting without a watch serializes against concurrent creation and dispatch", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1", timeout: 15_000
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  const userId = "watch_absent_delete_race"
  const now = new Date("2026-09-05T10:00:00Z")
  const match = createPostgresMatchRepository(pool)
  const notifications = createPostgresNotificationRepository(pool)
  const service = createNotificationService({ repository: notifications, now: () => now })
  let reached!: () => void
  const devicesLocked = new Promise<void>((resolve) => { reached = resolve })
  let resume!: () => void
  const pause = new Promise<void>((resolve) => { resume = resolve })
  try {
    const avatar = createSeedDiscoverProfiles()[0]!.avatar
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at,avatar_selection,avatar_revision,avatar_preset_id)
      VALUES($1,$1,$1,NOW(),NOW(),$2::jsonb,$3,$4)`, [userId, JSON.stringify(avatar.loadout), avatar.revision, avatar.presetId])
    await service.registerDevice(userId, { platform: "ios", pushToken: "absent_watch_device" })
    const account = await createPostgresAuthRepository(pool).findAccountByUserId(userId)
    assert.ok(account)
    assert.equal(await match.findDiscoveryWatch(userId), null)
    await pool.query(`INSERT INTO blumi_account_deletion_confirmations(account_id,token_digest,expires_at)
      VALUES($1,$2,$3)`, [userId, "b".repeat(64), new Date(now.getTime() + 60_000)])
    const authPool = { async connect() {
      const client = await pool.connect()
      return { release: () => client.release(), async query(sql: string, values?: unknown[]) {
        const result = await client.query(sql, values)
        if (sql === "DELETE FROM blumi_push_devices WHERE user_id = $1") { reached(); await pause }
        return result
      } }
    } } as unknown as Pool
    const deletion = createPostgresAuthRepository(authPool).deleteAccountData(account, {
      confirmationTokenDigest: "b".repeat(64), now: now.getTime()
    })
    await devicesLocked
    let sends = 0
    const contender = (async () => {
      await match.upsertDiscoveryWatch({ userId, status: "active", preferences: {
        ageMin: 18, ageMax: 99, genders: ["woman"], vibes: []
      }, updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 86400_000).toISOString() })
      const watch = await match.claimNextDiscoveryWatch(now)
      assert.ok(watch)
      await service.sendPushToUser(userId, { title: "Blumi", body: "Candidates", data: { type: "discovery.watch_match" } }, watch)
      const [delivery] = await notifications.claimDueDeliveries({ now, limit: 10, leaseMs: 60_000 })
      return notifications.withAuthorizedDelivery(delivery, now, async () => { sends++ })
    })()
    let blocked = false
    for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
      blocked = (await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND pid <> pg_backend_pid()`)).rows.length > 0
    }
    resume()
    const [deleted, competing] = await Promise.allSettled([deletion, contender])
    assert.ok(blocked, "exercise actual PostgreSQL contention")
    assert.equal(deleted.status, "fulfilled", JSON.stringify(deleted))
    assert.equal(deleted.status === "fulfilled" && deleted.value, true)
    assert.notEqual(competing.status === "rejected" && competing.reason?.code, "40P01")
    if (competing.status === "rejected") assert.equal(competing.reason?.code, "23503", "a deleted parent account cannot acquire a new watch")
    else assert.equal(competing.value.authorized, false)
    assert.equal(sends, 0)
    assert.equal(await match.findDiscoveryWatch(userId), null)
    assert.equal(await createPostgresAuthRepository(pool).findAccountByUserId(userId), null)
  } finally { resume?.(); await pool.end() }
})
