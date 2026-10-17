import assert from "node:assert/strict"
import { createInMemoryCatTripPrefsRepository, type CatTripPrefsRepository } from "../catTrips/catTripPrefs"
import { createPostgresCatTripPrefsRepository } from "./postgresCatTripPrefsRepository"
import { runRepositoryContract } from "./repositoryContract"

const AT = "2026-10-17T08:00:00.000Z"

runRepositoryContract<CatTripPrefsRepository>({
  name: "cat trip prefs repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryCatTripPrefsRepository(),
    postgres: (pool) => createPostgresCatTripPrefsRepository(pool)
  },
  cases: {
    "no row reads as null; a partial update keeps the defaults for the other switches": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      assert.equal(await backend.repository.get(ada), null)
      assert.deepEqual(await backend.repository.update(ada, { pushEnabled: true }, AT),
        { travelEnabled: true, hostEnabled: true, pushEnabled: true })
      assert.deepEqual(await backend.repository.update(ada, { hostEnabled: false }, AT),
        { travelEnabled: true, hostEnabled: false, pushEnabled: true })
      assert.deepEqual(await backend.repository.get(ada), { travelEnabled: true, hostEnabled: false, pushEnabled: true })
      assert.equal(await backend.repository.get(bora), null, "another member is untouched")
    },

    "deleteUser removes only that member's switches": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      await backend.repository.update(ada, { travelEnabled: false }, AT)
      await backend.repository.update(bora, { travelEnabled: false }, AT)
      assert.equal(await backend.repository.deleteUser(ada), 1)
      assert.equal(await backend.repository.get(ada), null)
      assert.deepEqual(await backend.repository.get(bora), { travelEnabled: false, hostEnabled: true, pushEnabled: false })
    }
  }
})
