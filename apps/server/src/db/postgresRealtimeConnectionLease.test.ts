import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import pg from "pg"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, toAvatarLoadoutV2 } from "@blumi/domain"
import type { AccountRecord } from "../auth/authStore"
import { createPostgresAuthRepository } from "./postgresAuthRepository"
import { createPhoneBanHasher } from "../auth/moderationPhoneBan"
import { createPostgresPresenceRepository } from "./postgresPresenceRepository"

const databaseUrl = process.env.DATABASE_URL?.trim()
const testAvatarSelection = toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT)

function createPool(applicationName: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    application_name: `${applicationName}-${randomUUID()}`,
    max: 3
  })
}

function asLeaseRepository(pool: pg.Pool): ReturnType<typeof createPostgresPresenceRepository> {
  return createPostgresPresenceRepository(pool)
}

async function seedAccountAndPresence(
  pool: pg.Pool,
  userId: string,
  roomId: string
): Promise<void> {
  const timestamp = new Date()
  await pool.query(
    `INSERT INTO blumi_accounts (
       account_id, user_id, phone_number, avatar_preset_id,
       avatar_selection, avatar_revision, created_at, updated_at
     ) VALUES ($1, $1, $2, 'avatar_v2_body_default', $4::jsonb, 1, $3, $3)`,
    [userId, `+1555${userId.replace(/\D/g, "").slice(-10)}`, timestamp, JSON.stringify(testAvatarSelection)]
  )
  await pool.query(
    `INSERT INTO blumi_room_presence (
       room_id, user_id, display_name, spot_id, in_mini_room,
       joined_at, updated_at, expires_at
     ) VALUES ($1, $2, 'Test user', 'spot_1', false, $3, $3, $4)`,
    [roomId, userId, timestamp, new Date(timestamp.getTime() + 60_000)]
  )
}

async function backendPid(pool: pg.Pool): Promise<number> {
  const client = await pool.connect()
  try {
    const result = await client.query("SELECT pg_backend_pid() AS pid")
    return Number(result.rows[0]?.pid)
  } finally {
    client.release()
  }
}

