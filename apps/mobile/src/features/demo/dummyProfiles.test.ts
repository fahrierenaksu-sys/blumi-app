import assert from "node:assert/strict"
import test from "node:test"
import { DEMO_CURRENT_USER, DUMMY_PROFILES } from "./dummyProfiles"

test("demo catalog has 16 distinct adults with matching existing avatar bodies", () => {
  assert.equal(DUMMY_PROFILES.length, 16)
  assert.equal(new Set(DUMMY_PROFILES.map((profile) => profile.userId)).size, 16)
  assert.equal(DUMMY_PROFILES.filter((profile) => profile.gender === "woman").length, 8)
  assert.equal(DUMMY_PROFILES.filter((profile) => profile.gender === "man").length, 8)
  assert.ok(DUMMY_PROFILES.every((profile) =>
    profile.age >= 18 &&
    profile.avatarPresetId === (profile.gender === "man"
      ? "avatar_v2_body_male_light"
      : "avatar_v2_body_default")
  ))
  assert.equal(DEMO_CURRENT_USER.displayName, "You")
})

test("demo profiles keep explicit liked and not-liked cohorts", () => {
  assert.deepEqual(
    DUMMY_PROFILES.filter((profile) => profile.hasLikedMe).map((profile) => profile.userId),
    DUMMY_PROFILES.map((profile) => profile.userId)
  )
  assert.equal(DUMMY_PROFILES.filter((profile) => !profile.hasLikedMe).length, 0)
})
