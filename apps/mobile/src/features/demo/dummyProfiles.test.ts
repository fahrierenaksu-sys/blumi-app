import assert from "node:assert/strict"
import test from "node:test"
import { DEMO_CURRENT_USER, DUMMY_PROFILES } from "./dummyProfiles"

test("English demo mode keeps profile copy in the same language as the UI", () => {
  assert.deepEqual(
    DUMMY_PROFILES.map((profile) => profile.bio),
    [
      "Coffee lover ☕ Photography and travel",
      "Yoga instructor 🧘‍♀️ Dog mom",
      "Musician 🎵 Guitar and piano",
      "Graphic designer 🎨 Minimalism enthusiast",
      "Bookworm 📚 Science fiction and philosophy",
      "Software engineer 💻 Startup life",
      "Dancer 💃 Salsa and bachata",
      "Chef 🍳 World cuisines",
      "Fitness and outdoors 🏃‍♀️ Hiking",
      "Lawyer ⚖️ Human rights"
    ]
  )
  assert.equal(DEMO_CURRENT_USER.displayName, "You")
})

test("demo profiles keep explicit liked and not-liked cohorts", () => {
  assert.deepEqual(
    DUMMY_PROFILES.filter((profile) => profile.hasLikedMe).map((profile) => profile.userId),
    ["demo-user-001", "demo-user-003", "demo-user-006"]
  )
  assert.equal(DUMMY_PROFILES.filter((profile) => !profile.hasLikedMe).length, 7)
})
