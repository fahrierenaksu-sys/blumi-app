import assert from "node:assert/strict"
import test from "node:test"
import {
  canOpenMatchExperience,
  createLocalDemoMatch
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
