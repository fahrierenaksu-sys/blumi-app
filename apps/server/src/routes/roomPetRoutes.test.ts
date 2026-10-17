import assert from "node:assert/strict"
import test from "node:test"
import { ROOM_PET_CAT_SPECIES_ID } from "@blumi/domain"
import type { RoomPetSchemaProbe } from "../roomPets/roomPetSchema"
import { createInMemoryRoomPetRepository } from "../roomPets/roomPetRepository"
import { ROOM_PET_STARTER_NAME, createRoomCatOwnership, createRoomPetService, isRoomPetEnabled } from "../roomPets/roomPetService"
import { createAdversarialServer } from "./adversarialFixture"

const PET_ROUTES = [
  ["GET", "/v1/users/me/pet"],
  ["POST", "/v1/users/me/pet/adopt"],
  ["PUT", "/v1/users/me/pet/name"]
] as const

async function withServer(
  options: Parameters<typeof createAdversarialServer>[0],
  run: (server: ReturnType<typeof createAdversarialServer>) => Promise<void>
) {
  const server = createAdversarialServer(options)
  await server.app.ready()
  try {
    await run(server)
  } finally {
    await server.app.close()
  }
}

function adoptBody(name: string) {
  return { speciesItemId: ROOM_PET_CAT_SPECIES_ID, name }
}

test("the pet flag is off unless BLUMI_ROOM_PET_ENABLED is exactly 1", () => {
  assert.equal(isRoomPetEnabled({}), false)
  assert.equal(isRoomPetEnabled({ BLUMI_ROOM_PET_ENABLED: "true" }), false)
  assert.equal(isRoomPetEnabled({ BLUMI_ROOM_PET_ENABLED: "0" }), false)
  assert.equal(isRoomPetEnabled({ BLUMI_ROOM_PET_ENABLED: "1" }), true)
})

test("with the flag off the pet routes do not exist, even for a signed-in member", async () => {
  await withServer({ roomPetService: null }, async (server) => {
    const ada = await server.createAccount("ada")
    for (const [method, path] of PET_ROUTES) {
      assert.equal(server.app.hasRoute({ method, url: path }), false, `${method} ${path} is registered`)
      const response = await server.call(method, path, {
        token: ada.sessionToken,
        ...(method === "GET" ? {} : { payload: adoptBody("Pamuk") })
      })
      assert.equal(response.statusCode, 404, `${method} ${path}`)
    }
  })
})

test("every pet route needs a signed-in member", async () => {
  await withServer({}, async (server) => {
    for (const [method, path] of PET_ROUTES) {
      const response = await server.call(method, path, method === "GET" ? {} : { payload: adoptBody("Pamuk") })
      assert.equal(response.statusCode, 401, `${method} ${path}`)
    }
  })
})

test("the first read grants exactly one starter cat and repeat reads never add another", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    const first = await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })
    assert.equal(first.statusCode, 200, first.body)
    assert.equal(first.json().pet.speciesItemId, ROOM_PET_CAT_SPECIES_ID)
    assert.equal(first.json().pet.name, ROOM_PET_STARTER_NAME)
    assert.equal(first.json().pet.userId, undefined, "the response never carries a user id")
    assert.deepEqual(first.json().speciesIds, [ROOM_PET_CAT_SPECIES_ID])

    const reads = await Promise.all([1, 2, 3].map(() => server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })))
    for (const read of reads) assert.equal(read.json().pet.petId, first.json().pet.petId)

    const adoptAgain = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("Tekir") })
    assert.equal(adoptAgain.statusCode, 409)
    assert.equal(adoptAgain.json().code, "ROOM_PET_ALREADY_ADOPTED")
    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })).json().pet.name, ROOM_PET_STARTER_NAME)
  })
})

test("concurrent first reads on the service grant one cat, not one per request", async () => {
  const repository = createInMemoryRoomPetRepository()
  const roomPetService = createRoomPetService({ repository })
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => roomPetService.getMyPet("member_a")))
  const petIds = new Set(results.map((result) => (result.outcome === "ok" ? result.pet.petId : "none")))
  assert.equal(petIds.size, 1)
  assert.ok(!petIds.has("none"))
})

test("a member who adopts before the first read keeps the chosen name", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    const adopted = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("  Minnoş  ") })
    assert.equal(adopted.statusCode, 201, adopted.body)
    assert.equal(adopted.json().pet.name, "Minnoş", "the name is trimmed")
    const mine = await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })
    assert.equal(mine.json().pet.petId, adopted.json().pet.petId)
    assert.equal(mine.json().pet.name, "Minnoş")
  })
})

test("only species from the server's fixed list can be adopted", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    for (const speciesItemId of ["pet_dragon_v1", "hair_bob_v1", ""]) {
      const response = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: { speciesItemId, name: "Pamuk" } })
      assert.equal(response.statusCode, 400, speciesItemId)
    }
    const mine = await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })
    assert.equal(mine.json().pet.speciesItemId, ROOM_PET_CAT_SPECIES_ID, "a refused species never becomes the pet")
  })
})

