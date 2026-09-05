import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryMatchRepository } from "./matchRepository"
import { createMatchService } from "./matchService"
const now = new Date("2026-09-05T10:00:00Z")
const filters = { ageMin: 18, ageMax: 99, genders: [], vibes: [] }

test("cancel during claim cannot be resurrected by worker restore", async () => {
  const service = createMatchService()
  await service.activateDiscoveryWatch("viewer", filters, now)
  const claim = await service.claimNextDiscoveryWatch(now)
  assert.ok(claim)
  await service.cancelDiscoveryWatch("viewer")
  await service.restoreDiscoveryWatch(claim)
  assert.equal(await service.getDiscoveryWatch("viewer", now), null)
})

test("new user preferences survive stale restore; crashed lease can be reclaimed", async () => {
  const repository = createInMemoryMatchRepository()
  const service = createMatchService({ repository })
  await service.activateDiscoveryWatch("viewer", filters, now)
  const old = await service.claimNextDiscoveryWatch(now)
  assert.ok(old)
  await service.activateDiscoveryWatch("viewer", { ...filters, ageMin: 30 }, now)
  await service.restoreDiscoveryWatch(old)
  assert.equal((await service.getDiscoveryWatch("viewer", now))?.preferences.ageMin, 30)
  const newer = await service.claimNextDiscoveryWatch(now)
  assert.ok(newer)
  assert.equal(await service.claimNextDiscoveryWatch(now), null)
  const reclaimed = await service.claimNextDiscoveryWatch(new Date(now.getTime() + 61_000))
  assert.ok(reclaimed)
})
