import assert from "node:assert/strict"
import test from "node:test"
import {
  createPreAuthOnboardingDraft,
  getNextPreAuthOnboardingRoute,
  PRE_AUTH_ONBOARDING_ROUTE_ORDER,
  replayPreAuthOnboardingDraft,
  setPreAuthAvatarDraft,
  setPreAuthProfileDraft,
  setPreAuthRoomDraft
} from "./preAuthOnboardingDraft"

test("pre-auth onboarding stays immutable and routes profile -> avatar -> room -> register", () => {
  const empty = createPreAuthOnboardingDraft()
  const withProfile = setPreAuthProfileDraft(empty, { displayName: "Ada" })
  const withAvatar = setPreAuthAvatarDraft(withProfile, { avatarId: "female-01" })
  const ready = setPreAuthRoomDraft(withAvatar, { roomId: "cozy-01" })

  assert.deepEqual(PRE_AUTH_ONBOARDING_ROUTE_ORDER, [
    "profile",
    "avatar",
    "room",
    "register"
  ])
  assert.equal(getNextPreAuthOnboardingRoute(empty), "profile")
  assert.equal(getNextPreAuthOnboardingRoute(withProfile), "avatar")
  assert.equal(getNextPreAuthOnboardingRoute(withAvatar), "room")
  assert.equal(getNextPreAuthOnboardingRoute(ready), "register")
  assert.equal(empty.profile, null)
  assert.notEqual(withProfile, empty)
  assert.notEqual(withAvatar, withProfile)
  assert.notEqual(ready, withAvatar)
})

test("ready drafts replay only after registration and clear only after completion flags", async () => {
  const calls: string[] = []
  const draft = setPreAuthRoomDraft(
    setPreAuthAvatarDraft(
      setPreAuthProfileDraft(createPreAuthOnboardingDraft(), { displayName: "Ada" }),
      { avatarId: "female-01" }
    ),
    { roomId: "cozy-01" }
  )

  await replayPreAuthOnboardingDraft(draft, {
    register: async () => {
      calls.push("register")
      return { actorId: "actor-1" }
    },
    saveProfile: async (registration, profile) => {
      calls.push(`profile:${registration.actorId}:${profile.displayName}`)
    },
    saveAvatar: async (registration, avatar) => {
      calls.push(`avatar:${registration.actorId}:${avatar.avatarId}`)
    },
    saveRoom: async (registration, room) => {
      calls.push(`room:${registration.actorId}:${room.roomId}`)
    },
    completeOnboarding: async (registration) => {
      calls.push(`complete:${registration.actorId}`)
    },
    clearDraft: async () => {
      calls.push("clear")
    }
  })

  assert.deepEqual(calls, [
    "register",
    "profile:actor-1:Ada",
    "avatar:actor-1:female-01",
    "room:actor-1:cozy-01",
    "complete:actor-1",
    "clear"
  ])
})

test("replay fails closed before registration when any local draft is missing", async () => {
  const calls: string[] = []
  const incomplete = setPreAuthProfileDraft(
    createPreAuthOnboardingDraft(),
    { displayName: "Ada" }
  )

  await assert.rejects(
    replayPreAuthOnboardingDraft(incomplete, {
      register: async () => {
        calls.push("register")
        return { actorId: "actor-1" }
      },
      saveProfile: async () => { calls.push("profile") },
      saveAvatar: async () => { calls.push("avatar") },
      saveRoom: async () => { calls.push("room") },
      completeOnboarding: async () => { calls.push("complete") },
      clearDraft: async () => { calls.push("clear") }
    }),
    /not ready/i
  )
  assert.deepEqual(calls, [])
})

test("replay preserves the draft when a server step fails", async () => {
  const calls: string[] = []
  const draft = setPreAuthRoomDraft(
    setPreAuthAvatarDraft(
      setPreAuthProfileDraft(createPreAuthOnboardingDraft(), { displayName: "Ada" }),
      { avatarId: "female-01" }
    ),
    { roomId: "cozy-01" }
  )

  await assert.rejects(
    replayPreAuthOnboardingDraft(draft, {
      register: async () => {
        calls.push("register")
        return { actorId: "actor-1" }
      },
      saveProfile: async () => { calls.push("profile") },
      saveAvatar: async () => {
        calls.push("avatar")
        throw new Error("avatar rejected")
      },
      saveRoom: async () => { calls.push("room") },
      completeOnboarding: async () => { calls.push("complete") },
      clearDraft: async () => { calls.push("clear") }
    }),
    /avatar rejected/
  )

  assert.deepEqual(calls, ["register", "profile", "avatar"])
  assert.equal(getNextPreAuthOnboardingRoute(draft), "register")
})
