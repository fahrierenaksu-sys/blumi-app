import assert from "node:assert/strict"
import { randomInt, randomUUID } from "node:crypto"
import test from "node:test"
import { Pool } from "pg"
import type { DiscoveryFilters } from "@blumi/contracts"
import {
  createInMemoryMatchRepository,
  type DiscoveryDecision,
  type MatchRepository,
  type RecordedDiscoveryDecision
} from "../matches/matchRepository"
import { createPostgresMatchRepository } from "./postgresMatchRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

type Backend = RepositoryContractBackend<MatchRepository>

const NOW = new Date("2026-10-01T10:00:00.000Z")

function record(
  backend: Backend,
  fromUserId: string,
  toUserId: string,
  decision: DiscoveryDecision,
  proposedMatchId = backend.id(`match_${fromUserId}`)
): Promise<RecordedDiscoveryDecision> {
  return backend.repository.recordDecision({
    decision: { fromUserId, toUserId, decision, decidedAt: NOW.toISOString() },
    now: NOW,
    proposedMatchId
  })
}

runRepositoryContract<MatchRepository>({
  name: "match repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryMatchRepository(),
    postgres: (pool) => createPostgresMatchRepository(pool)
  },
  cases: {
    "a pass records one decision and never opens a match": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      await record(backend, bora, ada, "like")
      const passed = await record(backend, ada, bora, "pass")
      assert.equal(passed.decision?.decision, "pass")
      assert.equal(passed.created, true)
      assert.equal(passed.match, null)
      assert.equal(passed.matchCreated, false)
      assert.equal(passed.quota.used, 1)
      assert.equal(await backend.repository.findMatchBetween(ada, bora), null)
    },
    "the reciprocal like creates the pair's one match and a retry replays it without spending quota": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const oneWay = await record(backend, ada, bora, "like")
      assert.equal(oneWay.match, null)
      assert.equal(oneWay.matchCreated, false)

      const matchId = backend.id("match")
      const mutual = await record(backend, bora, ada, "like", matchId)
      assert.equal(mutual.decision?.decision, "like")
      assert.equal(mutual.match?.matchId, matchId)
      assert.deepEqual([...mutual.match!.participantUserIds].sort(), [ada, bora].sort())
      assert.equal(mutual.matchCreated, true)
      assert.equal(mutual.quota.used, 1)

      for (const [from, to] of [[bora, ada], [ada, bora]] as const) {
        const retry = await record(backend, from, to, "like")
        assert.equal(retry.created, false, "a retry spends no second decision")
        assert.equal(retry.match?.matchId, matchId)
        assert.equal(retry.matchCreated, false, "only the first call creates the match")
        assert.equal(retry.quota.used, 1)
      }
      assert.equal((await backend.repository.findMatchBetween(ada, bora))?.matchId, matchId)
    },
    "concurrent reciprocal likes and their retries create exactly one match": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const results = await Promise.all(Array.from({ length: 12 }, (_, index) => index % 2
        ? record(backend, bora, ada, "like", `${backend.id("match")}_${index}`)
        : record(backend, ada, bora, "like", `${backend.id("match")}_${index}`)))
      const persisted = await backend.repository.findMatchBetween(ada, bora)
      assert.ok(persisted, "two committed likes always end as a match")
      assert.equal(results.filter((result) => result.matchCreated).length, 1)
      for (const result of results) {
        if (result.match) assert.equal(result.match.matchId, persisted.matchId)
      }
      assert.ok(results.some((result) => result.match !== null))
      assert.equal((await backend.repository.getDecisionQuota(ada, NOW)).used, 1)
      assert.equal((await backend.repository.getDecisionQuota(bora, NOW)).used, 1)
    },
    "an exhausted quota records nothing and opens no match": async (backend) => {
      const ada = backend.id("ada")
      const targets = Array.from({ length: 11 }, (_, index) => backend.id(`target_${index}`))
      await backend.ensureUsers(ada, ...targets)
      await record(backend, targets[10]!, ada, "like")
      for (const target of targets.slice(0, 10)) await record(backend, ada, target, "pass")
      const refused = await record(backend, ada, targets[10]!, "like")
      assert.equal(refused.decision, null)
      assert.equal(refused.match, null)
      assert.equal(refused.matchCreated, false)
      assert.equal(refused.quota.remaining, 0)
      assert.equal(await backend.repository.findMatchBetween(ada, targets[10]!), null)
    },
    "listMatchesForUser returns only the requester's matches": async (backend) => {
      const [ada, bora, cara, dan] = [backend.id("ada"), backend.id("bora"), backend.id("cara"), backend.id("dan")]
      await backend.ensureUsers(ada, bora, cara, dan)
      for (const [from, to] of [[ada, bora], [bora, ada], [cara, dan], [dan, cara]] as const) {
        await record(backend, from, to, "like", backend.id(`match_${[from, to].sort().join("_")}`))
      }
      const adaMatches = await backend.repository.listMatchesForUser(ada)
      assert.equal(adaMatches.length, 1)
      assert.deepEqual([...adaMatches[0]!.participantUserIds].sort(), [ada, bora].sort())
      assert.deepEqual(await backend.repository.listMatchesForUser(backend.id("stranger")), [])
    },
    "an expired pass is reconsidered once, only against the pass the caller saw": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const passedAt = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000)
      const pass = await backend.repository.recordDecision({
        decision: { fromUserId: ada, toUserId: bora, decision: "pass", decidedAt: passedAt.toISOString() },
        now: passedAt,
        proposedMatchId: backend.id("match_pass")
      })
      assert.equal(pass.created, true)

      const withoutExpectation = await record(backend, ada, bora, "like")
      assert.equal(withoutExpectation.created, false, "a decision is never replaced without naming the expired pass")
      assert.equal(withoutExpectation.decision?.decision, "pass")

      const reconsider = () => backend.repository.recordDecision({
        decision: { fromUserId: ada, toUserId: bora, decision: "like", decidedAt: NOW.toISOString() },
        now: NOW,
        reconsiderationOf: passedAt.toISOString(),
        proposedMatchId: backend.id("match_like")
      })
      const first = await reconsider()
      assert.equal(first.created, true)
      assert.equal(first.decision?.decision, "like")
      const replay = await reconsider()
      assert.equal(replay.created, false, "the same expired pass is reconsidered only once")
      assert.equal(replay.decision?.decision, "like")
      assert.equal(replay.quota.used, 1)
    }
  }
})

