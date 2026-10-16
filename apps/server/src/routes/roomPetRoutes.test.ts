import assert from "node:assert/strict"
import test from "node:test"
import { ROOM_PET_CAT_SPECIES_ID } from "@blumi/domain"
import type { RoomPetSchemaProbe } from "../roomPets/roomPetSchema"
import { createInMemoryRoomPetRepository } from "../roomPets/roomPetRepository"
import { createRoomCatOwnership, createRoomPetService, isRoomPetEnabled } from "../roomPets/roomPetService"
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

test("a member adopts one starter pet, a second adopt is refused and the first pet is kept", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    const empty = await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })
    assert.equal(empty.statusCode, 200, empty.body)
    assert.equal(empty.json().pet, null)
    assert.deepEqual(empty.json().speciesIds, [ROOM_PET_CAT_SPECIES_ID])

    const adopted = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("  Pamuk  ") })
    assert.equal(adopted.statusCode, 201, adopted.body)
    assert.equal(adopted.json().pet.name, "Pamuk", "the name is trimmed")
    assert.equal(adopted.json().pet.speciesItemId, ROOM_PET_CAT_SPECIES_ID)
    assert.equal(adopted.json().pet.userId, undefined, "the response never carries a user id")

    const again = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("Tekir") })
    assert.equal(again.statusCode, 409)
    assert.equal(again.json().code, "ROOM_PET_ALREADY_ADOPTED")

    const mine = await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })
    assert.equal(mine.json().pet.name, "Pamuk")
    assert.equal(mine.json().pet.petId, adopted.json().pet.petId)
  })
})

test("only species from the server's fixed list can be adopted", async () => {
  await withServer({}, async (server) => {
    const ada = await server.createAccount("ada")
    for (const speciesItemId of ["pet_dragon_v1", "hair_bob_v1", ""]) {
      const response = await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: { speciesItemId, name: "Pamuk" } })
      assert.equal(response.statusCode, 400, speciesItemId)
    }
    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })).json().pet, null)
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
    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })).json().pet, null)

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
    await server.call("POST", "/v1/users/me/pet/adopt", { token: ada.sessionToken, payload: adoptBody("Pamuk") })

    const bobRead = await server.call("GET", "/v1/users/me/pet", { token: bob.sessionToken })
    assert.equal(bobRead.json().pet, null, "bob sees only his own (missing) pet")
    const bobRename = await server.call("PUT", "/v1/users/me/pet/name", { token: bob.sessionToken, payload: { name: "Tekir" } })
    assert.equal(bobRename.statusCode, 404)
    assert.equal(bobRename.json().code, "ROOM_PET_NOT_FOUND")
    for (const path of [`/v1/users/${ada.userId}/pet`, `/v1/users/me/pet?userId=${ada.userId}`]) {
      const probe = await server.call("GET", path, { token: bob.sessionToken })
      assert.ok(probe.statusCode === 404 || probe.json().pet === null, path)
    }
    // A smuggled owner field never moves the adopt onto another member.
    const bobAdopt = await server.call("POST", "/v1/users/me/pet/adopt", {
      token: bob.sessionToken, payload: { ...adoptBody("Tekir"), userId: ada.userId }
    })
    assert.equal(bobAdopt.statusCode, 201, "bob's own first pet is not blocked by ada's")
    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: bob.sessionToken })).json().pet.name, "Tekir")

    assert.equal((await server.call("GET", "/v1/users/me/pet", { token: ada.sessionToken })).json().pet.name, "Pamuk")
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
