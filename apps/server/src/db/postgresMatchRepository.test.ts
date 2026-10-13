import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresMatchRepository } from "./postgresMatchRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

// A complete, currently wearable look (plan X15: the 2.5D girl starter; the old pieces are retired).
const completeAvatarRow = {
  avatar_preset_id: "avatar_v2_body_default",
  avatar_selection: {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_ink_pageboy_star",
    topId: "avatar_v2_top_coral_wave_polo",
    bottomId: "avatar_v2_bottom_coral_wave_pants",
    shoesId: "avatar_v2_shoes_mint_ribbon_court_sneakers",
    accessoryIds: []
  },
  avatar_revision: 3
} as const

function createFakePool(handler: (text: string) => Record<string, unknown>[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    pool: {
      async query(text: string, values?: readonly unknown[]) {
        calls.push({ text, values })
        return { rows: handler(text) }
      }
    }
  }
}

test("postgres discovery maps account rows into normalized profiles", async () => {
  const fake = createFakePool((text) => {
    if (/\bSELECT\b/i.test(text)) {
      return [
        {
          user_id: "discover_defne",
          display_name: "Defne Yildiz",
          age: 24,
          gender: "woman",
          distance_label: "3 km away",
          vibe_tags: ["coffee dates", "slow burn"],
          profile_prompts: [
            { promptId: "invented", answer: "Must not leak." },
            { promptId: "small_joy", answer: "  Fresh   coffee. " },
            { promptId: "small_joy", answer: "Duplicate." },
            { promptId: "ask_me_about", answer: "Neighborhood cafes." },
            { promptId: "ideal_sunday", answer: "Third must be dropped." }
          ],
          ...completeAvatarRow
        }
      ]
    }
    return []
  })
  const repository = createPostgresMatchRepository(fake.pool)

  const profiles = await repository.listDiscoverProfiles("current_user", {
    ageMin: 23,
    ageMax: 31,
    genders: ["woman"],
    vibes: ["coffee dates", "slow burn"]
  })

  assert.equal(profiles[0]?.userId, "discover_defne")
  assert.deepEqual(profiles[0]?.prompts, [
    { promptId: "small_joy", answer: "Fresh coffee." },
    { promptId: "ask_me_about", answer: "Neighborhood cafes." }
  ])
  assert.deepEqual(profiles[0]?.avatar, {
    presetId: "avatar_v2_body_default",
    loadout: completeAvatarRow.avatar_selection,
    revision: 3
  })
})

// Was "skips one invalid avatar without breaking the page": a malformed field
// hid the person. Reads are tolerant now (plan §2.4): a malformed field inside
// the loadout is drawn as the starter piece; only a loadout that is not an
// object is still skipped, and it never breaks the page.
test("postgres discovery lists a malformed avatar as the starter look and skips a broken one without breaking the page", async () => {
  const fake = createFakePool((text) => {
    if (!/\bSELECT\b/i.test(text)) return []
    return [
      {
        user_id: "invalid-avatar",
        display_name: "Broken",
        age: 27,
        gender: "woman",
        vibe_tags: ["coffee"],
        ...completeAvatarRow,
        avatar_selection: {
          ...completeAvatarRow.avatar_selection,
          accessoryIds: "invalid"
        }
      },
      {
        user_id: "broken-envelope",
        display_name: "Gone",
        age: 27,
        gender: "woman",
        vibe_tags: ["coffee"],
        ...completeAvatarRow,
        avatar_selection: "not a loadout"
      },
      {
        user_id: "valid-avatar",
        display_name: "Ada",
        age: 26,
        gender: "woman",
        vibe_tags: ["coffee"],
        ...completeAvatarRow
      }
    ]
  })

  const profiles = await createPostgresMatchRepository(fake.pool)
    .listDiscoverProfiles("viewer", {
      ageMin: 18,
      ageMax: 99,
      genders: [],
      vibes: []
    })

  assert.deepEqual(profiles.map((profile) => profile.userId), ["invalid-avatar", "valid-avatar"])
  assert.deepEqual(profiles[0]?.avatar.loadout.accessoryIds, [])
})

test("postgres discovery preserves bios and does not invent vibe tags", async () => {
  const fake = createFakePool((text) => {
    if (/\bSELECT\b/i.test(text)) {
      return [
        {
          user_id: "user_without_interests",
          display_name: "Deniz",
          age: 28,
          gender: "non-binary",
          bio: "Ceramics, rainy walks, and quiet Sundays.",
          vibe_tags: [],
          ...completeAvatarRow
        }
      ]
    }
    return []
  })
  const repository = createPostgresMatchRepository(fake.pool)

  const profile = await repository.findDiscoverProfile("user_without_interests")

  assert.equal(profile?.bio, "Ceramics, rainy walks, and quiet Sundays.")
  assert.deepEqual(profile?.vibeTags, [])
})

// Was "excludes malformed stored avatar selections" (see the test above).
test("postgres discovery reads a malformed stored avatar field as the starter piece", async () => {
  const fake = createFakePool((text) => {
    if (/\bSELECT\b/i.test(text)) {
      return [
        {
          user_id: "malformed_avatar",
          display_name: "Deniz",
          age: 28,
          gender: "non-binary",
          vibe_tags: [],
          ...completeAvatarRow,
          avatar_selection: {
            ...completeAvatarRow.avatar_selection,
            accessoryIds: "not-an-array"
          }
        }
      ]
    }
    return []
  })

  const profile = await createPostgresMatchRepository(fake.pool).findDiscoverProfile("malformed_avatar")
  assert.deepEqual(profile?.avatar.loadout.accessoryIds, [])
})
