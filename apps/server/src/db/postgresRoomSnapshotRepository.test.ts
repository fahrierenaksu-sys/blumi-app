import test from "node:test"
import assert from "node:assert/strict"
import { createPostgresRoomSnapshotRepository } from "./postgresRoomSnapshotRepository"

test("postgres snapshot lookups and visibility updates preserve repository projection", async () => {
  const row = {
    user_id: "user_1", room_revision: 3, asset_key: "asset-3", mime_type: "image/webp",
    renderer_version: "test", body: Buffer.from("snapshot"), is_public: false,
    headline: "Latest", updated_at: "2026-08-14T12:00:00.000Z"
  }
  let rows = [row]
  const repository = createPostgresRoomSnapshotRepository({ async query() {
    return { rows }
  } })
  assert.equal((await repository.findByAssetKey("asset-3"))?.isPublic, false)
  assert.equal((await repository.updateVisibility({ userId: "user_1", roomRevision: 3, isPublic: false, headline: "Latest" }))?.headline, "Latest")
  rows = []
  assert.equal(await repository.findByAssetKey("missing"), null)
  assert.equal(await repository.getLatest("missing"), null)
  assert.equal(await repository.updateVisibility({ userId: "user_1", roomRevision: 2, isPublic: true, headline: null }), null)
})
