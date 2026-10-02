import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import Fastify from "fastify"
import { createPostgresRoomSnapshotRepository } from "./postgresRoomSnapshotRepository"
import { createRoomSnapshotService } from "../rooms/roomSnapshotService"
import { registerRoomSnapshotRoutes } from "../routes/roomSnapshotRoutes"
import type { PersonalRoomDecorSnapshot } from "../rooms/personalRoomDecorRepository"

test("two PostgreSQL connections preserve accepted hide and headline during render", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const renderClient = await pool.connect()
  const preferenceClient = await pool.connect()
  const userId = `snapshot_${randomUUID()}`
  const app = Fastify()
  try {
    await renderClient.query(`INSERT INTO blumi_accounts
      (account_id, user_id, phone_number, created_at, updated_at)
      VALUES ($1, $1, $2, NOW(), NOW())`, [userId, userId])
    const repository = createPostgresRoomSnapshotRepository(renderClient)
    const preferences = createPostgresRoomSnapshotRepository(preferenceClient)
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const paused = new Promise<void>((resolve) => { release = resolve })
    const service = createRoomSnapshotService({ repository, renderer: {
      async render({ roomRevision }) {
        if (roomRevision === 2) { entered(); await paused }
        return { body: Buffer.from("webp"), mimeType: "image/webp", rendererVersion: "test" }
      }
    } })
    const room = (revision: number): PersonalRoomDecorSnapshot => ({
      userId, revision, updatedAt: new Date().toISOString(),
      decor: { schemaVersion: 3, geometryVersion: "room_v2", roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }
    })
    await service.publishForRoomSave(room(1))
    await preferences.updateVisibility({ userId, roomRevision: 1, isPublic: true, headline: "Old" })
    const pending = service.publishForRoomSave(room(2))
    await started
    await preferenceClient.query("BEGIN")
    const hidden = await preferences.updateVisibility({ userId, roomRevision: 1, isPublic: false, headline: "Latest" })
    assert.equal(hidden?.isPublic, false)
    release()
    await preferenceClient.query("COMMIT")
    const rendered = await pending
    assert.equal(rendered.roomRevision, 2)
    assert.equal(rendered.isPublic, false)
    assert.equal(rendered.headline, "Latest")
    await registerRoomSnapshotRoutes(app, {
      authService: null as never, personalRoomDecorService: null as never, roomSnapshotService: service
    })
    const response = await app.inject({ method: "GET", url: `/v1/room-showcase/${rendered.assetKey}` })
    assert.equal(response.statusCode, 404)
    assert.equal(response.headers["cache-control"], "no-store")
  } finally {
    await app.close()
    await preferenceClient.query("ROLLBACK")
    renderClient.release()
    preferenceClient.release()
    await pool.end()
  }
})

test("PostgreSQL snapshot saves never replace a newer revision or the owner's visibility and headline", {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1"
}, async () => {
  assert.ok(process.env.DATABASE_URL, "Use the isolated postgres-gate runner")
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const userId = `snapshot_order_${randomUUID()}`
  const snapshot = (roomRevision: number, isPublic: boolean, headline: string | null) => ({
    userId, roomRevision, assetKey: `asset_${roomRevision}_${userId}`, mimeType: "image/webp" as const,
    rendererVersion: "test", body: Buffer.from(`revision ${roomRevision}`), isPublic, headline,
    updatedAt: new Date().toISOString()
  })
  try {
    await pool.query(`INSERT INTO blumi_accounts
      (account_id, user_id, phone_number, created_at, updated_at)
      VALUES ($1, $1, $2, NOW(), NOW())`, [userId, userId])
    const repository = createPostgresRoomSnapshotRepository(pool)

    await repository.save(snapshot(3, true, null))
    const stale = await repository.save(snapshot(2, true, null))
    assert.equal(stale.roomRevision, 3, "an older render returns the stored newer one")
    assert.equal((await repository.getLatest(userId))?.roomRevision, 3)
    assert.equal(await repository.findByAssetKey(`asset_2_${userId}`), null)

    assert.equal((await repository.updateVisibility({ userId, roomRevision: 3, isPublic: false, headline: "Mine" }))?.isPublic, false)
    const next = await repository.save(snapshot(4, true, null))
    assert.equal(next.roomRevision, 4)
    const latest = await repository.getLatest(userId)
    assert.equal(latest?.roomRevision, 4)
    assert.equal(latest?.isPublic, false, "a render never republishes a hidden room")
    assert.equal(latest?.headline, "Mine", "a render never clears the owner's headline")
    assert.equal(latest && "body" in latest, false, "revision reads leave the image in the database")
    assert.equal((await repository.findByAssetKey(`asset_4_${userId}`))?.body.toString(), "revision 4")
    assert.equal(await repository.updateVisibility({ userId, roomRevision: 3, isPublic: true, headline: null }), null)
  } finally {
    await pool.end()
  }
})
