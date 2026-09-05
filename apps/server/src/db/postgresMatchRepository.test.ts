import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresMatchRepository } from "./postgresMatchRepository"

interface QueryCall {
  text: string
  values?: readonly unknown[]
}

const completeAvatarRow = {
  avatar_preset_id: "avatar_v2_body_default",
  avatar_selection: {
    schemaVersion: 1,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_default",
    bottomId: "avatar_v2_bottom_default",
    shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
    accessoryIds: ["avatar_v2_accessory_golden_heart_locket"]
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

test("postgres match repository lists real accounts with parameterized filters", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("SELECT user_id") && text.includes("NOT EXISTS")) {
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
  assert.equal(
    fake.calls.some((call) => /INSERT INTO blumi_discover_profiles/.test(call.text)),
    false
  )
  const selectCall = fake.calls.find((call) => /NOT EXISTS/.test(call.text))
  assert.match(selectCall?.text ?? "", /age BETWEEN \$2 AND \$3/)
  assert.match(
    selectCall?.text ?? "",
    /lower\(trim\(COALESCE\(identity_gender, gender\)\)\)/
  )
  assert.match(selectCall?.text ?? "", /unnest/)
  assert.match(selectCall?.text ?? "", /avatar_selection/)
  assert.match(selectCall?.text ?? "", /avatar_revision/)
  assert.match(selectCall?.text ?? "", /profile_prompts/)
  assert.doesNotMatch(selectCall?.text ?? "", /ORDER BY display_name ASC/i)
  assert.match(selectCall?.text ?? "", /ORDER BY[\s\S]*rank_score DESC/i)
  assert.match(selectCall?.text ?? "", /LIMIT\s+\$\d+/i)
  assert.match(selectCall?.text ?? "", /OFFSET\s+\$\d+/i)
  assert.equal(
    highestPostgresPlaceholder(selectCall?.text ?? ""),
    selectCall?.values?.length,
    "every PostgreSQL placeholder must have a bound value"
  )
  assert.match(selectCall?.text ?? "", /is_resurfaced/i)
  assert.match(selectCall?.text ?? "", /resurfaced_rank\s*=\s*1/i)
  assert.deepEqual(selectCall?.values, [
    "current_user",
    23,
    31,
    ["woman"],
    ["coffee dates", "slow burn"],
    101,
    0
  ])
})

function highestPostgresPlaceholder(text: string): number {
  return [...text.matchAll(/\$(\d+)/g)]
    .map((match) => Number(match[1]))
    .reduce((highest, placeholder) => Math.max(highest, placeholder), 0)
}

test("postgres discovery skips one invalid avatar without breaking the page", async () => {
  const fake = createFakePool((text) => {
    if (!text.includes("SELECT user_id")) return []
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

  assert.deepEqual(profiles.map((profile) => profile.userId), ["valid-avatar"])
})

test("postgres discovery preserves bios and does not invent vibe tags", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("SELECT user_id")) {
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
  assert.match(fake.calls[0]?.text ?? "", /\bbio\b/)
})

test("postgres discovery excludes malformed stored avatar selections", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("SELECT user_id")) {
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

  assert.equal(
    await createPostgresMatchRepository(fake.pool).findDiscoverProfile("malformed_avatar"),
    null
  )
})

test("postgres discovery list and direct lookup require completed onboarding", async () => {
  const fake = createFakePool(() => [])
  const repository = createPostgresMatchRepository(fake.pool)

  await repository.listDiscoverProfiles("current_user", {
    ageMin: 18,
    ageMax: 99,
    genders: [],
    vibes: []
  })
  await repository.findDiscoverProfile("target_user")

  for (const call of fake.calls) {
    assert.match(call.text, /onboarding_profile_complete\s*=\s*TRUE/i)
    assert.match(call.text, /onboarding_avatar_complete\s*=\s*TRUE/i)
    assert.match(call.text, /onboarding_room_complete\s*=\s*TRUE/i)
    assert.match(call.text, /char_length\(trim\(display_name\)\)\s*>=\s*2/i)
    assert.match(call.text, /COALESCE\(identity_gender, gender\) IN \('woman', 'man'\)/i)
  }
})

test("postgres linked-profile eligibility reuses the normal deck policy without client query authority", async () => {
  const fake = createFakePool((text) =>
    text.includes("blumi_accounts.user_id = $2")
      ? [{
          user_id: "target_user",
          display_name: "Mert",
          age: 26,
          gender: "man",
          vibe_tags: ["coffee"],
          ...completeAvatarRow
        }]
      : []
  )
  const profile = await createPostgresMatchRepository(fake.pool)
    .findEligibleDiscoverProfile("viewer_user", "target_user", {
      ageMin: 24,
      ageMax: 30,
      genders: ["man"],
      vibes: ["coffee"]
    })

  assert.equal(profile?.userId, "target_user")
  const query = fake.calls[0]
  assert.match(query?.text ?? "", /WITH viewer AS/i)
  assert.match(query?.text ?? "", /blumi_accounts\.user_id\s*=\s*\$2/i)
  assert.match(query?.text ?? "", /age BETWEEN \$3 AND \$4/i)
  assert.match(query?.text ?? "", /ANY\(\$5::text\[\]\)/i)
  assert.match(query?.text ?? "", /ANY\(\$6::text\[\]\)/i)
  assert.match(query?.text ?? "", /blumi_discovery_decisions/i)
  assert.match(query?.text ?? "", /blumi_matches/i)
  assert.match(query?.text ?? "", /viewer\.viewer_gender\s*=\s*ANY\(discovery_genders\)/i)
  assert.match(query?.text ?? "", /onboarding_profile_complete\s*=\s*TRUE/i)
  assert.match(query?.text ?? "", /onboarding_avatar_complete\s*=\s*TRUE/i)
  assert.match(query?.text ?? "", /onboarding_room_complete\s*=\s*TRUE/i)
  assert.equal(highestPostgresPlaceholder(query?.text ?? ""), query?.values?.length)
  assert.deepEqual(query?.values, [
    "viewer_user",
    "target_user",
    24,
    30,
    ["man"],
    ["coffee"]
  ])
})

test("postgres match repository upserts and finds discovery decisions", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("SELECT from_user_id")) {
      return [
        {
          from_user_id: "user_a",
          to_user_id: "user_b",
          decision: "like",
          decided_at: "2026-06-27T10:00:00.000Z"
        }
      ]
    }
    return []
  })
  const repository = createPostgresMatchRepository(fake.pool)

  await repository.saveDecision({
    fromUserId: "user_a",
    toUserId: "user_b",
    decision: "like",
    decidedAt: "2026-06-27T10:00:00.000Z"
  })
  const decision = await repository.findDecision("user_a", "user_b")

  assert.equal(decision?.decision, "like")
  assert.match(fake.calls[0].text, /INSERT INTO blumi_discovery_decisions/)
  assert.match(fake.calls[0].text, /ON CONFLICT \(from_user_id, to_user_id\)/)
  assert.deepEqual(fake.calls[0].values?.slice(0, 3), [
    "user_a",
    "user_b",
    "like"
  ])
})

