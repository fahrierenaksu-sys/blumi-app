import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryCatTripRepository } from "../catTrips/catTripRepository"
import { createCatTripService, type CatTripWorld } from "../catTrips/catTripService"
import { createAdversarialServer } from "./adversarialFixture"

function openWorld(): CatTripWorld {
  return {
    async countMessagesByPartner() { return [{ partnerUserId: "host-1", messageCount: 6 }] },
    async isMutualMatch() { return true },
    async hasBlockBetween() { return false },
    async isUserActive() { return true },
    async hasCat() { return true },
    async getTimeSettings() { return { timeZone: "UTC", quietHours: null } },
    async queueTeaser() {}
  }
}

test("cat routes need a signed-in member and answer disabled while the feature is off", async () => {
  const server = createAdversarialServer()
  await server.app.ready()
  try {
    const ada = await server.createAccount("ada")
    for (const [method, path] of [
      ["GET", "/v1/cat/state"], ["GET", "/v1/cat/trip/current"], ["GET", "/v1/cat/guests"], ["POST", "/v1/cat/trips/t1/reveal-ack"]
    ] as const) {
      assert.equal((await server.call(method, path)).statusCode, 401, `${method} ${path} without a token`)
    }
    for (const path of ["/v1/cat/state", "/v1/cat/trip/current", "/v1/cat/guests"]) {
      const response = await server.call("GET", path, { token: ada.sessionToken })
      assert.equal(response.statusCode, 200, response.body)
      assert.deepEqual(response.json(), { enabled: false })
    }
    const ack = await server.call("POST", "/v1/cat/trips/t1/reveal-ack", { token: ada.sessionToken })
    assert.equal(ack.statusCode, 409)
    assert.equal(ack.json().code, "CAT_TRIPS_DISABLED")
  } finally {
    await server.app.close()
  }
})

test("with the feature on, the state is planned by the server and a stranger cannot acknowledge a trip", async () => {
  const repository = createInMemoryCatTripRepository()
  const catTripService = createCatTripService({
    repository, world: openWorld(), enabled: true, seedSecret: "route-test-secret"
  })
  const server = createAdversarialServer({ catTripService })
  await server.app.ready()
  try {
    const ada = await server.createAccount("ada")
    const bora = await server.createAccount("bora")
    const state = await server.call("GET", "/v1/cat/state", { token: ada.sessionToken })
    assert.equal(state.statusCode, 200, state.body)
    assert.equal(state.json().enabled, true)
    assert.ok(["home", "away"].includes(state.json().catPhase))
    assert.equal(state.body.includes("host-1"), false, "the destination is never in the state while a trip may be under way")

    const trips = await repository.listOwnerTrips(ada.userId, "2000-01-01T00:00:00.000Z")
    assert.equal(trips.length, 2)
    const strange = await server.call("POST", `/v1/cat/trips/${trips[0]!.tripId}/reveal-ack`, { token: bora.sessionToken })
    assert.equal(strange.statusCode, 404)
    const missing = await server.call("POST", "/v1/cat/trips/nope/reveal-ack", { token: ada.sessionToken })
    assert.equal(missing.statusCode, 404)
    const guests = await server.call("GET", "/v1/cat/guests", { token: bora.sessionToken })
    assert.deepEqual(guests.json(), { enabled: true, guests: [] })
  } finally {
    await server.app.close()
  }
})
