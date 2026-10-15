import assert from "node:assert/strict"
import test from "node:test"
import type { Pool } from "pg"
import type { AccountRecord } from "../auth/authStore"
import { createDefaultAvatarSelection } from "../auth/authStore"
import { createPhoneBanHasher } from "../auth/moderationPhoneBan"
import { createNotificationService } from "../notifications/notificationService"
import { createDatabasePools, resolveDatabasePoolSettings, resolveLockedSendTimeoutMs } from "./databasePoolConfig"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPostgresNotificationRepository } from "./postgresNotificationRepository"

// A push dispatch holds the device and outbox row locks across the provider
// call so a removal that wins them stops the send. Removal and account
// deletion wait for that hold under the app's lock_timeout, so the hold must
// end first, even when the provider hangs.

const databaseUrl = process.env.DATABASE_URL?.trim()
const PROVIDER_TIMEOUT_MS = 10_000
const phoneBanHash = createPhoneBanHasher("push-dispatch-lock-budget-secret-0123456789")
const notification = { title: "Blumi", body: "Yeni bir eşleşme", data: { type: "discovery.match", matchId: "match_lock_budget" } }

async function insertAccount(pool: Pool, userId: string): Promise<AccountRecord> {
  const accountId = `acct_${userId}`
  const phoneNumber = `+90555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`
  await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
    VALUES($1,$2,$3,NOW(),NOW())`, [accountId, userId, phoneNumber])
  const now = new Date().toISOString()
  return { accountId, userId, phoneNumber, createdAt: now, updatedAt: now,
    onboarding: { profile: "incomplete", avatar: "incomplete", room: "incomplete" },
    profile: { userId, displayName: "", avatar: createDefaultAvatarSelection() } }
}

function hangingProvider() {
  let sends = 0
  let entered!: () => void
  const providerEntered = new Promise<void>((resolve) => { entered = resolve })
  return {
    get sends() { return sends },
    providerEntered,
    pushProvider: {
      async sendPush(_token: string, _push: unknown, options?: { signal?: AbortSignal }) {
        sends += 1
        entered()
        await new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
        })
      }
    }
  }
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const started = Date.now()
  try { return { ms: Date.now() - started, value: await run() } } catch (error) { return { ms: Date.now() - started, error } }
}

test("a hanging push send ends before device removal and account deletion run out of lock budget", { skip: !databaseUrl, timeout: 60_000 }, async () => {
  const settings = resolveDatabasePoolSettings({})
  const { pool } = createDatabasePools({ databaseUrl, databasePool: { ...settings, max: 4 } })
  const lockedSendTimeoutMs = resolveLockedSendTimeoutMs(PROVIDER_TIMEOUT_MS, settings)
  assert.ok(lockedSendTimeoutMs < settings.lockTimeoutMs, "the locked send ends before a waiter's lock_timeout")
  try {
    for (const [userId, remove] of [
      ["lock_budget_device", async (_account: AccountRecord, service: ReturnType<typeof createNotificationService>) => {
        await service.removeDevice("lock_budget_device", "lock_budget_device_token")
        return true
      }],
      ["lock_budget_delete", async (account: AccountRecord) =>
        createPostgresAuthRepository(pool).deleteAccountData(account, undefined, { phoneBanHash })]
    ] as const) {
      const account = await insertAccount(pool, userId)
      const provider = hangingProvider()
      const service = createNotificationService({
        repository: createPostgresNotificationRepository(pool),
        pushProvider: provider.pushProvider,
        providerTimeoutMs: PROVIDER_TIMEOUT_MS,
        lockedSendTimeoutMs
      })
      await service.registerDevice(userId, { platform: "ios", pushToken: `${userId}_token` })
      assert.equal((await service.sendPushToUser(userId, notification)).outcome, "queued")

      const dispatch = service.dispatchDue()
      await provider.providerEntered
      const removal = await timed(() => remove(account, service))
      await dispatch

      assert.equal(removal.error, undefined, `${userId}: the waiting removal succeeds`)
      assert.equal(removal.value, true)
      assert.ok(removal.ms < settings.lockTimeoutMs, `${userId}: removal waited ${removal.ms} ms`)
      const left = await pool.query("SELECT count(*)::int AS n FROM blumi_push_delivery_outbox WHERE user_id = $1", [userId])
      assert.equal(left.rows[0].n, 0, `${userId}: the removed device keeps no queued push`)
      await service.dispatchDue(new Date(Date.now() + 3_600_000))
      assert.equal(provider.sends, 1, `${userId}: nothing is sent to the removed device afterwards`)
    }
  } finally {
    await pool.end()
  }
})