test("pet names go through the community filter and refuse phone-like, empty, long and invisible text", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    const refused: Array<[string, string]> = [
      ["kill yourself", "not_allowed"],
      ["12 34 56 78 90", "phone_like"],
      ["cat12345", "phone_like"],
      ["   ", "empty"],
      ["a".repeat(17), "too_long"],
      ["Pa​muk", "control_characters"]
    ]
    for (const [name, reason] of refused) {
      const response = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody(name) })
      assert.equal(response.statusCode, 400, `${reason}: ${response.body}`)
      assert.equal(response.json().reason, reason)
    }

    const adopted = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("Kedi 2026") })
    assert.equal(adopted.statusCode, 201, "four digits are still a name")
    const emoji = await server.call("PUT", "/v1/users/me/pet/name", { token: ada.sessionToken, payload: { name: "🐱".repeat(16) } })
    assert.equal(emoji.statusCode, 200, "length counts characters, not UTF-16 units")

    for (const [name, reason] of refused) {
      const response = await server.call("PUT", "/v1/users/me/pet/name", { token: ada.sessionToken, payload: { name } })
      assert.equal(response.statusCode, 400, `rename ${reason}`)
      assert.equal(response.json().reason, reason)
    }
    const renamed = await server.call("PUT", "/v1/users/me/pet/name", { token: ada.sessionToken, payload: { name: "Minnoş" } })
    assert.equal(renamed.statusCode, 200, renamed.body)
    assert.equal(renamed.json().pet.name, "Minnoş")
    assert.equal(renamed.json().pet.revision, 3)
  })
})

test("another member can neither read nor rename my pet", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    const bob = await server.createAccount("bob")
    await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("Ayva") })
    const adaPetId = (await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })).json().pet.petId

    const bobRename = await server.call("PUT", "/v1/users/me/pet/name", { token: bob.sessionToken, payload: { name: "Tekir" } })
    assert.equal(bobRename.statusCode, 404, "bob has no pet yet, and ada's is not his")
    assert.equal(bobRename.json().code, "ROOM_PET_NOT_FOUND")
    // A smuggled owner field never moves the adopt onto another member.
    const bobAdopt = await server.call("POST", "/v1/users/me/pet/adopt", {
      token: bob.sessionToken, payload: { ...adoptBody("Tekir"), userId: ada.userId }
    })
    assert.equal(bobAdopt.statusCode, 201, "bob's own first pet is not blocked by ada's")
    for (const path of ["/v1/users/me/pet", `/v1/users/${ada.userId}/pet`, `/v1/users/me/pet?userId=${ada.userId}`]) {
      const probe = await server.call("GET", path, { token: bob.sessionToken })
      assert.ok(probe.statusCode === 404 || probe.json().pet.petId !== adaPetId, path)
    }
    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: bob.sessionToken })).json().pet.name, "Tekir")
    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })).json().pet.name, "Ayva")
  })
})

test("before migration 078 is applied the pet routes answer unavailable and write nothing", async () => {
  const repository = createInMemoryRoomPetRepository()
  const schema: RoomPetSchemaProbe = { async isReady() { return false }, peek() { return false } } as RoomPetSchemaProbe
  const roomPetService = createRoomPetService({ repository, schema })
  await withServer({ roomPetService }, async (server) => {
    const ada = await server.createAccount("ada")
    for (const [method, path] of PET_ROUTES) {
      const response = await server.call(method, path, {
        token: ada.sessionToken,
        ...(method === "GET" ? {} : { payload: adoptBody("Pamuk") })
      })
      assert.equal(response.statusCode, 409, `${method} ${path}`)
      assert.equal(response.json().code, "ROOM_PET_UNAVAILABLE")
    }
    assert.equal(await repository.findByUser(ada.userId), null)
  })
})

test("cat ownership answers from the pet record and is not authoritative while the pet is off", async () => {
  const off = createRoomCatOwnership(undefined)
  assert.equal(await off.isAuthoritative(), false)

  const roomPetService = createRoomPetService({ repository: createInMemoryRoomPetRepository() })
  const ownership = createRoomCatOwnership(roomPetService)
  assert.equal(await ownership.isAuthoritative(), true)
  assert.equal(await ownership.hasCat("member_a"), false)
  await roomPetService.adopt("member_a", adoptBody("Pamuk"))
  assert.equal(await ownership.hasCat("member_a"), true)
  assert.equal(await ownership.hasCat("member_b"), false)
  assert.equal(await roomPetService.deleteUserData("member_a"), 1)
  assert.equal(await ownership.hasCat("member_a"), false, "account deletion erases the pet")
  assert.equal(await ownership.hasCat("member_c"), false)
  await roomPetService.getMyPet("member_c")
  assert.equal(await ownership.hasCat("member_c"), true, "the first read's starter cat can travel")
})

test("pet events report outcome codes only, never a name or a user id", async () => {
  const events: string[] = []
  const roomPetService = createRoomPetService({
    repository: createInMemoryRoomPetRepository(),
    report: (event, fields) => { events.push(JSON.stringify([event, fields ?? {}])) }
  })
  await roomPetService.adopt("member_secret_id", adoptBody("SecretName"))
  await roomPetService.rename("member_secret_id", "OtherSecret")
  await roomPetService.rename("member_secret_id", "12 34 56 78 90")
  assert.ok(events.length >= 3)
  for (const event of events) {
    assert.doesNotMatch(event, /member_secret_id|SecretName|OtherSecret|12 34 56/)
  }
})
