// Behaviour: a stored avatar full of legacy item IDs never hides an account
// (plan §2.4, V1–V4). Before 1.6 such a row threw, which dropped the person
// from Discover, left chat partners without an avatar, and failed account
// loads. Fixtures use made-up item IDs only; no user data.
import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  toAvatarLoadoutV2
} from "@blumi/domain"
import { chatParticipantFromAccount, completeParticipantAvatar } from "../chat/chatParticipantIdentity"
import { mapAccountProfileSafely } from "../db/postgresMatchRepository"
import { cloneCompleteAvatarSelection } from "./avatarSelectionPersistence"
import { createAccountRecord } from "../auth/authStore"
import { createConfiguredServerServices, resolveServerConfig } from "../config"
import { createPostgresAuthRepository } from "../db/postgresAuthRepository"
import { createPostgresPresenceRepository } from "../db/postgresPresenceRepository"

const LEGACY = "avatar_v1_retired_item"

function legacyLoadout(starter: typeof DEFAULT_FEMALE_AVATAR_LOADOUT) {
  return {
    ...toAvatarLoadoutV2(starter),
    hairId: LEGACY,
    topId: LEGACY,
    bottomId: LEGACY,
    shoesId: LEGACY,
    dressId: LEGACY,
    accessoryIds: [LEGACY]
  }
}

test("a chat partner with legacy item IDs still has an avatar, drawn as the starter look", () => {
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    const avatar = { presetId: starter.bodyId, loadout: legacyLoadout(starter), revision: 3 }
    assert.deepEqual(completeParticipantAvatar(avatar)?.loadout, toAvatarLoadoutV2(starter))
    const participant = chatParticipantFromAccount({
      userId: "user-fixture",
      profile: { displayName: "Fixture", avatar }
    })
    assert.equal(participant.avatar?.presetId, starter.bodyId)
    assert.equal(participant.avatar?.revision, 3)
  }
  // Only a broken envelope still leaves the optional avatar out.
  assert.equal(completeParticipantAvatar({ presetId: "avatar_v2_body_default", loadout: "not a loadout" as never, revision: 1 }), undefined)
  assert.equal(completeParticipantAvatar({ presetId: "avatar_v2_body_default", loadout: legacyLoadout(DEFAULT_FEMALE_AVATAR_LOADOUT), revision: -1 }), undefined)
})

test("a Discover profile with legacy item IDs and a legacy preset is still listed", () => {
  const rows = [
    { avatar_preset_id: "dusk", gender: "man", identity_gender: null, expected: DEFAULT_MALE_AVATAR_LOADOUT },
    { avatar_preset_id: "sunset", gender: "woman", identity_gender: "woman", expected: DEFAULT_FEMALE_AVATAR_LOADOUT },
    { avatar_preset_id: DEFAULT_MALE_AVATAR_LOADOUT.bodyId, gender: null, identity_gender: null, expected: DEFAULT_MALE_AVATAR_LOADOUT }
  ]
  for (const { expected, ...columns } of rows) {
    const profiles = mapAccountProfileSafely({
      user_id: "user-fixture",
      display_name: "Fixture",
      age: 27,
      bio: null,
      profile_prompts: [],
      vibe_tags: [],
      avatar_selection: { ...legacyLoadout(expected), bodyId: columns.avatar_preset_id.startsWith("avatar_") ? expected.bodyId : LEGACY },
      avatar_revision: 5,
      updated_at: null,
      ...columns
    })
    assert.equal(profiles.length, 1, columns.avatar_preset_id)
    assert.deepEqual(profiles[0].avatar.loadout, toAvatarLoadoutV2(expected))
    assert.equal(profiles[0].avatarPresetId, expected.bodyId)
  }
})

test("presence and match copies of a legacy avatar clone without throwing", () => {
  const copy = cloneCompleteAvatarSelection({
    presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
    loadout: legacyLoadout(DEFAULT_FEMALE_AVATAR_LOADOUT),
    revision: 8
  })
  assert.deepEqual(copy.loadout, toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT))
  assert.equal(copy.revision, 8)
})

// Review A F2: the three read paths below had no direct test.

/** A pool that answers every SELECT with the given rows (no database). */
function fakePool(rows: Record<string, unknown>[]) {
  const executor = {
    async query(text: string) {
      if (text.includes("clock_timestamp()")) return { rows: [{ checked_at: new Date() }] }
      return { rows: text.includes("SELECT") ? rows : [] }
    }
  }
  return { ...executor, async connect() { return { ...executor, release() {} } } } as never
}

function accountRow(avatarSelection: unknown, extra: Record<string, unknown> = {}) {
  return {
    account_id: "account-fixture",
    user_id: "user-fixture",
    phone_number: "+900000000000",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    display_name: "Fixture",
    avatar_preset_id: "dusk",
    avatar_revision: 6,
    avatar_selection: avatarSelection,
    gender: "man",
    identity_gender: null,
    ...extra
  }
}

