import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarLoadoutV2, CompleteAvatarSelection } from "@blumi/contracts"
import {
  areChatParticipantAvatarsEquivalent,
  getCanonicalChatParticipantAvatar
} from "./chatParticipantAvatar"

const COMPLETE_AVATAR: CompleteAvatarSelection = {
  presetId: "avatar_v2_body_default",
  revision: 4,
  loadout: {
    schemaVersion: 2,
    bodyId: "avatar_v2_body_default",
    faceId: "face_default",
    eyesId: "eyes_default",
    noseId: "nose_default",
    mouthId: "mouth_default",
    hairId: "hair_default",
    topId: "top_default",
    bottomId: "bottom_default",
    dressId: null,
    outerwearId: null,
    shoesId: "shoes_default",
    accessoryIds: ["accessory_default"]
  }
}

function cloneAvatarWithLoadout(
  loadout: AvatarLoadoutV2
): CompleteAvatarSelection {
  return {
    ...COMPLETE_AVATAR,
    loadout: {
      ...loadout,
      accessoryIds: [...loadout.accessoryIds]
    }
  }
}

test("returns a cloned complete participant avatar and rejects partial data", () => {
  const avatar = getCanonicalChatParticipantAvatar({
    userId: "user_two",
    avatar: COMPLETE_AVATAR
  })

  assert.deepEqual(avatar, COMPLETE_AVATAR)
  assert.notStrictEqual(avatar?.loadout.accessoryIds, COMPLETE_AVATAR.loadout.accessoryIds)
  assert.equal(
    getCanonicalChatParticipantAvatar({
      userId: "user_two",
      avatar: { presetId: "avatar_v2_body_default" }
    }),
    null
  )
})

test("compares canonical participant avatars so Inbox rerenders only for visible changes", () => {
  const equivalentClone = cloneAvatarWithLoadout(COMPLETE_AVATAR.loadout as AvatarLoadoutV2)

  assert.equal(
    areChatParticipantAvatarsEquivalent(COMPLETE_AVATAR, equivalentClone),
    true
  )
  assert.equal(
    areChatParticipantAvatarsEquivalent(
      COMPLETE_AVATAR,
      { ...equivalentClone, revision: COMPLETE_AVATAR.revision + 1 }
    ),
    false
  )
  assert.equal(
    areChatParticipantAvatarsEquivalent(
      COMPLETE_AVATAR,
      {
        ...equivalentClone,
        loadout: cloneAvatarWithLoadout({
          ...(equivalentClone.loadout as AvatarLoadoutV2),
          hairId: "changed_hair"
        }).loadout
      }
    ),
    false
  )
  assert.equal(
    areChatParticipantAvatarsEquivalent(
      COMPLETE_AVATAR,
      {
        ...equivalentClone,
        loadout: cloneAvatarWithLoadout({
          ...(equivalentClone.loadout as AvatarLoadoutV2),
          schemaVersion: 2,
          dressId: "dress_rose",
          outerwearId: (equivalentClone.loadout as AvatarLoadoutV2).outerwearId
        }).loadout
      }
    ),
    false
  )
  assert.equal(
    areChatParticipantAvatarsEquivalent(
      COMPLETE_AVATAR,
      {
        ...equivalentClone,
        loadout: cloneAvatarWithLoadout({
          ...(equivalentClone.loadout as AvatarLoadoutV2),
          schemaVersion: 2,
          dressId: (equivalentClone.loadout as AvatarLoadoutV2).dressId,
          outerwearId: "coat_twilight"
        }).loadout
      }
    ),
    false
  )
  assert.equal(areChatParticipantAvatarsEquivalent(undefined, undefined), true)
})
