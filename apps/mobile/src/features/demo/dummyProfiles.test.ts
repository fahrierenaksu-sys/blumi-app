import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_LOADOUT_CATALOG } from "@blumi/domain"
import { DUMMY_PROFILES } from "./dummyProfiles"

test("demo catalog has distinct adults with existing avatar bodies", () => {
  assert.ok(DUMMY_PROFILES.length > 0)
  assert.equal(new Set(DUMMY_PROFILES.map((profile) => profile.userId)).size, DUMMY_PROFILES.length)
  const bodyIds = new Set(
    AVATAR_LOADOUT_CATALOG.filter((item) => item.slot === "body").map((item) => item.itemId)
  )
  for (const profile of DUMMY_PROFILES) {
    assert.ok(profile.age >= 18, `${profile.userId} is an adult`)
    assert.ok(bodyIds.has(profile.avatarPresetId), `${profile.userId} uses a real body`)
  }
})
