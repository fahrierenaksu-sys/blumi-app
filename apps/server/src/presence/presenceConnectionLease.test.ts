import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import { createInMemoryPresenceRepository, createInMemoryPresenceStore } from "./presenceRepository"

const avatar: CompleteAvatarSelection = {
  presetId: "avatar_v2_body_default",
  revision: 1,
  loadout: {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    accessoryIds: []
  }
}

test("in-memory presence keeps rejoined users until their last local connection leaves", async () => {
  const repository = createInMemoryPresenceRepository()
  const now = new Date()
  await repository.savePresence({
    roomId: "room_one",
    userId: "user_one",
    displayName: "User",
    avatar,
    spotId: "spot_one",
    inMiniRoom: false,
    joinedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString()
  })
  await repository.registerConnectionLease("connection_old", "user_one", 90_000)
  await repository.registerConnectionLease("connection_new", "user_one", 90_000)

  assert.deepEqual(
    await repository.disconnectConnectionLease("connection_old", "user_one"),
    []
  )
  assert.ok(await repository.findUserPresence("room_one", "user_one"))
  assert.equal(await repository.heartbeatConnectionLease("connection_old", "user_one", 90_000), false)

  assert.deepEqual(
    await repository.disconnectConnectionLease("connection_new", "user_one"),
    ["room_one"]
  )
  assert.equal(await repository.findUserPresence("room_one", "user_one"), null)
})

test("in-memory connection lease purge removes only expired rows", async () => {
  const store = createInMemoryPresenceStore()
  const repository = createInMemoryPresenceRepository(store)
  await repository.registerConnectionLease("connection_expired", "user_one", 90_000)
  await repository.registerConnectionLease("connection_live", "user_one", 90_000)
  store.connectionLeases.get("connection_expired")!.expiresAt = Date.now() - 1

  assert.equal(await repository.purgeExpiredConnectionLeases(1), 1)
  assert.equal(store.connectionLeases.has("connection_expired"), false)
  assert.equal(store.connectionLeases.has("connection_live"), true)
})
