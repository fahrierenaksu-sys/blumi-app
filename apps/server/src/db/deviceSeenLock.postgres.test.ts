import assert from "node:assert/strict"
import test from "node:test"
import { createDatabasePools, resolveDatabasePoolSettings } from "./databasePoolConfig"
import { disposablePostgresSkip, disposablePostgresUrl } from "./disposablePostgres"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"

// App start refreshes a registered device's "last seen" time. A locked push
// send holds that row (FOR SHARE) for seconds, and the refresh must not queue
// behind it: it is skipped, and the next app start refreshes instead.

const databaseUrl = process.env.DATABASE_URL?.trim()
const OLD = "2026-10-01T10:00:00.000Z"
const SEEN_AT = new Date("2026-10-10T10:00:00.000Z")
const PROMPT_MS = 1_000

test("a device row held by a locked push send is skipped by the seen refresh without waiting", {
  skip: disposablePostgresSkip().skip, timeout: 30_000
}, async () => {
  const settings = resolveDatabasePoolSettings({})
  assert.ok(settings.lockTimeoutMs > PROMPT_MS * 2, "a waiting refresh would be visibly slower than the bound")
  const { pool } = createDatabasePools({ databaseUrl: disposablePostgresUrl(databaseUrl), databasePool: { ...settings, max: 3 } })
  const repository = createPostgresNotificationRepository(pool)
  const userId = "device_seen_lock"
  const pushToken = "device_seen_lock_token"
  const holder = await pool.connect()
  try {
    await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES($1,$1,'+905550000001',NOW(),NOW())`, [userId])
    await repository.saveDevice({ userId, platform: "ios", pushToken, registeredAt: OLD })
    const [device] = await repository.listDevices(userId)
    assert.ok(device?.registrationId)
    const seen = { userId, pushToken, registrationId: device.registrationId, seenAt: SEEN_AT }

    await holder.query("BEGIN")
    await holder.query("SELECT 1 FROM blumi_push_devices WHERE user_id = $1 AND push_token = $2 FOR SHARE", [userId, pushToken])
    const started = Date.now()
    await repository.markDeviceSeen(seen)
    assert.ok(Date.now() - started < PROMPT_MS, "the refresh returns at once while a send holds the row")
    assert.equal((await repository.listDevices(userId))[0]?.registeredAt, OLD, "a skipped refresh changes nothing")

    await holder.query("COMMIT")
    await repository.markDeviceSeen(seen)
    assert.equal((await repository.listDevices(userId))[0]?.registeredAt, SEEN_AT.toISOString(), "an unlocked row is refreshed")
  } finally {
    await holder.query("ROLLBACK").catch(() => undefined)
    holder.release()
    await pool.query("DELETE FROM blumi_push_devices WHERE user_id = $1", [userId]).catch(() => undefined)
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await pool.end()
  }
})
