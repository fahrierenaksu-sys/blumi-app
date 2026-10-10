import test from "node:test"
import assert from "node:assert/strict"
import {
  createRoomSnapshotService
} from "./roomSnapshotService"
import sharp from "sharp"
import {
  checkRoomSnapshotRenderer,
  createRoomSnapshotRenderer,
  ROOM_SNAPSHOT_RENDERER_VERSION
} from "./roomSnapshotRenderer"
import { createInMemoryRoomSnapshotRepository } from "./roomSnapshotRepository"
import type { PersonalRoomDecor, PersonalRoomDecorSnapshot } from "./personalRoomDecorRepository"

function room(revision: number): PersonalRoomDecorSnapshot {
  return {
    userId: "user_1",
    revision,
    updatedAt: new Date(2026, 7, 14, 12, revision).toISOString(),
    decor: {
      schemaVersion: 3,
      geometryVersion: "room_v2",
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: []
    }
  }
}

test("render completion preserves a visibility and headline change accepted while rendering", async () => {
  let release!: () => void
  let started!: () => void
  const paused = new Promise<void>((resolve) => { release = resolve })
  const entered = new Promise<void>((resolve) => { started = resolve })
  const service = createRoomSnapshotService({
    renderer: { async render({ roomRevision }) {
      if (roomRevision === 2) { started(); await paused }
      return { body: Buffer.from("image"), mimeType: "image/webp", rendererVersion: "test" }
    } }
  })
  await service.publishForRoomSave(room(1))
  await service.setVisibilityForRoom({ userId: "user_1", room: room(1), isPublic: true, headline: "Old" })
  const pending = service.publishForRoomSave(room(2))
  await entered
  const hidden = await service.setVisibilityForRoom({ userId: "user_1", room: room(1), isPublic: false, headline: "New" })
  assert.equal(hidden?.isPublic, false)
  release()
  const result = await pending
  assert.equal(result.roomRevision, 2)
  assert.equal(result.isPublic, false)
  assert.equal(result.headline, "New")
})

test("room snapshot service publishes the saved room revision", async () => {
  const rendered: number[] = []
  const service = createRoomSnapshotService({
    repository: createInMemoryRoomSnapshotRepository(),
    renderer: {
      async render(input) {
        rendered.push(input.roomRevision)
        return {
          body: Buffer.from(`room-${input.roomRevision}`),
          mimeType: "image/webp",
          rendererVersion: "test-renderer-v1"
        }
      }
    },
    isPublicByDefault: true
  })

  const snapshot = await service.publishForRoomSave(room(4))

  assert.equal(snapshot.roomRevision, 4)
  assert.equal(snapshot.isPublic, true)
  assert.equal("body" in snapshot, false, "metadata never carries the image")
  assert.equal((await service.findByAssetKey(snapshot.assetKey))?.body.toString(), "room-4")
  assert.deepEqual(rendered, [4])
})

test("publishing the same room revision is idempotent and does not rerender", async () => {
  let renderCount = 0
  const service = createRoomSnapshotService({
    repository: createInMemoryRoomSnapshotRepository(),
    renderer: {
      async render() {
        renderCount += 1
        return {
          body: Buffer.from("same"),
          mimeType: "image/webp",
          rendererVersion: "test-renderer-v1"
        }
      }
    }
  })

  const first = await service.publishForRoomSave(room(2))
  const second = await service.publishForRoomSave(room(2))

  assert.equal(renderCount, 1)
  assert.equal(second.assetKey, first.assetKey)
  assert.deepEqual((await service.findByAssetKey(second.assetKey))?.body, Buffer.from("same"))
})

test("room showcase visibility changes only the current snapshot and normalizes its headline", async () => {
  const service = createRoomSnapshotService({
    repository: createInMemoryRoomSnapshotRepository(),
    renderer: {
      async render() {
        return {
          body: Buffer.from("room"),
          mimeType: "image/webp",
          rendererVersion: "test-renderer-v1"
        }
      }
    }
  })
  const currentRoom = room(3)
  await service.publishForRoomSave(currentRoom)

  const updated = await service.setVisibilityForRoom({
    userId: currentRoom.userId,
    room: currentRoom,
    isPublic: true,
    headline: "  Kahve   ve sohbet  "
  })
  assert.equal(updated?.isPublic, true)
  assert.equal(updated?.headline, "Kahve ve sohbet")
  assert.equal(
    (await service.setVisibilityForRoom({
      userId: currentRoom.userId,
      room: room(2),
      isPublic: false
    })),
    null
  )
})

test("a newly saved room keeps the user's explicit showcase visibility and headline", async () => {
  const service = createRoomSnapshotService({
    repository: createInMemoryRoomSnapshotRepository(),
    renderer: {
      async render(input) {
        return {
          body: Buffer.from(`room-${input.roomRevision}`),
          mimeType: "image/webp",
          rendererVersion: "test-renderer-v1"
        }
      }
    }
  })
  const firstRoom = room(4)
  await service.publishForRoomSave(firstRoom)
  await service.setVisibilityForRoom({
    userId: firstRoom.userId,
    room: firstRoom,
    isPublic: true,
    headline: "Kahve ve sohbet"
  })

  const next = await service.publishForRoomSave(room(5))
  assert.equal(next.roomRevision, 5)
  assert.equal(next.isPublic, true)
  assert.equal(next.headline, "Kahve ve sohbet")
})

