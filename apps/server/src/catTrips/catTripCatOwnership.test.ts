import assert from "node:assert/strict"
import test from "node:test"
import { ROOM_PET_CAT_SPECIES_ID } from "@blumi/domain"
import { createInMemoryRoomPetRepository } from "../roomPets/roomPetRepository"
import { createRoomCatOwnership, createRoomPetService, type RoomPetService } from "../roomPets/roomPetService"
import { createInMemoryCatTripRepository } from "./catTripRepository"
import { createCatTripService, type CatTripWorld } from "./catTripService"
import { createCatTripCatCheck } from "./catTripWiring"

const OWNER = "owner-1"
const HOSTS = { "host-a": 9, "host-b": 4 }
const NOW = new Date("2026-10-16T06:00:00.000Z")

async function adoptCat(pets: RoomPetService, userId: string): Promise<void> {
  const result = await pets.adopt(userId, { speciesItemId: ROOM_PET_CAT_SPECIES_ID, name: "Pamuk" })
  assert.equal(result.outcome, "adopted")
}

/** Plans the owner's day with the cat flag on and returns the hosts the cat travelled to. */
async function plannedHosts(pets: RoomPetService | undefined): Promise<string[]> {
  const repository = createInMemoryCatTripRepository()
  const world: CatTripWorld = {
    async countMessagesByPartner() {
      return Object.entries(HOSTS).map(([partnerUserId, messageCount]) => ({ partnerUserId, messageCount }))
    },
    async isMutualMatch() { return true },
    async hasBlockBetween() { return false },
    async isUserActive() { return true },
    hasCat: createCatTripCatCheck(createRoomCatOwnership(pets)),
    async getTimeSettings() { return { timeZone: "UTC", quietHours: null } },
    async queueTeaser() {}
  }
  let counter = 0
  const service = createCatTripService({
    repository, world, enabled: true, seedSecret: "secret-a",
    now: () => NOW, createId: () => `id-${(counter += 1)}`
  })
  await service.getState(OWNER)
  const trips = await repository.listOwnerTrips(OWNER, "2000-01-01T00:00:00.000Z")
  return [...new Set(trips.map((trip) => trip.hostUserId))].sort()
}

function petService(schemaReady = true): RoomPetService {
  return createRoomPetService({
    repository: createInMemoryRoomPetRepository(),
    schema: { isReady: async () => schemaReady, peek: () => schemaReady }
  })
}

test("with the pet flag off nobody has a cat, so no cat travels", async () => {
  assert.deepEqual(await plannedHosts(undefined), [])
})

test("before migration 078 is applied nobody has a cat, even with the pet flag on", async () => {
  assert.deepEqual(await plannedHosts(petService(false)), [])
})

test("an owner without a pet record never sends a cat", async () => {
  const pets = petService()
  for (const host of Object.keys(HOSTS)) await adoptCat(pets, host)
  assert.deepEqual(await plannedHosts(pets), [])
})

test("a member without a pet record never hosts the cat; one with a record does", async () => {
  const pets = petService()
  await adoptCat(pets, OWNER)
  await adoptCat(pets, "host-b")
  assert.deepEqual(await plannedHosts(pets), ["host-b"])
})

test("with records on both sides and both flags on, the cat travels to either host", async () => {
  const pets = petService()
  for (const userId of [OWNER, ...Object.keys(HOSTS)]) await adoptCat(pets, userId)
  const hosts = await plannedHosts(pets)
  assert.ok(hosts.length > 0)
  for (const host of hosts) assert.ok(host in HOSTS)
})
