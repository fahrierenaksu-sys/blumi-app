import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { createPostgresMiniRoomRepository } from "./postgresMiniRoomRepository"
import { createPostgresPersonalRoomDecorRepository } from "./postgresPersonalRoomDecorRepository"

test("PostgreSQL acceptance captures only current inviter decor and keeps it stable across connections", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use isolated postgres-gate")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const repository = createPostgresMiniRoomRepository(pool)
  const decor = createPostgresPersonalRoomDecorRepository(pool)
  const suffix = randomUUID()
  const [sender, recipient] = [`sender_${suffix}`, `recipient_${suffix}`]
  const now = new Date().toISOString()
  const layout = (roomShellId: string) => ({ schemaVersion: 3, geometryVersion: "room_v2", roomShellId, placedItems: [] })
  try {
    for (const user of [sender, recipient]) await pool.query(`INSERT INTO blumi_accounts(account_id,user_id,phone_number,created_at,updated_at)
      VALUES($1,$1,$1,NOW(),NOW())`, [user])
    await decor.save({ userId: sender, expectedRevision: 0, decor: layout("before-invite"), updatedAt: now })
    await decor.save({ userId: recipient, expectedRevision: 0, decor: layout("recipient-only"), updatedAt: now })
    const inviteId = `invite_${suffix}`
    await repository.saveInvite({ inviteId, senderUserId: sender, recipientUserId: recipient, sourceThreadId: `thread_${suffix}`, status: "pending", createdAt: now })
    await decor.save({ userId: sender, expectedRevision: 1, decor: layout("at-accept"), updatedAt: now })
    const miniRoomId = `room_${suffix}`
    assert.equal(await repository.acceptPendingInvite({ inviteId, decidedAt: now, miniRoom: {
      miniRoomId, lobbyRoomId: "thread", participantUserIds: [sender, recipient], livekitRoomName: miniRoomId, startedAt: now,
      sharedDecor: { ownerUserId: recipient, revision: 99, capturedAt: now, source: "inviter", decor: layout("untrusted-input") }
    } }), "accepted")
    const accepted = await repository.findMiniRoom(miniRoomId)
    assert.equal(accepted?.sharedDecor?.ownerUserId, sender)
    assert.equal(accepted?.sharedDecor?.revision, 2)
    assert.equal(accepted?.sharedDecor?.decor.roomShellId, "at-accept")
    await decor.save({ userId: sender, expectedRevision: 2, decor: layout("after-accept"), updatedAt: now })
    const other = await pool.connect()
    try {
      const reloaded = await createPostgresMiniRoomRepository(other).findActiveMiniRoomForUser(recipient)
      assert.deepEqual(reloaded?.sharedDecor, accepted?.sharedDecor)
    } finally { other.release() }
    assert.deepEqual((await repository.findMiniRoomByInviteId(inviteId))?.sharedDecor, accepted?.sharedDecor)
  } finally { await pool.end() }
})
