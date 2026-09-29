import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import {
  createAvatarSelection,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "@blumi/domain"
import { createInMemoryPresenceRepository } from "./presenceRepository"

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
