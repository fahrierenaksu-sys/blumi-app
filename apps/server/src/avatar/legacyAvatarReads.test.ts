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
