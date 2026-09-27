import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"
import {
  canOpenMatchExperience,
  createLocalDemoMatch,
  createMatchFromPersistedThread
} from "./matchRoomModel"
import {
  DEFAULT_MATCH_ROOM_AVATAR,
  createStableMatchedUserAvatar,
  resolveLatestMatchRoomAvatar
} from "./matchRoomResolvers"

test("completed users can open the match-room experience", () => {
  const completedActor = {
    session: {
      onboarding: {
        profile: "complete" as const,
        avatar: "complete" as const,
        room: "complete" as const
      }
    }
  }
  const incompleteActor = {
    session: {
      onboarding: {
        profile: "complete" as const,
        avatar: "incomplete" as const,
        room: "incomplete" as const
      }
    }
  }

  assert.equal(canOpenMatchExperience(completedActor), true)
  assert.equal(canOpenMatchExperience(incompleteActor), false)
  assert.equal(canOpenMatchExperience(null), false)
})

test("a persisted mutual-match chat can reopen its real match screen", () => {
  const thread: ChatThread = {
    threadId: "thread_match_match_123",
    miniRoomId: "match_match_123",
    createdAt: "2026-09-27T03:00:00.000Z",
    participantUserIds: ["me", "them"] as [string, string],
    participants: [
      { userId: "me", displayName: "Eren" },
      { userId: "them", displayName: "Can", avatar: {
        presetId: "avatar_v2_body_male_light", revision: 0,
        loadout: {
          schemaVersion: 1 as const,
          bodyId: "avatar_v2_body_male_light", faceId: "face", eyesId: "eyes",
          noseId: "nose", mouthId: "mouth", hairId: "hair", topId: "top",
          bottomId: "bottom", shoesId: "shoes", accessoryIds: ["glasses"]
        }
      } }
    ]
  }
  const match = createMatchFromPersistedThread(thread, "me")
  assert.equal(match?.id, "match_123")
  assert.equal(match?.matchedUser.avatarPresetId, "avatar_v2_body_male_light")
  assert.deepEqual(match?.matchedUser.avatarSelection?.loadout, {
    ...thread.participants[1]?.avatar?.loadout,
    schemaVersion: 2,
    dressId: null,
    outerwearId: null
  })
  assert.notEqual(match?.matchedUser.avatarSelection, thread.participants[1]?.avatar)
  assert.deepEqual(
    createStableMatchedUserAvatar(match!.matchedUser),
    {
      bodyId: "avatar_v2_body_male_light",
      faceId: "face", eyesId: "eyes", noseId: "nose", mouthId: "mouth",
      hairId: "hair", topId: "top", bottomId: "bottom", shoesId: "shoes",
      dressId: null, outerwearId: null, accessoryIds: ["glasses"]
    }
  )
  assert.equal(createMatchFromPersistedThread({ ...thread, miniRoomId: "other" }, "me"), null)
  assert.equal(createMatchFromPersistedThread(thread, "stranger"), null)
})

test("local demo matches are explicit and stay outside durable backend chat", () => {
  const match = createLocalDemoMatch({
    now: "2026-06-23T12:00:00.000Z",
    currentUser: { userId: "me", displayName: "Mina" },
    matchedUser: { userId: "them", displayName: "Defne" }
  })

  assert.equal(match.mode, "demo")
  assert.equal(match.backendBoundary, "local-demo-only")
  assert.equal(match.roomOwnerUserId, "me")
})

test("latest avatar resolver copies state without owning it", () => {
  const avatar = {
    ...DEFAULT_MATCH_ROOM_AVATAR,
    topId: "avatar_v2_top_noir_rose_heart_cardigan",
    accessoryIds: ["avatar_v2_accessory_sage_heart_glasses"]
  }
  const resolvedAvatar = resolveLatestMatchRoomAvatar(avatar)
  assert.deepEqual(resolvedAvatar, avatar)
  assert.notEqual(resolvedAvatar, avatar)
  assert.notEqual(resolvedAvatar.accessoryIds, avatar.accessoryIds)
})

test("matched-user fallback avatar is stable for the same participant", () => {
  const participant = { userId: "demo-user-001", displayName: "Defne" }
  assert.deepEqual(
    createStableMatchedUserAvatar(participant),
    createStableMatchedUserAvatar(participant)
  )
  assert.notDeepEqual(
    createStableMatchedUserAvatar(participant),
    createStableMatchedUserAvatar({ userId: "demo-user-002", displayName: "Ece" })
  )
})

test("male demo matches keep a compatible male avatar on the match screen", () => {
  const match = createLocalDemoMatch({
    currentUser: { userId: "me", displayName: "Mina" },
    matchedUser: {
      userId: "demo-user-009",
      displayName: "Mert Kaya",
      avatarPresetId: "avatar_v2_body_male_light"
    }
  })
  const avatar = createStableMatchedUserAvatar(match.matchedUser)
  assert.equal(avatar.bodyId, "avatar_v2_body_male_light")
  assert.match(avatar.hairId, /_male_/)
  assert.match(avatar.topId, /_male_/)
  assert.match(avatar.bottomId, /_male_/)
  assert.match(avatar.shoesId, /_male_/)
})
