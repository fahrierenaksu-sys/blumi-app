import assert from "node:assert/strict"
import { ROOM_PET_CAT_SPECIES_ID } from "@blumi/domain"
import { createInMemoryRoomPetRepository, type NewRoomPet, type RoomPetRepository } from "../roomPets/roomPetRepository"
import { createPostgresRoomPetRepository } from "./postgresRoomPetRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

type Backend = RepositoryContractBackend<RoomPetRepository>

const at = (minute: number) => new Date(Date.UTC(2026, 9, 17, 9, minute)).toISOString()

function newPet(backend: Backend, userId: string, name: string, createdAt = at(0)): NewRoomPet {
  return { petId: backend.id(`pet_${name.toLowerCase()}`), userId, speciesItemId: ROOM_PET_CAT_SPECIES_ID, name, createdAt }
}

runRepositoryContract<RoomPetRepository>({
  name: "room pet repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryRoomPetRepository(),
    postgres: (pool) => createPostgresRoomPetRepository(pool)
  },
  cases: {
    "a member adopts once and a second adopt keeps the first pet": async (backend) => {
      const ada = backend.id("ada")
      await backend.ensureUsers(ada)
      assert.equal(await backend.repository.findByUser(ada), null)

      const first = await backend.repository.adopt(newPet(backend, ada, "Pamuk"))
      assert.equal(first.outcome, "adopted")
      assert.deepEqual(first.pet, {
        petId: backend.id("pet_pamuk"),
        userId: ada,
        speciesItemId: ROOM_PET_CAT_SPECIES_ID,
        name: "Pamuk",
        nameStatus: "active",
        roomState: "home",
        revision: 1,
        createdAt: at(0),
        updatedAt: at(0)
      })

      const second = await backend.repository.adopt(newPet(backend, ada, "Tekir", at(5)))
      assert.equal(second.outcome, "already_has_pet")
      assert.deepEqual(second.pet, first.pet)
      assert.deepEqual(await backend.repository.findByUser(ada), first.pet)
    },
    "concurrent adopts give a member exactly one pet": async (backend) => {
      const ada = backend.id("ada")
      await backend.ensureUsers(ada)
      const results = await Promise.all(["Bir", "Iki", "Uc", "Dort"].map((name) => backend.repository.adopt(newPet(backend, ada, name))))
      assert.equal(results.filter((result) => result.outcome === "adopted").length, 1)
      const kept = await backend.repository.findByUser(ada)
      assert.ok(kept)
      for (const result of results) assert.equal(result.pet.petId, kept.petId)
    },
    "rename changes only the caller's pet and bumps its revision": async (backend) => {
      const [ada, bob] = [backend.id("ada"), backend.id("bob")]
      await backend.ensureUsers(ada, bob)
      await backend.repository.adopt(newPet(backend, ada, "Pamuk"))
      await backend.repository.adopt(newPet(backend, bob, "Tekir"))

      const renamed = await backend.repository.rename(ada, "Minnoş", at(10))
      assert.equal(renamed?.name, "Minnoş")
      assert.equal(renamed?.revision, 2)
      assert.equal(renamed?.updatedAt, at(10))
      assert.equal(renamed?.createdAt, at(0))
      assert.equal((await backend.repository.findByUser(bob))?.name, "Tekir", "another member's pet is untouched")

      const carol = backend.id("carol")
      await backend.ensureUsers(carol)
      assert.equal(await backend.repository.rename(carol, "Boncuk", at(11)), null, "no pet, nothing renamed")
      assert.equal(await backend.repository.findByUser(carol), null)
    },
    "deleting a member's pet leaves other members' pets": async (backend) => {
      const [ada, bob] = [backend.id("ada"), backend.id("bob")]
      await backend.ensureUsers(ada, bob)
      await backend.repository.adopt(newPet(backend, ada, "Pamuk"))
      await backend.repository.adopt(newPet(backend, bob, "Tekir"))

      assert.equal(await backend.repository.deleteByUser(ada), 1)
      assert.equal(await backend.repository.deleteByUser(ada), 0)
      assert.equal(await backend.repository.findByUser(ada), null)
      assert.equal((await backend.repository.findByUser(bob))?.name, "Tekir")
      const again = await backend.repository.adopt(newPet(backend, ada, "Boncuk"))
      assert.equal(again.outcome, "adopted", "an erased pet does not block a fresh start")
    }
  }
})