async function waitForBlockedQuery(
  observer: pg.Pool,
  applicationName: string,
  acceptableQueryFragments: string[][],
  description: string
): Promise<void> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const result = await observer.query(
      `SELECT query
         FROM pg_stat_activity
        WHERE application_name = $1
          AND state = 'active'
          AND wait_event_type = 'Lock'`,
      [applicationName]
    )
    const found = result.rows.some((row) => {
      const query = String(row.query).replace(/\s+/g, " ").toLowerCase()
      return acceptableQueryFragments.some((fragments) =>
        fragments.every((fragment) => query.includes(fragment.toLowerCase()))
      )
    })
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${description}.`)
}

test("old replica disconnect removes only its lease while a rejoined connection remains live", {
  skip: !databaseUrl
}, async () => {
  const replicaA = createPool("realtime-lease-a")
  const replicaB = createPool("realtime-lease-b")
  const userId = `lease-user-${randomUUID()}`
  const roomId = `lease-room-${randomUUID()}`
  const oldConnectionId = `connection_${randomUUID()}`
  const rejoinedConnectionId = `connection_${randomUUID()}`
  const repositoryA = asLeaseRepository(replicaA)
  const repositoryB = asLeaseRepository(replicaB)

  try {
    assert.notEqual(await backendPid(replicaA), await backendPid(replicaB))
    await seedAccountAndPresence(replicaA, userId, roomId)

    await repositoryA.registerConnectionLease(oldConnectionId, userId, 90_000)
    await repositoryB.registerConnectionLease(rejoinedConnectionId, userId, 90_000)
    assert.equal(await repositoryB.heartbeatConnectionLease(rejoinedConnectionId, userId, 90_000), true)

    assert.deepEqual(
      await repositoryA.disconnectConnectionLease(oldConnectionId, userId),
      []
    )
    const afterStaleDisconnect = await replicaA.query(
      `SELECT connection_id FROM blumi_realtime_connection_leases
        WHERE user_id = $1 AND expires_at > clock_timestamp()`,
      [userId]
    )
    assert.deepEqual(afterStaleDisconnect.rows.map((row) => row.connection_id), [rejoinedConnectionId])
    assert.equal(
      (await replicaA.query("SELECT 1 FROM blumi_room_presence WHERE user_id = $1", [userId])).rowCount,
      1,
      "a live connection on another replica keeps room presence intact"
    )

    assert.deepEqual(
      await repositoryB.disconnectConnectionLease(rejoinedConnectionId, userId),
      [roomId]
    )
    assert.equal(
      (await replicaA.query("SELECT 1 FROM blumi_room_presence WHERE user_id = $1", [userId])).rowCount,
      0,
      "the last live connection clears presence"
    )
  } finally {
    await replicaA.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await Promise.all([replicaA.end(), replicaB.end()])
  }
})

test("concurrent heartbeat and disconnect cannot resurrect a removed connection lease", {
  skip: !databaseUrl
}, async () => {
  const replicaA = createPool("realtime-heartbeat-a")
  const replicaB = createPool("realtime-heartbeat-b")
  const userId = `lease-user-${randomUUID()}`
  const roomId = `lease-room-${randomUUID()}`
  const connectionId = `connection_${randomUUID()}`
  const repositoryA = asLeaseRepository(replicaA)
  const repositoryB = asLeaseRepository(replicaB)

  try {
    assert.notEqual(await backendPid(replicaA), await backendPid(replicaB))
    await seedAccountAndPresence(replicaA, userId, roomId)
    await repositoryA.registerConnectionLease(connectionId, userId, 90_000)

    const [heartbeatResult, removedRooms] = await Promise.all([
      repositoryA.heartbeatConnectionLease(connectionId, userId, 90_000),
      repositoryB.disconnectConnectionLease(connectionId, userId)
    ])

    assert.equal(typeof heartbeatResult, "boolean")
    assert.deepEqual(removedRooms, [roomId])
    assert.equal(
      (await replicaA.query("SELECT 1 FROM blumi_realtime_connection_leases WHERE connection_id = $1", [connectionId])).rowCount,
      0,
      "a heartbeat that loses the disconnect race must not recreate the lease"
    )
    assert.equal(
      (await replicaA.query("SELECT 1 FROM blumi_room_presence WHERE user_id = $1", [userId])).rowCount,
      0
    )
  } finally {
    await replicaA.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await Promise.all([replicaA.end(), replicaB.end()])
  }
})

test("account deletion and last websocket disconnect use one lock order", {
  skip: !databaseUrl,
  timeout: 20_000
}, async () => {
  if (!databaseUrl) return

  const suffix = randomUUID()
  const accountApplicationName = `account-delete-lease-race-${suffix}`
  const disconnectApplicationName = `lease-disconnect-race-${suffix}`
  const accountPool = new pg.Pool({
    connectionString: databaseUrl,
    application_name: accountApplicationName,
    statement_timeout: 10_000,
    max: 2
  })
  const disconnectPool = new pg.Pool({
    connectionString: databaseUrl,
    application_name: disconnectApplicationName,
    statement_timeout: 10_000,
    max: 2
  })
  const observerPool = createPool("account-delete-lease-observer")
  const userId = `lease-delete-user-${suffix}`
  const roomId = `lease-delete-room-${suffix}`
  const connectionId = `connection_${suffix}`
  const phoneNumber = `+1555${userId.replace(/\D/g, "").slice(-10)}`
  const accountIdentity = {
    accountId: userId,
    userId,
    phoneNumber
  }
  const disconnectRepository = asLeaseRepository(disconnectPool)
  let blocker: pg.PoolClient | undefined
  let deletionOutcome: Promise<{ ok: true; value: boolean } | { ok: false; error: unknown }> | undefined
  let disconnectOutcome: Promise<{ ok: true; value: string[] } | { ok: false; error: unknown }> | undefined

  try {
    assert.notEqual(await backendPid(accountPool), await backendPid(disconnectPool))
    await seedAccountAndPresence(accountPool, userId, roomId)
    await disconnectRepository.registerConnectionLease(connectionId, userId, 90_000)

    blocker = await observerPool.connect()
    await blocker.query("BEGIN")
    await blocker.query("LOCK TABLE blumi_mini_room_invites IN ACCESS EXCLUSIVE MODE")

    deletionOutcome = createPostgresAuthRepository(accountPool)
      // This repository method consumes only the account identity fields.
      .deleteAccountData(accountIdentity as AccountRecord, undefined, { phoneBanHash: createPhoneBanHasher("phone-ban-test-secret-0123456789abcdef") })
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
    await waitForBlockedQuery(
      observerPool,
      accountApplicationName,
      [["delete", "blumi_mini_room_invites"]],
      "account deletion to reach the invite-table blocker"
    )

    disconnectOutcome = disconnectRepository
      .disconnectConnectionLease(connectionId, userId)
      .then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
    await waitForBlockedQuery(
      observerPool,
      disconnectApplicationName,
      [["pg_advisory_xact_lock"], ["delete from blumi_room_presence"]],
      "last disconnect to wait on the shared user lock or account-held presence row"
    )

    await blocker.query("COMMIT")
    blocker.release()
    blocker = undefined

    const [deletion, disconnect] = await Promise.all([deletionOutcome, disconnectOutcome])
    if (deletion.ok === false) assert.fail(`account deletion failed: ${String(deletion.error)}`)
    if (disconnect.ok === false) assert.fail(`last disconnect failed: ${String(disconnect.error)}`)
    assert.equal(deletion.value, true)
    assert.deepEqual(disconnect.value, [])
    assert.equal(
      (await accountPool.query("SELECT 1 FROM blumi_accounts WHERE user_id = $1", [userId])).rowCount,
      0,
      "the existing account deletion still removes the account"
    )
    assert.equal(
      (await accountPool.query("SELECT 1 FROM blumi_realtime_connection_leases WHERE user_id = $1", [userId])).rowCount,
      0,
      "the account FK cascade still removes its connection leases"
    )
    assert.equal(
      (await accountPool.query("SELECT 1 FROM blumi_room_presence WHERE user_id = $1", [userId])).rowCount,
      0,
      "account deletion still removes room presence"
    )
  } finally {
    if (blocker) {
      await blocker.query("ROLLBACK").catch(() => undefined)
      blocker.release()
    }
    await Promise.allSettled([deletionOutcome, disconnectOutcome].filter(Boolean) as Promise<unknown>[])
    await accountPool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await Promise.all([accountPool.end(), disconnectPool.end(), observerPool.end()])
  }
})

test("expired connection leases are collected using the database clock", {
  skip: !databaseUrl
}, async () => {
  const pool = createPool("realtime-lease-expiry")
  const userId = `lease-user-${randomUUID()}`
  const connectionId = `connection_${randomUUID()}`
  const repository = asLeaseRepository(pool)

  try {
    await seedAccountAndPresence(pool, userId, `lease-room-${randomUUID()}`)
    await repository.registerConnectionLease(connectionId, userId, 90_000)
    await pool.query(
      `UPDATE blumi_realtime_connection_leases
          SET expires_at = clock_timestamp() - INTERVAL '1 second'
        WHERE connection_id = $1`,
      [connectionId]
    )

    assert.equal(await repository.purgeExpiredConnectionLeases(10), 1)
    assert.equal(
      (await pool.query("SELECT 1 FROM blumi_realtime_connection_leases WHERE connection_id = $1", [connectionId])).rowCount,
      0
    )
  } finally {
    await pool.query("DELETE FROM blumi_accounts WHERE user_id = $1", [userId]).catch(() => undefined)
    await pool.end()
  }
})
