import test from "node:test"
import assert from "node:assert/strict"
import { createPostgresRoomSnapshotRepository } from "./postgresRoomSnapshotRepository"

test("postgres snapshot lookups and visibility updates preserve repository projection", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const row = {
    user_id: "user_1", room_revision: 3, asset_key: "asset-3", mime_type: "image/webp",
    renderer_version: "test", body: Buffer.from("snapshot"), is_public: false,
    headline: "Latest", updated_at: "2026-08-14T12:00:00.000Z"
  }
  let rows = [row]
  const repository = createPostgresRoomSnapshotRepository({ async query(text, values) {
    calls.push({ text, values })
    return { rows }
  } })
  assert.equal((await repository.findByAssetKey("asset-3"))?.isPublic, false)
  assert.equal((await repository.updateVisibility({ userId: "user_1", roomRevision: 3, isPublic: false, headline: "Latest" }))?.headline, "Latest")
  assert.match(calls[1]!.text, /WHERE user_id = \$1 AND room_revision = \$2/)
  assert.deepEqual(calls[1]!.values, ["user_1", 3, false, "Latest"])
  rows = []
  assert.equal(await repository.findByAssetKey("missing"), null)
  assert.equal(await repository.getLatest("missing"), null)
  assert.equal(await repository.updateVisibility({ userId: "user_1", roomRevision: 2, isPublic: true, headline: null }), null)
})

test("postgres room snapshot repository only replaces an older revision", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresRoomSnapshotRepository({
    async query(text, values) {
      calls.push({ text, values })
      if (text.includes("INSERT INTO")) return { rows: [] }
      return {
        rows: [{
          user_id: "user_1",
          room_revision: 3,
          asset_key: "asset-3",
          mime_type: "image/webp",
          renderer_version: "room-snapshot-v1",
          body: Buffer.from("snapshot"),
          is_public: true,
          headline: null,
          updated_at: "2026-08-14T12:00:00.000Z"
        }]
      }
    }
  })

  const result = await repository.save({
    userId: "user_1",
    roomRevision: 2,
    assetKey: "asset-2",
    mimeType: "image/webp",
    rendererVersion: "room-snapshot-v1",
    body: Buffer.from("old"),
    isPublic: true,
    headline: null,
    updatedAt: "2026-08-14T12:00:00.000Z"
  })

  assert.equal(result.roomRevision, 3)
  assert.equal(calls.length, 2)
  assert.match(calls[0]!.text, /room_revision < EXCLUDED\.room_revision/)
  const updateClause = calls[0]!.text.split("DO UPDATE SET")[1]!
  assert.doesNotMatch(updateClause, /is_public\s*=\s*EXCLUDED|headline\s*=\s*EXCLUDED/)
})