test("postgres discovery quota uses migration function columns and preserves unavailable rewards", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("blumi_consume_discovery_decision")) {
      return [{
        outcome: "created",
        decision: "pass",
        decided_at: "2026-07-22T12:00:00.000Z",
        created: true,
        limit: 10,
        extension_decisions: 0,
        used: 1,
        remaining: 9,
        resets_at: "2026-07-23T00:00:00.000Z"
      }]
    }
    return []
  })
  const repository = createPostgresMatchRepository(fake.pool)

  const result = await repository.consumeDecisionQuota({
    fromUserId: "user_a",
    toUserId: "user_b",
    decision: "pass",
    decidedAt: "2026-07-22T12:00:00.000Z"
  }, new Date("2026-07-22T12:00:00.000Z"))

  assert.equal(result.created, true)
  assert.equal(result.decision?.decision, "pass")
  assert.deepEqual(result.quota, {
    limit: 10,
    extensionDecisions: 0,
    used: 1,
    remaining: 9,
    resetsAt: "2026-07-23T00:00:00.000Z",
    rewardedAd: { available: false, extensionDecisions: 10 }
  })
  assert.match(fake.calls[0]?.text ?? "", /decision_limit AS limit/i)
  assert.match(fake.calls[0]?.text ?? "", /blumi_consume_discovery_decision/i)
  assert.deepEqual(fake.calls[0]?.values, [
    "user_a",
    "user_b",
    "pass",
    new Date("2026-07-22T12:00:00.000Z"),
    null
  ])
})

