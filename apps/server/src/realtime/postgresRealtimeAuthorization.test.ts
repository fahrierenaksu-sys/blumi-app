import assert from "node:assert/strict"
import test from "node:test"
import { Pool } from "pg"
import { createAuthService } from "../auth/authService"
import { createAccountRecord, createSessionRecord } from "../auth/authStore"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createConnectionManager } from "./connectionManager"
import { createInMemoryRealtimeFanout } from "./realtimeFanout"
import { createPostgresRealtimeTicketStore } from "../db/postgresRealtimeTicketStore"

const databaseUrl = process.env.DATABASE_URL?.trim()

test("PostgreSQL family authority gates remote delivery after rotation, expiry and revocation", {
  skip: !databaseUrl
}, async () => {
  assert.ok(databaseUrl)
  const firstPool = new Pool({ connectionString: databaseUrl })
  const secondPool = new Pool({ connectionString: databaseUrl })
  const firstRepository = createPostgresAuthRepository(firstPool)
  const secondRepository = createPostgresAuthRepository(secondPool)
  const firstAuth = createAuthService({ repository: firstRepository })
  const secondAuth = createAuthService({ repository: secondRepository })
  const now = new Date()
  const account = createAccountRecord("+905551110083", now)
  const sessionCredential = ["postgres", "realtime", "synthetic", "session"].join("-")
  const session = createSessionRecord(account, sessionCredential, now)
  const otherSession = createSessionRecord(account, "postgres-realtime-other-family", now)
  const identity = { userId: account.userId, sessionFamilyId: session.sessionId }
  const fanout = createInMemoryRealtimeFanout()
  const sender = createConnectionManager({ fanout, instanceId: "auth-writer" })
  const recipient = createConnectionManager({ fanout, instanceId: "auth-reader" })
  const socket = {
    readyState: 1,
    received: [] as string[],
    closeCode: 0,
    close(code: number) { this.closeCode = code; this.readyState = 3 },
    send(value: string) { this.received.push(value) }
  }
  try {
    await firstRepository.saveAccount(account)
    await firstRepository.saveSession(session)
    await firstRepository.saveSession(otherSession)
    recipient.addConnection({ socket: socket as never, profile: account.profile, sessionFamilyId: session.sessionId })
    recipient.setDeliveryAuthorization(async (connection) => {
      const allowed = await secondAuth.isRealtimeSessionAllowed({
        userId: connection.userId, sessionFamilyId: connection.sessionFamilyId!
      })
      if (!allowed) connection.socket.close(4403, "Session revoked")
      return allowed
    })
    await sender.startFanout()
    await recipient.startFanout()
    assert.equal(await secondAuth.isRealtimeSessionAllowed(identity), true)
    assert.equal(await secondAuth.isRealtimeSessionAllowed({ ...identity, userId: "other" }), false)
    const rotated = await firstAuth.refreshSession(sessionCredential, now)
    assert.ok(rotated)
    assert.equal(rotated.session.sessionId, session.sessionId)
    assert.equal(await secondAuth.isRealtimeSessionAllowed(identity), true)
    assert.equal(await secondAuth.isRealtimeSessionAllowed(identity, new Date(rotated.session.expiresAt)), false)
    sender.sendToUser(account.userId, { type: "chat.thread_listed", payload: { userId: account.userId, threads: [] } })
    await eventually(() => socket.received.length === 1)
    await firstAuth.revokeSession(rotated.sessionToken)
    assert.equal(await secondAuth.isRealtimeSessionAllowed(identity), false)
    assert.equal(await secondAuth.isRealtimeSessionAllowed({ ...identity, sessionFamilyId: otherSession.sessionId }), true)
    sender.sendToUser(account.userId, { type: "chat.thread_listed", payload: { userId: account.userId, threads: [] } })
    await eventually(() => socket.closeCode === 4403)
    assert.equal(socket.received.length, 1)
  } finally {
    await sender.closeFanout()
    await recipient.closeFanout()
    await firstPool.query("DELETE FROM blumi_accounts WHERE account_id = $1", [account.accountId])
    await firstPool.end()
    await secondPool.end()
  }
})

async function eventually(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1500
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.ok(predicate(), "timed out waiting for authorized delivery")
}

test("PostgreSQL expiry cleanup skips locked tickets and never consumes valid tickets", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const store = createPostgresRealtimeTicketStore(pool)
  const now = new Date()
  const digests = ["a", "b", "c"].map((letter) => letter.repeat(64))
  const client = await pool.connect()
  try {
    for (const [index, digest] of digests.entries()) {
      await store.issue({ digest, sessionTokenHash: "f".repeat(64), expiresAtMs: now.getTime() + (index < 2 ? -1000 : 60_000) })
    }
    await client.query("BEGIN")
    await client.query("SELECT ticket_digest FROM blumi_realtime_tickets WHERE ticket_digest = $1 FOR UPDATE", [digests[0]])
    assert.equal(await store.purgeExpired(now, 1), 1)
    assert.equal(await store.consume(digests[2]!, now), "f".repeat(64))
    await client.query("ROLLBACK")
    assert.equal(await store.purgeExpired(now, 1), 1)
    assert.equal(await store.purgeExpired(now, 1), 0)
  } finally {
    await client.query("ROLLBACK")
    client.release()
    await pool.query("DELETE FROM blumi_realtime_tickets WHERE ticket_digest = ANY($1)", [digests])
    await pool.end()
  }
})
