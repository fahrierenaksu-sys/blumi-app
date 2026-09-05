import test from "node:test"
import assert from "node:assert/strict"
import type { FastifyRequest } from "fastify"
import { createSeedDiscoverProfiles } from "../matches/matchRepository"
import { decorateDiscoverProfile } from "./discoverRoutes"

const request = {
  protocol: "http",
  headers: { host: "127.0.0.1:4000" }
} as FastifyRequest

test("Discovery projects only the public snapshot for the current room revision", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const room = {
    userId: profile.userId,
    revision: 7,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const projected = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: {
      get: async () => room
    } as never,
    roomSnapshotService: {
      getLatestForUser: async () => ({
        userId: profile.userId,
        roomRevision: 7,
        assetKey: "a".repeat(64),
        mimeType: "image/webp",
        rendererVersion: "room-snapshot-v1",
        body: Buffer.from("snapshot"),
        isPublic: true,
        headline: "Kahve ve sohbet",
        updatedAt: room.updatedAt
      }),
      findByAssetKey: async () => null,
      publishForRoomSave: async () => {
        throw new Error("not used")
      },
      setVisibilityForRoom: async () => null
    }
  })

  assert.equal(
    projected.roomSnapshotUrl,
    `/v1/room-showcase/${"a".repeat(64)}`
  )
})

test("Discovery snapshot links cannot be poisoned through the request Host header", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const room = {
    userId: profile.userId,
    revision: 7,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const projected = await decorateDiscoverProfile({
    profile,
    request: {
      protocol: "https",
      headers: { host: "attacker.example" }
    } as FastifyRequest,
    personalRoomDecorService: { get: async () => room } as never,
    roomSnapshotService: {
      getLatestForUser: async () => ({
        userId: profile.userId,
        roomRevision: room.revision,
        assetKey: "c".repeat(64),
        mimeType: "image/webp",
        rendererVersion: "room-snapshot-v1",
        body: Buffer.from("snapshot"),
        isPublic: true,
        headline: null,
        updatedAt: room.updatedAt
      })
    } as never
  })

  assert.equal(projected.roomSnapshotUrl, `/v1/room-showcase/${"c".repeat(64)}`)
  assert.doesNotMatch(String(projected.roomSnapshotUrl), /attacker\.example/)
})

test("Discovery hides private and stale room snapshots", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const room = {
    userId: profile.userId,
    revision: 8,
    decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
    updatedAt: "2026-08-14T12:00:00.000Z"
  }
  const personalRoomDecorService = { get: async () => room }
  const privateSnapshotService = {
    getLatestForUser: async () => ({
      userId: profile.userId,
      roomRevision: 8,
      assetKey: "b".repeat(64),
      mimeType: "image/webp" as const,
      rendererVersion: "room-snapshot-v1",
      body: Buffer.from("snapshot"),
      isPublic: false,
      headline: null,
      updatedAt: room.updatedAt
    }),
    findByAssetKey: async () => null,
    publishForRoomSave: async () => {
      throw new Error("not used")
    },
    setVisibilityForRoom: async () => null
  }
  const hidden = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: personalRoomDecorService as never,
    roomSnapshotService: privateSnapshotService as never
  })
  assert.equal("roomSnapshotUrl" in hidden, false)

  const capabilityHidden = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: personalRoomDecorService as never,
    roomSnapshotService: privateSnapshotService as never,
    allowRoomShowcase: false
  })
  assert.equal("roomSnapshotUrl" in capabilityHidden, false)

  const stale = await decorateDiscoverProfile({
    profile,
    request,
    personalRoomDecorService: personalRoomDecorService as never,
    roomSnapshotService: {
      ...privateSnapshotService,
      getLatestForUser: async () => null
    } as never
  })
  assert.equal("roomSnapshotUrl" in stale, false)
})

test("Discovery keeps the base profile when optional room showcase enrichment fails", async () => {
  const profile = createSeedDiscoverProfiles()[0]!
  const warnings: unknown[] = []
  const requestWithLogger = {
    ...request,
    log: {
      warn: (context: unknown) => {
        warnings.push(context)
      }
    }
  } as unknown as FastifyRequest

  const roomReadFailure = await decorateDiscoverProfile({
    profile,
    request: requestWithLogger,
    personalRoomDecorService: {
      get: async () => {
        throw new Error("room storage unavailable")
      }
    } as never,
    roomSnapshotService: {} as never
  })
  assert.equal(roomReadFailure.userId, profile.userId)
  assert.equal("roomSnapshotUrl" in roomReadFailure, false)

  const snapshotReadFailure = await decorateDiscoverProfile({
    profile,
    request: requestWithLogger,
    personalRoomDecorService: {
      get: async () => ({
        userId: profile.userId,
        revision: 1,
        decor: { roomShellId: "room_v2_shell_blumi_world_v1", placedItems: [] },
        updatedAt: "2026-08-14T12:00:00.000Z"
      })
    } as never,
    roomSnapshotService: {
      getLatestForUser: async () => {
        throw new Error("snapshot storage unavailable")
      }
    } as never
  })
  assert.equal(snapshotReadFailure.userId, profile.userId)
  assert.equal("roomSnapshotUrl" in snapshotReadFailure, false)
  assert.equal(warnings.length, 2)
})