test("postgres quota forwards an expected expired pass timestamp for one atomic reconsideration", async () => {
  const fake = createFakePool((text) => text.includes("blumi_consume_discovery_decision")
    ? [{
        outcome: "created",
        decision: "like",
        decided_at: "2026-07-22T12:00:00.000Z",
        created: true,
        limit: 10,
        extension_decisions: 0,
        used: 1,
        remaining: 9,
        resets_at: "2026-07-23T00:00:00.000Z"
      }]
    : [])
  const reconsideredAt = "2026-06-21T12:00:00.000Z"

  await createPostgresMatchRepository(fake.pool).consumeDecisionQuota({
    fromUserId: "user_a",
    toUserId: "user_b",
    decision: "like",
    decidedAt: "2026-07-22T12:00:00.000Z"
  }, new Date("2026-07-22T12:00:00.000Z"), reconsideredAt)

  assert.deepEqual(fake.calls[0]?.values, [
    "user_a",
    "user_b",
    "like",
    new Date("2026-07-22T12:00:00.000Z"),
    new Date(reconsideredAt)
  ])
})

test("postgres match repository stores and finds stable matches", async () => {
  const fake = createFakePool((text) => {
    if (
      text.includes("SELECT match_id") ||
      text.includes("INSERT INTO blumi_matches")
    ) {
      return [
        {
          match_id: "match_one",
          participant_a_user_id: "user_a",
          participant_b_user_id: "user_b",
          matched_at: "2026-06-27T10:00:00.000Z"
        }
      ]
    }
    return []
  })
  const repository = createPostgresMatchRepository(fake.pool)

  const created = await repository.createMatch({
    matchId: "match_one",
    participantUserIds: ["user_a", "user_b"],
    matchedAt: "2026-06-27T10:00:00.000Z"
  })
  const match = await repository.findMatchBetween("user_b", "user_a")

  assert.equal(created?.matchId, "match_one")
  assert.deepEqual(match?.participantUserIds, ["user_a", "user_b"])
  assert.match(fake.calls[0].text, /INSERT INTO blumi_matches/)
  assert.match(fake.calls[0].text, /ON CONFLICT \(participant_key\)/)
  assert.match(fake.calls[0].text, /RETURNING match_id/)
  assert.deepEqual(fake.calls[1].values, ["user_a:user_b"])
})

test("postgres match creation returns the canonical row after a pair conflict", async () => {
  const fake = createFakePool((text) => {
    if (text.includes("INSERT INTO blumi_matches")) {
      return [
        {
          match_id: "match_winner",
          participant_a_user_id: "user_b",
          participant_b_user_id: "user_a",
          matched_at: "2026-07-13T10:00:00.000Z"
        }
      ]
    }
    return []
  })
  const repository = createPostgresMatchRepository(fake.pool)

  const canonical = await repository.createMatch({
    matchId: "match_loser",
    participantUserIds: ["user_a", "user_b"],
    matchedAt: "2026-07-13T10:00:01.000Z"
  })

  assert.deepEqual(canonical, {
    matchId: "match_winner",
    participantUserIds: ["user_b", "user_a"],
    matchedAt: "2026-07-13T10:00:00.000Z"
  })
  assert.match(fake.calls[0]?.text ?? "", /ON CONFLICT \(participant_key\) DO UPDATE/)
  assert.match(fake.calls[0]?.text ?? "", /RETURNING match_id/)
})

test("postgres discovery watch upserts, reads, and deletes one account row", async () => {
  const watchRow = {
    user_id: "user_a",
    status: "active",
    age_min: 23,
    age_max: 35,
    genders: ["woman"],
    vibes: ["coffee"],
    updated_at: "2026-07-21T10:00:00.000Z",
    expires_at: "2026-07-28T10:00:00.000Z"
  }
  const fake = createFakePool((text) =>
    text.includes("blumi_discovery_watches") && !text.includes("DELETE")
      ? [watchRow]
      : []
  )
  const repository = createPostgresMatchRepository(fake.pool)
  const watch = {
    userId: "user_a",
    status: "active" as const,
    preferences: {
      ageMin: 23,
      ageMax: 35,
      genders: ["woman"] as ["woman"],
      vibes: ["coffee"]
    },
    updatedAt: "2026-07-21T10:00:00.000Z",
    expiresAt: "2026-07-28T10:00:00.000Z"
  }

  assert.deepEqual(await repository.upsertDiscoveryWatch(watch), watch)
  assert.deepEqual(await repository.findDiscoveryWatch("user_a"), watch)
  await repository.deleteDiscoveryWatch("user_a")
  assert.match(fake.calls[0]?.text ?? "", /ON CONFLICT \(user_id\) DO UPDATE/)
  assert.equal(fake.calls[0]?.values?.[5], 25)
  assert.match(fake.calls[2]?.text ?? "", /UPDATE blumi_discovery_watches SET generation = gen_random_uuid\(\)::text/)
  assert.match(fake.calls[2]?.text ?? "", /cancelled_at = NOW\(\), claim_token = NULL, lease_until = NULL/)
  assert.deepEqual(fake.calls[2]?.values, ["user_a"])
})
