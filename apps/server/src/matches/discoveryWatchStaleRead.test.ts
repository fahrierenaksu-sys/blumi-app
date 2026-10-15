import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryMatchRepository, createInMemoryMatchStore, createSeedDiscoverProfiles } from "./matchRepository"
import { createMatchService } from "./matchService"

const preferences = { ageMin: 18, ageMax: 99, genders: ["woman" as const], vibes: [] }
const DAY_MS = 86_400_000

test("a stale read of an expired watch never deletes the watch activated meanwhile", async () => {
  // Arrange: the old GET has already read the expired record, then waits.
  const seed = createSeedDiscoverProfiles()[0]!
  const base = createInMemoryMatchRepository(createInMemoryMatchStore([{ ...seed, userId: "watcher", gender: "woman" }]))
  let releaseOldRead!: () => void
  const oldReadGate = new Promise<void>((resolve) => { releaseOldRead = resolve })
  let readCount = 0
  let firstReadDone!: () => void
  const firstRead = new Promise<void>((resolve) => { firstReadDone = resolve })
  const repository = {
    ...base,
    async findDiscoveryWatch(userId: string) {
      const record = await base.findDiscoveryWatch(userId)
      readCount += 1
      if (readCount === 1) {
        firstReadDone()
        await oldReadGate
      }
      return record
    }
  }
  const service = createMatchService({ repository })
  const activatedAt = new Date("2026-09-01T00:00:00Z")
  await service.activateDiscoveryWatch("watcher", preferences, activatedAt)
  const afterExpiry = new Date(activatedAt.getTime() + 8 * DAY_MS)

  // Act: old GET waits -> new activation -> old GET finishes.
  const oldGet = service.getDiscoveryWatch("watcher", afterExpiry)
  await firstRead
  const renewed = await service.activateDiscoveryWatch("watcher", preferences, afterExpiry)
  releaseOldRead()
  const oldResult = await oldGet

  // Assert: the old GET reports the expired record as gone, the new record survives.
  assert.equal(oldResult, null)
  const current = await service.getDiscoveryWatch("watcher", afterExpiry)
  assert.equal(current?.expiresAt, renewed.expiresAt)
})

test("an expired watch reads as null and can be activated again", async () => {
  const seed = createSeedDiscoverProfiles()[0]!
  const service = createMatchService({
    repository: createInMemoryMatchRepository(createInMemoryMatchStore([{ ...seed, userId: "watcher", gender: "woman" }]))
  })
  const activatedAt = new Date("2026-09-01T00:00:00Z")
  await service.activateDiscoveryWatch("watcher", preferences, activatedAt)
  const afterExpiry = new Date(activatedAt.getTime() + 8 * DAY_MS)

  assert.equal(await service.getDiscoveryWatch("watcher", afterExpiry), null)
  const renewed = await service.activateDiscoveryWatch("watcher", preferences, afterExpiry)
  assert.equal((await service.getDiscoveryWatch("watcher", afterExpiry))?.expiresAt, renewed.expiresAt)
})
