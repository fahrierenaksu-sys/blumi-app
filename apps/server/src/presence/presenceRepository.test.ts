import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import {
  createAvatarSelection,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import {
  createInMemoryPresenceRepository,
  createInMemoryPresenceStore
} from "./presenceRepository"

const createAvatar = (): CompleteAvatarSelection => ({
  presetId: "avatar_v2_body_default",
  revision: 2,
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
    accessoryIds: ["avatar_v2_accessory_golden_heart_locket"]
  }
})

test("in-memory presence repository deep-clones complete avatar selections", async () => {
  const repository = createInMemoryPresenceRepository()
  const avatar = createAvatar()

  await repository.savePresence({
    roomId: "room_one",
    userId: "user_one",
    displayName: "Defne",
    avatar,
    spotId: "spot_one",
    inMiniRoom: false,
    joinedAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
    expiresAt: "2026-07-13T10:10:00.000Z"
  })
  avatar.loadout.accessoryIds.push("caller_mutation")

  const firstRead = await repository.findUserPresence(
    "room_one",
    "user_one",
    new Date("2026-07-13T10:01:00.000Z")
  )
  firstRead?.avatar.loadout.accessoryIds.push("read_mutation")
  const secondRead = await repository.findUserPresence(
    "room_one",
    "user_one",
    new Date("2026-07-13T10:01:00.000Z")
  )

  assert.deepEqual(secondRead?.avatar.loadout.accessoryIds, [
    "avatar_v2_accessory_golden_heart_locket"
  ])
  assert.equal(secondRead?.avatar.revision, 2)
})

test("in-memory presence reads hydrate the account avatar and ignore stale websocket snapshots", async () => {
  const storedPresenceAvatar = createAvatar()
  let canonicalAvatar: CompleteAvatarSelection | null = createAvatarSelection(
    DEFAULT_MALE_AVATAR_LOADOUT,
    5
  )
  const repository = createInMemoryPresenceRepository(undefined, {
    resolveAvatarSelection: async (userId) =>
      userId === "user_one" ? canonicalAvatar : null
  })

  await repository.savePresence({
    roomId: "room_one",
    userId: "user_one",
    displayName: "Eren",
    avatar: storedPresenceAvatar,
    spotId: "spot_one",
    inMiniRoom: false,
    joinedAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
    expiresAt: "2026-07-13T10:10:00.000Z"
  })

  const firstRead = await repository.findUserPresence(
    "room_one",
    "user_one",
    new Date("2026-07-13T10:01:00.000Z")
  )
  assert.deepEqual(firstRead?.avatar, canonicalAvatar)

  canonicalAvatar = canonicalAvatar
    ? {
        ...canonicalAvatar,
        revision: 6,
        loadout: {
          ...canonicalAvatar.loadout,
          bottomId: "avatar_v2_bottom_male_navy_straight_pants"
        }
      }
    : null

  await repository.savePresence({
    roomId: "room_one",
    userId: "user_one",
    displayName: "Eren",
    avatar: storedPresenceAvatar,
    spotId: "spot_two",
    inMiniRoom: false,
    joinedAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:02:00.000Z",
    expiresAt: "2026-07-13T10:12:00.000Z"
  })

  const afterCachedResave = await repository.listRoomPresence(
    "room_one",
    new Date("2026-07-13T10:03:00.000Z")
  )
  assert.equal(afterCachedResave[0]?.spotId, "spot_two")
  assert.deepEqual(afterCachedResave[0]?.avatar, canonicalAvatar)

  canonicalAvatar = null
  assert.deepEqual(
    await repository.listRoomPresence(
      "room_one",
      new Date("2026-07-13T10:03:00.000Z")
    ),
    []
  )
})

test("in-memory presence reads hide expired rows without deleting them; the bounded purge removes them", async () => {
  const store = createInMemoryPresenceStore()
  const repository = createInMemoryPresenceRepository(store)
  const base = {
    displayName: "Defne",
    avatar: createAvatar(),
    inMiniRoom: false,
    joinedAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z"
  }
  // Seed directly: expired rows only exist when a lease lapses after saving.
  for (const [index, expiresAt] of [
    "2026-07-13T10:00:30.000Z",
    "2026-07-13T10:00:40.000Z",
    "2026-07-13T10:00:50.000Z",
    "2099-01-01T00:00:00.000Z"
  ].entries()) {
    store.records.set(`room_one:user_${index}`, {
      ...base, roomId: "room_one", userId: `user_${index}`, spotId: `spot_${index}`, expiresAt
    })
  }
  store.records.set("room_two:user_0", {
    ...base,
    roomId: "room_two",
    userId: "user_0",
    spotId: "spot_0",
    updatedAt: "2026-07-13T10:00:05.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z"
  })
  const now = new Date("2026-07-13T10:01:00.000Z")

  assert.deepEqual((await repository.listRoomPresence("room_one", now)).map((record) => record.userId), ["user_3"])
  assert.equal(await repository.findUserPresence("room_one", "user_0", now), null)
  assert.equal((await repository.findUserPresence("room_one", "user_3", now))?.spotId, "spot_3")
  // The expired room_one row is skipped; the live room_two row is returned.
  assert.equal((await repository.findUserPresenceAcrossRooms("user_0", now))?.roomId, "room_two")
  assert.equal(store.records.size, 5, "reads must not delete")

  await assert.rejects(repository.purgeExpiredPresence(0), /purge limit is invalid/)
  assert.equal(await repository.purgeExpiredPresence(2), 2)
  assert.equal(await repository.purgeExpiredPresence(500), 1)
  assert.equal(await repository.purgeExpiredPresence(500), 0)
  assert.deepEqual([...store.records.keys()].sort(), ["room_one:user_3", "room_two:user_0"])
})