// Discovery eligibility lives in SQL (onboarding flags, name length, identity
// gender, the target's discovery genders), so it is proven on PostgreSQL.
const requirePostgres = {
  skip: process.env.BLUMI_TEST_REQUIRE_POSTGRES !== "1" || !process.env.DATABASE_URL
}

interface SeedAccount {
  userId: string
  displayName?: string
  age?: number
  gender?: "woman" | "man" | null
  discoveryGenders?: string[]
  profileComplete?: boolean
  avatarComplete?: boolean
  roomComplete?: boolean
}

const AVATAR_LOADOUT = {
  schemaVersion: 1, bodyId: "avatar_v2_body_default", faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe", noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile", hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default", bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers", accessoryIds: []
}

async function seedAccount(pool: Pool, account: SeedAccount): Promise<void> {
  await pool.query(
    `INSERT INTO blumi_accounts (
       account_id, user_id, phone_number, display_name, age, gender, identity_gender,
       discovery_genders, avatar_preset_id, avatar_selection, avatar_revision,
       onboarding_profile_complete, onboarding_avatar_complete, onboarding_room_complete,
       moderation_status, created_at, updated_at
     ) VALUES ($1, $1, $2, $3, $4, $5, $5, $6, 'avatar_v2_body_default', $7::jsonb, 1, $8, $9, $10, 'active', NOW(), NOW())`,
    [
      account.userId,
      `+1555${String(randomInt(0, 10_000_000)).padStart(7, "0")}`,
      account.displayName ?? "Profile",
      account.age ?? 25,
      account.gender === undefined ? "woman" : account.gender,
      account.discoveryGenders ?? [],
      JSON.stringify(AVATAR_LOADOUT),
      account.profileComplete ?? true,
      account.avatarComplete ?? true,
      account.roomComplete ?? true
    ]
  )
}

const OPEN_FILTERS: DiscoveryFilters = { ageMin: 18, ageMax: 99, genders: [], vibes: [] }

test("PostgreSQL discovery never shows an incomplete, unnamed or ungendered account", requirePostgres, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const scope = randomUUID().slice(0, 8)
  const viewer = `viewer_${scope}`
  const eligible = `eligible_${scope}`
  const hidden: Array<Omit<SeedAccount, "userId"> & { label: string }> = [
    { label: "profile_incomplete", profileComplete: false },
    { label: "avatar_incomplete", avatarComplete: false },
    { label: "room_incomplete", roomComplete: false },
    { label: "one_char_name", displayName: "A" },
    { label: "no_gender", gender: null }
  ]
  try {
    const repository = createPostgresMatchRepository(pool)
    await seedAccount(pool, { userId: viewer, gender: "man" })
    await seedAccount(pool, { userId: eligible })
    for (const account of hidden) await seedAccount(pool, { ...account, userId: `${account.label}_${scope}` })

    const deck = (await repository.listDiscoverProfiles(viewer, OPEN_FILTERS)).map((profile) => profile.userId)
    assert.ok(deck.includes(eligible))
    assert.ok((await repository.findDiscoverProfile(eligible)) !== null)
    assert.ok((await repository.findEligibleDiscoverProfile(viewer, eligible, OPEN_FILTERS, "man")) !== null)
    for (const account of hidden) {
      const userId = `${account.label}_${scope}`
      assert.equal(deck.includes(userId), false, `${account.label} is in the deck`)
      assert.equal(await repository.findDiscoverProfile(userId), null, `${account.label} is found directly`)
      assert.equal(await repository.findEligibleDiscoverProfile(viewer, userId, OPEN_FILTERS, "man"), null, `${account.label} is eligible`)
    }
  } finally {
    await pool.end()
  }
})

test("PostgreSQL linked-profile eligibility honors the target's discovery genders and the viewer's age window", requirePostgres, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  const scope = randomUUID().slice(0, 8)
  const [womanViewer, manViewer, target] = [`woman_${scope}`, `man_${scope}`, `target_${scope}`]
  try {
    const repository = createPostgresMatchRepository(pool)
    await seedAccount(pool, { userId: womanViewer, gender: "woman" })
    await seedAccount(pool, { userId: manViewer, gender: "man" })
    await seedAccount(pool, { userId: target, age: 26, discoveryGenders: ["man"] })

    assert.equal((await repository.findEligibleDiscoverProfile(manViewer, target, OPEN_FILTERS, "man"))?.userId, target)
    assert.equal(await repository.findEligibleDiscoverProfile(womanViewer, target, OPEN_FILTERS, "woman"), null)
    assert.equal(
      await repository.findEligibleDiscoverProfile(manViewer, target, { ...OPEN_FILTERS, ageMin: 30 }, "man"),
      null
    )
    assert.equal(
      await repository.findEligibleDiscoverProfile(manViewer, target, { ...OPEN_FILTERS, genders: ["man"] }, "man"),
      null
    )
  } finally {
    await pool.end()
  }
})
