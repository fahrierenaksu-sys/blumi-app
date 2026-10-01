import assert from "node:assert/strict"
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
    }
  }
})