test("a boy stored in his former starter (side part + interim garments) reads as the curls and basic_a starter", async () => {
  const former = {
    ...toAvatarLoadoutV2(DEFAULT_MALE_AVATAR_LOADOUT),
    hairId: "avatar_v2_hair_male_soft_black_side_part",
    topId: "avatar_v2_top_male_powder_blue_crew_tee",
    bottomId: "avatar_v2_bottom_male_navy_straight_pants",
    shoesId: "avatar_v2_shoes_male_milk_tea_court"
  }
  const repository = createPostgresAuthRepository(fakePool([accountRow(former, { avatar_preset_id: DEFAULT_MALE_AVATAR_LOADOUT.bodyId })]))
  const account = await repository.findAccountByUserId("user-fixture")
  assert.ok(account)
  const read = account.profile.avatar.loadout
  assert.ok(read)
  assert.deepEqual(
    [read.hairId, read.topId, read.bottomId, read.shoesId],
    [
      "avatar_v2_hair_male_blue_black_curls",
      "avatar_v2_top_male_white_basic_tee",
      "avatar_v2_bottom_male_black_straight_trousers",
      "avatar_v2_shoes_male_black_clean_sneakers"
    ]
  )
  assert.equal(account.profile.avatar.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
})

test("an account with legacy item IDs still loads, as the starter look of the body its gender implies", async () => {
  const legacy = { ...legacyLoadout(DEFAULT_MALE_AVATAR_LOADOUT), bodyId: LEGACY }
  // Rows arrive as parsed JSON from pg, or as a JSON string from older drivers.
  for (const stored of [legacy, JSON.stringify(legacy)]) {
    const repository = createPostgresAuthRepository(fakePool([accountRow(stored)]))
    const account = await repository.findAccountByUserId("user-fixture")
    assert.ok(account)
    assert.deepEqual(account.profile.avatar.loadout, toAvatarLoadoutV2(DEFAULT_MALE_AVATAR_LOADOUT))
    assert.equal(account.profile.avatar.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
    assert.equal(account.profile.avatar.revision, 6)
  }
  const woman = createPostgresAuthRepository(fakePool([accountRow(legacy, { avatar_preset_id: "sunset", gender: "woman" })]))
  assert.deepEqual((await woman.findAccountByUserId("user-fixture"))?.profile.avatar.loadout,
    toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT))
  // A stored value that is not JSON at all is a broken envelope, not an item ID: it still fails loudly.
  const broken = createPostgresAuthRepository(fakePool([accountRow("{not json")]))
  await assert.rejects(broken.findAccountByUserId("user-fixture"))
})

test("room presence read from PostgreSQL draws a legacy avatar as the starter look", async () => {
  const repository = createPostgresPresenceRepository(fakePool([{
    room_id: "room-fixture",
    user_id: "user-fixture",
    display_name: "Fixture",
    avatar_preset_id: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
    avatar_selection: legacyLoadout(DEFAULT_FEMALE_AVATAR_LOADOUT),
    avatar_revision: 2,
    spot_id: "seat-left",
    in_mini_room: false,
    joined_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    expires_at: "2026-10-01T00:10:00.000Z"
  }]))
  const listed = await repository.listRoomPresence("room-fixture", new Date("2026-10-01T00:01:00.000Z"))
  assert.equal(listed.length, 1)
  assert.deepEqual(listed[0].avatar.loadout, toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT))
  assert.equal(listed[0].avatar.revision, 2)
})

test("the configured memory server shows a present user with legacy item IDs as the starter look", async () => {
  const services = createConfiguredServerServices(resolveServerConfig({ NODE_ENV: "development" }))
  try {
    const now = new Date()
    const base = createAccountRecord("+900000000001", now)
    const userId = base.userId
    services.authService.store.accountsByPhone.set(base.phoneNumber, {
      ...base,
      profile: {
        ...base.profile,
        avatar: { presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId, revision: 4, loadout: legacyLoadout(DEFAULT_MALE_AVATAR_LOADOUT) as never }
      }
    })
    const record = {
      roomId: "room-fixture",
      userId,
      displayName: "Fixture",
      // A stale cached copy (revision 1): the read must use the account row (revision 4) instead.
      avatar: { presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId, revision: 1, loadout: toAvatarLoadoutV2(DEFAULT_MALE_AVATAR_LOADOUT) },
      spotId: "seat-left",
      inMiniRoom: false,
      joinedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString()
    }
    await services.presenceService.repository.savePresence(record)
    const present = await services.presenceService.repository.findUserPresence("room-fixture", userId, now)
    assert.ok(present, "the user must stay present")
    assert.deepEqual(present.avatar.loadout, toAvatarLoadoutV2(DEFAULT_MALE_AVATAR_LOADOUT))
    assert.equal(present.avatar.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
    assert.equal(present.avatar.revision, 4)
  } finally {
    await services.close()
  }
})
