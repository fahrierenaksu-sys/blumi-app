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

function v1Snapshot(overrides: Partial<{ roomRevision: number; isPublic: boolean; headline: string | null }> = {}) {
  return {
    userId: "user_1",
    roomRevision: overrides.roomRevision ?? 1,
    assetKey: "b".repeat(64),
    mimeType: "image/webp" as const,
    rendererVersion: "room-snapshot-v1",
    body: Buffer.from("old"),
    isPublic: overrides.isPublic ?? true,
    headline: overrides.headline ?? null,
    updatedAt: "2026-10-10T00:00:00.000Z"
  }
}

function v2Renderer(onRender: () => void = () => {}) {
  return {
    version: "room-snapshot-v2",
    async render() {
      onRender()
      return { body: Buffer.from("new"), mimeType: "image/webp" as const, rendererVersion: "room-snapshot-v2" }
    }
  }
}

// M3 (Phase 2 review): existing users hold pictures drawn by the old renderer and may never save again. Reading
// their room redraws it once, keeping their visibility and headline; the old drawing itself is never served.
test("reading a room drawn by an older renderer redraws it once and keeps the user's showcase choices", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  let renders = 0
  const service = createRoomSnapshotService({ repository, renderer: v2Renderer(() => { renders += 1 }) })
  await repository.save(v1Snapshot({ isPublic: true, headline: "Hello" }))

  const [first, concurrent] = await Promise.all([
    service.getLatestForUser("user_1", room(1)),
    service.getLatestForUser("user_1", room(1))
  ])
  const again = await service.getLatestForUser("user_1", room(1))

  assert.equal(first?.rendererVersion, "room-snapshot-v2")
  assert.equal(first?.isPublic, true)
  assert.equal(first?.headline, "Hello")
  assert.deepEqual(concurrent, first)
  assert.deepEqual(again, first)
  assert.equal(renders, 1)
  assert.equal(await service.findByAssetKey("b".repeat(64)), null)
  assert.equal((await service.findByAssetKey(first!.assetKey))?.body.toString(), "new")
})

test("a read redraw that fails serves nothing and reports the error", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  const errors: unknown[] = []
  const service = createRoomSnapshotService({
    repository,
    onRenderError: (error) => { errors.push(error) },
    renderer: { version: "room-snapshot-v2", async render() { throw new Error("art pack missing") } }
  })
  await repository.save(v1Snapshot())

  assert.equal(await service.getLatestForUser("user_1", room(1)), null)
  assert.equal(errors.length, 1)
  assert.equal((await repository.getLatest("user_1"))?.rendererVersion, "room-snapshot-v1")
})

test("a read never draws a room that has no picture or whose picture is for another revision", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  let renders = 0
  const service = createRoomSnapshotService({ repository, renderer: v2Renderer(() => { renders += 1 }) })

  assert.equal(await service.getLatestForUser("user_1", room(1)), null)
  await repository.save(v1Snapshot({ roomRevision: 1 }))
  assert.equal(await service.getLatestForUser("user_1", room(2)), null)
  assert.equal(renders, 0)
})

test("a save redraws a same-revision room drawn by an older renderer", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  const service = createRoomSnapshotService({ repository, renderer: v2Renderer() })
  await repository.save(v1Snapshot())

  const redrawn = await service.publishForRoomSave(room(1))
  assert.equal(redrawn.rendererVersion, "room-snapshot-v2")
})

test("the start-up self-check reports the art pack without throwing", async () => {
  assert.deepEqual(await checkRoomSnapshotRenderer(), { ok: true })
  const broken = await checkRoomSnapshotRenderer(createRoomSnapshotRenderer({ artDir: "/nonexistent-art-pack" }))
  assert.equal(broken.ok, false)
})

// LOW-1 (fresh review): a redraw that keeps failing must not re-run the renderer on every read. After a failure
// the room's revision waits a retry-after before a read tries again; a save always draws.
test("a failed read redraw waits its retry-after before a read tries again", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  let clock = Date.parse("2026-10-10T12:00:00.000Z")
  let renders = 0
  const errors: unknown[] = []
  const service = createRoomSnapshotService({
    repository,
    now: () => clock,
    redrawRetryAfterMs: 60_000,
    onRenderError: (error) => { errors.push(error) },
    renderer: { version: "room-snapshot-v2", async render() { renders += 1; throw new Error("art pack missing") } }
  })
  await repository.save(v1Snapshot())

  assert.equal(await service.getLatestForUser("user_1", room(1)), null)
  assert.equal(await service.getLatestForUser("user_1", room(1)), null)
  assert.equal(renders, 1)
  assert.equal(errors.length, 1)

  clock += 60_001
  assert.equal(await service.getLatestForUser("user_1", room(1)), null)
  assert.equal(renders, 2)
  await assert.rejects(service.publishForRoomSave(room(1)), /art pack missing/)
  assert.equal(renders, 3)
})

// LOW-2 (fresh review): reads share a pending redraw only for the same room revision, so a read of a newer
// revision is never handed the previous revision's picture.
test("a read of a newer room revision never joins the previous revision's pending redraw", async () => {
  const repository = createInMemoryRoomSnapshotRepository()
  let release!: () => void
  const paused = new Promise<void>((resolve) => { release = resolve })
  const drawnRevisions: number[] = []
  const service = createRoomSnapshotService({
    repository,
    renderer: {
      version: "room-snapshot-v2",
      async render({ roomRevision }) {
        drawnRevisions.push(roomRevision)
        if (roomRevision === 1) await paused
        return { body: Buffer.from(`r${roomRevision}`), mimeType: "image/webp" as const, rendererVersion: "room-snapshot-v2" }
      }
    }
  })
  await repository.save(v1Snapshot({ roomRevision: 1 }))
  const first = service.getLatestForUser("user_1", room(1))
  await repository.save(v1Snapshot({ roomRevision: 2 }))
  const pendingSecond = service.getLatestForUser("user_1", room(2))
  release()
  const [, second] = await Promise.all([first, pendingSecond])

  assert.deepEqual(drawnRevisions, [1, 2])
  assert.equal(second?.roomRevision, 2)
})
