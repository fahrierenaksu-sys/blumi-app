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
