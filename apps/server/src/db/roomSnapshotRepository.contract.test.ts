import assert from "node:assert/strict"
import {
  createInMemoryRoomSnapshotRepository,
  type RoomShowcaseSnapshot,
  type RoomSnapshotRepository
} from "../rooms/roomSnapshotRepository"
import { createPostgresRoomSnapshotRepository } from "./postgresRoomSnapshotRepository"
import { runRepositoryContract } from "./repositoryContract"

// Which drawing of a room wins. During a rolling deploy an old and a new server both answer, so a same-revision
// save may arrive drawn by either renderer: the newer renderer must win in either order, never flip-flop.

function snapshot(userId: string, roomRevision: number, rendererVersion: string): RoomShowcaseSnapshot {
  return {
    userId,
    roomRevision,
    assetKey: `${rendererVersion}_${roomRevision}_${userId}`.padEnd(64, "0").slice(0, 64),
    mimeType: "image/webp",
    rendererVersion,
    body: Buffer.from(rendererVersion),
    isPublic: true,
    headline: null,
    updatedAt: "2026-10-10T00:00:00.000Z"
  }
}

runRepositoryContract<RoomSnapshotRepository>({
  name: "room snapshot repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryRoomSnapshotRepository(),
    postgres: (pool) => createPostgresRoomSnapshotRepository(pool)
  },
  cases: {
    "a newer renderer replaces the same room revision": async (backend) => {
      const userId = backend.id("ada")
      await backend.ensureUsers(userId)
      await backend.repository.save(snapshot(userId, 3, "room-snapshot-v1"))
      const saved = await backend.repository.save(snapshot(userId, 3, "room-snapshot-v2"))
      assert.equal(saved.rendererVersion, "room-snapshot-v2")
      assert.equal((await backend.repository.getLatest(userId))?.rendererVersion, "room-snapshot-v2")
    },
    "an older renderer never replaces a newer drawing of the same revision": async (backend) => {
      const userId = backend.id("bora")
      await backend.ensureUsers(userId)
      await backend.repository.save(snapshot(userId, 3, "room-snapshot-v2"))
      const kept = await backend.repository.save(snapshot(userId, 3, "room-snapshot-v1"))
      assert.equal(kept.rendererVersion, "room-snapshot-v2")
      assert.equal((await backend.repository.getLatest(userId))?.rendererVersion, "room-snapshot-v2")
    },
    "a newer room revision replaces the row whichever renderer drew it": async (backend) => {
      const userId = backend.id("cem")
      await backend.ensureUsers(userId)
      await backend.repository.save(snapshot(userId, 3, "room-snapshot-v2"))
      const saved = await backend.repository.save(snapshot(userId, 4, "room-snapshot-v1"))
      assert.equal(saved.roomRevision, 4)
      const stale = await backend.repository.save(snapshot(userId, 3, "room-snapshot-v2"))
      assert.equal(stale.roomRevision, 4)
    }
  }
})
