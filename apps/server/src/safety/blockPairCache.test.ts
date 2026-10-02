import assert from "node:assert/strict"
import test from "node:test"
import { createInMemorySafetyRepository } from "./safetyRepository"
import { BLOCK_PAIR_CACHE_TTL_MS, createSafetyService } from "./safetyService"

function fixture() {
  const repository = createInMemorySafetyRepository()
  let lookups = 0
  const list = repository.listBlockedUserIdsBetween.bind(repository)
  repository.listBlockedUserIdsBetween = async (viewer, candidates) => {
    lookups += 1
    return list(viewer, candidates)
  }
  let clock = 1_000_000
  const service = createSafetyService({ repository, now: () => clock })
  return { repository, service, lookups: () => lookups, advance: (ms: number) => { clock += ms } }
}

test("realtime hints reuse one block lookup per pair, in either order", async () => {
  const { service, lookups } = fixture()
  for (let index = 0; index < 20; index += 1) {
    assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), false)
    assert.equal(await service.hasBlockBetweenCached("user_b", "user_a"), false)
  }
  assert.equal(lookups(), 1)
})

test("a block, report or unblock on this instance applies to the very next hint", async () => {
  const { service } = fixture()
  assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), false)
  await service.blockUser("user_b", "user_a")
  assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), true)
  await service.unblockUser("user_b", "user_a")
  assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), false)
  await service.reportUser("user_a", { reportedUserId: "user_b", reason: "spam" })
  assert.equal(await service.hasBlockBetweenCached("user_b", "user_a"), true)
})

test("a lookup that overlapped a block is never stored", async () => {
  const { repository, service } = fixture()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const list = repository.listBlockedUserIdsBetween
  repository.listBlockedUserIdsBetween = async (viewer, candidates) => {
    const answer = await list(viewer, candidates)
    await gate
    return answer
  }
  const stale = service.hasBlockBetweenCached("user_a", "user_b")
  repository.listBlockedUserIdsBetween = list
  await service.blockUser("user_a", "user_b")
  release()
  assert.equal(await stale, false, "the overlapping read answers its own call")
  assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), true)
})

test("another instance's block reaches the cache within its lifetime", async () => {
  const { repository, service, lookups, advance } = fixture()
  assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), false)
  // Written by another replica: this instance's cache was not told.
  await repository.saveBlock({ actorUserId: "user_a", blockedUserId: "user_b", createdAt: new Date().toISOString() })
  advance(BLOCK_PAIR_CACHE_TTL_MS)
  assert.equal(await service.hasBlockBetweenCached("user_a", "user_b"), true)
  assert.equal(lookups(), 2)
  // Access decisions never use the cache.
  assert.equal(await service.hasBlockBetween("user_b", "user_a"), true)
})