test("a snapshot for an older room revision is not projected as current", async () => {
  const service = createRoomSnapshotService({
    repository: createInMemoryRoomSnapshotRepository(),
    renderer: {
      async render() {
        return {
          body: Buffer.from("room"),
          mimeType: "image/webp",
          rendererVersion: "test-renderer-v1"
        }
      }
    }
  })

  await service.publishForRoomSave(room(1))
  assert.equal(await service.getLatestForUser("user_1", room(2)), null)
})

test("renderer failures do not publish a partial snapshot", async () => {
  const service = createRoomSnapshotService({
    repository: createInMemoryRoomSnapshotRepository(),
    renderer: {
      async render() {
        throw new Error("asset missing")
      }
    }
  })

  await assert.rejects(() => service.publishForRoomSave(room(1)), /asset missing/)
  assert.equal(await service.getLatestForUser("user_1", room(1)), null)
})

test("canonical room renderer produces a non-empty webp snapshot", async () => {
  const result = await createRoomSnapshotRenderer().render({
    roomRevision: 1,
    decor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: []
    }
  })
  assert.equal(result.mimeType, "image/webp")
  assert.equal(result.rendererVersion, ROOM_SNAPSHOT_RENDERER_VERSION)
  assert.ok(result.body.length > 100)
  assert.equal(result.body.subarray(0, 4).toString("hex"), "52494646")
})

test("the room renderer skips legacy and unknown pieces instead of failing", async () => {
  const renderer = createRoomSnapshotRenderer()
  const empty = await renderer.render({
    roomRevision: 1,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] }
  })
  const legacyOnly = await renderer.render({
    roomRevision: 2,
    decor: {
      roomShellId: "room_v2_shell_blumi_world_v1",
      placedItems: [
        { instanceId: "old", itemId: "room_v2_cozy_bed", x: 0.4, y: 0.7, rotation: "front" },
        { instanceId: "unknown", itemId: "room_v9_not_drawn", x: 0.5, y: 0.7, rotation: "front" }
      ]
    }
  })
  assert.ok(legacyOnly.body.equals(empty.body))
})

test("the room renderer draws a placed 2.5D piece from the art pack", async () => {
  const renderer = createRoomSnapshotRenderer()
  const decor = (placedItems: PersonalRoomDecor["placedItems"]) =>
    ({ roomShellId: "room_v2_shell_blumi_world_v1", placedItems })
  const empty = await sharp((await renderer.render({ roomRevision: 1, decor: decor([]) })).body).raw().toBuffer()
  const furnished = await sharp((await renderer.render({
    roomRevision: 2,
    decor: decor([
      { instanceId: "sofa", itemId: "room_v3_sofa_japon_cream", x: 0.5, y: 0.7, rotation: "front" },
      { instanceId: "poster", itemId: "room_v3_poster_oyun_bunny", x: 0.7, y: 0.3, rotation: "front" }
    ])
  })).body).raw().toBuffer()
  assert.equal(furnished.length, empty.length)
  let changed = 0
  for (let index = 0; index < empty.length; index += 1) if (empty[index] !== furnished[index]) changed += 1
  assert.ok(changed > empty.length * 0.02, `changed ${changed}`)
})

test("a snapshot drawn by another renderer version is never served", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  const service = createRoomSnapshotService({
    repository,
    isPublicByDefault: true,
    renderer: {
      version: "room-snapshot-v2",
      async render() {
        return { body: Buffer.from("new"), mimeType: "image/webp", rendererVersion: "room-snapshot-v2" }
      }
    }
  })
  await repository.save({
    userId: "user_1",
    roomRevision: 1,
    assetKey: "b".repeat(64),
    mimeType: "image/webp",
    rendererVersion: "room-snapshot-v1",
    body: Buffer.from("old"),
    isPublic: true,
    headline: null,
    updatedAt: "2026-10-10T00:00:00.000Z"
  })
  const current = room(1)
  assert.equal(await service.getLatestForUser("user_1", current), null)
  assert.equal(await service.findByAssetKey("b".repeat(64)), null)
  const redrawn = await service.publishForRoomSave(current)
  assert.equal(redrawn.rendererVersion, "room-snapshot-v2")
  assert.ok(await service.getLatestForUser("user_1", current))
})

test("the start-up self-check reports the art pack without throwing", async () => {
  assert.deepEqual(await checkRoomSnapshotRenderer(), { ok: true })
  const broken = await checkRoomSnapshotRenderer(createRoomSnapshotRenderer({ artDir: "/nonexistent-art-pack" }))
  assert.equal(broken.ok, false)
})
