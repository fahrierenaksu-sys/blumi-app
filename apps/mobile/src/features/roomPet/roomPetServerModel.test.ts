import assert from "node:assert/strict"
import test from "node:test"
import { readServerRoomPetPresence } from "./roomPetServerModel"

const STARTER = { petId: "pet_1", speciesItemId: "pet_cat_blumi_v1", name: "Pamuk", roomState: "home", revision: 1 }

test("the room draws the cat only when the server returns the member's pet at home", () => {
  assert.equal(readServerRoomPetPresence(200, { pet: STARTER, speciesIds: ["pet_cat_blumi_v1"] }), "present")
})

test("no pet, a hidden pet, a missing route, an unavailable feature or a bad payload draw nothing", () => {
  assert.equal(readServerRoomPetPresence(200, { pet: null }), "absent")
  assert.equal(readServerRoomPetPresence(200, { pet: { ...STARTER, roomState: "hidden" } }), "absent")
  assert.equal(readServerRoomPetPresence(404, { error: "Not found" }), "absent")
  assert.equal(readServerRoomPetPresence(409, { code: "ROOM_PET_UNAVAILABLE" }), "absent")
  assert.equal(readServerRoomPetPresence(500, { pet: STARTER }), "absent")
  assert.equal(readServerRoomPetPresence(200, { pet: { ...STARTER, petId: "" } }), "absent")
  assert.equal(readServerRoomPetPresence(200, "oops"), "absent")
  assert.equal(readServerRoomPetPresence(200, null), "absent")
})
