import assert from "node:assert/strict"
import test from "node:test"
import type { CompleteAvatarSelection } from "@blumi/contracts"
import { createPostgresPresenceRepository } from "./postgresPresenceRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

const avatar: CompleteAvatarSelection = {
  presetId: "avatar_v2_body_default",
  revision: 4,
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
}

const canonicalAccountAvatar: CompleteAvatarSelection = {
  ...avatar,
  revision: 5,
  loadout: {
    ...avatar.loadout,
    accessoryIds: []
  }
}

const presenceRow = {
  room_id: "room_one",
  user_id: "user_one",
  display_name: "Defne",
  avatar_preset_id: avatar.presetId,
  avatar_selection: avatar.loadout,
  avatar_revision: avatar.revision,
  spot_id: "spot_one",
  in_mini_room: false,
  joined_at: "2026-07-13T10:00:00.000Z",
  updated_at: "2026-07-13T10:00:00.000Z",
  expires_at: "2026-07-13T10:10:00.000Z"
}

function createFakePool(rows: Record<string, unknown>[] = []) {
  const calls: QueryCall[] = []
  return {
    calls,
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        return { rows: text.includes("SELECT") ? rows : [] }
      }
    }
  }
}

function createAvatarAuthorityPool(legacyAvatar: CompleteAvatarSelection) {
  const calls: QueryCall[] = []
  return {
    calls,
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        if (!text.includes("SELECT")) return { rows: [] }
        const selectedAvatar = /account\.avatar_revision AS avatar_revision/i.test(text)
          ? canonicalAccountAvatar
          : legacyAvatar
        return {
          rows: [{
            ...presenceRow,
            avatar_preset_id: selectedAvatar.presetId,
            avatar_selection: selectedAvatar.loadout,
            avatar_revision: selectedAvatar.revision
          }]
        }
      }
    }
  }
}

test("postgres presence reads hydrate canonical account avatars instead of stale presence copies", async () => {
  const now = new Date("2026-07-13T10:01:00.000Z")
  const divergentLegacyAvatars: CompleteAvatarSelection[] = [
    avatar,
    {
      ...avatar,
      revision: canonicalAccountAvatar.revision
    },
    {
      ...avatar,
      revision: canonicalAccountAvatar.revision + 1
    }
  ]
  const operations = [
    (repository: ReturnType<typeof createPostgresPresenceRepository>) =>
      repository.listRoomPresence("room_one", now),
    (repository: ReturnType<typeof createPostgresPresenceRepository>) =>
      repository.findUserPresence("room_one", "user_one", now),
    (repository: ReturnType<typeof createPostgresPresenceRepository>) =>
      repository.findUserPresenceAcrossRooms("user_one", now)
  ]

  for (const legacyAvatar of divergentLegacyAvatars) {
    for (const operation of operations) {
      const fake = createAvatarAuthorityPool(legacyAvatar)
      const result = await operation(createPostgresPresenceRepository(fake.pool))
      const record = Array.isArray(result) ? result[0] : result

      assert.deepEqual(record?.avatar, canonicalAccountAvatar)
      assertCanonicalAccountAvatarQuery(fake.calls[1]?.text ?? "")
    }
  }
})

test("cached stale presence saves update metadata without writing avatar columns", async () => {
  const fake = createFakePool()
  const repository = createPostgresPresenceRepository(fake.pool)

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

  const query = fake.calls[0]?.text ?? ""
  assert.doesNotMatch(query, /avatar_preset_id|avatar_selection|avatar_revision/)
  assert.deepEqual(fake.calls[0]?.values, [
    "room_one",
    "user_one",
    "Defne",
    "spot_one",
    false,
    "2026-07-13T10:00:00.000Z",
    "2026-07-13T10:00:00.000Z",
    "2026-07-13T10:10:00.000Z"
  ])
})

test("legacy avatar projection updates are compatibility no-ops", async () => {
  const fake = createFakePool()
  const repository = createPostgresPresenceRepository(fake.pool)
  const now = new Date("2026-07-13T10:01:00.000Z")

  await repository.updateUserAvatarSelection("user_one", avatar, now)

  assert.equal(fake.calls.length, 0)
})

test("postgres presence repository rejects malformed stored avatar selections", async () => {
  const fake = createFakePool([
    { ...presenceRow, avatar_revision: "4" }
  ])

  await assert.rejects(
    createPostgresPresenceRepository(fake.pool).findUserPresence(
      "room_one",
      "user_one",
      new Date("2026-07-13T10:01:00.000Z")
    ),
    /Stored avatar selection is invalid/
  )
})

test("presence metadata writes ignore malformed cached avatars", async () => {
  const fake = createFakePool()
  const malformedAvatar = {
    ...avatar,
    revision: "4"
  } as unknown as CompleteAvatarSelection

  await createPostgresPresenceRepository(fake.pool).savePresence({
    roomId: "room_one",
    userId: "user_one",
    displayName: "Defne",
    avatar: malformedAvatar,
    spotId: "spot_one",
    inMiniRoom: false,
    joinedAt: "2026-07-13T10:00:00.000Z",
    updatedAt: "2026-07-13T10:00:00.000Z",
    expiresAt: "2026-07-13T10:10:00.000Z"
  })
  assert.equal(fake.calls.length, 1)
})

function assertCanonicalAccountAvatarQuery(query: string): void {
  assert.match(
    query,
    /FROM blumi_room_presence AS presence\s+INNER JOIN blumi_accounts AS account\s+ON account\.user_id = presence\.user_id/i
  )
  assert.match(query, /account\.avatar_preset_id AS avatar_preset_id/i)
  assert.match(query, /account\.avatar_selection AS avatar_selection/i)
  assert.match(query, /account\.avatar_revision AS avatar_revision/i)
}
